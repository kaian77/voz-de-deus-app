// Fotos de produto em lote, pelo GitHub Actions (workflow "Fotos de produto: refazer e cadastrar"):
//   deno run -A scripts/photo-jobs.ts all      → refaz todos os lotes prontos, espera ficarem prontos e cadastra no site
//   deno run -A scripts/photo-jobs.ts redo     → só refaz
//   deno run -A scripts/photo-jobs.ts publish  → só cadastra os lotes prontos (trocando os produtos antigos deles)
// Usa o mesmo código das ferramentas do Studio (_shared/photo-jobs.ts). Variáveis: as mesmas das functions.
import { adminClient } from "../supabase/functions/_shared/util.ts";
import { publishPhotoJob, redoPhotoJobs } from "../supabase/functions/_shared/photo-jobs.ts";

const db = adminClient();
const cmd = Deno.args[0] ?? "all";
const price = Number(Deno.args[1]) || undefined; // preço quando o modelo não tem (ex.: 17.99)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function users() {
  const { data } = await db.from("photo_jobs").select("user_id");
  return [...new Set((data ?? []).map((r) => r.user_id as string))];
}

if (cmd === "redo" || cmd === "all") {
  for (const u of await users()) console.log("refazer", u, JSON.stringify(await redoPhotoJobs(db, u)));
}

if (cmd === "all") {
  // espera o workflow "Fotos de produto" terminar os lotes (até 45 min)
  for (let i = 0; i < 90; i++) {
    const { count } = await db.from("photo_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "processing"]);
    console.log(`lotes na fila: ${count}`);
    if (!count) break;
    await sleep(30_000);
  }
}

if (cmd === "publish" || cmd === "all") {
  const { data: jobs } = await db.from("photo_jobs").select("id,user_id,theme,status").eq("status", "ready").order("created_at");
  for (const j of jobs ?? []) {
    console.log(`▶ lote ${j.id} (${j.theme ?? "sem tema"})`);
    for (let round = 0; round < 30; round++) {
      const r = await publishPhotoJob(db, j.user_id, j.id, true, [], price);
      for (const d of r.deleted) console.log("  apagado", JSON.stringify(d));
      for (const c of r.created) console.log("  no site", JSON.stringify(c));
      for (const e of r.errors) console.log("  ERRO", JSON.stringify(e));
      if (!r.pending || (!r.created.length && r.errors.length)) break;
    }
  }
}
