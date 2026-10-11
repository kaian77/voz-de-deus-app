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

// ---------------------------------------------------------------------------
// Cadastro de produtos (escopo write_products)
// ---------------------------------------------------------------------------

/** Modelo de cadastro: tudo que se repete entre produtos. {nome} é trocado pelo nome do produto. */
export type ProductTemplate = {
  name_pattern?: string;
  price?: number;
  promotional_price?: number | null;
  stock?: number | null; // null = estoque infinito
  weight?: number; // kg
  width?: number; // cm
  height?: number;
  depth?: number;
  sku_prefix?: string;
  category_ids?: number[];
  description?: string;
  ai_description?: boolean;
  tags?: string;
  brand?: string;
  published?: boolean;
  free_shipping?: boolean;
  seo_title?: string;
  seo_description?: string;
};

export type ProductChanges = Partial<Omit<ProductTemplate, "name_pattern" | "sku_prefix" | "ai_description">> & {
  name?: string;
  sku?: string;
};

const fill = (text: string | undefined, name: string) => (text ?? "").replaceAll("{nome}", name).trim();
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Texto simples (com quebras de linha) -> HTML de parágrafos, como a Nuvemshop espera. */
export const toHtml = (text: string) =>
  text.includes("<") && /<\/(p|ul|li|br|strong)>/i.test(text)
    ? text
    : text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : String(Number(v)));

function variantFields(src: ProductChanges) {
  const v: Record<string, unknown> = {};
  if (src.price !== undefined) v.price = num(src.price);
  if (src.promotional_price !== undefined) v.promotional_price = src.promotional_price === null ? null : num(src.promotional_price);
  if (src.stock !== undefined) {
    v.stock_management = src.stock !== null;
    v.stock = src.stock;
  }
  for (const k of ["weight", "width", "height", "depth"] as const) if (src[k] !== undefined) v[k] = num(src[k]);
  if (src.sku !== undefined) v.sku = src.sku;
  return v;
}

function productFields(src: ProductChanges) {
  const p: Record<string, unknown> = {};
  if (src.name !== undefined) p.name = { pt: src.name };
  if (src.description !== undefined) p.description = { pt: toHtml(src.description) };
  if (src.category_ids !== undefined) p.categories = src.category_ids;
  if (src.tags !== undefined) p.tags = src.tags;
  if (src.brand !== undefined) p.brand = src.brand;
  if (src.published !== undefined) p.published = src.published;
  if (src.free_shipping !== undefined) p.free_shipping = src.free_shipping;
  if (src.seo_title !== undefined) p.seo_title = { pt: src.seo_title };
  if (src.seo_description !== undefined) p.seo_description = { pt: src.seo_description };
  return p;
}

/** Aplica o modelo ao nome informado (nome final, descrição e SEO com {nome} preenchido). */
export function applyTemplate(template: ProductTemplate, baseName: string, overrides: ProductChanges = {}): ProductChanges {
  const name = overrides.name ?? (fill(template.name_pattern || "{nome}", baseName) || baseName);
  const slug = baseName.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    name,
    description: fill(template.description, baseName) || undefined,
    price: template.price,
    promotional_price: template.promotional_price ?? undefined,
    stock: template.stock === undefined ? undefined : template.stock,
    weight: template.weight,
    width: template.width,
    height: template.height,
    depth: template.depth,
    sku: template.sku_prefix ? `${template.sku_prefix}${slug}`.slice(0, 50) : undefined,
    category_ids: template.category_ids?.length ? template.category_ids : undefined,
    tags: template.tags || undefined,
    brand: template.brand || undefined,
    published: template.published ?? true,
    free_shipping: template.free_shipping ?? false,
    seo_title: fill(template.seo_title, baseName) || undefined,
    seo_description: fill(template.seo_description, baseName) || undefined,
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
  };
}

export async function nsCategories(token: string, storeId: string) {
  const list = await ns<any[]>(token, storeId, "categories?per_page=200");
  return (Array.isArray(list) ? list : []).map((c) => ({ id: c.id as number, name: txt(c.name), parent: c.parent as number | null }));
}

function productSummary(p: any) {
  return {
    id: p.id,
    name: txt(p.name),
    url: p.canonical_url,
    published: p.published,
    price: money(p.variants?.[0]?.promotional_price || p.variants?.[0]?.price),
    stock: p.variants?.[0]?.stock ?? null,
    images: (p.images ?? []).length,
  };
}

export async function nsCreateProduct(token: string, storeId: string, fields: ProductChanges, images: string[]) {
  if (!fields.name) throw new Error("O produto precisa de um nome");
  if (fields.price === undefined) throw new Error("O produto precisa de um preço (defina no modelo ou informe price)");
  const body = {
    ...productFields(fields),
    variants: [variantFields(fields)],
    images: images.slice(0, 50).map((src, i) => ({ src, position: i + 1 })),
  };
  return productSummary(await ns(token, storeId, "products", { method: "POST", body }));
}

/** Encontra um produto pelo nome (ou id). Ambíguo = erro listando as opções. */
export async function nsFindProduct(token: string, storeId: string, nameOrId: string | number) {
  const key = String(nameOrId).trim();
  if (/^\d{5,}$/.test(key)) {
    const one = await ns(token, storeId, `products/${key}`).catch(() => null);
    if (one && !Array.isArray(one)) return one;
  }
  const list = await ns<any[]>(token, storeId, `products?q=${encodeURIComponent(key)}&per_page=30`);
  const found = Array.isArray(list) ? list : [];
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const exact = found.filter((p) => norm(txt(p.name)) === norm(key));
  if (exact.length === 1) return exact[0];
  if (found.length === 1) return found[0];
  if (!found.length) throw new Error(`Nenhum produto encontrado com "${key}"`);
  throw new Error(`Mais de um produto com "${key}": ${found.slice(0, 10).map((p) => `${txt(p.name)} (id ${p.id})`).join("; ")}. Use o nome completo ou o id.`);
}

export async function nsUpdateProduct(token: string, storeId: string, nameOrId: string | number, changes: ProductChanges, addImages: string[] = []) {
  const product = await nsFindProduct(token, storeId, nameOrId);
  const fields = productFields(changes);
  if (Object.keys(fields).length) await ns(token, storeId, `products/${product.id}`, { method: "PUT", body: fields });
  const vFields = variantFields(changes);
  if (Object.keys(vFields).length) {
    for (const v of product.variants ?? []) {
      await ns(token, storeId, `products/${product.id}/variants/${v.id}`, { method: "PUT", body: vFields });
    }
  }
  for (const src of addImages.slice(0, 20)) {
    await ns(token, storeId, `products/${product.id}/images`, { method: "POST", body: { src } });
  }
  return productSummary(await ns(token, storeId, `products/${product.id}`));
}
