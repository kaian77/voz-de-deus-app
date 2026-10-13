// Limpeza do storage (o plano grátis do Supabase guarda 1 GB). Só vídeos, que são os arquivos grandes:
// - vídeo avulso (só para baixar): apagado 30 dias depois de criado;
// - vídeo de post: apagado 1 dia depois de publicado (o Instagram e o TikTok já guardam a cópia deles;
//   no TikTok o vídeo vai para a caixa de entrada do app na hora de publicar);
// - vídeo pronto que não virou post (post descartado): apagado depois de 30 dias.
// Posts agendados ou esperando aprovação nunca perdem o vídeo.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const DAY = 86400_000;
const BATCH = 50;

/** Caminho dentro do bucket "media" a partir da URL pública (null se o arquivo não é do Studio). */
function storagePath(url: string) {
  const marker = "/storage/v1/object/public/media/";
  const i = url.indexOf(marker);
  return i < 0 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

export async function cleanupStorage(db: SupabaseClient) {
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const removed: string[] = [];

  // 1) Vídeos animados dos produtos
  const { data: videos } = await db.from("product_videos").select("id,user_id,video_url,autopost,post_id,status,created_at,updated_at")
    .not("video_url", "is", null).is("file_deleted_at", null).in("status", ["ready", "failed"]).lt("created_at", ago(1)).order("created_at").limit(BATCH * 6);
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
      ? post.status === "published" && !!post.published_at && post.published_at < ago(1)
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

  // 2) Vídeos enviados para posts já publicados
  const { data: published } = await db.from("posts").select("id,media").eq("status", "published").lt("published_at", ago(1))
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
