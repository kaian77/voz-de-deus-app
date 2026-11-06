// Fotos temáticas dos produtos da loja: põe na fila (foto atual do site), e aplica as aprovadas como capa no site.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ns, storeFor, txt } from "./nuvemshop.ts";
import { dispatchRender } from "./product-video.ts";
import { requeueProducts } from "./ml-sync.ts";

async function store(db: SupabaseClient, userId: string) {
  const s = await storeFor(db, userId);
  if (!s) throw new Error("Conecte a loja Nuvemshop em Contas");
  return s;
}

/** Produtos da loja (todas as páginas) com a 1ª foto. */
async function allProducts(token: string, storeId: string) {
  const out: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const list = await ns<any[]>(token, storeId, `products?per_page=100&page=${page}&fields=id,name,images,canonical_url`).catch(() => []);
    if (!Array.isArray(list) || !list.length) break;
    out.push(...list);
    if (list.length < 100) break;
  }
  return out;
}

/** Põe na fila: ids escolhidos ou a loja inteira (all). Refazer = mesmo produto de novo. */
export async function queueStorePhotos(db: SupabaseClient, userId: string, opts: { ids?: number[]; all?: boolean; theme?: string; auto?: boolean }) {
  const s = await store(db, userId);
  let products: any[];
  if (opts.all) products = await allProducts(s.token, s.storeId);
  else {
    products = [];
    for (const id of (opts.ids ?? []).slice(0, 300)) {
      const p = await ns(s.token, s.storeId, `products/${id}?fields=id,name,images,canonical_url`).catch(() => null);
      if (p && !Array.isArray(p)) products.push(p);
    }
  }
  // no "todos", pula o que já tem foto temática aplicada ou esperando aprovação
  let skip = new Set<number>();
  if (opts.all) {
    const { data } = await db.from("store_photo_jobs").select("product_id").eq("user_id", userId).in("status", ["applied", "ready", "queued", "processing"]);
    skip = new Set((data ?? []).map((r) => Number(r.product_id)));
    // "skipped" = a capa já tinha cenário: não refaz no "todos"
    const { data: sk } = await db.from("store_photo_jobs").select("product_id").eq("user_id", userId).eq("status", "skipped");
    for (const r of sk ?? []) skip.add(Number(r.product_id));
  }
  const rows = products
    .filter((p) => p.images?.length && !skip.has(Number(p.id)))
    .map((p) => {
      // a foto de fundo branco (a última da lista costuma ser a original; a capa pode já ser uma temática antiga)
      const imgs = [...p.images].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
      return {
        user_id: userId, product_id: Number(p.id), name: txt(p.name), url: p.canonical_url ?? null,
        source_url: String(imgs[0].src), theme: opts.theme?.trim() || null, status: "queued", result_url: null, error: null,
        attempts: 0, auto_apply: opts.auto === true, updated_at: new Date().toISOString(),
      };
    });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("store_photo_jobs").upsert(rows.slice(i, i + 200), { onConflict: "user_id,product_id" });
    if (error) throw new Error(error.message);
  }
  return { queued: rows.length, skipped: products.length - rows.length, dispatched: rows.length ? await dispatchRender("store-photos.yml") : false };
}

/** Aplica as fotos aprovadas: entram como 1ª foto (capa) do produto no site. Até ~100 s por chamada. */
export async function applyStorePhotos(db: SupabaseClient, userId: string, ids: string[]) {
  const s = await store(db, userId);
  const started = Date.now();
  const { data: jobs } = await db.from("store_photo_jobs").select("*").eq("user_id", userId).eq("status", "ready").in("id", ids.slice(0, 200));
  let applied = 0;
  const errors: string[] = [];
  const done: number[] = [];
  for (const j of jobs ?? []) {
    if (Date.now() - started > 100_000) break;
    // trava: duas execuções ao mesmo tempo não põem a mesma foto duas vezes
    const { data: claimed } = await db.from("store_photo_jobs").update({ status: "applying" }).eq("id", j.id).eq("status", "ready").select("id");
    if (!claimed?.length) continue;
    try {
      await ns(s.token, s.storeId, `products/${j.product_id}/images`, { method: "POST", body: { src: j.result_url, position: 1 } });
      await db.from("store_photo_jobs").update({ status: "applied", error: null, updated_at: new Date().toISOString() }).eq("id", j.id);
      applied++;
      done.push(Number(j.product_id));
      await new Promise((r) => setTimeout(r, 400)); // a Nuvemshop limita ~2 chamadas por segundo
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${j.name}: ${msg}`);
      await db.from("store_photo_jobs").update({ status: "ready", error: msg, updated_at: new Date().toISOString() }).eq("id", j.id);
    }
  }
  // Mercado Livre: os produtos alterados voltam para a sincronização (capa branca com o pin grande + foto temática)
  if (done.length) {
    const { data: accs } = await db.from("social_accounts").select("id").eq("user_id", userId).eq("platform", "mercadolivre");
    for (const a of accs ?? []) await requeueProducts(db, a.id, done).catch((e) => console.error("ML requeue", e));
  }
  const pending = (jobs ?? []).length - applied - errors.length;
  return { applied, errors, pending };
}
