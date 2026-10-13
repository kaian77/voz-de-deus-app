// Vídeos diários para o TikTok: todo dia às 9h (Brasília) pega N produtos do site que ainda não ganharam vídeo
// neste ciclo, faz um vídeo de cada (fotos do site, sem chamada para o site) e manda para Aprovações.
// Quando todos os produtos tiverem vídeo, para e avisa o dono (Studio + WhatsApp); só recomeça quando ele autorizar.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { storeFor } from "./nuvemshop.ts";
import { storeProducts } from "./strategy.ts";
import { queueProductVideo } from "./product-video.ts";
import { sendWhatsAppTo } from "./sale-alerts.ts";
import { brasiliaNow } from "./daily.ts";

/** Acima disso, o piloto espera: vídeos parados em Aprovações ocupam o armazenamento grátis. */
const MAX_PENDING = 40;

async function pendingVideos(db: SupabaseClient, userId: string) {
  const { count } = await db.from("product_videos").select("id", { count: "exact", head: true }).eq("user_id", userId)
    .contains("brief", { source: "video_autopilot" }).in("status", ["pending_brief", "queued", "rendering", "rendered"]);
  const { data: ready } = await db.from("product_videos").select("post_id").eq("user_id", userId)
    .contains("brief", { source: "video_autopilot" }).eq("status", "ready").not("post_id", "is", null).limit(500);
  const ids = (ready ?? []).map((r) => r.post_id);
  const { count: waiting } = ids.length
    ? await db.from("posts").select("id", { count: "exact", head: true }).in("id", ids).eq("status", "pending_approval")
    : { count: 0 };
  return (count ?? 0) + (waiting ?? 0);
}

/** Situação do ciclo: quantos produtos já ganharam vídeo e quantos faltam. */
export async function videoAutopilotStatus(db: SupabaseClient, userId: string) {
  const { data: st } = await db.from("brand_settings").select("video_daily, video_cycle, video_cycle_done_at, video_daily_last").eq("user_id", userId).maybeSingle();
  const cycle = st?.video_cycle ?? 1;
  const store = await storeFor(db, userId);
  const products = store ? (await storeProducts(store.token, store.storeId)).filter((p) => p.images.length) : [];
  const { count: done } = await db.from("video_autopilot_items").select("product_id", { count: "exact", head: true }).eq("user_id", userId).eq("cycle", cycle);
  return {
    per_day: st?.video_daily ?? 0,
    cycle,
    total: products.length,
    done: done ?? 0,
    finished_at: st?.video_cycle_done_at ?? null,
    last_run: st?.video_daily_last ?? null,
    pending: await pendingVideos(db, userId),
    max_pending: MAX_PENDING,
  };
}

/** Faz os vídeos do dia de um usuário. `force` ignora o horário (botão "Fazer os de hoje agora"). */
export async function runVideosFor(db: SupabaseClient, userId: string) {
  const { data: st } = await db.from("brand_settings").select("brand_name, video_daily, video_cycle, video_cycle_done_at, sale_alert_phone").eq("user_id", userId).maybeSingle();
  const perDay = Math.min(Math.max(st?.video_daily ?? 0, 0), 20);
  if (!perDay) return { skipped: "desligado" };
  if (st?.video_cycle_done_at) return { skipped: "ciclo terminado, esperando autorização" };
  const pending = await pendingVideos(db, userId);
  if (pending >= MAX_PENDING) return { skipped: `${pending} vídeos esperando aprovação` };

  const store = await storeFor(db, userId);
  if (!store) return { skipped: "Nuvemshop não conectada" };
  const cycle = st?.video_cycle ?? 1;
  const products = (await storeProducts(store.token, store.storeId)).filter((p) => p.images.length);
  const { data: doneRows } = await db.from("video_autopilot_items").select("product_id").eq("user_id", userId).eq("cycle", cycle).limit(5000);
  const done = new Set((doneRows ?? []).map((r) => Number(r.product_id)));
  const todo = products.filter((p) => !done.has(p.id));
  const batch = todo.slice(0, Math.min(perDay, MAX_PENDING - pending));

  const made: string[] = [];
  for (const p of batch) {
    // Marca antes de fazer: nunca repete o produto no ciclo, mesmo se o cron rodar duas vezes
    const { error: dup } = await db.from("video_autopilot_items").insert({ user_id: userId, cycle, product_id: p.id, name: p.name });
    if (dup) continue;
    await queueProductVideo(db, userId, { name: p.name, images: p.images, url: p.url, description: p.description },
      { defer: true, autopost: true, platforms: ["tiktok"], why: "Vídeo diário do TikTok (piloto de vídeos)", source: "video_autopilot" });
    made.push(p.name);
  }

  // Acabaram os produtos: para e avisa
  if (todo.length - made.length <= 0) {
    await db.from("brand_settings").update({ video_cycle_done_at: new Date().toISOString() }).eq("user_id", userId);
    if (st?.sale_alert_phone) {
      await sendWhatsAppTo(db, userId, st.sale_alert_phone,
        `🎬 *Vídeos do TikTok: ciclo ${cycle} terminado!*\nTodos os ${products.length} produtos do site já ganharam vídeo. ` +
          `Parei de criar. Para recomeçar (com textos novos), abra o Studio → Aprovações → Vídeos diários e toque em "Recomeçar".`).catch(() => null);
    }
  }
  return { made: made.length, remaining: Math.max(todo.length - made.length, 0) };
}

/** Cron: às 9h de Brasília, uma vez por dia por usuário. */
export async function runDailyVideos(db: SupabaseClient) {
  const now = brasiliaNow();
  if (now.hour !== 9) return undefined;
  const { data: users } = await db.from("brand_settings").select("user_id, video_daily_last").gt("video_daily", 0).is("video_cycle_done_at", null);
  const out: Record<string, unknown>[] = [];
  for (const u of users ?? []) {
    if (u.video_daily_last === now.date) continue;
    const { data: claimed } = await db.from("brand_settings").update({ video_daily_last: now.date }).eq("user_id", u.user_id)
      .or(`video_daily_last.is.null,video_daily_last.neq.${now.date}`).select("user_id").maybeSingle();
    if (!claimed) continue;
    out.push({ user: u.user_id, ...(await runVideosFor(db, u.user_id).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))) });
  }
  return out;
}
