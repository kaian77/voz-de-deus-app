// Mercado Livre e Shopee: análise dos anúncios que o lojista já tem (preço x loja, categoria, frete,
// dados fiscais) e publicação de produtos novos seguindo esse padrão.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ns, storeFor, txt } from "./nuvemshop.ts";
import { ml, type MlItem, ML_LOOKUP_FIELDS, mlPictures, mlSellerItems, mlSku, mlTokenFor } from "./mercadolivre.ts";
import { shopeeItems, shopeeTokenFor } from "./shopee.ts";

export type Marketplace = "mercadolivre" | "shopee";

export type PriceRule = { type: "ratio" | "add"; value: number; ending: number | null };

export type Analysis = {
  at: string;
  listings: number;
  matched: number;
  rule: PriceRule | null;
  rule_text: string;
  samples: { name: string; store: number; marketplace: number }[];
  category?: string | null;
  listing_type?: string | null;
  shipping?: Record<string, unknown> | null;
  reference_id?: string | null;
  fiscal?: Record<string, unknown> | null;
  errors: string[];
};

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ")
  .split(/\s+/).filter((w) => w.length > 2 && !["pin", "pins", "broche", "botton", "metal", "esmaltado", "com", "para", "brax", "multicolorido"].includes(w));
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const mode = <T>(a: T[]) => {
  const m = new Map<string, { v: T; n: number }>();
  for (const v of a) {
    const k = JSON.stringify(v);
    m.set(k, { v, n: (m.get(k)?.n ?? 0) + 1 });
  }
  return [...m.values()].sort((x, y) => y.n - x.n)[0]?.v;
};
const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

/** Preço no marketplace a partir do preço da loja, seguindo a regra observada nos anúncios atuais. */
export function applyRule(storePrice: number, rule: PriceRule | null) {
  if (!rule) return storePrice;
  let p = rule.type === "ratio" ? storePrice * rule.value : storePrice + rule.value;
  if (rule.ending !== null) p = Math.floor(p) + rule.ending / 100; // mantém o final de centavos (ex.: ,90)
  return Math.round(p * 100) / 100;
}

/** Produtos da loja Nuvemshop: preço por SKU e por nome. */
async function storePrices(db: SupabaseClient, userId: string) {
  const store = await storeFor(db, userId);
  if (!store) return [];
  const out: { name: string; words: string[]; skus: string[]; price: number }[] = [];
  for (let page = 1; page <= 4; page++) {
    // deno-lint-ignore no-explicit-any
    const list = await ns<any[]>(store.token, store.storeId, `products?per_page=200&page=${page}`).catch(() => []);
    if (!Array.isArray(list) || !list.length) break;
    for (const p of list) {
      // deno-lint-ignore no-explicit-any
      const variants: any[] = p.variants ?? [];
      const price = Number(variants[0]?.price ?? 0);
      if (!price) continue;
      const name = txt(p.name);
      out.push({ name, words: norm(name), skus: variants.map((v) => String(v.sku ?? "").trim()).filter(Boolean), price });
    }
    if (list.length < 200) break;
  }
  return out;
}

function matchStore(store: Awaited<ReturnType<typeof storePrices>>, name: string, sku: string | null | undefined) {
  if (sku) {
    const bySku = store.find((s) => s.skus.includes(sku.trim()));
    if (bySku) return bySku;
  }
  const words = norm(name);
  if (!words.length) return null;
  let best: (typeof store)[number] | null = null;
  let score = 0;
  for (const s of store) {
    const common = s.words.filter((w) => words.includes(w)).length;
    const j = common / new Set([...s.words, ...words]).size;
    if (j > score) [best, score] = [s, j];
  }
  return score >= 0.6 ? best : null;
}

/** Descobre a regra de preço comparando os anúncios com a loja. */
function priceRule(pairs: { store: number; marketplace: number }[]): { rule: PriceRule | null; text: string } {
  if (pairs.length < 2) return { rule: null, text: "Poucos produtos em comum com a loja para descobrir a regra de preço." };
  const ratio = median(pairs.map((p) => p.marketplace / p.store));
  const add = median(pairs.map((p) => p.marketplace - p.store));
  const errRatio = pairs.reduce((s, p) => s + Math.abs(p.marketplace - p.store * ratio), 0);
  const errAdd = pairs.reduce((s, p) => s + Math.abs(p.marketplace - (p.store + add)), 0);
  const cents = pairs.map((p) => Math.round((p.marketplace % 1) * 100));
  const ending = mode(cents) ?? null;
  const endingShare = cents.filter((c) => c === ending).length / cents.length;
  const end = endingShare >= 0.6 ? ending : null;
  const endText = end !== null ? `, terminando em ,${String(end).padStart(2, "0")}` : "";
  if (Math.abs(ratio - 1) < 0.01 && Math.abs(add) < 0.5) return { rule: { type: "ratio", value: 1, ending: end }, text: `Mesmo preço da loja${endText}.` };
  if (errAdd < errRatio) {
    return { rule: { type: "add", value: Math.round(add * 100) / 100, ending: end }, text: `Preço da loja + ${brl(add)}${endText}.` };
  }
  const pct = Math.round((ratio - 1) * 1000) / 10;
  return { rule: { type: "ratio", value: Math.round(ratio * 10000) / 10000, ending: end }, text: `Preço da loja ${pct >= 0 ? "+" : ""}${pct}%${endText}.` };
}

async function account(db: SupabaseClient, userId: string, platform: Marketplace) {
  const { data } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", platform).order("connected_at").limit(1).maybeSingle();
  return data;
}

/**
 * Anúncios do Mercado Livre (todos menos os encerrados), os produtos da loja que ainda não têm anúncio lá
 * e um diagnóstico dos anúncios fora do ar (status, sub_status, tags e o que o ML diz das infrações).
 */
export async function mercadoLivreListings(db: SupabaseClient, userId: string) {
  const acc = await account(db, userId, "mercadolivre");
  if (!acc) throw new Error("Conecte o Mercado Livre em Contas");
  const token = await mlTokenFor(db, acc.id);
  const fields = ["id", "title", "family_name", "price", "status", "sub_status", "tags", "permalink", "seller_custom_field"];
  const items = (await mlSellerItems(token, acc.external_id, 1000, "", fields)).filter((i) => i.status !== "closed");
  const store = await storePrices(db, userId);
  const listed = new Set<string>();
  // deno-lint-ignore no-explicit-any
  const listings = items.map((it: any) => {
    const m = matchStore(store, it.title, it.seller_custom_field);
    if (m) listed.add(m.name);
    return { id: it.id, title: it.title, price: it.price, status: it.status, sub_status: it.sub_status ?? [], tags: it.tags ?? [], store_product: m?.name ?? null };
  });
  const missing = store.filter((s) => !listed.has(s.name)).map((s) => ({ name: s.name, price: s.price }));

  // Diagnóstico: contagem por motivo e o que as APIs de moderação/saúde dizem de alguns anúncios fora do ar
  const problems = listings.filter((l) => l.status !== "active");
  const by_reason: Record<string, number> = {};
  for (const p of problems) {
    const key = `${p.status}: ${[...p.sub_status].sort().join(",") || "-"}`;
    by_reason[key] = (by_reason[key] ?? 0) + 1;
  }
  const probe = async (path: string) => {
    try {
      return JSON.stringify(await ml(token, path)).slice(0, 6000);
    } catch (e) {
      return `erro: ${e instanceof Error ? e.message : e}`;
    }
  };
  const samples: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const p of problems) {
    const key = `${p.status}:${p.sub_status.join(",")}`;
    if (seen.has(key) || samples.length >= 4) continue;
    seen.add(key);
    samples.push({
      id: p.id, title: p.title, status: p.status, sub_status: p.sub_status, tags: p.tags,
      infractions: await probe(`/moderations/infractions/${acc.external_id}?related_item_id=${p.id}`),
      performance: await probe(`/item/${p.id}/performance`),
    });
  }
  // Qualidade (performance) e experiência de compra de alguns anúncios ativos
  const quality = [];
  for (const l of listings.filter((x) => x.status === "active").slice(0, 2)) {
    quality.push({
      id: l.id, title: l.title,
      performance: await probe(`/item/${l.id}/performance`),
      experience: await probe(`/reputation/items/${l.id}/purchase_experience/integrators?locale=pt_BR`),
    });
  }
  // Anúncio modelo: atributos (de onde vem o título montado pelo ML) e dados fiscais, para copiar o formato
  const refId = acc.meta?.analysis?.reference_id as string | undefined;
  // deno-lint-ignore no-explicit-any
  const ref = refId ? await ml<any>(token, `/items/${refId}`).catch(() => null) : null;
  const reference = ref && {
    id: ref.id, title: ref.title, family_name: ref.family_name, user_product_id: ref.user_product_id, seller_custom_field: ref.seller_custom_field,
    // deno-lint-ignore no-explicit-any
    attributes: (ref.attributes ?? []).map((a: any) => `${a.id}=${a.value_name ?? a.value_id}`),
    fiscal_detail: await probe(`/items/${refId}/fiscal_information/detail`),
    fiscal_by_sku: ref.seller_custom_field ? await probe(`/items/fiscal_information/${encodeURIComponent(ref.seller_custom_field)}`) : null,
  };
  const search_filters = await probe(`/users/${acc.external_id}/items/search?include_filters=true&limit=1`);
  return {
    reference,
    search_filters,
    quality,
    store_products: store.length,
    active: listings.length - problems.length,
    not_active: problems.length,
    by_reason,
    samples,
    problems: problems.map((p) => ({ id: p.id, title: p.title, status: p.status, sub_status: p.sub_status, store_product: p.store_product })),
    missing,
  };
}

/** Lê os anúncios do marketplace, compara com a loja e guarda o padrão em social_accounts.meta.analysis. */
export async function analyzeMarketplace(db: SupabaseClient, userId: string, platform: Marketplace): Promise<Analysis> {
  const acc = await account(db, userId, platform);
  if (!acc) throw new Error(`Conecte o ${platform === "mercadolivre" ? "Mercado Livre" : "a Shopee"} em Contas`);
  const store = await storePrices(db, userId).catch(() => []);
  const errors: string[] = [];
  const pairs: { name: string; store: number; marketplace: number }[] = [];
  let analysis: Omit<Analysis, "rule" | "rule_text" | "samples" | "matched">;

  if (platform === "mercadolivre") {
    const token = await mlTokenFor(db, acc.id);
    const items = await mlSellerItems(token, acc.external_id);
    for (const it of items) {
      const m = matchStore(store, it.title, mlSku(it));
      if (m && it.price) pairs.push({ name: it.title, store: m.price, marketplace: it.price });
    }
    const category = mode(items.map((i) => i.category_id)) ?? null;
    const sameCat = items.filter((i) => i.category_id === category);
    const listing_type = mode(sameCat.map((i) => i.listing_type_id)) ?? null;
    const ref = [...sameCat].filter((i) => !i.catalog_listing && i.listing_type_id === listing_type)
      .sort((a, b) => (b.sold_quantity ?? 0) - (a.sold_quantity ?? 0))[0] ?? null;
    analysis = {
      at: new Date().toISOString(),
      listings: items.length,
      category,
      listing_type,
      shipping: ref?.shipping ? { mode: ref.shipping.mode, free_shipping: ref.shipping.free_shipping, logistic_type: ref.shipping.logistic_type } : null,
      reference_id: ref?.id ?? null,
      fiscal: null,
      errors,
    };
  } else {
    const token = await shopeeTokenFor(db, acc.id, acc.external_id);
    const items = await shopeeItems(token, acc.external_id);
    for (const it of items) {
      const price = Number(it.price_info?.[0]?.original_price ?? it.price_info?.[0]?.current_price ?? 0);
      const m = matchStore(store, it.item_name, it.item_sku);
      if (m && price) pairs.push({ name: it.item_name, store: m.price, marketplace: price });
    }
    const category = mode(items.map((i) => String(i.category_id ?? ""))) || null;
    const ref = items.find((i) => String(i.category_id) === category && !i.has_model) ?? items[0] ?? null;
    const fiscal = mode(items.map((i) => i.tax_info).filter((t) => t && Object.keys(t).length)) ?? null;
    analysis = {
      at: new Date().toISOString(),
      listings: items.length,
      category,
      listing_type: null,
      shipping: ref?.logistic_info ? { logistic_info: ref.logistic_info } : null,
      reference_id: ref ? String(ref.item_id) : null,
      fiscal,
      errors,
    };
  }

  const { rule, text } = priceRule(pairs);
  const result: Analysis = { ...analysis, matched: pairs.length, rule, rule_text: text, samples: pairs.slice(0, 6) };
  await db.from("social_accounts").update({ meta: { ...(acc.meta ?? {}), analysis: result } }).eq("id", acc.id);
  return result;
}

// Atributos próprios de cada produto (os demais, como marca, material e medidas da embalagem, vêm do anúncio modelo)
// COLOR e PATTERN_NAME do modelo ("Branco", "Zé Gotinha") iam parar no título de todos os pins
const OWN_ATTRS = new Set(["SELLER_SKU", "GTIN", "MODEL", "ALPHANUMERIC_MODEL", "LINE", "CHARACTER", "COLOR", "PATTERN_NAME"]);

/**
 * Publica um produto no Mercado Livre copiando o padrão do anúncio de referência do lojista
 * (categoria, tipo de anúncio, frete, garantia e atributos gerais) e aplicando a regra de preço.
 */
export async function publishToMercadoLivre(
  db: SupabaseClient,
  userId: string,
  product: {
    name: string;
    description?: string;
    images: string[];
    price: number;
    sku?: string;
    stock?: number | null;
    /** Fotos já tratadas para o ML (tabela ml_photos): substituem as do anúncio mesmo ativo */
    ml_ready_pictures?: boolean;
    /** Anúncios que já são de outro produto da loja: nunca são atualizados com este */
    exclude_ids?: string[];
    /** Kit: quantos pins vêm (0 = não sei) — o anúncio sai como "Kit" e não como unidade */
    kit_units?: number;
  },
  /** Anúncios do vendedor já carregados (a sincronização em lote busca uma vez só) */
  sellerItems?: MlItem[],
) {
  const acc = await account(db, userId, "mercadolivre");
  if (!acc) throw new Error("Conecte o Mercado Livre em Contas");
  const analysis: Analysis | undefined = acc.meta?.analysis ?? await analyzeMarketplace(db, userId, "mercadolivre");
  if (!analysis?.reference_id) throw new Error("Não achei um anúncio seu no Mercado Livre para usar de modelo");
  const token = await mlTokenFor(db, acc.id);
  const warnings: string[] = [];
  const description = product.description ? mlPlainText(product.description) : "";
  const setDescription = async (id: string, update: boolean) => {
    if (!description) return;
    const path = `/items/${id}/description`;
    const send = (method: string) => ml(token, path, { method, body: { plain_text: description } });
    const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
    // Atualiza com PUT; POST só quando o anúncio ainda não tem descrição (se o POST diz que já tem, o erro que vale é o do PUT)
    await (update
      ? send("PUT").catch((put) => send("POST").catch((post) => { throw new Error(/already has a description/i.test(msg(post)) ? msg(put) : msg(post)); }))
      : send("POST"))
      .catch((e) => warnings.push(`descrição: ${msg(e)}`));
  };

  // Produto já anunciado (em qualquer status, pelo SKU ou pelo nome): atualiza em vez de duplicar
  const existing = await findMlListing(token, acc.external_id, product.name, product.sku, sellerItems, new Set(product.exclude_ids ?? []));
  if (existing) {
    const id = existing.id;
    await setDescription(id, true);
    const changes: Record<string, unknown> = { available_quantity: product.stock ?? DEFAULT_ML_STOCK };
    // Fotos já no padrão do ML (fundo branco, 1200x1200) sempre substituem; as da loja, só em anúncio inativo
    if (product.images.length && (product.ml_ready_pictures || existing.status !== "active")) {
      changes.pictures = await mlPictures(token, product.images);
    }
    await ml(token, `/items/${id}`, { method: "PUT", body: changes })
      .catch((e) => warnings.push(`atualizar: ${e instanceof Error ? e.message : e}`));
    // Título no modelo User Products = nome + cor + estampa: anúncios antigos vieram do modelo com "Branco Zé Gotinha"
    // (o ML pausa por "título não corresponde ao produto"). Vai separado para um atributo recusado não travar o resto.
    const model = pinModelName(product.name);
    const attrs = [
      ...(product.sku ? [{ id: "SELLER_SKU", value_name: product.sku }] : []), // os dados fiscais vão por SKU
      { id: "COLOR", value_name: "Multicolorido" },
      { id: "PATTERN_NAME", value_name: model },
      { id: "MODEL", value_name: model },
      ...kitAttrs(product.kit_units),
    ];
    await ml(token, `/items/${id}`, { method: "PUT", body: { attributes: attrs } })
      .catch((e) => warnings.push(`atributos: ${e instanceof Error ? e.message : e}`));
    // Sem "tempo de disponibilidade" (prazo de fabricação): o ML rebaixa o anúncio que tem (pin tem pronta entrega)
    // (a lista de anúncios da sincronização não traz sale_terms; sem prazo o ML só recusa, e a análise de qualidade mostra se ficou)
    if (existing.sale_terms?.some((t) => t.id === "MANUFACTURING_TIME") || !existing.sale_terms) {
      await ml(token, `/items/${id}`, { method: "PUT", body: { sale_terms: [{ id: "MANUFACTURING_TIME", value_id: null, value_name: null }] } }).catch(() => {});
    }
    if (product.sku) await setMlFiscal(token, analysis.reference_id, product.sku, product.name).catch((e) => warnings.push(`fiscal: ${e instanceof Error ? e.message : e}`));
    let item = await ml<MlItem & { sub_status?: string[] }>(token, `/items/${id}`);
    if (item.status === "paused") {
      await ml(token, `/items/${id}`, { method: "PUT", body: { status: "active" } })
        .catch((e) => warnings.push(`reativar: ${e instanceof Error ? e.message : e}`));
      item = await ml<MlItem & { sub_status?: string[] }>(token, `/items/${id}`);
    }
    return { id, permalink: item.permalink, price: item.price, status: item.status, sub_status: item.sub_status ?? [], updated: true, warnings };
  }

  const ref = await ml<MlItem>(token, `/items/${analysis.reference_id}`);

  const attributes = (ref.attributes ?? [])
    .filter((a) => !OWN_ATTRS.has(a.id) && (a.value_id || a.value_name))
    // O value_id de valores próprios do vendedor (ex.: a marca) não existe no catálogo do ML; pelo nome ele resolve
    .map((a) => (a.value_name ? { id: a.id, value_name: a.value_name } : { id: a.id, value_id: a.value_id }));
  // O ML monta o título com nome + cor + modelo ("Pin Snoopy (metal Esmaltado) Multicolorido Snoopy"): o modelo é só o nome do pin
  if (product.kit_units !== undefined) {
    const own = kitAttrs(product.kit_units);
    attributes.splice(0, attributes.length, ...attributes.filter((a) => !["SALE_FORMAT", "UNITS_PER_PACK"].includes(a.id)), ...own);
  }
  attributes.push({ id: "MODEL", value_name: pinModelName(product.name) });
  attributes.push({ id: "COLOR", value_name: "Multicolorido" });
  if (product.sku) attributes.push({ id: "SELLER_SKU", value_name: product.sku });

  const title = mlFamilyName(product.name);
  const body: Record<string, unknown> = {
    title,
    category_id: ref.category_id,
    price: applyRule(product.price, analysis.rule),
    currency_id: "BRL",
    available_quantity: product.stock ?? DEFAULT_ML_STOCK,
    buying_mode: "buy_it_now",
    condition: "new",
    listing_type_id: ref.listing_type_id,
    pictures: await mlPictures(token, product.images),
    attributes,
    sale_terms: (ref.sale_terms ?? []).map((t) => (t.value_id ? { id: t.id, value_id: t.value_id } : { id: t.id, value_name: t.value_name })),
    shipping: ref.shipping ? { mode: ref.shipping.mode, local_pick_up: ref.shipping.local_pick_up ?? false, free_shipping: ref.shipping.free_shipping ?? false } : undefined,
  };
  let created: MlItem;
  try {
    created = await ml<MlItem>(token, "/items", { method: "POST", body });
  } catch (e) {
    // Contas no modelo "User Products": o título é gerado pelo ML e o vendedor manda family_name
    if (!/family_name/i.test(String(e))) throw e;
    const { title: _t, ...rest } = body;
    created = await ml<MlItem>(token, "/items", { method: "POST", body: { ...rest, family_name: title } });
  }
  await setDescription(created.id, false);
  if (product.sku) await setMlFiscal(token, analysis.reference_id, product.sku, product.name).catch((e) => warnings.push(`fiscal: ${e instanceof Error ? e.message : e}`));
  // deno-lint-ignore no-explicit-any
  const sub_status: string[] = (created as any).sub_status ?? [];
  return { id: created.id, permalink: created.permalink, price: body.price, status: created.status, sub_status, warnings };
}

/** Formato de venda do kit (o anúncio modelo é de pin avulso: "Unidade", 1 por pacote). */
function kitAttrs(units?: number) {
  if (units === undefined) return [];
  return [{ id: "SALE_FORMAT", value_name: "Kit" }, ...(units > 1 ? [{ id: "UNITS_PER_PACK", value_name: String(units) }] : [])];
}

/** Nome do pin sem "Pin", sem "(Metal Esmaltado)" e sem o subtítulo: "Zé Bioquímico" (modelo/estampa no ML). */
export function pinModelName(name: string) {
  return (name.replace(/\([^)]*\)/g, "").split(" - ")[0].replace(/^\s*(pin|broche|botton)\s+/i, "").trim() || name.trim()).slice(0, 60);
}

/** Nome do anúncio (o ML junta a cor no fim): sem "(Metal Esmaltado)" e cortado em palavra inteira até 60 letras. */
export function mlFamilyName(name: string) {
  const clean = name.replace(/\s*\((metal|pin)[^)]*\)/gi, "").replace(/\s+/g, " ").trim() || name.trim();
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  return cut.slice(0, cut.lastIndexOf(" ") > 30 ? cut.lastIndexOf(" ") : 60)
    .replace(/(\s+(em|de|da|do|das|dos|e|a|o|com|para|na|no))+$/i, "").replace(/[\s\-–,]+$/, "");
}

/** NCM dos pins (7117.90.00), conforme o cadastro da loja. */
const ML_NCM = "71179000";

/**
 * Dados fiscais do SKU no Mercado Livre (para o ML emitir a nota): copia o formato do SKU do anúncio
 * modelo (custo, origem, CSOSN, pesos) trocando o NCM. Cria; se já existir, atualiza.
 */
// deno-lint-ignore no-explicit-any
let refFiscal: { id: string; sku: any } | null = null;
async function setMlFiscal(token: string, referenceId: string, sku: string, name: string) {
  if (refFiscal?.id !== referenceId) {
    // deno-lint-ignore no-explicit-any
    const d = await ml<any>(token, `/items/${referenceId}/fiscal_information/detail`).catch(() => null);
    refFiscal = { id: referenceId, sku: d?.sku ?? {} };
  }
  const r = refFiscal.sku;
  const { empty: _e, ...tax } = r.tax_information ?? {};
  const body = {
    sku,
    title: name.slice(0, 120),
    type: "single",
    cost: r.cost ?? 6,
    measurement_unit: "UN",
    register_type: r.register_type ?? "final",
    tax_information: { origin_type: "reseller", origin_detail: "0", csosn: "102", ...tax, ncm: ML_NCM },
  };
  try {
    await ml(token, "/items/fiscal_information", { method: "POST", body });
  } catch (e) {
    // Já existe dado fiscal para o SKU: atualiza
    try {
      await ml(token, `/items/fiscal_information/${encodeURIComponent(sku)}`, { method: "PUT", body });
    } catch (e2) {
      throw new Error(`${e instanceof Error ? e.message : e} / ${e2 instanceof Error ? e2.message : e2}`);
    }
  }
}

/** Estoque padrão dos anúncios do Mercado Livre (o lojista trabalha sempre com 200). */
const DEFAULT_ML_STOCK = 200;

/**
 * Anúncio do vendedor para o produto, em qualquer status menos encerrado: primeiro pelo SKU, depois pelo nome.
 * Com mais de um, prefere o ativo.
 */
async function findMlListing(token: string, sellerId: string, name: string, sku?: string, sellerItems?: MlItem[], exclude = new Set<string>()): Promise<MlItem | null> {
  const pick = (items: MlItem[]) => (items = items.filter((i) => !exclude.has(i.id))).find((i) => i.status === "active") ?? items[0] ?? null;
  if (sku) {
    const found = await ml<{ results: string[] }>(token, `/users/${sellerId}/items/search?seller_sku=${encodeURIComponent(sku)}`)
      .catch(() => ({ results: [] as string[] }));
    if (found.results.length) {
      const batch = await ml<{ code: number; body: MlItem }[]>(token, `/items?ids=${found.results.slice(0, 20).join(",")}`);
      const items = batch.filter((r) => r.code === 200 && r.body.status !== "closed").map((r) => r.body);
      if (pick(items)) return pick(items);
    }
  }
  const words = norm(name);
  if (!words.length) return null;
  const all = (sellerItems ?? await mlSellerItems(token, sellerId, 1000, "", ML_LOOKUP_FIELDS)).filter((i) => i.status !== "closed");
  const same = all.filter((i) => {
    const w = norm(i.family_name ?? i.title);
    const common = w.filter((x) => words.includes(x)).length;
    // Bem mais rígido que a análise de preços: um falso positivo atualizaria o anúncio de outro pin
    return common / new Set([...w, ...words]).size >= 0.8;
  });
  return pick(same);
}

/** Descrição em texto puro como o ML exige: sem HTML, sem emoji e com marcadores simples. */
export function mlPlainText(text: string) {
  return text.replace(/<[^>]+>/g, "\n")
    // Emojis e o que os compõe: tom de pele, bandeiras (🇧🇷), tecla (1️⃣), seletores e junções
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}\u{20E3}\u{FE00}-\u{FE0F}\u{200B}-\u{200D}]/gu, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]*[•●▪◦]\s*/gm, "- ")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
