// Cliente da API da Nuvemshop (Tiendanube).
// Docs: https://dev.nuvemshop.com.br/docs/applications/authentication
// O token não expira (só deixa de valer se o app for desinstalado). A autenticação usa o header
// "Authentication: bearer <token>" e a API exige User-Agent.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env } from "./util.ts";

const API = "https://api.nuvemshop.com.br/v1";
const USER_AGENT = "Social Studio (suporte@socialstudio.app)";

export function nsAuthorizeUrl(state: string) {
  const url = new URL(`https://www.nuvemshop.com.br/apps/${env("NUVEMSHOP_APP_ID")}/authorize`);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function nsExchangeCode(code: string) {
  const res = await fetch("https://www.nuvemshop.com.br/apps/authorize/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      client_id: env("NUVEMSHOP_APP_ID"),
      client_secret: env("NUVEMSHOP_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw new Error(`Nuvemshop: ${data.error_description ?? data.error ?? res.status}`);
  return data as { access_token: string; user_id: number | string; scope?: string };
}

export async function ns<T = any>(token: string, storeId: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}/${storeId}/${path}`, {
    method: init.method ?? "GET",
    headers: { Authentication: `bearer ${token}`, "User-Agent": USER_AGENT, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 404 && (init.method ?? "GET") === "GET") return [] as T; // lista vazia/sem resultado
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Nuvemshop: ${data.description ?? data.message ?? res.status}`);
  return data as T;
}

/** Conta da loja do usuário + token. */
export async function storeFor(db: SupabaseClient, userId: string) {
  const { data: account } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", "nuvemshop")
    .order("connected_at").limit(1).maybeSingle();
  if (!account) return null;
  const { data: tok } = await db.from("account_tokens").select("access_token").eq("account_id", account.id).maybeSingle();
  if (!tok) return null;
  return { account, token: tok.access_token as string, storeId: account.external_id as string };
}

/** Textos da Nuvemshop vêm por idioma ({ pt: "..." }). */
export function txt(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const v = value as Record<string, string>;
  return v.pt ?? v.es ?? Object.values(v)[0] ?? "";
}

const money = (v: unknown) => (v == null || v === "" ? undefined : `R$ ${Number(v).toFixed(2).replace(".", ",")}`);
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const SHIPPING_LABEL: Record<string, string> = {
  unpacked: "aguardando embalagem",
  unfulfilled: "ainda não enviado",
  unshipped: "ainda não enviado",
  fulfilled: "enviado",
  shipped: "enviado",
  delivered: "entregue",
};
const PAYMENT_LABEL: Record<string, string> = {
  pending: "aguardando pagamento",
  authorized: "pagamento autorizado",
  paid: "pago",
  abandoned: "abandonado",
  refunded: "reembolsado",
  voided: "cancelado",
};

/** Resumo de pedido sem dados sensíveis (sem endereço, CPF ou telefone). */
export function orderSummary(o: any) {
  return {
    id: o.id,
    number: o.number,
    created_at: o.created_at,
    customer: o.contact_name ?? o.customer?.name,
    email: o.contact_email ?? o.customer?.email,
    status: o.status, // open | closed | cancelled
    payment: PAYMENT_LABEL[o.payment_status] ?? o.payment_status,
    shipping: SHIPPING_LABEL[o.shipping_status] ?? o.shipping_status,
    shipping_option: txt(o.shipping_option),
    shipping_days: o.shipping_min_days != null ? `${o.shipping_min_days} a ${o.shipping_max_days} dias úteis` : undefined,
    tracking_number: o.shipping_tracking_number || undefined,
    tracking_url: o.shipping_tracking_url || undefined,
    shipped_at: o.shipped_at || undefined,
    total: money(o.total),
    items: (o.products ?? []).map((p: any) => `${p.quantity}x ${txt(p.name)}`),
  };
}

export async function nsOrders(token: string, storeId: string, opts: { q?: string; status?: string; limit?: number } = {}) {
  const params = new URLSearchParams({ per_page: String(Math.min(opts.limit ?? 20, 200)) });
  if (opts.q) params.set("q", opts.q);
  if (opts.status) params.set("status", opts.status);
  const list = await ns<any[]>(token, storeId, `orders?${params}`);
  return (Array.isArray(list) ? list : []).map(orderSummary);
}

/** Busca um pedido pelo número que o cliente vê (ex.: 1234) ou pelo id interno. */
export async function nsFindOrder(token: string, storeId: string, numberOrId: string | number) {
  const key = String(numberOrId).replace(/\D/g, "");
  if (!key) return null;
  const found = await nsOrders(token, storeId, { q: key, limit: 10 });
  const match = found.find((o) => String(o.number) === key || String(o.id) === key);
  if (match) return match;
  if (key.length >= 8) {
    const one = await ns(token, storeId, `orders/${key}`).catch(() => null);
    if (one && !Array.isArray(one)) return orderSummary(one);
  }
  return null;
}

export async function nsProducts(token: string, storeId: string, opts: { q?: string; limit?: number } = {}) {
  const params = new URLSearchParams({ per_page: String(Math.min(opts.limit ?? 50, 200)), published: "true" });
  if (opts.q) params.set("q", opts.q);
  const list = await ns<any[]>(token, storeId, `products?${params}`);
  return (Array.isArray(list) ? list : []).map((p) => {
    const variants = p.variants ?? [];
    const prices = variants.map((v: any) => Number(v.promotional_price || v.price)).filter((n: number) => n > 0);
    const stock = variants.some((v: any) => v.stock == null) ? null : variants.reduce((s: number, v: any) => s + Number(v.stock ?? 0), 0);
    return {
      id: p.id,
      name: txt(p.name),
      price: prices.length ? money(Math.min(...prices)) : undefined,
      regular_price: money(variants[0]?.price),
      on_sale: variants.some((v: any) => v.promotional_price && Number(v.promotional_price) < Number(v.price)),
      stock, // null = estoque infinito
      url: p.canonical_url,
      image: p.images?.[0]?.src,
      description: plain(txt(p.description)).slice(0, 300),
    };
  });
}

export async function nsStore(token: string, storeId: string) {
  const s = await ns(token, storeId, "store");
  return {
    id: s.id,
    name: txt(s.name),
    description: plain(txt(s.description)),
    url: s.url_with_protocol ?? (s.original_domain ? `https://${s.original_domain}` : undefined),
    email: s.contact_email ?? s.email,
    phone: s.phone,
    whatsapp: s.whatsapp_phone_number,
    instagram: s.instagram,
    address: s.business_address ?? s.address,
  };
}

/** Páginas de conteúdo da loja (trocas, envio, perguntas frequentes...). */
export async function nsPages(token: string, storeId: string) {
  const list = await ns<any[]>(token, storeId, "pages?per_page=50").catch(() => []);
  return (Array.isArray(list) ? list : []).map((p) => ({ title: txt(p.title ?? p.name), text: plain(txt(p.content ?? p.body)).slice(0, 4000) }));
}
