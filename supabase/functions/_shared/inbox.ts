// Caixa de entrada unificada (Instagram DM + WhatsApp) e o agente de IA que responde.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { igRequest, igTokenFor } from "./instagram.ts";
import { agentAllowed, waSendText, wahaSendText } from "./whatsapp.ts";
import { aiEnabled, brandContext, generateJSON } from "./claude.ts";
import { sleep } from "./util.ts";
import { nsFindOrder, nsProducts, storeFor } from "./nuvemshop.ts";

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
  contact: { id: string; name?: string; username?: string },
  message: { externalId: string; text: string },
) {
  const now = new Date().toISOString();
  const { data: existing } = await db.from("conversations").select("*").eq("account_id", account.id).eq("contact_id", contact.id).maybeSingle();
  const conversation = existing ?? (await db.from("conversations").insert({
    user_id: account.user_id,
    account_id: account.id,
    channel,
    contact_id: contact.id,
    // Número com IA desligada (ex.: pessoal): a conversa já nasce sem IA, salvo os contatos da lista
    ai_enabled: channel === "whatsapp" ? agentAllowed(account.meta, contact.id) : true,
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
 * Contexto da loja para o agente: catálogo resumido e, se o contato informou número do pedido
 * E o e-mail da compra, a situação do pedido. Sem o e-mail certo, nenhum dado do pedido é revelado.
 */
async function storeContext(db: SupabaseClient, userId: string, history: { direction: string; text: string }[]) {
  const store = await storeFor(db, userId).catch(() => null);
  if (!store) return "";
  const parts: string[] = [];
  try {
    const products = await nsProducts(store.token, store.storeId, { limit: 80 });
    if (products.length) {
      // Sem preços: eles variam (modelos e kits) e o cliente confere no site pelo link do produto
      parts.push("Produtos da loja (para indicar o link certo; não informe preços):\n" + products.map((p) =>
        `- ${p.name}${p.stock === 0 ? " (esgotado)" : ""}${p.url ? ` — ${p.url}` : ""}`).join("\n"));
    }
  } catch (e) {
    console.error("catálogo", e);
  }

  const said = history.filter((m) => m.direction === "in").map((m) => m.text).join("\n");
  // "pedido 1234", "nº 1234", "#1234" ou uma mensagem só com o número
  const numbers = [...new Set([
    ...said.matchAll(/(?:pedido|n[º°o]\.?|#)\s*:?\s*(\d{3,9})/gi),
    ...said.matchAll(/^\s*(\d{3,9})\s*$/gm),
  ].map((m) => m[1]))].slice(-2);
  const emails = [...said.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0].toLowerCase());
  const lookups: string[] = [];
  for (const number of numbers) {
    const order = await nsFindOrder(store.token, store.storeId, number).catch(() => null);
    if (!order) {
      lookups.push(`Pedido ${number}: não encontrado. Peça para a pessoa conferir o número.`);
    } else if (!emails.length) {
      lookups.push(`Pedido ${number}: existe. Antes de passar qualquer informação, peça o e-mail usado na compra.`);
    } else if (!order.email || !emails.includes(String(order.email).toLowerCase())) {
      lookups.push(`Pedido ${number}: o e-mail informado não confere com o da compra. Não passe dados do pedido; peça para conferir o e-mail ou faça handoff.`);
    } else {
      lookups.push(`Pedido ${number} (e-mail confirmado): pagamento ${order.payment}; envio ${order.shipping}` +
        `${order.shipping_option ? ` via ${order.shipping_option}` : ""}${order.shipping_days ? ` (prazo ${order.shipping_days})` : ""}` +
        `${order.tracking_number ? `; código de rastreio ${order.tracking_number}` : ""}${order.tracking_url ? ` — ${order.tracking_url}` : ""}` +
        `${order.status === "cancelled" ? "; pedido CANCELADO" : ""}. Itens: ${order.items.join(", ")}.`);
    }
  }
  parts.push(
    "Pedidos: para informar a situação de um pedido, a pessoa precisa mandar o número do pedido e o e-mail usado na compra. " +
      "Só fale da situação de pedidos listados abaixo como \"e-mail confirmado\".\n" + (lookups.join("\n") || "(nenhum pedido consultado nesta conversa)"),
  );
  return parts.join("\n\n");
}

/** Gera a resposta da IA (sem enviar). */
export async function draftReply(db: SupabaseClient, conversation: any) {
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", conversation.user_id).maybeSingle();
  const history = await transcript(db, conversation.id);
  const lines = history.map((m) => `${m.direction === "in" ? "CONTATO" : "MARCA"}: ${m.text}`).join("\n");
  const shop = await storeContext(db, conversation.user_id, history);
  const system =
    `Você é o atendente virtual da marca no ${conversation.channel === "whatsapp" ? "WhatsApp" : "direct do Instagram"}. ` +
    `Responda em português do Brasil, de forma calorosa, curta (até 3 frases), natural, sem parecer robô, no máximo 1 emoji. ` +
    `Use SOMENTE as informações da base de conhecimento; nunca invente preços, prazos, links ou promessas. ` +
    `Peça handoff (handoff=true) quando: a pessoa pedir para falar com humano; reclamação séria; pagamento/reembolso; ` +
    `assunto delicado (luto, crise, saúde mental grave — nesse caso responda com acolhimento e indique o CVV 188 se houver risco); ` +
    `ou quando você não souber a resposta.\n\n` +
    `${brandContext(settings)}\n\nInstruções de atendimento:\n${settings?.agent_instructions ?? "Seja prestativo e acolhedor."}\n\n` +
    `Base de conhecimento:\n${settings?.agent_knowledge ?? "(vazia)"}` +
    (shop ? `\n\nDados ao vivo da loja (também valem como base de conhecimento):\n${shop}` : "");
  const result = await generateJSON(AgentReply, system,
    `Contato: ${conversation.contact_name ?? conversation.contact_username ?? "sem nome"}\n\nConversa até agora:\n${lines}\n\nEscreva a próxima mensagem da MARCA.`, "low");
  return { ...result, settings };
}

/** Responde automaticamente se o agente estiver ligado para a marca e para a conversa. */
export async function autoReply(db: SupabaseClient, conversation: any, inboundMessageId: string) {
  if (!aiEnabled() || !conversation.ai_enabled || conversation.status === "needs_human") return;
  const { data: settings } = await db.from("brand_settings").select("agent_enabled").eq("user_id", conversation.user_id).maybeSingle();
  if (!settings?.agent_enabled) return;

  // Espera um pouco: se a pessoa mandar várias mensagens seguidas, responde só a última (com todo o contexto)
  await sleep(4000);
  const { data: latest } = await db.from("messages").select("id").eq("conversation_id", conversation.id).eq("direction", "in")
    .order("created_at", { ascending: false }).limit(1).single();
  if (latest?.id !== inboundMessageId) return;

  const draft = await draftReply(db, conversation);
  if (draft.handoff) {
    await db.from("conversations").update({ status: "needs_human", handoff_reason: draft.handoff_reason || "Pedido de atendimento humano" }).eq("id", conversation.id);
    const text = draft.reply?.trim() || draft.settings?.agent_handoff_message;
    if (text) await sendMessage(db, conversation.id, text, "ai");
    return;
  }
  if (draft.reply.trim()) await sendMessage(db, conversation.id, draft.reply.trim(), "ai");
}
