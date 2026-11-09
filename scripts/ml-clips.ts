// Teste da API de Clips (vídeo) do Mercado Livre pelo GitHub Actions (workflow "ML clips"):
//   deno run -A scripts/ml-clips.ts probe  → mostra o que a API responde para os vídeos de um anúncio e tenta subir um vídeo de teste
import { adminClient } from "../supabase/functions/_shared/util.ts";
import { ml, mlTokenFor } from "../supabase/functions/_shared/mercadolivre.ts";

const db = adminClient();
const API = "https://api.mercadolibre.com";
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
const words = (s: string) => new Set(norm(s).split(/\s+/).filter((w) => w.length > 3 && !["metal", "esmaltado", "edicao"].includes(w)));

const { data: accounts } = await db.from("social_accounts").select("id,user_id,meta,external_id").eq("platform", "mercadolivre");
const acc = accounts?.[0];
if (!acc) throw new Error("sem conta do ML");
const token = await mlTokenFor(db, acc.id);
const call = async (method: string, path: string, body?: BodyInit) => {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body });
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status} ${text.slice(0, 600)}`);
  return { status: res.status, text };
};

if (Deno.args[0] === "chat") {
  // Teste de acesso (só leitura): perguntas, mensagens pós-venda, etiqueta e nota fiscal
  const seller = acc.external_id;
  console.log("seller", seller);
  await call("GET", `/questions/search?seller_id=${seller}&api_version=4&status=UNANSWERED&limit=5`);
  await call("GET", `/my/received_questions/search?limit=3`);
  const orders = await call("GET", `/orders/search?seller=${seller}&sort=date_desc&limit=3`);
  const o = JSON.parse(orders.text).results?.[0];
  if (o) {
    const pack = o.pack_id ?? o.id;
    await call("GET", `/messages/packs/${pack}/sellers/${seller}?tag=post_sale&mark_as_read=false`);
    await call("GET", `/messages/action_guide/packs/${pack}/caps_available?tag=post_sale`);
    const ship = o.shipping?.id;
    if (ship) {
      await call("GET", `/shipments/${ship}`);
      const lab = await fetch(`${API}/shipment_labels?shipment_ids=${ship}&response_type=pdf`, { headers: { Authorization: `Bearer ${token}` } });
      console.log("ETIQUETA", lab.status, lab.headers.get("content-type"), (await lab.arrayBuffer()).byteLength, "bytes");
    }
    await call("GET", `/users/${seller}/invoices/orders/${o.id}`);
    await call("GET", `/orders/${o.id}/billing_info`);
  }
  Deno.exit(0);
}
if (Deno.args[0] === "stock0") {
  // produtos sem estoque no site que ficaram com estoque no anúncio do ML (a sincronização punha 200 em todos)
  const { ns, storeFor } = await import("../supabase/functions/_shared/nuvemshop.ts");
  const store = await storeFor(db, acc.user_id);
  if (!store) throw new Error("sem loja");
  const latest = new Map<number, string>();
  for (const d of acc.meta?.ml_sync?.done ?? []) if (d.ml_id) latest.set(d.id, d.ml_id);
  let fixed = 0;
  for (let page = 1; page <= 10; page++) {
    const list = await ns<any[]>(store.token, store.storeId, `products?per_page=200&page=${page}&fields=id,name,variants`);
    if (!Array.isArray(list) || !list.length) break;
    for (const p of list) {
      const v = p.variants?.[0];
      if (!v || v.stock === null || v.stock === undefined || Number(v.stock) > 0) continue;
      const mlId = latest.get(p.id);
      if (!mlId) continue;
      const item = await ml<any>(token, `/items/${mlId}?attributes=id,available_quantity,status`).catch(() => null);
      if (!item || !(item.available_quantity > 0) || item.status === "closed") continue;
      const err = await ml(token, `/items/${mlId}`, { method: "PUT", body: { available_quantity: 0 } }).then(() => "", (e) => String(e?.message ?? e));
      console.log(err ? "ERRO" : "ZERADO", p.name?.pt ?? p.name, mlId, item.available_quantity, "→ 0", err);
      fixed++;
    }
    if (list.length < 200) break;
  }
  console.log("zerados:", fixed);
  Deno.exit(0);
}
if (Deno.args[0] === "requeue") {
  // produtos com foto temática aplicada + os que deram erro → frente da fila do ML
  const { requeueProducts } = await import("../supabase/functions/_shared/ml-sync.ts");
  const { data: jobs } = await db.from("store_photo_jobs").select("product_id").eq("user_id", acc.user_id).eq("status", "applied");
  const errs = (acc.meta?.ml_sync?.errors ?? []).map((e: { id: number }) => e.id).filter((id: number) => id > 0);
  const ids = [...new Set([...errs, ...(jobs ?? []).map((j: { product_id: number }) => Number(j.product_id))])].filter(Boolean);
  console.log("de volta na fila:", await requeueProducts(db, acc.id, ids), "(erros:", errs.length, ")");
  Deno.exit(0);
}
if (Deno.args[0] === "sync") {
  const sy = acc.meta?.ml_sync;
  console.log("total", sy.total, "fila", sy.queue.length, "feitos", sy.done.length, "únicos", new Set(sy.done.map((d: { id: number }) => d.id)).size, "inflight", JSON.stringify(sy.inflight));
  for (const e of sy.errors.slice(-15)) console.log("ERRO", e.name, "|", e.error);
  for (const d of sy.done.slice(-10)) console.log("FEITO", d.name, d.ml_id, d.status, d.updated, d.error ?? "");
  Deno.exit(0);
}
const done = (acc.meta?.ml_sync?.done ?? []).filter((d: { ml_id?: string }) => d.ml_id);
const item = done[0];
console.log("anúncios na sincronização:", done.length, "| teste com", item?.ml_id, item?.name);
await call("GET", `/marketplace/items/${item.ml_id}/clips`);
await call("GET", `/items/${item.ml_id}/clips`);
await call("GET", `/items/${item.ml_id}?attributes=id,title,video_id,status`);

// vídeo de produto que ainda está no storage, ligado a um anúncio pelo nome
const { data: vids } = await db.from("product_videos").select("name,video_url").eq("user_id", acc.user_id).not("video_url", "is", null).order("created_at", { ascending: false }).limit(40);
let pick: { ml_id: string; name: string; url: string } | null = null;
for (const v of vids ?? []) {
  const head = await fetch(v.video_url, { method: "HEAD" });
  if (!head.ok) continue;
  const w = words(v.name);
  const best = done.map((d: { ml_id: string; name: string }) => ({ d, n: [...words(d.name)].filter((x) => w.has(x)).length }))
    .sort((a: { n: number }, b: { n: number }) => b.n - a.n)[0];
  if (best && best.n >= 2) { pick = { ml_id: best.d.ml_id, name: best.d.name, url: v.video_url }; break; }
}
if (!pick) { console.log("nenhum vídeo de produto no storage combina com um anúncio; sem teste de envio"); Deno.exit(0); }
console.log("envio de teste:", pick.name, pick.ml_id, pick.url);
const bytes = new Uint8Array(await (await fetch(pick.url)).arrayBuffer());
for (const path of [`/marketplace/items/${pick.ml_id}/clips/upload`, `/items/${pick.ml_id}/clips/upload`]) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "video/mp4" }), "clip.mp4");
  const r = await call("POST", path, form);
  if (r.status < 300) break;
}
await call("GET", `/marketplace/items/${pick.ml_id}/clips`);
