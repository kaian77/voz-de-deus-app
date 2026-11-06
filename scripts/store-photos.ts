// Fotos temáticas da loja pelo GitHub Actions (workflow "Fotos temáticas da loja"):
//   deno run -A scripts/store-photos.ts queue-all  → põe a loja inteira na fila com aplicação automática
//   deno run -A scripts/store-photos.ts apply      → aplica no site as prontas com aplicação automática (+ ML)
import { adminClient } from "../supabase/functions/_shared/util.ts";
import { applyStorePhotos, queueStorePhotos } from "../supabase/functions/_shared/store-photos.ts";

const db = adminClient();
const cmd = Deno.args[0];

if (cmd === "queue-all") {
  const { data } = await db.from("social_accounts").select("user_id").eq("platform", "nuvemshop");
  for (const u of [...new Set((data ?? []).map((r) => r.user_id as string))]) {
    console.log("fila", u, JSON.stringify(await queueStorePhotos(db, u, { all: true, auto: true })));
  }
}

if (cmd === "apply") {
  for (let round = 0; round < 20; round++) {
    const { data } = await db.from("store_photo_jobs").select("id,user_id").eq("status", "ready").eq("auto_apply", true).limit(200);
    if (!data?.length) break;
    const byUser = new Map<string, string[]>();
    for (const r of data) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.id]);
    let any = 0;
    for (const [u, ids] of byUser) {
      const r = await applyStorePhotos(db, u, ids);
      any += r.applied;
      console.log(`aplicadas ${r.applied}`, r.errors.slice(0, 5).join(" | "));
    }
    if (!any) break;
  }
}
