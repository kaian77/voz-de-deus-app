// Cliente da API do Mercado Livre (Brasil, site MLB).
// Docs: https://developers.mercadolivre.com.br — OAuth com token de 6 horas e refresh token de uso único
// (cada renovação devolve um refresh token novo, que precisa ser salvo).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env, functionsUrl } from "./util.ts";

const API = "https://api.mercadolibre.com";

export function mlRedirectUri() {
  return functionsUrl("oauth-mercadolivre");
}

export function mlAuthorizeUrl(state: string) {
  // Sem o secret a troca do código falharia só depois de autorizar no Mercado Livre
  if (!Deno.env.get("ML_CLIENT_SECRET")) {
    throw new Error("Falta o secret ML_CLIENT_SECRET: cadastre em GitHub → Settings → Secrets and variables → Actions e rode o deploy");
  }
  const url = new URL("https://auth.mercadolivre.com.br/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env("ML_APP_ID"));
  url.searchParams.set("redirect_uri", mlRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; user_id: number; scope?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: env("ML_APP_ID"), client_secret: env("ML_CLIENT_SECRET"), ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    // Renovação recusada: sem o escopo offline_access o ML não deixa renovar, ou o refresh token já foi usado
    if (params.grant_type === "refresh_token" && /unsupported_grant_type|invalid_grant|invalid_token/.test(String(data.error ?? data.message))) {
      throw new Error("Acesso ao Mercado Livre expirou: ative offline_access no app do ML e conecte de novo em Contas");
    }
    throw new Error(`Mercado Livre: ${data.message ?? data.error ?? res.status}`);
  }
  return data;
}

export const mlExchangeCode = (code: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: mlRedirectUri() });

/** Token válido da conta (renova quando faltam menos de 10 minutos). */
export async function mlTokenFor(db: SupabaseClient, accountId: string): Promise<string> {
  const { data } = await db.from("account_tokens").select("*").eq("account_id", accountId).single();
  if (!data) throw new Error("Conta do Mercado Livre sem token: reconecte em Contas");
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 10 * 60 * 1000) return data.access_token;
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await db.from("account_tokens").update({
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token,
    expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("account_id", accountId);
  return fresh.access_token;
}

// deno-lint-ignore no-explicit-any
export async function ml<T = any>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const send = () => fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let res = await send();
  // 409 "Conflict": outra alteração no mesmo anúncio ainda está sendo gravada no ML. Espera e manda de novo.
  for (const wait of [2000, 4000, 8000]) {
    if (res.status !== 409) break;
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, wait));
    res = await send();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const causes = Array.isArray(data.cause)
      ? data.cause.filter((c: { type?: string }) => c.type !== "warning").map((c: { message?: string; code?: string }) => c.message ?? c.code).join("; ")
      : "";
    throw new Error(`Mercado Livre: ${data.message ?? data.error ?? res.status}${causes ? ` (${causes})` : ""}`);
  }
  return data as T;
}

export type MlItem = {
  id: string;
  title: string;
  family_name?: string | null;
  price: number;
  original_price?: number | null;
  category_id: string;
  listing_type_id: string;
  permalink?: string;
  thumbnail?: string;
  available_quantity?: number;
  sold_quantity?: number;
  status?: string;
  sub_status?: string[];
  seller_custom_field?: string | null;
  catalog_listing?: boolean;
  // deno-lint-ignore no-explicit-any
  attributes?: { id: string; name?: string; value_id?: string | null; value_name?: string | null; values?: any[] }[];
  // deno-lint-ignore no-explicit-any
  sale_terms?: any[];
  // deno-lint-ignore no-explicit-any
  shipping?: any;
  pictures?: { url?: string; secure_url?: string }[];
};

/**
 * Anúncios do vendedor (até `max` por status, ativos por padrão; status "" traz todos menos os encerrados), com os dados completos
 * ou só os campos em `fields` (bem mais leve: o anúncio completo tem dezenas de KB).
 */
export async function mlSellerItems(token: string, sellerId: string, max = 200, status = "active", fields?: string[]): Promise<MlItem[]> {
  const ids = new Set<string>();
  // "" = todos menos encerrados, status por status ("pending" = inativo por política/moderação, à espera de correção)
  for (const st of status ? [status] : ["active", "paused", "pending", "not_yet_active"]) {
    for (let offset = 0; offset < max; offset += 50) {
      const page = await ml<{ results: string[]; paging: { total: number } }>(token, `/users/${sellerId}/items/search?status=${st}&limit=50&offset=${offset}`);
      page.results.forEach((id) => ids.add(id));
      if (offset + 50 >= page.paging.total) break;
    }
  }
  const items: MlItem[] = [];
  const list = [...ids];
  for (let i = 0; i < list.length; i += 20) {
    const batch = await ml<{ code: number; body: MlItem }[]>(token, `/items?ids=${list.slice(i, i + 20).join(",")}${fields ? `&attributes=${fields.join(",")}` : ""}`);
    for (const r of batch) if (r.code === 200) items.push(r.body);
  }
  return items;
}

/** Campos que bastam para achar um anúncio pelo nome ou SKU. */
export const ML_LOOKUP_FIELDS = ["id", "title", "family_name", "status", "sub_status", "seller_custom_field"];

/** SKU do anúncio: atributo SELLER_SKU ou o campo antigo seller_custom_field. */
export function mlSku(item: MlItem) {
  return item.attributes?.find((a) => a.id === "SELLER_SKU")?.value_name ?? item.seller_custom_field ?? null;
}

/**
 * Sobe a foto direto para o ML (o Studio baixa e envia o arquivo) e devolve o id dela.
 * Mandar só o link (`source`) deixava anúncios dias em "picture_download_pending".
 */
export async function mlUploadPicture(token: string, url: string): Promise<string> {
  const img = await fetch(url);
  if (!img.ok) throw new Error(`foto ${img.status}`);
  const blob = await img.blob();
  const form = new FormData();
  form.append("file", blob, url.split("/").pop()?.split("?")[0] || "foto.jpg");
  const res = await fetch(`${API}/pictures/items/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(`Mercado Livre (foto): ${data.message ?? data.error ?? res.status}`);
  return data.id as string;
}

/** Fotos para o anúncio: sobe cada uma; se o envio falhar, cai no link (o ML tenta baixar). */
export async function mlPictures(token: string, urls: string[]) {
  const out: ({ id: string } | { source: string })[] = [];
  for (const url of urls.slice(0, 10)) {
    out.push(await mlUploadPicture(token, url).then((id) => ({ id })).catch(() => ({ source: url })));
  }
  return out;
}

