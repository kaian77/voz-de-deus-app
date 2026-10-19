// Atendente da PáginasPro (WhatsApp da PáginasPro e Instagram @paginasproo): conversa em nome do Bruno, junta os dados
// do negócio do cliente, pede a prévia do site e manda os planos com os links do Mercado Pago.
// A prévia é montada pelo cron (runPaginasproJobs): importa Instagram, a IA escreve, publica como prévia e manda o link
// na conversa. Regras: nada de promessa de resultado, desconto ou informação inventada; dúvida que não sabe vira handoff.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type AgentTool, aiEnabled, runAgent } from "./claude.ts";
import { importClientData, uniqueSlug, writeLanding } from "./landing.ts";
import { sendMessage, transcript } from "./inbox.ts";
import { notify } from "./push.ts";
import { sleep } from "./util.ts";

const SITE = "https://paginaspro.app.br";

/** Preços e links padrão (os mesmos de src/studio/lib/offer.ts); o dono muda em "Preços e links" (brand_settings.landing_offer). */
const DEFAULT_OFFER: Record<string, number | string> = {
  monthly: 59, oneTime: 397, change: 30, panelAddon: 19, premiumMonthly: 129, premiumOneTime: 997,
  monthlyLink: "https://mpago.la/29WANe2", oneTimeLink: "https://mpago.la/1rDD3Gz",
  premiumMonthlyLink: "https://mpago.la/1Bu8EjD", premiumOneTimeLink: "https://mpago.la/1YEqfgd",
};

async function offerFor(db: SupabaseClient, userId: string) {
  const { data } = await db.from("brand_settings").select("landing_offer").eq("user_id", userId).maybeSingle();
  const o = { ...DEFAULT_OFFER };
  for (const [k, v] of Object.entries((data?.landing_offer ?? {}) as Record<string, unknown>)) {
    if (!(k in o)) continue;
    if (typeof o[k] === "number" && Number(v) > 0) o[k] = Number(v);
    if (typeof o[k] === "string" && typeof v === "string") o[k] = v.trim();
  }
  return o;
}

const brl = (n: unknown) => `R$ ${Number(n).toLocaleString("pt-BR")}`;
const pageUrl = (p: { slug: string; domain?: string | null; status: string }) =>
  p.status === "published" && p.domain ? `https://${p.domain}` : `${SITE}/p/${p.slug}`;

const FINAL: AgentTool = {
  name: "responder",
  description: "Envia a resposta final ao contato. Sempre termine chamando esta ferramenta.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "Mensagem a enviar (curta, como no WhatsApp). Vazia se handoff sem mensagem." },
      handoff: { type: "boolean", description: "true quando o Bruno precisa assumir ou ser avisado (pagou, pediu desconto, assunto que você não sabe)" },
      handoff_reason: { type: "string", description: "Motivo curto do aviso ao Bruno, ou vazio" },
    },
    required: ["reply", "handoff", "handoff_reason"],
  },
};

function systemPrompt(o: Record<string, number | string>, channel: string) {
  const link = (l: unknown) => (l ? ` · pagamento: ${l}` : "");
  return (
    `Você atende o ${channel === "whatsapp" ? "WhatsApp" : "direct do Instagram"} da PáginasPro em nome do Bruno Braga, em primeira pessoa ("eu faço", "te mando"). ` +
    `Português do Brasil, jeito de conversa de WhatsApp: mensagens curtas (até 4 frases), simpáticas e diretas, no máximo 1 emoji. ` +
    `Se perguntarem se é robô ou IA, diga a verdade: é o assistente do Bruno, e ele acompanha as conversas.\n\n` +
    `O QUE A PÁGINASPRO FAZ: site profissional (landing page) para qualquer negócio, com as fotos do cliente, serviços, horário, endereço com mapa e botão do WhatsApp. ` +
    `O cliente vê a prévia pronta antes de pagar; se não gostar, não paga nada. Site: ${SITE}\n\n` +
    `PARA MONTAR A PRÉVIA eu preciso de: o @ do Instagram (se tiver), algumas fotos para o site (pode mandar aqui mesmo), o endereço (se tiver), ` +
    `o horário de funcionamento e o tipo de serviço/o que o negócio faz. Peça o que faltar de forma leve, sem questionário enorme (no máximo 2 coisas por mensagem). ` +
    `Assim que tiver pelo menos o nome do negócio, o ramo e (fotos OU o @ do Instagram), chame montar_previa com tudo o que já sabe e diga que em 1 ou 2 minutos o link chega aqui. ` +
    `Se a pessoa pedir mudança numa prévia que já existe, chame montar_previa com o campo ajuste.\n\n` +
    `PLANOS (só passe quando a pessoa perguntar valor ou disser que gostou):\n` +
    `- Mensal: ${brl(o.monthly)}/mês, sem taxa de entrada, inclui alterações sempre que precisar${link(o.monthlyLink)} (cartão, renova sozinho)\n` +
    `- Pagamento único: ${brl(o.oneTime)}, sem mensalidade; alteração depois ${brl(o.change)} cada${link(o.oneTimeLink)} (Pix, cartão ou boleto)\n` +
    `- Premium (animado, foto em 3D, galeria, interação do ramo, igual ao site da PáginasPro): ${brl(o.premiumMonthly)}/mês${link(o.premiumMonthlyLink)} ou ${brl(o.premiumOneTime)} à vista${link(o.premiumOneTimeLink)}\n` +
    `Domínio próprio (.com.br) é opcional: o cliente compra (uns R$ 40/ano no Registro.br) e eu configuro.\n\n` +
    `REGRAS:\n` +
    `- Nunca prometa quantidade de clientes, vendas ou posição no Google. Pode dizer que o site ajuda a passar confiança e facilita o contato pelo WhatsApp.\n` +
    `- Nunca dê desconto nem invente preço, prazo, função ou garantia que não esteja aqui: nesses casos handoff=true (o Bruno responde).\n` +
    `- Quando a pessoa disser que pagou: agradeça, diga que vou conferir e colocar o site no ar em seguida, e handoff=true com motivo "pagou".\n` +
    `- Não repita links ou perguntas que já foram mandados na conversa. Responda a tudo o que a pessoa disse numa mensagem só.\n` +
    `- Mensagens com [foto enviada] são fotos que a pessoa mandou: elas já vão para o site, agradeça e siga.\n` +
    `- Assunto fora de site/negócio, reclamação séria ou algo que você não sabe: handoff=true com reply curto ("vou ver isso e já te respondo").`
  );
}

/** Responde uma mensagem na conta da PáginasPro. */
// deno-lint-ignore no-explicit-any
export async function paginasproReply(db: SupabaseClient, conversation: any, inboundMessageId: string) {
  if (!aiEnabled() || !conversation.ai_enabled || conversation.status === "needs_human") return;
  const isLatest = async () => {
    const { data } = await db.from("messages").select("id").eq("conversation_id", conversation.id).eq("direction", "in")
      .order("created_at", { ascending: false }).limit(1).single();
    return data?.id === inboundMessageId;
  };
  await sleep(8000); // espera a pessoa terminar de mandar (fotos chegam em sequência)
  if (!(await isLatest())) return;

  const history = await transcript(db, conversation.id, 40);
  // O Bruno está conversando pelo app: a IA não se mete por 3 horas. A 1ª mensagem dele (a abordagem) não conta.
  const { data: humans } = await db.from("messages").select("created_at").eq("conversation_id", conversation.id).eq("sender", "human")
    .order("created_at", { ascending: false }).limit(1);
  const lastHuman = humans?.[0]?.created_at;
  if (lastHuman && Date.now() - new Date(lastHuman).getTime() < 3 * 3600_000) {
    const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversation.id)
      .eq("direction", "in").lt("created_at", lastHuman);
    if ((count ?? 0) > 0) return;
  }

  const offer = await offerFor(db, conversation.user_id);
  const { data: page } = await db.from("landing_pages").select("id,name,niche,slug,status,domain,auto_status,photos")
    .eq("conversation_id", conversation.id).maybeSingle();
  const state = page
    ? `Prévia desta conversa: ${page.auto_status === "queued" || page.auto_status === "working" ? "sendo montada agora" : page.slug.startsWith("rascunho-") ? "ainda não montada" : `link ${pageUrl(page)} (${page.status === "published" ? "no ar" : "prévia"})`}; ${page.photos?.length ?? 0} foto(s).`
    : "Ainda não existe prévia para esta pessoa.";

  const tool: AgentTool = {
    name: "montar_previa",
    description: "Cria (ou refaz com ajuste) a prévia do site do cliente com o que já foi dito na conversa. O link é mandado sozinho em 1 ou 2 minutos.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome do negócio como deve aparecer no site" },
        ramo: { type: "string", description: "Área/tipo de serviço (ex.: Nutrição, Barbearia, Advocacia)" },
        cidade: { type: "string" }, instagram: { type: "string", description: "@ do Instagram" },
        endereco: { type: "string" }, horario: { type: "string" },
        servicos: { type: "string", description: "Serviços, diferenciais e tudo de real que a pessoa contou" },
        modelo: { type: "string", enum: ["normal", "premium"] },
        ajuste: { type: "string", description: "Só para mudar uma prévia que já existe: o que a pessoa pediu" },
      },
      required: ["nome", "ramo"],
    },
    run: async (i: Record<string, string>) => queuePreview(db, conversation, i),
  };

  const chat = history.map((m) => `${m.direction === "in" ? "CLIENTE" : m.sender === "human" ? "BRUNO" : "EU"}: ${m.text}`).join("\n");
  const result = await runAgent<{ reply: string; handoff: boolean; handoff_reason: string }>(
    systemPrompt(offer, conversation.channel),
    `Contato: ${conversation.contact_name ?? conversation.contact_username ?? "sem nome"}\n${state}\n\nConversa:\n${chat}\n\n` +
      `Escreva a próxima mensagem (EU). Termine com a ferramenta responder.`,
    [tool, FINAL], "medium",
  );
  if (!(await isLatest())) return;
  const reply = String(result.reply ?? "").trim();
  if (result.handoff) {
    await db.from("conversations").update({ status: "needs_human", handoff_reason: result.handoff_reason || "Atendimento" }).eq("id", conversation.id);
    await notify(db, conversation.user_id, `🌐 PáginasPro: ${conversation.contact_name ?? "cliente"} precisa de você`, result.handoff_reason || "", "/studio/mensagens").catch(() => {});
  }
  if (reply) await sendMessage(db, conversation.id, reply, "ai");
}

/** Guarda os dados do cliente na landing desta conversa e põe na fila do cron. */
// deno-lint-ignore no-explicit-any
async function queuePreview(db: SupabaseClient, conversation: any, i: Record<string, string>) {
  const { data: existing } = await db.from("landing_pages").select("*").eq("conversation_id", conversation.id).maybeSingle();
  const { data: media } = await db.from("messages").select("media_url").eq("conversation_id", conversation.id).not("media_url", "is", null)
    .order("created_at").limit(12);
  const photos = [...new Set([...(existing?.photos ?? []), ...(media ?? []).map((m) => m.media_url as string)])].slice(0, 12);
  const fields = {
    name: String(i.nome ?? existing?.name ?? "").slice(0, 120), niche: String(i.ramo ?? existing?.niche ?? "").slice(0, 80),
    city: i.cidade || existing?.city || null, instagram: i.instagram || existing?.instagram || null,
    address: i.endereco || existing?.address || null, hours: i.horario || existing?.hours || null,
    notes: [existing?.notes, i.servicos].filter(Boolean).join("\n").slice(0, 3000) || null,
    whatsapp: existing?.whatsapp ?? (conversation.channel === "whatsapp" ? conversation.contact_id : null),
    tier: i.modelo === "premium" ? "premium" : (existing?.tier ?? "normal"),
    photos, conversation_id: conversation.id, auto_status: "queued", auto_error: null,
    auto_instructions: i.ajuste ? String(i.ajuste).slice(0, 1500) : null, updated_at: new Date().toISOString(),
  };
  if (!fields.name || !fields.niche) return { erro: "preciso do nome do negócio e do ramo" };
  if (!photos.length && !fields.instagram) return { erro: "preciso de pelo menos uma foto ou do @ do Instagram" };
  const { error } = existing
    ? await db.from("landing_pages").update(fields).eq("id", existing.id)
    : await db.from("landing_pages").insert({ ...fields, user_id: conversation.user_id, slug: `rascunho-${crypto.randomUUID()}` });
  if (error) return { erro: error.message };
  return { ok: true, fotos: photos.length, aviso: "a prévia fica pronta em 1 ou 2 minutos e o link é mandado sozinho nesta conversa" };
}

/** Cron: monta as prévias pedidas pelo atendente e manda o link na conversa (uma por rodada, em segundo plano). */
export async function runPaginasproJobs(db: SupabaseClient) {
  // Rodada interrompida volta para a fila depois de 15 minutos
  await db.from("landing_pages").update({ auto_status: "queued" }).eq("auto_status", "working").lt("updated_at", new Date(Date.now() - 15 * 60_000).toISOString());
  const { data: jobs } = await db.from("landing_pages").select("*").eq("auto_status", "queued").order("updated_at").limit(1);
  const done = [];
  for (const job of jobs ?? []) {
    const { data: claimed } = await db.from("landing_pages").update({ auto_status: "working", updated_at: new Date().toISOString() })
      .eq("id", job.id).eq("auto_status", "queued").select().maybeSingle();
    if (!claimed) continue;
    try {
      let page = claimed;
      if (!page.imported && (page.instagram || page.lead_id)) {
        const patch = await importClientData(db, page);
        const { data } = await db.from("landing_pages").update(patch).eq("id", page.id).select().single();
        page = data ?? page;
      }
      if (!page.photos?.length) {
        if (page.conversation_id) {
          await sendMessage(db, page.conversation_id, "Para montar o seu site eu preciso de pelo menos uma foto (do seu trabalho, do espaço ou sua). Pode me mandar aqui? 📸", "ai").catch(() => {});
        }
        await db.from("landing_pages").update({ auto_status: "need_photos" }).eq("id", page.id);
        done.push({ id: page.id, need_photos: true });
        continue;
      }
      const adjusting = Boolean(page.content && page.auto_instructions);
      const content = await writeLanding(adjusting ? page : { ...page, content: null }, page.auto_instructions ?? undefined);
      const patch: Record<string, unknown> = { content, auto_status: "sent", auto_instructions: null, updated_at: new Date().toISOString() };
      if (page.status === "draft") {
        patch.status = "preview";
        patch.preview_until = new Date(Date.now() + 7 * 86400_000).toISOString();
      }
      if (String(page.slug).startsWith("rascunho-")) patch.slug = await uniqueSlug(db, page.name, page.id);
      const { data: saved } = await db.from("landing_pages").update(patch).eq("id", page.id).select().single();
      const url = pageUrl(saved ?? { ...page, ...patch });
      if (page.conversation_id) {
        const first = page.name.split(/[\s·|-]+/)[0];
        const text = adjusting
          ? `Pronto, ajustei! Dá uma olhada: ${url}`
          : `Pronto${first ? `, ${first}` : ""}! Montei a prévia do seu site: ${url}\n\nDá uma olhada com calma no celular e testa os botões. Se quiser mudar qualquer coisa (texto, foto, cor), é só me falar aqui.`;
        await sendMessage(db, page.conversation_id, text, "ai");
      }
      await notify(db, page.user_id, `🌐 Prévia enviada: ${page.name}`, url, "/studio/landing").catch(() => {});
      done.push({ id: page.id, url });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("landing_pages").update({ auto_status: "failed", auto_error: msg.slice(0, 500) }).eq("id", job.id);
      if (job.conversation_id) await db.from("conversations").update({ status: "needs_human", handoff_reason: "Não consegui montar a prévia" }).eq("id", job.conversation_id);
      await notify(db, job.user_id, `⚠️ Prévia não saiu: ${job.name}`, msg, "/studio/landing").catch(() => {});
      done.push({ id: job.id, error: msg });
    }
  }
  return done;
}

/** Guarda no storage uma foto que o cliente mandou na conversa (vai para o site dele). */
export async function storeClientPhoto(db: SupabaseClient, userId: string, bytes: Uint8Array, type: string) {
  if (!type.startsWith("image/") || bytes.length < 5_000) return null;
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/landing/chat/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("media").upload(path, bytes, { contentType: type });
  return error ? null : db.storage.from("media").getPublicUrl(path).data.publicUrl;
}
