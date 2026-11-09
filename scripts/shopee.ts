// Shopee pelo GitHub Actions (workflow "Shopee"):
//   deno run -A scripts/shopee.ts one "Pin Medicina"  → pede ao cron para pôr só esse produto no começo da fila e acompanha o resultado
//   deno run -A scripts/shopee.ts start               → loja inteira na fila (atualiza os que existem, cria os que faltam)
//   deno run -A scripts/shopee.ts status              → estado da fila
import { adminClient } from "../supabase/functions/_shared/util.ts";
import { ns, storeFor, txt } from "../supabase/functions/_shared/nuvemshop.ts";

const db = adminClient();
const [cmd, arg] = Deno.args;
const { data: acc } = await db.from("social_accounts").select("*").eq("platform", "shopee").limit(1).single();
const userId = acc.user_id as string;
const state = async () => (await db.from("social_accounts").select("meta").eq("id", acc.id).single()).data?.meta?.shopee_sync;

// O GitHub não tem as chaves da Shopee: o script só faz o pedido (shopee_sync.request) e o cron das functions executa
const ask = async (request: "all" | "audit" | "dedupe" | number[]) => {
  const { data } = await db.from("social_accounts").select("meta").eq("id", acc.id).single();
  const meta = data?.meta ?? {};
  const cur = meta.shopee_sync ?? { started_at: new Date().toISOString(), total: 0, queue: [], done: [], errors: [], skipped: [] };
  // resultado antigo desses produtos sai, para o teste mostrar só o de agora
  const keep = (x: { id: number }) => !Array.isArray(request) || !request.includes(x.id);
  const next = { ...cur, request, done: cur.done.filter(keep), errors: cur.errors.filter(keep), skipped: cur.skipped.filter(keep) };
  await db.from("social_accounts").update({ meta: { ...meta, shopee_sync: next } }).eq("id", acc.id);
};
const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

if (cmd === "one") {
  // arg: um nome, vários separados por ";" ou "latest:N" (os N produtos mais novos da loja)
  const store = (await storeFor(db, userId))!;
  const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // deno-lint-ignore no-explicit-any
  const all: any[] = [];
  for (let page = 1; page <= 10; page++) {
    // deno-lint-ignore no-explicit-any
    const list = await ns<any[]>(store.token, store.storeId, `products?per_page=200&page=${page}`);
    if (!Array.isArray(list) || !list.length) break;
    all.push(...list);
    if (list.length < 200) break;
  }
  const latest = arg.match(/^latest:(\d+)$/);
  const hits: { id: number; name: string }[] = latest
    ? all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, Number(latest[1])).map((p) => ({ id: Number(p.id), name: txt(p.name) }))
    : arg.split(";").map((n) => n.trim()).filter(Boolean).map((n) => {
      const p = all.find((x) => key(txt(x.name)).includes(key(n)));
      if (!p) console.log("NÃO ACHEI", n);
      return p ? { id: Number(p.id), name: txt(p.name) } : null;
    }).filter((x): x is { id: number; name: string } => !!x);
  if (!hits.length) throw new Error(`não achei "${arg}" na loja`);
  for (const h of hits) console.log("produto", h.id, h.name);
  const ids = hits.map((h) => h.id);
  await ask(ids);
  const pending = new Set(ids);
  for (let i = 0; i < 45 && pending.size; i++) {
    await wait(20);
    const s = await state();
    if (s.request) continue; // o cron ainda não pegou o pedido
    for (const id of [...pending]) {
      const d = s.done.find((x: { id: number }) => x.id === id);
      const k = s.skipped.find((x: { id: number }) => x.id === id);
      const e = s.errors.filter((x: { id: number }) => x.id === id).at(-1);
      if (d || k || (e && !s.queue.includes(id) && !s.inflight?.ids?.includes(id))) {
        console.log("RESULTADO", JSON.stringify(d ?? k ?? e));
        pending.delete(id);
      }
    }
  }
  if (pending.size) console.log("AINDA NA FILA", [...pending].join(","));
}

if (cmd === "start") {
  await ask("all");
  await wait(90);
}

if (cmd === "audit" || cmd === "dedupe") {
  if (cmd === "dedupe") {
    await ask("dedupe");
    for (let i = 0; i < 12 && (await state()).request; i++) await wait(20);
  }
  await ask("audit");
  for (let i = 0; i < 12; i++) {
    await wait(20);
    const s = await state();
    if (s.request) continue;
    console.log("anúncios na Shopee", s.audit?.total, "| nomes repetidos", s.audit?.dupes.length);
    for (const d of s.audit?.dupes ?? []) console.log("REPETIDO", d.name, JSON.stringify(d.items));
    break;
  }
}

if (cmd === "status" || cmd === "start") {
  const s = await state();
  console.log("fila", s.queue.length, "feitos", s.done.length, "atualizados", s.done.filter((d: { updated?: boolean }) => d.updated).length, "ligados", Object.keys(s.links ?? {}).length);
  for (const e of s.errors.slice(-8)) console.log("ERRO", e.name, "|", e.error);
  for (const d of s.done.slice(-8)) console.log("FEITO", d.name, d.item_id, d.updated ? "atualizado" : "criado", d.error ?? "");
}
