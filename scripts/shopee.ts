// Shopee pelo GitHub Actions (workflow "Shopee"):
//   deno run -A scripts/shopee.ts one "Pin Medicina"  → põe só esse produto no começo da fila, roda uma rodada e mostra o anúncio
//   deno run -A scripts/shopee.ts start               → loja inteira na fila (atualiza os que existem, cria os que faltam)
//   deno run -A scripts/shopee.ts status              → estado da fila
import { adminClient } from "../supabase/functions/_shared/util.ts";
import { shopee, shopeeTokenFor } from "../supabase/functions/_shared/shopee.ts";
import { runShopeeSync, startShopeeSync } from "../supabase/functions/_shared/shopee-sync.ts";
import { ns, storeFor, txt } from "../supabase/functions/_shared/nuvemshop.ts";

const db = adminClient();
const [cmd, arg] = Deno.args;
const { data: acc } = await db.from("social_accounts").select("*").eq("platform", "shopee").limit(1).single();
const userId = acc.user_id as string;
const state = async () => (await db.from("social_accounts").select("meta").eq("id", acc.id).single()).data?.meta?.shopee_sync;

if (cmd === "one") {
  const store = (await storeFor(db, userId))!;
  const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let hit: { id: number; name: string } | null = null;
  for (let page = 1; page <= 10 && !hit; page++) {
    // deno-lint-ignore no-explicit-any
    const list = await ns<any[]>(store.token, store.storeId, `products?per_page=200&page=${page}`);
    // deno-lint-ignore no-explicit-any
    const p = list.find((x: any) => key(txt(x.name)).includes(key(arg)));
    if (p) hit = { id: Number(p.id), name: txt(p.name) };
    if (list.length < 200) break;
  }
  if (!hit) throw new Error(`não achei "${arg}" na loja`);
  console.log("produto", hit);
  console.log("fila", JSON.stringify(await startShopeeSync(db, userId, [hit.id])));
  const s0 = await state();
  console.log("anúncio ligado", s0?.links?.[hit.id] ?? "nenhum (vai criar)");
  console.log("rodada", JSON.stringify(await runShopeeSync(db)));
  const s1 = await state();
  console.log("resultado", JSON.stringify(s1.done.find((d: { id: number }) => d.id === hit!.id) ?? s1.errors.filter((e: { id: number }) => e.id === hit!.id || e.id === 0).slice(-2)));
  const item = s1.links?.[hit.id];
  if (item) {
    const token = await shopeeTokenFor(db, acc.id, acc.external_id);
    const r = await shopee(token, acc.external_id, "/api/v2/product/get_item_base_info", { params: { item_id_list: item } });
    // deno-lint-ignore no-explicit-any
    const it: any = r.item_list?.[0] ?? {};
    console.log("na Shopee", JSON.stringify({ item, name: it.item_name, status: it.item_status, price: it.price_info, stock: it.stock_info_v2?.summary_info, fotos: it.image?.image_url_list?.length }));
  }
}

if (cmd === "start") console.log(JSON.stringify(await startShopeeSync(db, userId)));

if (cmd === "status" || cmd === "start") {
  const s = await state();
  console.log("fila", s.queue.length, "feitos", s.done.length, "atualizados", s.done.filter((d: { updated?: boolean }) => d.updated).length, "ligados", Object.keys(s.links ?? {}).length);
  for (const e of s.errors.slice(-8)) console.log("ERRO", e.name, "|", e.error);
  for (const d of s.done.slice(-8)) console.log("FEITO", d.name, d.item_id, d.updated ? "atualizado" : "criado", d.error ?? "");
}
