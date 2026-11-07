// Teste da API de Clips (vídeo) do Mercado Livre pelo GitHub Actions (workflow "ML clips"):
//   deno run -A scripts/ml-clips.ts probe  → mostra o que a API responde para os vídeos de um anúncio e tenta subir um vídeo de teste
import { adminClient } from "../supabase/functions/_shared/util.ts";
import { mlTokenFor } from "../supabase/functions/_shared/mercadolivre.ts";

const db = adminClient();
const API = "https://api.mercadolibre.com";
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
const words = (s: string) => new Set(norm(s).split(/\s+/).filter((w) => w.length > 3 && !["metal", "esmaltado", "edicao"].includes(w)));

const { data: accounts } = await db.from("social_accounts").select("id,user_id,meta").eq("platform", "mercadolivre");
const acc = accounts?.[0];
if (!acc) throw new Error("sem conta do ML");
const token = await mlTokenFor(db, acc.id);
const call = async (method: string, path: string, body?: BodyInit) => {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body });
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status} ${text.slice(0, 600)}`);
  return { status: res.status, text };
};

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
