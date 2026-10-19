// WhatsApp Cloud API (Meta). Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
// Regra importante: mensagens livres só dentro de 24h da última mensagem do cliente;
// fora disso o WhatsApp exige um template aprovado.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env } from "./util.ts";

const graph = (path: string) => `https://graph.facebook.com/${env("META_GRAPH_VERSION", "v24.0")}/${path}`;

async function wa<T = any>(token: string, path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const res = await fetch(graph(path), {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`WhatsApp: ${data.error?.message ?? res.status}`);
  return data as T;
}

export function waPhoneInfo(token: string, phoneNumberId: string) {
  return wa<{ id: string; display_phone_number: string; verified_name: string }>(
    token,
    `${phoneNumberId}?fields=display_phone_number,verified_name`,
  );
}

export function waSubscribeApp(token: string, wabaId: string) {
  return wa(token, `${wabaId}/subscribed_apps`, {});
}

export async function waSendText(token: string, phoneNumberId: string, to: string, body: string) {
  const data = await wa<{ messages: { id: string }[] }>(token, `${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: true, body: body.slice(0, 4096) },
  });
  return data.messages?.[0]?.id;
}

export function waMarkRead(token: string, phoneNumberId: string, messageId: string) {
  return wa(token, `${phoneNumberId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: messageId }).catch(() => null);
}

/** Converte qualquer tipo de mensagem recebida em texto para o histórico/IA. */
export function waMessageText(m: any): string {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "button":
      return m.button?.text ?? "";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    case "image":
    case "video":
    case "document":
      return `[${m.type} enviado]${m[m.type]?.caption ? ` ${m[m.type].caption}` : ""}`;
    case "audio":
      return "[áudio enviado]";
    case "location":
      return "[localização enviada]";
    default:
      return `[${m.type ?? "mensagem"}]`;
  }
}

/**
 * Chave para comparar telefones: só dígitos, com 55 quando faltar o DDI e sem o 9 extra do celular brasileiro
 * (o WhatsApp às vezes identifica 61 99133-1525 como 556191331525). Aceita "556191331525@c.us".
 */
export function phoneKey(raw: string) {
  let d = String(raw).split("@")[0].replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") d = d.slice(0, 4) + d.slice(5);
  return d;
}

/** A IA responde neste contato? Número com IA ligada para todos, ou contato na lista do número. */
export function agentAllowed(meta: { agent?: boolean; agent_numbers?: string[] } | null | undefined, contactId: string) {
  if (meta?.agent !== false) return true;
  const key = phoneKey(contactId);
  return (meta.agent_numbers ?? []).some((n) => phoneKey(n) === key);
}

// ---------------------------------------------------------------------------
// WAHA (https://waha.devlike.pro) — WhatsApp HTTP API self-hosted, grátis (versão Core).
// Não é oficial: usa o WhatsApp Web. Há risco de bloqueio do número se houver abuso.
// ---------------------------------------------------------------------------
export type WahaConfig = { base_url: string; session: string; api_key?: string | null };

async function waha<T = any>(cfg: WahaConfig, path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const res = await fetch(`${cfg.base_url.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cfg.api_key ? { "X-Api-Key": cfg.api_key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WAHA: ${data.message ?? data.error ?? res.status}`);
  return data as T;
}

export function wahaSession(cfg: WahaConfig) {
  return waha<{ name: string; status: string; me?: { id: string; pushName?: string } }>(cfg, `/api/sessions/${cfg.session}`);
}

/** Aponta o webhook da sessão do WAHA para o Studio (eventos "message"). */
export function wahaSetWebhook(cfg: WahaConfig, url: string) {
  return waha(cfg, `/api/sessions/${cfg.session}`, { config: { webhooks: [{ url, events: ["message"] }] } }, "PUT");
}

/**
 * O WhatsApp esconde o telefone de alguns contatos e manda um id "@lid". Descobre o telefone (@c.us):
 * primeiro pelo próprio evento (GOWS: _data.Info.SenderAlt), depois pela API do WAHA.
 */
export async function wahaPhoneFromLid(cfg: WahaConfig, lid: string, data?: any): Promise<string | null> {
  const toCus = (jid?: string | null) => {
    const digits = String(jid ?? "").split("@")[0].split(":")[0].replace(/\D/g, "");
    return jid && !String(jid).endsWith("@lid") && digits.length >= 10 ? `${digits}@c.us` : null;
  };
  const fromEvent = toCus(data?.Info?.SenderAlt) ?? toCus(data?.Info?.RecipientAlt);
  if (fromEvent) return fromEvent;
  const r = await waha<{ pn?: string | null }>(cfg, `/api/${cfg.session}/lids/${encodeURIComponent(lid)}`).catch(() => null);
  return toCus(r?.pn);
}

/** chatId certo de um telefone (o WhatsApp às vezes registra celular BR sem o 9). */
export async function wahaChatIdFor(cfg: WahaConfig, phone: string) {
  const digits = phone.replace(/\D/g, "");
  const r = await waha<{ numberExists?: boolean; chatId?: string }>(cfg, `/api/contacts/check-exists?phone=${digits}&session=${cfg.session}`).catch(() => null);
  if (r && r.numberExists === false) throw new Error(`O número ${phone} não tem WhatsApp`);
  return r?.chatId ?? `${digits}@c.us`;
}

/** Liga a sessão (quando o servidor reiniciou e ela ficou STOPPED/FAILED). */
export function wahaStart(cfg: WahaConfig) {
  return waha(cfg, `/api/sessions/${cfg.session}/start`, {}).catch(() => null);
}

export async function wahaSendText(cfg: WahaConfig, chatId: string, text: string) {
  const data = await waha<{ id?: string | { _serialized?: string } }>(cfg, "/api/sendText", { session: cfg.session, chatId, text });
  return typeof data.id === "string" ? data.id : data.id?._serialized;
}

export function wahaSendSeen(cfg: WahaConfig, chatId: string) {
  return waha(cfg, "/api/sendSeen", { session: cfg.session, chatId }).catch(() => null);
}

/** Consulta cada sessão do WAHA: mantém o servidor acordado e guarda o status (ex.: SCAN_QR_CODE após reiniciar). */
export async function wahaKeepAlive(db: SupabaseClient) {
  const { data: accounts } = await db.from("social_accounts").select("id, username, meta").eq("platform", "whatsapp").eq("meta->>provider", "waha");
  const out: { id: string; status?: string; error?: string }[] = [];
  for (const a of accounts ?? []) {
    const { data: token } = await db.from("account_tokens").select("access_token").eq("account_id", a.id).maybeSingle();
    const cfg = { base_url: a.meta.base_url, session: a.meta.session, api_key: token?.access_token || null };
    const session = await wahaSession(cfg).catch((e) => ({ status: `ERRO: ${e instanceof Error ? e.message : e}`, me: undefined }));
    const status = session.status;
    if (status === "STOPPED" || status === "FAILED") await wahaStart(cfg);
    // Número conectado depois (QR lido após salvar no Studio): grava o telefone e o nome
    const phone = session.me?.id?.split("@")[0];
    if (status !== a.meta.status || (phone && phone !== a.username)) {
      await db.from("social_accounts").update({
        meta: { ...a.meta, status },
        ...(phone ? { username: phone, display_name: session.me?.pushName ?? "WhatsApp" } : {}),
      }).eq("id", a.id);
    }
    out.push({ id: a.id, status });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Coexistência (app do WhatsApp Business + API juntos), conectada pelo botão "Conectar com Facebook" do Studio
// (Embedded Signup com featureType whatsapp_business_app_onboarding). O dono continua usando o app no celular;
// o que ele manda pelo app chega no webhook como smb_message_echoes.
// Precisa: META_APP_ID (id do app da Meta), WA_ES_CONFIG_ID (configuração do Login do Facebook para Empresas)
// e o segredo do app (META_APP_SECRET ou o mesmo WHATSAPP_APP_SECRET usado para conferir o webhook).
// ---------------------------------------------------------------------------
export function waSignupConfig() {
  const appId = Deno.env.get("META_APP_ID") ?? "";
  const configId = Deno.env.get("WA_ES_CONFIG_ID") ?? "";
  return { app_id: appId, config_id: configId, ready: Boolean(appId && configId && (Deno.env.get("META_APP_SECRET") || Deno.env.get("WHATSAPP_APP_SECRET"))) };
}

/** Troca o código do login pelo token de negócio (não expira). */
export async function waExchangeCode(code: string): Promise<string> {
  const url = new URL(graph("oauth/access_token"));
  url.searchParams.set("client_id", env("META_APP_ID"));
  url.searchParams.set("client_secret", Deno.env.get("META_APP_SECRET") || env("WHATSAPP_APP_SECRET"));
  url.searchParams.set("code", code);
  const data = await (await fetch(url)).json().catch(() => ({}));
  if (!data.access_token) throw new Error(`WhatsApp: não consegui concluir a conexão (${data.error?.message ?? "código inválido ou expirado"})`);
  return data.access_token;
}

/** Depois de conectar: puxa contatos e conversas recentes do app (a Meta só deixa nas primeiras 24h). */
export async function waSyncCoexistence(token: string, phoneNumberId: string) {
  for (const sync_type of ["smb_app_state_sync", "history"]) {
    await wa(token, `${phoneNumberId}/smb_app_data`, { messaging_product: "whatsapp", sync_type }).catch((e) => console.error("sync", sync_type, e));
  }
}

/** Baixa uma mídia recebida (foto que o cliente mandou) -> bytes e tipo. */
export async function waDownloadMedia(token: string, mediaId: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const info = await wa<{ url?: string; mime_type?: string }>(token, mediaId).catch(() => null);
  if (!info?.url) return null;
  const res = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: info.mime_type ?? res.headers.get("content-type") ?? "image/jpeg" };
}
