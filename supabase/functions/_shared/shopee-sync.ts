// Sincronização da loja Nuvemshop com a Shopee, em fila e em segundo plano (igual ao Mercado Livre):
// produto que já tem anúncio (achado por nome ou SKU entre todos os anúncios, inclusive os fora da vitrine, e guardado
// em shopee_sync.links) é atualizado (fotos, descrição, preço pela regra e estoque); o que não tem vira anúncio novo.
// A fila fica em social_accounts.meta.shopee_sync e o cron faz alguns por minuto.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ns, storeFor, txt } from "./nuvemshop.ts";
import { applyRule, type PriceRule } from "./marketplaces.ts";
import { isKit, kitUnits, mlListingDescription, pinSku } from "./ml-sync.ts";
import {
  SHOPEE_PIN_TAX, shopee, shopeeAddItem, shopeeDeleteItem, shopeeModels, shopeeRelistItem, shopeeSetPrice, shopeeSetStock,
  shopeeTokenFor, shopeeUpdateItem, shopeeUploadImage,
} from "./shopee.ts";

/** Produtos por rodada do cron (cada um sobe várias fotos). */
const PER_RUN = 3;
/** A Shopee aceita até 9 fotos por anúncio. */
const MAX_PHOTOS = 9;
/** Regra que a loja já usa na Shopee: preço da loja + R$ 7,01, terminando em ,00 (R$ 17,99 → R$ 25,00). */
const DEFAULT_RULE: PriceRule = { type: "add", value: 7.01, ending: 0 };

type Result = { id: number; name: string; item_id?: number; price?: number; updated?: boolean; error?: string; reason?: string };
export type ShopeeSync = {
  started_at: string;
  finished_at?: string | null;
  total: number;
  queue: number[];
  done: Result[];
  errors: Result[];
  skipped: Result[];
  inflight?: { ids: number[]; at: string } | null;
  retries?: Record<string, number>;
  /** Produto da loja → anúncio da Shopee */
  links?: Record<string, number>;
  /** Pedido para a próxima rodada do cron (scripts sem as chaves da Shopee): "all" = loja inteira, ou alguns produtos */
  request?: "all" | "audit" | "dedupe" | number[] | null;
  /** Conferência de anúncios repetidos (mesmo nome) na Shopee */
  audit?: { at: string; total: number; dupes: { name: string; items: { item_id: number; status?: string; created_by_sync: boolean }[] }[] };
};

/** Nome comparável: sem "| Brax Pins Mania", sem acento, sem pontuação. */
const key = (s: string) =>
  s.replace(/\|\s*brax pins mania\s*$/i, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
const words = (s: string) => [...new Set(key(s).split(" ").filter(Boolean))].sort().join(" ");

async function shopeeAccount(db: SupabaseClient, userId: string) {
  const { data } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", "shopee").order("connected_at").limit(1).maybeSingle();
  return data;
}

/** Todos os anúncios da loja na Shopee (no ar, fora da vitrine, em análise e bloqueados): nome e SKU. */
async function shopeeAllItems(token: string, shopId: string) {
  const ids: number[] = [];
  for (const status of ["NORMAL", "UNLIST", "REVIEWING", "BANNED"]) {
    let offset = 0;
    for (let i = 0; i < 50; i++) {
      const page = await shopee<{ item?: { item_id: number }[]; has_next_page?: boolean; next_offset?: number }>(
        token, shopId, "/api/v2/product/get_item_list", { params: { offset, page_size: 100, item_status: status } },
      );
      ids.push(...(page?.item ?? []).map((x) => x.item_id));
      if (!page?.has_next_page || page.next_offset === undefined) break;
      offset = page.next_offset;
    }
  }
  const items: { item_id: number; item_name: string; item_sku?: string; item_status?: string }[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await shopee<{ item_list?: { item_id: number; item_name: string; item_sku?: string; item_status?: string }[] }>(
      token, shopId, "/api/v2/product/get_item_base_info", { params: { item_id_list: ids.slice(i, i + 50).join(",") } },
    );
    items.push(...(r?.item_list ?? []));
  }
  return items;
}

/** Produtos publicados da loja (nome, SKUs). */
async function storeList(token: string, storeId: string) {
  const out: { id: number; name: string; skus: string[] }[] = [];
  for (let page = 1; page <= 10; page++) {
    // deno-lint-ignore no-explicit-any
    const list = await ns<any[]>(token, storeId, `products?per_page=200&page=${page}`);
    if (!Array.isArray(list) || !list.length) break;
    for (const p of list.filter((p) => p.published !== false)) {
      const name = txt(p.name);
      // deno-lint-ignore no-explicit-any
      const skus = (p.variants ?? []).map((v: any) => String(v.sku ?? "").trim()).filter(Boolean);
      out.push({ id: Number(p.id), name, skus: [...skus, pinSku(name)] });
    }
    if (list.length < 200) break;
  }
  return out;
}

/** Liga cada produto da loja ao anúncio dele na Shopee (pelo SKU, depois pelo nome). */
function linkItems(products: { id: number; name: string; skus: string[] }[], items: { item_id: number; item_name: string; item_sku?: string }[], known: Record<string, number> = {}) {
  const exists = new Set(items.map((i) => i.item_id));
  const byName = new Map(items.map((i) => [words(i.item_name), i.item_id]));
  const bySku = new Map(items.filter((i) => i.item_sku).map((i) => [String(i.item_sku).trim(), i.item_id]));
  const links: Record<string, number> = {};
  for (const p of products) {
    const old = known[p.id];
    const hit = (old && exists.has(old) ? old : undefined) ?? p.skus.map((x) => bySku.get(x)).find(Boolean) ?? byName.get(words(p.name));
    if (hit) links[p.id] = hit;
  }
  return links;
}

/**
 * Monta a fila com todos os produtos da loja: os que já estão na Shopee são atualizados (fotos, preço, estoque,
 * descrição) e os que faltam viram anúncio. `ids` limita a alguns produtos (sem apagar o resto da fila).
 */
export async function startShopeeSync(db: SupabaseClient, userId: string, ids?: number[]) {
  const acc = await shopeeAccount(db, userId);
  if (!acc) throw new Error("Conecte a Shopee em Contas");
  const store = await storeFor(db, userId);
  if (!store) throw new Error("Conecte a Nuvemshop em Contas");
  const token = await shopeeTokenFor(db, acc.id, acc.external_id);
  const [products, items] = await Promise.all([storeList(store.token, store.storeId), shopeeAllItems(token, acc.external_id)]);
  const prev = acc.meta?.shopee_sync as ShopeeSync | undefined;
  const links = linkItems(products, items, prev?.links);
  const chosen = ids ? products.filter((p) => ids.includes(p.id)) : products;
  const queue = chosen.map((p) => p.id);
  const sync: ShopeeSync = ids && prev
    ? { ...prev, links, finished_at: null, total: prev.queue.length + queue.length, queue: [...queue, ...prev.queue.filter((x) => !queue.includes(x))] }
    : {
      started_at: new Date().toISOString(), finished_at: queue.length ? null : new Date().toISOString(),
      total: queue.length, queue, done: [], errors: [], skipped: [], links,
    };
  await saveSync(db, acc.id, sync);
  const linked = chosen.filter((p) => links[p.id]).length;
  return { store: products.length, on_shopee: items.length, update: linked, create: chosen.length - linked, minutes: Math.ceil(queue.length / PER_RUN) };
}

/** Devolve produtos para a fila da Shopee (foto nova aplicada, produto novo na loja). Sem fila ainda: não faz nada. */
export async function requeueShopee(db: SupabaseClient, userId: string, ids: number[]) {
  const acc = await shopeeAccount(db, userId);
  const sync = acc?.meta?.shopee_sync as ShopeeSync | undefined;
  if (!acc || !sync || !ids.length) return 0;
  const { data } = await db.from("social_accounts").select("meta").eq("id", acc.id).single();
  const cur = (data?.meta?.shopee_sync ?? sync) as ShopeeSync;
  const add = ids.filter((id) => !cur.queue.includes(id));
  if (!cur.queue.length && !cur.inflight?.ids.length) cur.total = 0; // rodada nova: o contador recomeça
  cur.queue = [...cur.queue, ...add];
  cur.total += add.length;
  cur.finished_at = null;
  await saveSync(db, acc.id, cur);
  return add.length;
}

/** Anúncio da Shopee do produto da loja (pela fila; se não estiver lá, procura pelo nome). */
async function linkFor(db: SupabaseClient, acc: { id: string; external_id: string; meta: Record<string, unknown> }, token: string, productId: number, name: string) {
  const sync = acc.meta?.shopee_sync as ShopeeSync | undefined;
  if (sync?.links?.[productId]) return sync.links[productId];
  const items = await shopeeAllItems(token, acc.external_id);
  return items.find((i) => words(i.item_name) === words(name))?.item_id ?? null;
}

/** Estoque do produto na Shopee (null = sem controle no site → 200). */
export async function shopeeStockFor(db: SupabaseClient, userId: string, productId: number, name: string, stock: number | null) {
  const acc = await shopeeAccount(db, userId);
  if (!acc) return null;
  const token = await shopeeTokenFor(db, acc.id, acc.external_id);
  const item = await linkFor(db, acc, token, productId, name);
  if (!item) return { error: "sem anúncio na Shopee" };
  await shopeeSetStock(token, acc.external_id, item, stock ?? 200);
  return { item_id: item, stock: stock ?? 200 };
}

/** Apaga o anúncio do produto na Shopee e tira ele da fila (para não ser recriado). */
export async function shopeeDeleteFor(db: SupabaseClient, userId: string, productId: number, name: string) {
  const acc = await shopeeAccount(db, userId);
  if (!acc) return null;
  const token = await shopeeTokenFor(db, acc.id, acc.external_id);
  const item = await linkFor(db, acc, token, productId, name);
  if (item) await shopeeDeleteItem(token, acc.external_id, item);
  const { data } = await db.from("social_accounts").select("meta").eq("id", acc.id).single();
  const sync = data?.meta?.shopee_sync as ShopeeSync | undefined;
  if (sync) {
    sync.queue = sync.queue.filter((x) => x !== productId);
    if (sync.links) delete sync.links[productId];
    await saveSync(db, acc.id, sync);
  }
  return item ? { item_id: item, deleted: true } : { error: "sem anúncio na Shopee" };
}

async function saveSync(db: SupabaseClient, accountId: string, sync: ShopeeSync) {
  const { data } = await db.from("social_accounts").select("meta").eq("id", accountId).single();
  await db.from("social_accounts").update({ meta: { ...(data?.meta ?? {}), shopee_sync: sync } }).eq("id", accountId);
}

async function record(db: SupabaseClient, accountId: string, id: number, r: { done?: Result; error?: Result; skipped?: Result }) {
  const { data } = await db.from("social_accounts").select("meta").eq("id", accountId).single();
  const sync = data?.meta?.shopee_sync as ShopeeSync | undefined;
  if (!sync) return;
  if (r.done) {
    sync.done = [...sync.done.filter((d) => d.id !== id), r.done]; // um resultado por produto
    if (r.done.item_id) sync.links = { ...(sync.links ?? {}), [id]: r.done.item_id };
  }
  if (r.error) sync.errors.push(r.error);
  if (r.skipped) sync.skipped.push(r.skipped);
  if (sync.inflight) sync.inflight.ids = sync.inflight.ids.filter((x) => x !== id);
  if (!sync.queue.length && !sync.inflight?.ids.length && !sync.finished_at) sync.finished_at = new Date().toISOString();
  await db.from("social_accounts").update({ meta: { ...data!.meta, shopee_sync: sync } }).eq("id", accountId);
}

/** Fotos do anúncio: as da loja (capa + outras) e a capa de fundo branco tratada para o ML, se já existir. */
async function photosFor(db: SupabaseClient, images: string[]) {
  const list = images.slice(0, MAX_PHOTOS);
  if (!list.length) return list;
  const { data } = await db.from("ml_photos").select("result_url").eq("source_url", list[0]).eq("kind", "cover").eq("status", "done").limit(1);
  const white = data?.[0]?.result_url as string | undefined;
  return white && list.length < MAX_PHOTOS ? [...list, white] : list;
}

/** Rodada do cron: publica alguns produtos da fila de cada loja da Shopee. */
export async function runShopeeSync(db: SupabaseClient) {
  const { data: accounts } = await db.from("social_accounts").select("id,user_id,external_id,meta").eq("platform", "shopee");
  const out: unknown[] = [];
  for (const acc of accounts ?? []) {
    // Primeira vez: monta a fila sozinho (o dono pediu para publicar todos os que faltam)
    if (!acc.meta?.shopee_sync) {
      const r = await startShopeeSync(db, acc.user_id).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
      out.push({ account: acc.id, started: r });
      continue;
    }
    let sync = acc.meta.shopee_sync as ShopeeSync;
    // Pedido de sincronizar (loja inteira ou alguns produtos), ou fila antiga sem a ligação produto → anúncio
    // Apaga as cópias repetidas que a fila criou (fica o anúncio antigo; sem antigo, o de id menor)
    if (sync.request === "dedupe" && sync.audit?.dupes.length) {
      const token = await shopeeTokenFor(db, acc.id, acc.external_id);
      const removed: number[] = [];
      for (const g of sync.audit.dupes) {
        const keep = g.items.find((i) => !i.created_by_sync) ?? [...g.items].sort((a, b) => a.item_id - b.item_id)[0];
        for (const i of g.items) {
          if (i.item_id === keep.item_id || !i.created_by_sync) continue;
          await shopeeDeleteItem(token, acc.external_id, i.item_id).then(() => removed.push(i.item_id)).catch((e) => console.error("apagar repetido", e));
        }
        for (const [pid, item] of Object.entries(sync.links ?? {})) if (removed.includes(item)) sync.links![pid] = keep.item_id;
      }
      sync.done = sync.done.filter((d) => !d.item_id || !removed.includes(d.item_id));
      sync.audit = { ...sync.audit, dupes: [] };
      sync.request = null;
      await saveSync(db, acc.id, sync);
      out.push({ account: acc.id, removed });
      continue;
    }
    if (sync.request === "audit") {
      try {
        const token = await shopeeTokenFor(db, acc.id, acc.external_id);
        const items = await shopeeAllItems(token, acc.external_id);
        const created = new Set(sync.done.filter((d) => !d.updated && d.item_id).map((d) => d.item_id));
        const groups = new Map<string, typeof items>();
        for (const it of items) groups.set(words(it.item_name), [...(groups.get(words(it.item_name)) ?? []), it]);
        const dupes = [...groups.values()].filter((g) => g.length > 1).map((g) => ({
          name: g[0].item_name,
          items: g.map((i) => ({ item_id: i.item_id, status: i.item_status, created_by_sync: created.has(i.item_id) })),
        }));
        sync.audit = { at: new Date().toISOString(), total: items.length, dupes };
      } catch (e) {
        sync.audit = { at: new Date().toISOString(), total: -1, dupes: [{ name: e instanceof Error ? e.message : String(e), items: [] }] };
      }
      sync.request = null;
      await saveSync(db, acc.id, sync);
      out.push({ account: acc.id, audit: sync.audit.dupes.length });
      continue;
    }
    if (sync.request || !sync.links) {
      const r = await startShopeeSync(db, acc.user_id, Array.isArray(sync.request) ? sync.request : sync.request === "all" ? undefined : [])
        .catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
      const { data } = await db.from("social_accounts").select("meta").eq("id", acc.id).single();
      sync = data?.meta?.shopee_sync as ShopeeSync;
      sync.request = null;
      await saveSync(db, acc.id, sync);
      out.push({ account: acc.id, started: r });
      continue;
    }
    // Rodada anterior morreu no meio: devolve os produtos para a fila (na 3ª vez vira erro)
    if (sync.inflight?.ids.length) {
      if (Date.now() - new Date(sync.inflight.at).getTime() < 3 * 60_000) continue;
      sync.retries ??= {};
      const back: number[] = [];
      for (const id of sync.inflight.ids) {
        sync.retries[id] = (sync.retries[id] ?? 0) + 1;
        if (sync.retries[id] >= 3) sync.errors.push({ id, name: String(id), error: "A rodada parou no meio 3 vezes com este produto" });
        else back.push(id);
      }
      sync.queue = [...back, ...sync.queue];
      sync.inflight = null;
    }
    if (!sync.queue.length) {
      if (!sync.finished_at) {
        sync.finished_at = new Date().toISOString();
        await saveSync(db, acc.id, sync);
      }
      continue;
    }
    const batch = sync.queue.slice(0, PER_RUN);
    sync.queue = sync.queue.slice(PER_RUN);
    sync.inflight = { ids: batch, at: new Date().toISOString() };
    await saveSync(db, acc.id, sync);
    try {
      const store = await storeFor(db, acc.user_id);
      if (!store) throw new Error("Nuvemshop desconectada");
      const token = await shopeeTokenFor(db, acc.id, acc.external_id);
      const rule: PriceRule = acc.meta?.analysis?.rule ?? DEFAULT_RULE;
      for (const id of batch) {
        let name = String(id);
        try {
          // deno-lint-ignore no-explicit-any
          const p = await ns<any>(store.token, store.storeId, `products/${id}`);
          name = txt(p.name);
          // deno-lint-ignore no-explicit-any
          const v: any = p.variants?.[0] ?? {};
          const kit = isKit(name);
          // Igual ao ML: kit usa o preço que o cliente paga no site (vive em promoção)
          const base = Number((kit && Number(v.promotional_price) > 0 ? v.promotional_price : v.price) || 0);
          // deno-lint-ignore no-explicit-any
          const images: string[] = (p.images ?? []).map((i: any) => i.src).filter(Boolean);
          const stock = v.stock === null || v.stock === undefined ? 200 : Number(v.stock);
          const linked = sync.links?.[id];
          // Já tem anúncio e o site está sem estoque: zera na Shopee também (sai de venda)
          if (linked && !(stock > 0) && base && !/\bteste\b/i.test(name)) {
            await shopeeSetStock(token, acc.external_id, linked, 0);
            await record(db, acc.id, id, { done: { id, name, item_id: linked, price: applyRule(base, rule), updated: true } });
            continue;
          }
          const skip = /\bteste\b/i.test(name) ? "produto de teste"
            : !base ? "sem preço"
            : !images.length ? "sem foto"
            : !(stock > 0) ? "sem estoque na loja"
            : null;
          if (skip) {
            await record(db, acc.id, id, { skipped: { id, name, reason: skip } });
            continue;
          }
          const price = applyRule(base, rule);
          const imageIds: string[] = [];
          for (const src of await photosFor(db, images)) {
            const img = await shopeeUploadImage(token, acc.external_id, src).catch(() => "");
            if (img) imageIds.push(img);
          }
          if (!imageIds.length) throw new Error("a Shopee não aceitou nenhuma foto");
          const about = txt(p.description).replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
          const units = kit ? kitUnits(name, about, Number(v.price || 0)) : null;
          const description = mlListingDescription({ name, about, units }).slice(0, 2900);
          if (linked) {
            const warn: string[] = [];
            const note = (what: string) => (e: unknown) => warn.push(`${what}: ${e instanceof Error ? e.message : e}`);
            await shopeeUpdateItem(token, acc.external_id, linked, { image: { image_id_list: imageIds }, description }).catch(note("fotos/descrição"));
            const models = await shopeeModels(token, acc.external_id, linked);
            await shopeeSetPrice(token, acc.external_id, linked, price, models).catch(note("preço"));
            await shopeeSetStock(token, acc.external_id, linked, stock, models).catch(note("estoque"));
            await shopeeRelistItem(token, acc.external_id, linked).catch(() => {}); // estava fora da vitrine: volta
            await record(db, acc.id, id, { done: { id, name, item_id: linked, price, updated: true, ...(warn.length ? { error: warn.join("; ") } : {}) } });
            continue;
          }
          const created = await shopeeAddItem(token, acc.external_id, {
            original_price: price,
            description,
            item_name: name.slice(0, 120),
            item_sku: String(v.sku ?? "").trim() || pinSku(name),
            category_id: 100160,
            image: { image_id_list: imageIds },
            weight: 0.4,
            dimension: { package_height: 3, package_length: 4, package_width: 4 },
            logistic_info: [{ logistic_id: 91003, enabled: true }],
            tax_info: SHOPEE_PIN_TAX,
            seller_stock: [{ stock }],
            brand: { brand_id: 0, original_brand_name: "No Brand" },
            condition: "NEW",
          });
          await record(db, acc.id, id, { done: { id, name, item_id: Number(created.item_id), price } });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Já existe na Shopee com nome parecido: não é erro, só não duplica
          if (/duplicat/i.test(msg)) await record(db, acc.id, id, { skipped: { id, name, reason: "já existe na Shopee (a Shopee recusou como duplicado)" } });
          else await record(db, acc.id, id, { error: { id, name, error: msg } });
        }
      }
    } catch (e) {
      const { data } = await db.from("social_accounts").select("meta").eq("id", acc.id).single();
      const cur = data?.meta?.shopee_sync as ShopeeSync | undefined;
      if (cur) {
        cur.queue = [...(cur.inflight?.ids ?? []), ...cur.queue];
        cur.inflight = null;
        const msg = e instanceof Error ? e.message : String(e);
        if (cur.errors.at(-1)?.error !== msg) cur.errors.push({ id: 0, name: "Rodada", error: msg });
        await saveSync(db, acc.id, cur);
      }
    }
    out.push({ account: acc.id, processed: batch.length });
  }
  return out;
}
