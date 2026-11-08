// Mercado Livre na caixa de entrada do Studio: perguntas dos anúncios (antes da compra) e mensagens dos pedidos (depois).
// O cron lê a cada 3 min; a resposta sai pela API (POST /answers ou mensagem do pack). A IA não responde sozinha aqui.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ml, mlTokenFor } from "./mercadolivre.ts";
import { notify } from "./push.ts";

type Account = { id: string; user_id: string; external_id: string; meta?: any };
type ConvMeta = { kind: "question"; item_id: string; item_title?: string; buyer_id: number } | { kind: "pack"; pack_id: string; buyer_id: number; order_id?: number };

const EVERY_MS = 3 * 60_000;
const PACKS_EVERY_MS = 30 * 60_000;

async function conversationFor(db: SupabaseClient, acc: Account, contactId: string, name: string, meta: ConvMeta) {
  const { data: found } = await db.from("conversations").select("*").eq("account_id", acc.id).eq("contact_id", contactId).maybeSingle();
  if (found) return found;
  const { data } = await db.from("conversations").insert({
    user_id: acc.user_id, account_id: acc.id, channel: "mercadolivre", contact_id: contactId, contact_name: name,
    ai_enabled: false, meta, status: "open", unread: 0, last_message_at: new Date(0).toISOString(),
  }).select().single();
  return data;
}

/** Grava a mensagem com a data do ML (sem duplicar). Retorna true se é nova. */
async function store(db: SupabaseClient, conv: any, m: { externalId: string; text: string; at: string; inbound: boolean }) {
  const { error } = await db.from("messages").insert({
    user_id: conv.user_id, conversation_id: conv.id, direction: m.inbound ? "in" : "out", sender: m.inbound ? "contact" : "human",
    text: m.text, external_id: m.externalId, created_at: m.at,
  });
  if (error) return false;
  const patch: Record<string, unknown> = {};
  if (new Date(m.at) > new Date(conv.last_message_at)) patch.last_message_at = conv.last_message_at = m.at;
  if (m.inbound) {
    patch.last_inbound_at = m.at;
    patch.unread = conv.unread = (conv.unread ?? 0) + 1;
  } else patch.unread = conv.unread = 0;
  await db.from("conversations").update(patch).eq("id", conv.id);
  return true;
}

async function setPending(db: SupabaseClient, conv: any, pending: boolean, reason: string) {
  const status = pending ? "needs_human" : conv.status === "needs_human" ? "open" : conv.status;
  if (status === conv.status) return;
  conv.status = status;
  await db.from("conversations").update({ status, handoff_reason: pending ? reason : null }).eq("id", conv.id);
}

const titles = new Map<string, string>();
async function itemTitle(token: string, id: string) {
  if (!titles.has(id)) titles.set(id, await ml<{ title: string }>(token, `/items/${id}?attributes=title`).then((r) => r.title).catch(() => id));
  return titles.get(id)!;
}

async function pollQuestions(db: SupabaseClient, acc: Account, token: string) {
  const r = await ml<{ questions?: any[] }>(token, `/questions/search?seller_id=${acc.external_id}&api_version=4&sort_fields=date_created&sort_types=DESC&limit=50`);
  let fresh = 0;
  for (const q of (r.questions ?? []).reverse()) {
    if (q.deleted_from_listing || q.status === "BANNED" || q.status === "DELETED") continue;
    const title = await itemTitle(token, q.item_id);
    const conv = await conversationFor(db, acc, `q:${q.item_id}:${q.from?.id}`, `Pergunta · ${title}`, { kind: "question", item_id: q.item_id, item_title: title, buyer_id: q.from?.id });
    if (!conv) continue;
    if (await store(db, conv, { externalId: `mlq:${q.id}`, text: q.text, at: q.date_created, inbound: true }) && q.status === "UNANSWERED") fresh++;
    if (q.answer?.text) await store(db, conv, { externalId: `mlqa:${q.id}`, text: q.answer.text, at: q.answer.date_created ?? q.date_created, inbound: false });
    await setPending(db, conv, q.status === "UNANSWERED", "Pergunta no Mercado Livre");
  }
  return fresh;
}

async function syncPack(db: SupabaseClient, acc: Account, token: string, packId: string, buyer?: { id: number; nickname?: string }, orderId?: number) {
  const r = await ml<{ messages?: any[] }>(token, `/messages/packs/${packId}/sellers/${acc.external_id}?tag=post_sale&mark_as_read=false&limit=50`);
  const msgs = (r.messages ?? []).slice().sort((a, b) => String(a.message_date?.created).localeCompare(String(b.message_date?.created)));
  if (!msgs.length) return 0;
  const buyerId = buyer?.id ?? msgs.map((m) => m.from?.user_id).find((id) => String(id) !== String(acc.external_id));
  const conv = await conversationFor(db, acc, `p:${packId}`, `Pedido · ${buyer?.nickname ?? `comprador ${buyerId}`}`, { kind: "pack", pack_id: packId, buyer_id: Number(buyerId), order_id: orderId });
  if (!conv) return 0;
  let fresh = 0;
  for (const m of msgs) {
    const inbound = String(m.from?.user_id) !== String(acc.external_id);
    if (await store(db, conv, { externalId: `mlm:${m.id}`, text: m.text ?? "", at: m.message_date?.created ?? new Date().toISOString(), inbound }) && inbound) fresh++;
  }
  const last = msgs[msgs.length - 1];
  await setPending(db, conv, String(last.from?.user_id) !== String(acc.external_id), "Mensagem de pedido no Mercado Livre");
  return fresh;
}

async function pollPacks(db: SupabaseClient, acc: Account, token: string, full: boolean) {
  let fresh = 0;
  // não lidas (barato) a cada rodada; os pedidos recentes de vez em quando, para pegar o que já foi lido no app
  const unread = await ml<{ results?: { resource: string }[] }>(token, `/messages/unread?role=seller&tag=post_sale`).catch(() => ({ results: [] }));
  const packs = new Map<string, { buyer?: { id: number; nickname?: string }; order?: number }>();
  for (const u of unread.results ?? []) { const id = u.resource.match(/packs\/(\d+)/)?.[1]; if (id) packs.set(id, {}); }
  if (full) {
    const orders = await ml<{ results?: any[] }>(token, `/orders/search?seller=${acc.external_id}&sort=date_desc&limit=30`);
    for (const o of orders.results ?? []) packs.set(String(o.pack_id ?? o.id), { buyer: o.buyer, order: o.id });
  }
  for (const [id, info] of packs) fresh += await syncPack(db, acc, token, id, info.buyer, info.order).catch(() => 0);
  return fresh;
}

/** Cron: lê perguntas e mensagens novas do ML de cada conta (a cada 3 min; pedidos recentes a cada 30 min). */
export async function runMlInbox(db: SupabaseClient) {
  const { data: accounts } = await db.from("social_accounts").select("id,user_id,external_id,meta").eq("platform", "mercadolivre");
  const out: Record<string, unknown>[] = [];
  for (const acc of (accounts ?? []) as Account[]) {
    const state = acc.meta?.ml_inbox ?? {};
    const now = Date.now();
    if (state.at && now - new Date(state.at).getTime() < EVERY_MS) continue;
    const full = !state.packs_at || now - new Date(state.packs_at).getTime() > PACKS_EVERY_MS;
    const next = { at: new Date(now).toISOString(), packs_at: full ? new Date(now).toISOString() : state.packs_at, error: null as string | null };
    try {
      const token = await mlTokenFor(db, acc.id);
      const questions = await pollQuestions(db, acc, token);
      const messages = await pollPacks(db, acc, token, full);
      // primeira leitura importa o histórico sem avisar
      if (state.at && questions + messages > 0) {
        const body = [questions && `${questions} pergunta${questions > 1 ? "s" : ""} nova${questions > 1 ? "s" : ""}`, messages && `${messages} mensage${messages > 1 ? "ns" : "m"} de pedido`].filter(Boolean).join(" · ");
        await notify(db, acc.user_id, "Mercado Livre", body, "/studio/mensagens").catch(() => {});
      }
      out.push({ account: acc.id, questions, messages });
    } catch (e) {
      next.error = e instanceof Error ? e.message : String(e);
      out.push({ account: acc.id, error: next.error });
    }
    const { data: fresh } = await db.from("social_accounts").select("meta").eq("id", acc.id).single();
    await db.from("social_accounts").update({ meta: { ...(fresh?.meta ?? {}), ml_inbox: next } }).eq("id", acc.id);
  }
  return out;
}

/** Resposta do Studio: pergunta → POST /answers (na última sem resposta); pedido → mensagem do pack (até 350 caracteres cada). */
export async function mlSend(db: SupabaseClient, conv: any, accountExternalId: string, text: string) {
  const token = await mlTokenFor(db, conv.account_id);
  const meta = conv.meta as ConvMeta;
  if (meta?.kind === "question") {
    const { data: qs } = await db.from("messages").select("external_id").eq("conversation_id", conv.id).like("external_id", "mlq:%").order("created_at", { ascending: false });
    const { data: answered } = await db.from("messages").select("external_id").eq("conversation_id", conv.id).like("external_id", "mlqa:%");
    const done = new Set((answered ?? []).map((a) => a.external_id.replace("mlqa:", "")));
    const open = (qs ?? []).map((q) => q.external_id.replace("mlq:", "")).find((id) => !done.has(id));
    if (!open) throw new Error("Essa pergunta já foi respondida. No Mercado Livre só dá para responder quando o comprador pergunta de novo.");
    await ml(token, `/answers`, { method: "POST", body: { question_id: Number(open), text: text.slice(0, 2000) } });
    await db.from("conversations").update({ status: "open", handoff_reason: null }).eq("id", conv.id);
    return `mlqa:${open}`;
  }
  if (meta?.kind === "pack") {
    let id: string | undefined;
    for (const chunk of text.match(/[\s\S]{1,350}/g) ?? [text]) {
      const r = await ml<{ id?: string }>(token, `/messages/packs/${meta.pack_id}/sellers/${accountExternalId}?tag=post_sale`, {
        method: "POST", body: { from: { user_id: Number(accountExternalId) }, to: { user_id: meta.buyer_id }, text: chunk },
      });
      id = r.id ? `mlm:${r.id}` : id;
    }
    await db.from("conversations").update({ status: "open", handoff_reason: null }).eq("id", conv.id);
    return id;
  }
  throw new Error("Conversa do Mercado Livre sem dados — espere a próxima leitura");
}
