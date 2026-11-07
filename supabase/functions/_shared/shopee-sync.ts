// Publicação dos produtos da loja Nuvemshop na Shopee, em fila e em segundo plano (igual ao Mercado Livre):
// só entram os produtos que ainda NÃO têm anúncio na Shopee (comparação por nome e SKU com todos os anúncios,
// inclusive os fora da vitrine). A fila fica em social_accounts.meta.shopee_sync e o cron publica alguns por minuto.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ns, storeFor, txt } from "./nuvemshop.ts";
import { applyRule, type PriceRule } from "./marketplaces.ts";
import { isKit, kitUnits, mlListingDescription, pinSku } from "./ml-sync.ts";
import { SHOPEE_PIN_TAX, shopee, shopeeAddItem, shopeeTokenFor, shopeeUploadImage } from "./shopee.ts";

/** Produtos por rodada do cron (cada um sobe várias fotos). */
const PER_RUN = 3;
/** A Shopee aceita até 9 fotos por anúncio. */
const MAX_PHOTOS = 9;
/** Regra que a loja já usa na Shopee: preço da loja + R$ 7,01, terminando em ,00 (R$ 17,99 → R$ 25,00). */
const DEFAULT_RULE: PriceRule = { type: "add", value: 7.01, ending: 0 };

type Result = { id: number; name: string; item_id?: number; price?: number; error?: string; reason?: string };
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
  const items: { item_id: number; item_name: string; item_sku?: string }[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await shopee<{ item_list?: { item_id: number; item_name: string; item_sku?: string }[] }>(
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

/** Monta a fila com os produtos da loja que ainda não estão na Shopee. */
export async function startShopeeSync(db: SupabaseClient, userId: string) {
  const acc = await shopeeAccount(db, userId);
  if (!acc) throw new Error("Conecte a Shopee em Contas");
  const store = await storeFor(db, userId);
  if (!store) throw new Error("Conecte a Nuvemshop em Contas");
  const token = await shopeeTokenFor(db, acc.id, acc.external_id);
  const [products, items] = await Promise.all([storeList(store.token, store.storeId), shopeeAllItems(token, acc.external_id)]);
  const names = new Set(items.map((i) => words(i.item_name)));
  const skus = new Set(items.map((i) => String(i.item_sku ?? "").trim()).filter(Boolean));
  const missing = products.filter((p) => !names.has(words(p.name)) && !p.skus.some((s) => skus.has(s)));
  const sync: ShopeeSync = {
    started_at: new Date().toISOString(), finished_at: missing.length ? null : new Date().toISOString(),
    total: missing.length, queue: missing.map((p) => p.id), done: [], errors: [], skipped: [],
  };
  await saveSync(db, acc.id, sync);
  return { store: products.length, on_shopee: items.length, missing: missing.length, minutes: Math.ceil(missing.length / PER_RUN) };
}

async function saveSync(db: SupabaseClient, accountId: string, sync: ShopeeSync) {
  const { data } = await db.from("social_accounts").select("meta").eq("id", accountId).single();
  await db.from("social_accounts").update({ meta: { ...(data?.meta ?? {}), shopee_sync: sync } }).eq("id", accountId);
}

async function record(db: SupabaseClient, accountId: string, id: number, r: { done?: Result; error?: Result; skipped?: Result }) {
  const { data } = await db.from("social_accounts").select("meta").eq("id", accountId).single();
  const sync = data?.meta?.shopee_sync as ShopeeSync | undefined;
  if (!sync) return;
  if (r.done) sync.done.push(r.done);
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
    const sync = acc.meta?.shopee_sync as ShopeeSync | undefined;
    if (!sync) continue;
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
          const created = await shopeeAddItem(token, acc.external_id, {
            original_price: price,
            description: mlListingDescription({ name, about, units }).slice(0, 2900),
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
