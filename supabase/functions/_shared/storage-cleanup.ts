// Limpeza do storage (o plano grátis do Supabase guarda 1 GB). Só vídeos, que são os arquivos grandes:
// - vídeo avulso (só para baixar): apagado 30 dias depois de criado;
// - vídeo de post (de produto, IA ou enviado): apagado 1 h depois de publicado (o Instagram e o TikTok já guardam
//   a cópia deles; no TikTok o vídeo vai para a caixa de entrada do app na hora de publicar);
// - vídeo pronto que não virou post (post descartado): apagado depois de 30 dias;
// - vídeo IA (Kling/Higgsfield) que não virou post: apagado 30 dias depois de criado;
// - prévia dos vídeos do YouTube (cópia leve para assistir no Studio): apagada quando o vídeo vai ao ar no canal
//   (até lá dá para assistir e refazer); vídeo apagado/refeito perde prévia e capa na hora.
// Posts agendados ou esperando aprovação nunca perdem o vídeo.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const DAY = 86400_000;
const HOUR = 3600_000;
const BATCH = 50;

/** Caminho dentro do bucket "media" a partir da URL pública (null se o arquivo não é do Studio). */
export function storagePath(url: string) {
  const marker = "/storage/v1/object/public/media/";
  const i = url.indexOf(marker);
  return i < 0 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

export async function cleanupStorage(db: SupabaseClient) {
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
  const removed: string[] = [];

  // 1) Vídeos animados dos produtos
  const { data: videos } = await db.from("product_videos").select("id,user_id,video_url,autopost,post_id,status,created_at,updated_at")
    .not("video_url", "is", null).is("file_deleted_at", null).in("status", ["ready", "failed"]).lt("created_at", hoursAgo(1)).order("created_at").limit(BATCH * 6);
  const postIds = (videos ?? []).map((v) => v.post_id).filter(Boolean);
  const { data: linked } = postIds.length
    ? await db.from("posts").select("id,status,published_at").in("id", postIds)
    : { data: [] as { id: string; status: string; published_at: string | null }[] };
  const posts = new Map((linked ?? []).map((p) => [p.id, p]));
  for (const v of videos ?? []) {
    const post = v.post_id ? posts.get(v.post_id) : undefined;
    const expired = v.autopost === false
      ? v.created_at < ago(30)
      : post
      ? post.status === "published" && !!post.published_at && post.published_at < hoursAgo(1)
      : v.updated_at < ago(30);
    if (!expired) continue;
    const path = storagePath(v.video_url!);
    if (path) {
      const { error } = await db.storage.from("media").remove([path]);
      if (error) continue;
      removed.push(path);
    }
    await db.from("product_videos").update({ video_url: null, file_deleted_at: new Date().toISOString() }).eq("id", v.id);
  }

  // 1b) Vídeos IA com mais de 30 dias (menos os que estão num post ainda por publicar) ou que já saíram num post
  const { data: oldAi } = await db.from("ai_videos").select("id,video_url,post_id").eq("status", "done")
    .not("video_url", "is", null).is("file_deleted_at", null).lt("created_at", ago(30)).order("created_at").limit(BATCH);
  const { data: postedAi } = await db.from("ai_videos").select("id,video_url,post_id,posts!inner(status,published_at)").eq("status", "done")
    .not("video_url", "is", null).is("file_deleted_at", null).eq("posts.status", "published").lt("posts.published_at", hoursAgo(1)).limit(BATCH);
  const aiVideos = [...(oldAi ?? []), ...(postedAi ?? []).map(({ posts: _p, ...v }) => v)];
  const aiPostIds = (oldAi ?? []).map((v) => v.post_id).filter(Boolean);
  const { data: aiPosts } = aiPostIds.length
    ? await db.from("posts").select("id,status").in("id", aiPostIds).in("status", ["pending_approval", "scheduled", "publishing"])
    : { data: [] as { id: string }[] };
  const waiting = new Set((aiPosts ?? []).map((p) => p.id));
  for (const v of aiVideos) {
    if (v.post_id && waiting.has(v.post_id)) continue;
    const path = storagePath(v.video_url!);
    if (path) {
      const { error } = await db.storage.from("media").remove([path]);
      if (error) continue;
      removed.push(path);
    }
    await db.from("ai_videos").update({ video_url: null, file_deleted_at: new Date().toISOString() }).eq("id", v.id);
  }

  // 1c) Prévias dos vídeos do YouTube (o vídeo de verdade fica no YouTube): somem quando o vídeo vai ao ar
  const { data: ytLive } = await db.from("yt_videos").select("id,preview_url").not("preview_url", "is", null)
    .eq("status", "uploaded").lt("publish_at", hoursAgo(1)).order("publish_at").limit(BATCH);
  for (const v of ytLive ?? []) {
    const path = storagePath(v.preview_url!);
    if (path) {
      const { error } = await db.storage.from("media").remove([path]);
      if (error) continue;
      removed.push(path);
    }
    await db.from("yt_videos").update({ preview_url: null }).eq("id", v.id);
  }

  // 2) Vídeos enviados para posts já publicados
  const { data: published } = await db.from("posts").select("id,media").eq("status", "published").lt("published_at", hoursAgo(1))
    .contains("media", [{ type: "video" }]).limit(BATCH);
  for (const p of published ?? []) {
    let changed = false;
    const media = [];
    for (const m of p.media ?? []) {
      const path = m.type === "video" && !m.removed ? storagePath(m.url) : null;
      if (path) {
        const { error } = await db.storage.from("media").remove([path]);
        if (!error) {
          removed.push(path);
          media.push({ ...m, removed: true });
          changed = true;
          continue;
        }
      }
      media.push(m);
    }
    if (changed) await db.from("posts").update({ media }).eq("id", p.id);
  }
  return removed.length ? { removed: removed.length } : undefined;
}

/** Apaga do storage os arquivos do Studio nessas URLs (botões "Apagar"/"Refazer"). */
export async function removeStudioFiles(db: SupabaseClient, urls: (string | null | undefined)[]) {
  const paths = urls.map((u) => (u ? storagePath(u) : null)).filter((p): p is string => !!p);
  if (paths.length) await db.storage.from("media").remove(paths);
}

/**
 * Botão "Otimizar agora" (Studio → Uso): apaga já os vídeos de produto e de IA com mais de `days` dias
 * (o Instagram/TikTok guardam a cópia deles) e os vídeos dos achadinhos e prévias de cortes/YouTube que já
 * não servem. Nunca mexe em vídeo de post em rascunho, esperando aprovação, agendado ou publicando, nem nas fotos
 * do Mercado Livre (a sincronização usa de novo).
 */
export async function optimizeStorage(db: SupabaseClient, days = 3) {
  const before = new Date(Date.now() - days * DAY).toISOString();
  const keep = ["draft", "pending_approval", "scheduled", "publishing"];
  const paths: string[] = [];
  const now = new Date().toISOString();

  async function waitingPosts(ids: (string | null)[]) {
    const list = ids.filter((x): x is string => !!x);
    if (!list.length) return new Set<string>();
    const { data } = await db.from("posts").select("id").in("id", list).in("status", keep);
    return new Set((data ?? []).map((p) => p.id));
  }

  const { data: videos } = await db.from("product_videos").select("id,video_url,post_id").not("video_url", "is", null)
    .is("file_deleted_at", null).in("status", ["ready", "rendered", "failed"]).lt("created_at", before).limit(500);
  const busy = await waitingPosts((videos ?? []).map((v) => v.post_id));
  const doneVideos = (videos ?? []).filter((v) => !(v.post_id && busy.has(v.post_id)));
  for (const v of doneVideos) {
    const p = storagePath(v.video_url!);
    if (p) paths.push(p);
  }

  const { data: ai } = await db.from("ai_videos").select("id,video_url,post_id").eq("status", "done").not("video_url", "is", null)
    .is("file_deleted_at", null).lt("created_at", before).limit(500);
  const busyAi = await waitingPosts((ai ?? []).map((v) => v.post_id));
  const doneAi = (ai ?? []).filter((v) => !(v.post_id && busyAi.has(v.post_id)));
  for (const v of doneAi) {
    const p = storagePath(v.video_url!);
    if (p) paths.push(p);
  }

  // Prévias de vídeos do YouTube/cortes que falharam ou foram apagados
  const { data: yt } = await db.from("yt_videos").select("id,preview_url,thumbnail_url").not("preview_url", "is", null)
    .in("status", ["failed", "deleted"]).limit(500);
  for (const v of yt ?? []) for (const u of [v.preview_url, v.thumbnail_url]) {
    const p = u ? storagePath(u) : null;
    if (p) paths.push(p);
  }

  // Achadinhos com mais de 24 h (postados ou não)
  const { data: deals } = await db.from("deals").select("id,video_url,thumb_url").not("video_url", "is", null)
    .lt("created_at", new Date(Date.now() - 23 * HOUR).toISOString()).limit(500);
  for (const d of deals ?? []) for (const u of [d.video_url, d.thumb_url]) {
    const p = u ? storagePath(u) : null;
    if (p) paths.push(p);
  }

  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from("media").remove(paths.slice(i, i + 100));
    if (error) throw new Error(`Não consegui apagar os arquivos: ${error.message}`);
  }
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  if (doneVideos.length) await db.from("product_videos").update({ video_url: null, file_deleted_at: now }).in("id", ids(doneVideos));
  if (doneAi.length) await db.from("ai_videos").update({ video_url: null, file_deleted_at: now }).in("id", ids(doneAi));
  if (yt?.length) await db.from("yt_videos").update({ preview_url: null, thumbnail_url: null }).in("id", ids(yt));
  if (deals?.length) {
    await db.from("deals").update({ status: "skipped" }).in("id", ids(deals)).in("status", ["ready", "rendering"]);
    await db.from("deals").update({ video_url: null, thumb_url: null }).in("id", ids(deals));
  }
  return { files: paths.length, videos: doneVideos.length + doneAi.length, previews: yt?.length ?? 0, deals: deals?.length ?? 0 };
}
