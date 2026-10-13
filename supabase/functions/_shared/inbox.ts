// Caixa de entrada unificada (Instagram DM + WhatsApp) e o agente de IA que responde.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { igRequest, igTokenFor } from "./instagram.ts";
import { agentAllowed, waSendText, wahaSendText } from "./whatsapp.ts";
import { type AgentTool, aiEnabled, brandContext, generateJSON, runAgent } from "./claude.ts";
import { sleep } from "./util.ts";
import { nsCoupons, nsFindOrder, nsOrders, nsPages, nsProducts, nsStore, storeFor } from "./nuvemshop.ts";

export type Channel = "instagram" | "whatsapp";
type Sender = "contact" | "ai" | "human" | "agent";

const WINDOW_MS = 24 * 3600 * 1000;

async function tokenFor(db: SupabaseClient, accountId: string, channel: Channel) {
  if (channel === "instagram") return igTokenFor(db, accountId);
  const { data } = await db.from("account_tokens").select("access_token").eq("account_id", accountId).maybeSingle();
  if (!data) throw new Error("WhatsApp sem token — reconecte em Contas");
  return data.access_token as string; // no WAHA é a X-Api-Key (pode ser vazia)
}

/** Registra a mensagem recebida. Retorna null se for entrega duplicada do webhook. */
export async function recordInbound(
  db: SupabaseClient,
  account: { id: string; user_id: string; meta?: any },
  channel: Channel,
  contact: { id: string; altId?: string; name?: string; username?: string },
  message: { externalId: string; text: string },
) {
  const now = new Date().toISOString();
  // altId: id antigo do mesmo contato (WhatsApp "@lid"); a conversa passa a usar o telefone
  const ids = contact.altId ? [contact.id, contact.altId] : [contact.id];
  const { data: found } = await db.from("conversations").select("*").eq("account_id", account.id).in("contact_id", ids);
  let existing = found?.find((c) => c.contact_id === contact.id) ?? found?.[0] ?? null;
  if (existing && existing.contact_id !== contact.id) {
    const { data: moved } = await db.from("conversations").update({ contact_id: contact.id }).eq("id", existing.id).select().single();
    existing = moved ?? existing;
  }
  const conversation = existing ?? (await db.from("conversations").insert({
    user_id: account.user_id,
    account_id: account.id,
    channel,
    contact_id: contact.id,
    // Número com IA desligada (ex.: pessoal): a conversa já nasce sem IA, salvo os contatos da lista
    ai_enabled: channel === "whatsapp" ? ids.some((id) => agentAllowed(account.meta, id)) : true,
    contact_name: contact.name,
    contact_username: contact.username,
  }).select().single()).data;
  if (!conversation) throw new Error("Falha ao criar conversa");

  const { data: inserted, error } = await db.from("messages").insert({
    user_id: account.user_id,
    conversation_id: conversation.id,
    direction: "in",
    sender: "contact",
    text: message.text,
    external_id: message.externalId,
  }).select().single();
  if (error) return null;

  const { data: updated } = await db.from("conversations").update({
    last_message_at: now,
    last_inbound_at: now,
    unread: (conversation.unread ?? 0) + 1,
    status: conversation.status === "closed" ? "open" : conversation.status,
    contact_name: conversation.contact_name ?? contact.name,
    contact_username: conversation.contact_username ?? contact.username,
  }).eq("id", conversation.id).select().single();
  return { conversation: updated ?? conversation, message: inserted };
}

/** Envia uma mensagem pelo canal da conversa e registra no histórico. */
export async function sendMessage(db: SupabaseClient, conversationId: string, text: string, sender: Exclude<Sender, "contact">) {
  const { data: conv } = await db.from("conversations").select("*, social_accounts(external_id, meta, user_id)").eq("id", conversationId).single();
  if (!conv) throw new Error("Conversa não encontrada");
  // Defesa extra: a conta que envia precisa ser do mesmo dono da conversa
  if (conv.social_accounts?.user_id !== conv.user_id) throw new Error("Conta da conversa não pertence a este usuário");
  const isWaha = conv.social_accounts.meta?.provider === "waha";
  // Janela de 24h é regra das APIs oficiais da Meta (o WAHA não tem essa limitação)
  if (!isWaha && (!conv.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > WINDOW_MS)) {
    throw new Error(
      conv.channel === "whatsapp"
        ? "Já passaram 24h desde a última mensagem do contato: o WhatsApp só permite responder com um template aprovado."
        : "Já passaram 24h desde a última mensagem do contato: o Instagram não permite mais responder esta conversa.",
    );
  }
  const token = await tokenFor(db, conv.account_id, conv.channel);
  const accountExternalId = conv.social_accounts.external_id as string;

  let externalId: string | undefined;
  if (conv.channel === "instagram") {
    // DMs do Instagram têm limite de 1000 caracteres por mensagem
    const chunks = text.match(/[\s\S]{1,1000}/g) ?? [text];
    for (const chunk of chunks) {
      const r = await igRequest<{ message_id?: string }>(token, `${accountExternalId}/messages`, {
        method: "POST",
        body: { recipient: { id: conv.contact_id }, message: { text: chunk } },
      });
      externalId = r.message_id;
    }
  } else if (isWaha) {
    const meta = conv.social_accounts.meta;
    externalId = await wahaSendText({ base_url: meta.base_url, session: meta.session, api_key: token || null }, conv.contact_id, text);
  } else {
    externalId = await waSendText(token, accountExternalId, conv.contact_id, text);
  }

  const { data: msg } = await db.from("messages").insert({
    user_id: conv.user_id,
    conversation_id: conv.id,
    direction: "out",
    sender,
    text,
    external_id: externalId ?? null,
  }).select().single();
  await db.from("conversations").update({ last_message_at: new Date().toISOString(), ...(sender !== "ai" ? { unread: 0 } : {}) }).eq("id", conv.id);
  return msg;
}

const AgentReply = z.object({
  reply: z.string().describe("Mensagem a enviar ao contato (vazia se handoff sem mensagem)"),
  handoff: z.boolean().describe("true se um humano precisa assumir"),
  handoff_reason: z.string().describe("Motivo curto do handoff, ou vazio"),
});

export async function transcript(db: SupabaseClient, conversationId: string, limit = 30) {
  const { data } = await db.from("messages").select("direction,sender,text,created_at").eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).reverse();
}

/**
 * Ferramentas da loja para o agente: busca no catálogo inteiro, informações e políticas da loja,
 * cupons ativos e situação de pedido (só com número + e-mail da compra; sem isso nada do pedido é revelado).
 */
function storeTools(store: { token: string; storeId: string } | null): AgentTool[] {
  if (!store) return [];
  const { token, storeId } = store;
  return [
    {
      name: "buscar_produtos",
      description: "Busca produtos publicados na loja pelo nome. Use palavras-chave curtas (ex.: 'aranha', 'enfermagem', 'flamengo', 'kit'). " +
        "Se não achar, tente sinônimos ou só uma palavra. Retorna nome, link e se está esgotado (sem preço).",
      input_schema: { type: "object", properties: { busca: { type: "string" } }, required: ["busca"] },
      run: async ({ busca }: { busca: string }) => {
        const found = await nsProducts(token, storeId, { q: busca, limit: 8 });
        return found.length
          ? found.map((p) => ({ nome: p.name, link: p.url, esgotado: p.stock === 0, descricao: p.description.slice(0, 200) }))
          : { resultado: "nenhum produto encontrado com essa busca" };
      },
    },
    {
      name: "info_loja",
      description: "Dados e políticas da loja: contato, endereço e páginas como frete/envio, trocas e devoluções, perguntas frequentes.",
      input_schema: { type: "object", properties: {} },
      run: async () => {
        const [info, pages] = await Promise.all([nsStore(token, storeId), nsPages(token, storeId)]);
        return { loja: info, paginas: pages.map((p) => ({ titulo: p.title, texto: p.text.slice(0, 2500) })) };
      },
    },
    {
      name: "cupons_ativos",
      description: "Cupons de desconto válidos agora na loja (código, desconto, compra mínima, se é só para primeira compra). " +
        "NUNCA passe cupons cujo código tenha nome de pessoa (ex.: JULIA10, BRUNO15, MARIA): são de parceiros/influenciadores.",
      input_schema: { type: "object", properties: {} },
      run: async () => {
        const coupons = await nsCoupons(token, storeId);
        return coupons.length ? coupons : { resultado: "nenhum cupom ativo no momento" };
      },
    },
    {
      name: "historico_cliente",
      description: "Quantas compras pagas a pessoa já fez na loja, pelo e-mail ou nome completo que ela informou nesta conversa (pode reaproveitar o que ela já disse). " +
        "Use para decidir o cupom (primeira compra x cliente recorrente).",
      input_schema: { type: "object", properties: { email_ou_nome: { type: "string" } }, required: ["email_ou_nome"] },
      run: async ({ email_ou_nome }: { email_ou_nome: string }) => {
        const orders = (await nsOrders(token, storeId, { q: String(email_ou_nome).trim(), limit: 50 }))
          .filter((o) => buyerMatches(o, email_ou_nome) && o.status !== "cancelled" && o.payment === "pago");
        return { compras_pagas: orders.length };
      },
    },
    {
      name: "consultar_pedido",
      description: "Situação de um pedido (pagamento, envio, transportadora, rastreio). Exige o número do pedido E o e-mail ou o nome completo de quem comprou, " +
        "informados pela própria pessoa nesta conversa. Sem isso, peça antes de chamar. Também traz os canais da transportadora.",
      input_schema: {
        type: "object",
        properties: { numero: { type: "string" }, email_ou_nome: { type: "string" } },
        required: ["numero", "email_ou_nome"],
      },
      run: async ({ numero, email_ou_nome }: { numero: string; email_ou_nome: string }) => {
        const order = await nsFindOrder(token, storeId, numero);
        if (!order) return { resultado: "pedido não encontrado; peça para conferir o número" };
        if (!buyerMatches(order, email_ou_nome)) {
          return { resultado: "o e-mail/nome não confere com o da compra; não passe nenhum dado do pedido, peça para conferir" };
        }
        return {
          numero: order.number, pagamento: order.payment, envio: order.shipping, transportadora: order.shipping_option,
          prazo: order.shipping_days, rastreio: order.tracking_number, link_rastreio: order.tracking_url,
          enviado_em: order.shipped_at, cancelado: order.status === "cancelled", itens: order.items,
          contato_transportadora: carrierContact(`${order.shipping_option ?? ""} ${order.tracking_url ?? ""}`),
        };
      },
    },
  ];
}

const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9@.\s]/g, " ").replace(/\s+/g, " ").trim();

/** Confere quem pergunta: e-mail igual ao da compra, ou nome e sobrenome que batem com o do comprador. */
// deno-lint-ignore no-explicit-any
function buyerMatches(order: any, given: string) {
  const g = norm(String(given ?? ""));
  if (!g) return false;
  if (g.includes("@")) return g === norm(String(order.email ?? ""));
  const words = g.split(" ").filter((w) => w.length > 1);
  const buyer = norm(String(order.customer ?? "")).split(" ");
  return words.length >= 2 && words.every((w) => buyer.includes(w));
}

/** Canais oficiais da transportadora para o destinatário (sem e-mail público: site e telefone). */
function carrierContact(info: string) {
  if (/loggi/i.test(info)) {
    return { nome: "Loggi", rastreio: "https://www.loggi.com/rastreador", ajuda: "https://www.loggi.com/ajuda" };
  }
  if (/correios|sedex|pac\b|mini/i.test(info)) {
    return {
      nome: "Correios", rastreio: "https://rastreamento.correios.com.br", fale_conosco: "https://www.correios.com.br/falecomoscorreios",
      telefone: "3003-0100", como: "No Fale Conosco, registrar manifestação de objeto entregue e não recebido, com o código de rastreio",
    };
  }
  return null;
}

const FINAL_TOOL: AgentTool = {
  name: "responder",
  description: "Envia a resposta final ao contato. Sempre termine chamando esta ferramenta.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "Mensagem a enviar ao contato (vazia se handoff sem mensagem)" },
      handoff: { type: "boolean", description: "true se um humano precisa assumir" },
      handoff_reason: { type: "string", description: "Motivo curto do handoff, ou vazio" },
    },
    required: ["reply", "handoff", "handoff_reason"],
  },
};

/** Gera a resposta da IA (sem enviar). */
export async function draftReply(db: SupabaseClient, conversation: any) {
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", conversation.user_id).maybeSingle();
  const history = await transcript(db, conversation.id);
  // Número com instruções próprias (ex.: WhatsApp pessoal): a IA responde como o dono, sem falar como a loja
  const { data: account } = await db.from("social_accounts").select("meta").eq("id", conversation.account_id).maybeSingle();
  const persona = String(account?.meta?.agent_prompt ?? "").trim();
  if (persona) {
    const chat = history.map((m) => `${m.direction === "in" ? "CONTATO" : "EU"}: ${m.text}`).join("\n");
    const personal =
      `Você responde mensagens no WhatsApp em nome do dono deste número, em primeira pessoa, como se fosse ele. ` +
      `Português do Brasil, natural e curto, do jeito que uma pessoa escreve no WhatsApp; não diga que é uma IA, a não ser que perguntem diretamente. ` +
      `Nunca invente fatos, compromissos, horários, valores ou promessas que não estejam nas instruções abaixo. ` +
      `Converse normalmente no papo do dia a dia (cumprimentos, brincadeiras, como está, provocações leves), no estilo das instruções; ` +
      `não fuja da conversa nem diga "já te respondo" à toa. ` +
      `Só peça handoff (handoff=true, com reply vazio) quando pedirem algo que só o dono pode decidir ou confirmar ` +
      `(compromissos, dinheiro, horários, favores), quando o assunto for sério ou delicado, ou quando as instruções mandarem.\n\n` +
      `Instruções do dono:\n${persona}`;
    const result = await generateJSON(AgentReply, personal,
      `Contato: ${conversation.contact_name ?? "sem nome"}\n\nConversa até agora:\n${chat}\n\nEscreva a minha próxima mensagem (EU).`, "low");
    return { ...result, settings, personal: true };
  }
  const lines = history.map((m) => `${m.direction === "in" ? "CONTATO" : "MARCA"}: ${m.text}`).join("\n");
  const store = await storeFor(db, conversation.user_id).catch(() => null);
  const tools = storeTools(store);
  const system =
    `Você é o atendente virtual da marca no ${conversation.channel === "whatsapp" ? "WhatsApp" : "direct do Instagram"}. ` +
    `Responda em português do Brasil, de forma calorosa, curta (até 3 frases), natural, sem parecer robô, no máximo 1 emoji.\n\n` +
    `Como atender:\n` +
    `- Leia a conversa inteira e responda ao que a pessoa quer AGORA, considerando tudo o que já foi dito. Se ela mandou várias mensagens seguidas, responda tudo numa mensagem só.\n` +
    `- Não repita cumprimentos, perguntas ou links que a MARCA já mandou na conversa. Não faça a mesma pergunta duas vezes. ` +
    `Se a pessoa só cumprimentar de novo, responda curto e pergunte como pode ajudar, sem link.\n` +
    `- Link só quando ajudar naquele momento (produto pedido, preço, quer comprar). Nunca mande o link do site em cumprimento, nem se ele já foi mandado na conversa.\n` +
    `- Aproveite o que a pessoa já informou (nome, e-mail, número do pedido) em vez de pedir de novo.\n` +
    `- Você está no direct: mande o link direto (do produto ou do site); nunca fale em "link da bio".\n` +
    (tools.length
      ? `- Use as ferramentas para consultar a loja de verdade: buscar_produtos (o catálogo é grande; procure antes de dizer que não tem), ` +
        `info_loja (frete, trocas, contato), cupons_ativos e consultar_pedido. Só afirme o que veio das ferramentas, da base de conhecimento ou das instruções.\n` +
        `- Produto pedido pelo nome popular (ex.: "homem aranha") pode ter outro nome na loja (ex.: "Zé Aranha"): busque por palavras-chave e explique a versão que a loja tem.\n` +
        `- Cupom: quando pedirem desconto, consulte cupons_ativos e passe só códigos que vieram de lá, com as condições (primeira compra, valor mínimo, validade). ` +
        `Nunca passe cupom com nome de pessoa no código. Se não houver, diga com gentileza que no momento não há cupom ativo.\n` +
        `- Pedido: peça o número do pedido e o e-mail (ou nome completo) de quem comprou; só depois consulte e passe status, transportadora e rastreio.\n` +
        `- "Consta entregue mas não recebi": com muita gentileza e empatia, explique que a parte da loja é embalar com cuidado e postar, e que a entrega ` +
        `fica sob responsabilidade da transportadora. Passe o nome da transportadora, o código e o link de rastreio e os canais dela (contato_transportadora), ` +
        `sugira antes conferir com portaria, vizinhos ou familiares, e oriente a abrir a reclamação na transportadora com o código. ` +
        `Coloque-se à disposição. Não prometa reenvio nem reembolso; se a pessoa voltar dizendo que a transportadora não resolveu, faça handoff.\n`
      : "") +
    `- Nunca invente produtos, preços, números, prazos, cupons, links ou promessas.\n` +
    `Peça handoff (handoff=true) só quando: a pessoa pedir para falar com humano; reclamação séria; pagamento/reembolso/troca com problema; ` +
    `assunto delicado (luto, crise, saúde mental grave — nesse caso responda com acolhimento e indique o CVV 188 se houver risco); ` +
    `ou quando nem as ferramentas nem a base resolverem.\n\n` +
    `${brandContext(settings)}\n\nInstruções de atendimento do dono (têm prioridade):\n${settings?.agent_instructions ?? "Seja prestativo e acolhedor."}\n\n` +
    `Base de conhecimento:\n${settings?.agent_knowledge ?? "(vazia)"}`;
  const result = await runAgent<z.infer<typeof AgentReply>>(system,
    `Contato: ${conversation.contact_name ?? conversation.contact_username ?? "sem nome"}\n\nConversa até agora:\n${lines}\n\n` +
      `Escreva a próxima mensagem da MARCA (termine com a ferramenta responder).`,
    [...tools, FINAL_TOOL], "medium");
  return { reply: String(result.reply ?? ""), handoff: Boolean(result.handoff), handoff_reason: String(result.handoff_reason ?? ""), settings, personal: false };
}

/** Responde automaticamente se o agente estiver ligado para a marca e para a conversa. */
export async function autoReply(db: SupabaseClient, conversation: any, inboundMessageId: string) {
  if (!aiEnabled() || !conversation.ai_enabled || conversation.status === "needs_human") return;
  const { data: settings } = await db.from("brand_settings").select("agent_enabled").eq("user_id", conversation.user_id).maybeSingle();
  if (!settings?.agent_enabled) return;

  // Espera um pouco: se a pessoa mandar várias mensagens seguidas, responde só a última (com todo o contexto)
  const isLatest = async () => {
    const { data: latest } = await db.from("messages").select("id").eq("conversation_id", conversation.id).eq("direction", "in")
      .order("created_at", { ascending: false }).limit(1).single();
    return latest?.id === inboundMessageId;
  };
  await sleep(6000);
  if (!(await isLatest())) return;

  const draft = await draftReply(db, conversation);
  // Chegou outra mensagem enquanto a IA pensava: descarta esta resposta (a da mensagem nova já vê tudo)
  if (!(await isLatest())) return;
  if (draft.handoff) {
    await db.from("conversations").update({ status: "needs_human", handoff_reason: draft.handoff_reason || "Pedido de atendimento humano" }).eq("id", conversation.id);
    // No modo pessoal não manda o aviso da loja ("vou chamar alguém da equipe")
    const text = draft.reply?.trim() || (draft.personal ? "" : draft.settings?.agent_handoff_message);
    if (text) await sendMessage(db, conversation.id, text, "ai");
    return;
  }
  if (draft.reply.trim()) await sendMessage(db, conversation.id, draft.reply.trim(), "ai");
}
