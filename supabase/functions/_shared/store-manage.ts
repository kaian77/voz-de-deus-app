// Gerenciar produtos da loja (Studio → Produtos → "Produtos da loja", ferramentas do MCP): mudar estoque e apagar,
// no site (Nuvemshop) e no anúncio do Mercado Livre ligado a ele.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ns, nsFindProduct, storeFor, txt } from "./nuvemshop.ts";
import { ml, mlTokenFor } from "./mercadolivre.ts";

/** Anúncios do ML ligados a um produto da loja: os da sincronização (meta.ml_sync.done) e os cadastrados pelo Studio. */
async function mlListings(db: SupabaseClient, userId: string, productId: number) {
  const out: { accountId: string; id: string }[] = [];
  const { data: accounts } = await db.from("social_accounts").select("id,meta").eq("user_id", userId).eq("platform", "mercadolivre");
  const { data: drafts } = await db.from("product_drafts").select("marketplaces").eq("user_id", userId).eq("product_id", String(productId));
  for (const acc of accounts ?? []) {
    const ids = new Set<string>();
    for (const d of acc.meta?.ml_sync?.done ?? []) if (d.id === productId && d.ml_id) ids.add(String(d.ml_id));
    for (const d of drafts ?? []) {
      const id = d.marketplaces?.mercadolivre?.id;
      if (id) ids.add(String(id));
    }
    for (const id of ids) out.push({ accountId: acc.id, id });
  }
  return out;
}

async function store(db: SupabaseClient, userId: string) {
  const s = await storeFor(db, userId);
  if (!s) throw new Error("Conecte a loja Nuvemshop em Contas");
  return s;
}

/** Estoque novo (null = sem controle/infinito) em todas as variações do site e no anúncio do ML. */
export async function setStock(db: SupabaseClient, userId: string, product: string | number, stock: number | null) {
  const s = await store(db, userId);
  const p = await nsFindProduct(s.token, s.storeId, product);
  for (const v of p.variants ?? []) {
    await ns(s.token, s.storeId, `products/${p.id}/variants/${v.id}`, {
      method: "PUT", body: { stock_management: stock !== null, stock },
    });
  }
  const ml_: Record<string, string> = {};
  for (const l of await mlListings(db, userId, Number(p.id))) {
    try {
      const token = await mlTokenFor(db, l.accountId);
      // ML não aceita "infinito": sem controle no site vira 999 no anúncio
      await ml(token, `/items/${l.id}`, { method: "PUT", body: { available_quantity: stock ?? 999 } });
      ml_[l.id] = "ok";
    } catch (e) {
      ml_[l.id] = e instanceof Error ? e.message : String(e);
    }
  }
  return { id: p.id, name: txt(p.name), stock, mercadolivre: ml_ };
}

/** Apaga o produto do site e encerra o anúncio do ML (encerrado não volta; para pausar, use estoque 0). */
export async function deleteProduct(db: SupabaseClient, userId: string, product: string | number) {
  const s = await store(db, userId);
  const p = await nsFindProduct(s.token, s.storeId, product);
  const listings = await mlListings(db, userId, Number(p.id));
  await ns(s.token, s.storeId, `products/${p.id}`, { method: "DELETE" });
  const ml_: Record<string, string> = {};
  for (const l of listings) {
    try {
      const token = await mlTokenFor(db, l.accountId);
      await ml(token, `/items/${l.id}`, { method: "PUT", body: { status: "closed" } });
      ml_[l.id] = "encerrado";
    } catch (e) {
      ml_[l.id] = e instanceof Error ? e.message : String(e);
    }
  }
  // tira da sincronização para ela não recriar o anúncio
  const { data: accounts } = await db.from("social_accounts").select("id,meta").eq("user_id", userId).eq("platform", "mercadolivre");
  for (const acc of accounts ?? []) {
    const sync = acc.meta?.ml_sync;
    if (!sync) continue;
    const pid = Number(p.id);
    const next = { ...sync, queue: (sync.queue ?? []).filter((id: number) => id !== pid), done: (sync.done ?? []).filter((d: { id: number }) => d.id !== pid) };
    await db.from("social_accounts").update({ meta: { ...acc.meta, ml_sync: next } }).eq("id", acc.id);
  }
  await db.from("product_drafts").update({ product_url: null }).eq("user_id", userId).eq("product_id", String(p.id));
  const price = Number(p.variants?.[0]?.price) || undefined;
  return { id: p.id, name: txt(p.name), price, deleted: true, mercadolivre: ml_ };
}
