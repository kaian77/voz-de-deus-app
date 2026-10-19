// Webhook do WhatsApp. Atende os dois provedores:
//   - API oficial (Meta Cloud API): GET de verificação + POST assinado com X-Hub-Signature-256
//   - WAHA (self-hosted, grátis): POST em ?account=<id>&secret=<segredo> com eventos "message"
// Mensagem recebida -> registra na caixa de entrada e o agente de IA responde.
import { adminClient, env, hmacHex, timingSafeEqual } from "../_shared/util.ts";
import { autoReply, recordEcho, recordInbound } from "../_shared/inbox.ts";
import { waDownloadMedia, waMarkRead, waMessageText, wahaPhoneFromLid, wahaSendSeen } from "../_shared/whatsapp.ts";
import { isPaginasPro } from "../_shared/brand.ts";
import { storeClientPhoto } from "../_shared/paginaspro-agent.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

async function handleValue(value: any) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId || !value.messages?.length) return; // "statuses" (entregue/lido) são ignorados
  const db = adminClient();
  const { data: account } = await db.from("social_accounts").select("*").eq("platform", "whatsapp").eq("external_id", phoneNumberId).maybeSingle();
  if (!account) return;
  const { data: token } = await db.from("account_tokens").select("access_token").eq("account_id", account.id).single();

  for (const m of value.messages) {
    const contact = value.contacts?.find((c: any) => c.wa_id === m.from);
    // PáginasPro: foto que o cliente manda vai para o site dele
    let mediaUrl: string | null = null;
    if (m.type === "image" && token && isPaginasPro(account.meta)) {
      const file = await waDownloadMedia(token.access_token, m.image?.id).catch(() => null);
      if (file) mediaUrl = await storeClientPhoto(db, account.user_id, file.bytes, file.type).catch(() => null);
    }
    const text = m.type === "image" ? `[foto enviada]${m.image?.caption ? ` ${m.image.caption}` : ""}` : waMessageText(m);
    const recorded = await recordInbound(db, account, "whatsapp", { id: m.from, name: contact?.profile?.name }, { externalId: m.id, text, mediaUrl });
    if (!recorded) continue;
    if (token) await waMarkRead(token.access_token, phoneNumberId, m.id);
    await autoReply(db, recorded.conversation, recorded.message.id);
  }
}

/** Coexistência: mensagens que o dono mandou pelo app do WhatsApp Business (abordagem do lead, conversa manual). */
async function handleEchoes(value: any) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId || !value.message_echoes?.length) return;
  const db = adminClient();
  const { data: account } = await db.from("social_accounts").select("*").eq("platform", "whatsapp").eq("external_id", phoneNumberId).maybeSingle();
  if (!account) return;
  for (const m of value.message_echoes) {
    if (!m.to) continue;
    await recordEcho(db, account, String(m.to), { externalId: m.id, text: waMessageText(m) || "[mensagem]" });
  }
}

/** Evento do WAHA: { event: "message", session, payload: { id, from, fromMe, body, hasMedia, _data } } */
async function handleWaha(accountId: string, secret: string, event: any) {
  const db = adminClient();
  const { data: account } = await db.from("social_accounts").select("*").eq("id", accountId).eq("platform", "whatsapp").maybeSingle();
  const { data: token } = await db.from("account_tokens").select("access_token, webhook_secret").eq("account_id", accountId).maybeSingle();
  if (!account || !token?.webhook_secret || !timingSafeEqual(token.webhook_secret, secret)) return false;
  if (event.event !== "message") return true;

  const m = event.payload ?? {};
  const chatId: string = m.from ?? "";
  // Ignora mensagens próprias, grupos, status e canais
  if (m.fromMe || !chatId || /@(g\.us|broadcast|newsletter)$/.test(chatId) || chatId === "status@broadcast") return true;

  const text = m.body || (m.hasMedia ? `[${m.media?.mimetype?.split("/")[0] ?? "mídia"} enviada]` : "[mensagem]");
  // WEBJS/NOWEB: notifyName/pushName; GOWS: _data.Info.PushName
  const name = m._data?.notifyName ?? m._data?.pushName ?? m._data?.Info?.PushName;
  const cfg = { base_url: account.meta.base_url, session: account.meta.session, api_key: token.access_token || null };
  // Contato com id escondido (@lid): usa o telefone de verdade, para a lista de números e o Studio mostrarem certo
  const phone = chatId.endsWith("@lid") ? await wahaPhoneFromLid(cfg, chatId, m._data) : null;
  const contact = { id: phone ?? chatId, altId: phone ? chatId : undefined, name };
  const recorded = await recordInbound(db, account, "whatsapp", contact, { externalId: `waha:${m.id}`, text });
  if (!recorded) return true;
  await wahaSendSeen(cfg, chatId);
  await autoReply(db, recorded.conversation, recorded.message.id);
  return true;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "POST" && url.searchParams.has("account")) {
    const event = await req.json().catch(() => ({}));
    const job = handleWaha(url.searchParams.get("account")!, url.searchParams.get("secret") ?? "", event).catch((e) => {
      console.error("WAHA falhou", e);
      return true;
    });
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
    else await job;
    return new Response("ok");
  }
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env("META_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge")) : new Response("Forbidden", { status: 403 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256")?.replace("sha256=", "") ?? "";
  const expected = await hmacHex(env("WHATSAPP_APP_SECRET"), raw);
  if (!timingSafeEqual(signature, expected)) return new Response("Assinatura inválida", { status: 401 });

  const body = JSON.parse(raw);
  const jobs: Promise<unknown>[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "messages") jobs.push(handleValue(change.value).catch((e) => console.error("WhatsApp falhou", e)));
      if (change.field === "smb_message_echoes") jobs.push(handleEchoes(change.value).catch((e) => console.error("WhatsApp eco falhou", e)));
    }
  }
  const all = Promise.all(jobs);
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(all);
  else await all;
  return new Response("EVENT_RECEIVED");
});
