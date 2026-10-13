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
