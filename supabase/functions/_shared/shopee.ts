// Cliente da Shopee Open Platform (API v2).
// Toda chamada é assinada: HMAC-SHA256(partner_key, partner_id + path + timestamp [+ access_token + shop_id]).
// O token da loja vale 4 horas e o refresh token 30 dias (cada renovação devolve um novo).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env, functionsUrl, hmacHex } from "./util.ts";

const BASE = "https://partner.shopeemobile.com";

const partnerId = () => Number(env("SHOPEE_PARTNER_ID"));
const now = () => Math.floor(Date.now() / 1000);

async function signed(path: string, extra: { token?: string; shopId?: string | number } = {}) {
  const ts = now();
  const base = `${partnerId()}${path}${ts}${extra.token ?? ""}${extra.shopId ?? ""}`;
  const sign = await hmacHex(env("SHOPEE_PARTNER_KEY"), base);
  const url = new URL(BASE + path);
  url.searchParams.set("partner_id", String(partnerId()));
  url.searchParams.set("timestamp", String(ts));
  url.searchParams.set("sign", sign);
  if (extra.token) url.searchParams.set("access_token", extra.token);
  if (extra.shopId !== undefined) url.searchParams.set("shop_id", String(extra.shopId));
  return url;
}

/** Link de autorização da loja; o state vai na própria URL de retorno (a Shopee só acrescenta code e shop_id). */
export async function shopeeAuthorizeUrl(state: string) {
  const url = await signed("/api/v2/shop/auth_partner");
  url.searchParams.set("redirect", `${functionsUrl("oauth-shopee")}?state=${encodeURIComponent(state)}`);
  return url.toString();
}

// deno-lint-ignore no-explicit-any
async function call<T = any>(url: URL, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Shopee: ${data.message || data.error || res.status}`);
  return data as T;
}

type Token = { access_token: string; refresh_token: string; expire_in: number };

export async function shopeeExchangeCode(code: string, shopId: string) {
  return call<Token>(await signed("/api/v2/auth/token/get"), {
    method: "POST",
    body: { code, shop_id: Number(shopId), partner_id: partnerId() },
  });
}

/** Token válido da loja (renova quando faltam menos de 10 minutos). */
export async function shopeeTokenFor(db: SupabaseClient, accountId: string, shopId: string): Promise<string> {
  const { data } = await db.from("account_tokens").select("*").eq("account_id", accountId).single();
  if (!data) throw new Error("Loja da Shopee sem token: reconecte em Contas");
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 10 * 60 * 1000) return data.access_token;
  const fresh = await call<Token>(await signed("/api/v2/auth/access_token/get"), {
    method: "POST",
    body: { refresh_token: data.refresh_token, shop_id: Number(shopId), partner_id: partnerId() },
  });
  await db.from("account_tokens").update({
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token,
    expires_at: new Date(Date.now() + fresh.expire_in * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("account_id", accountId);
  return fresh.access_token;
}

/** Chamada de loja (GET com parâmetros na URL ou POST com corpo). */
// deno-lint-ignore no-explicit-any
export async function shopee<T = any>(token: string, shopId: string, path: string, init: { params?: Record<string, string | number>; body?: unknown } = {}) {
  const url = await signed(path, { token, shopId });
  for (const [k, v] of Object.entries(init.params ?? {})) url.searchParams.set(k, String(v));
  const data = await call<{ response: T }>(url, init.body === undefined ? {} : { method: "POST", body: init.body });
  return data.response;
}

export async function shopeeShopInfo(token: string, shopId: string) {
  return shopee<{ shop_name?: string }>(token, shopId, "/api/v2/shop/get_shop_info").catch(() => ({} as { shop_name?: string }));
}

export type ShopeeItem = {
  item_id: number;
  item_name: string;
  item_sku?: string;
  category_id?: number;
  price_info?: { current_price?: number; original_price?: number }[];
  has_model?: boolean;
  image?: { image_url_list?: string[] };
  // deno-lint-ignore no-explicit-any
  attribute_list?: any[];
  // deno-lint-ignore no-explicit-any
  logistic_info?: any[];
  // deno-lint-ignore no-explicit-any
  tax_info?: Record<string, any>;
  weight?: number | string;
  // deno-lint-ignore no-explicit-any
  dimension?: any;
  condition?: string;
};

/** Anúncios ativos da loja (até `max`), com os dados básicos (inclui preço e dados fiscais). */
export async function shopeeItems(token: string, shopId: string, max = 200): Promise<ShopeeItem[]> {
  const ids: number[] = [];
  let offset = 0;
  while (ids.length < max) {
    const page = await shopee<{ item?: { item_id: number }[]; has_next_page?: boolean; next_offset?: number }>(
      token, shopId, "/api/v2/product/get_item_list", { params: { offset, page_size: 100, item_status: "NORMAL" } },
    );
    ids.push(...(page.item ?? []).map((i) => i.item_id));
    if (!page.has_next_page || page.next_offset === undefined) break;
    offset = page.next_offset;
  }
  const items: ShopeeItem[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await shopee<{ item_list?: ShopeeItem[] }>(token, shopId, "/api/v2/product/get_item_base_info", {
      params: { item_id_list: ids.slice(i, i + 50).join(","), need_tax_info: "true" },
    });
    items.push(...(r.item_list ?? []));
  }
  return items;
}
