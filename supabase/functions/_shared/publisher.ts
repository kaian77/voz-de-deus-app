// Máquina de estados da publicação. Cada execução avança o post o máximo possível;
// vídeos que ainda estão processando ficam em "publishing" e são retomados no próximo ciclo do cron.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { igCreateContainer, igPublishContainer, igTokenFor, igWaitContainer } from "./instagram.ts";
import { TikTokError, ttPublishPhotos, ttPublishStatus, ttPublishVideo, ttTokenFor, ttUploadToInbox } from "./tiktok.ts";

type PlatformResult = {
  status?: "processing" | "published" | "failed";
  container_id?: string;
  publish_id?: string;
  id?: string;
  permalink?: string;
  error?: string;
  account_id?: string;
  inbox?: boolean; // foi para a caixa de entrada do app do TikTok (falta o criador publicar pelo app)
};

type Post = {
  id: string;
  user_id: string;
  kind: string;
  caption: string;
  platforms: string[];
  media: { url: string; type: "image" | "video" }[];
  options: Record<string, any>;
  results: Record<string, PlatformResult>;
  updated_at: string;
};

async function accountFor(db: SupabaseClient, post: Post, platform: string) {
  const wanted = post.options?.account_ids?.[platform];
  let query = db.from("social_accounts").select("*").eq("user_id", post.user_id).eq("platform", platform);
  if (wanted) query = query.eq("id", wanted);
  const { data } = await query.order("connected_at").limit(1);
  if (!data?.[0]) throw new Error(`Nenhuma conta de ${platform} conectada`);
  return data[0];
}

export function validatePost(post: Pick<Post, "kind" | "platforms" | "media">): string | null {
  if (!post.media?.length) return "O post precisa de pelo menos uma mídia (imagem ou vídeo).";
  const hasVideo = post.media.some((m) => m.type === "video");
  const isVideoKind = ["reel", "video"].includes(post.kind);
  if (isVideoKind && post.media[0].type !== "video") return "Reels/vídeos precisam de um arquivo de vídeo.";
  if (post.platforms.includes("tiktok")) {
    if (post.kind === "story") return "Stories não existem no TikTok.";
    if (!isVideoKind && hasVideo) return "No TikTok, carrossel/fotos aceita apenas imagens.";
  }
  if (post.kind === "carousel" && post.media.length > 10 && post.platforms.includes("instagram")) {
    return "Carrossel do Instagram aceita no máximo 10 itens.";
  }
  return null;
}

async function stepInstagram(db: SupabaseClient, post: Post, r: PlatformResult): Promise<PlatformResult> {
  const account = await accountFor(db, post, "instagram");
  const token = await igTokenFor(db, account.id);
  if (!r.container_id) {
    r.container_id = await igCreateContainer(token, account.external_id, post.kind, post.caption, post.media, post.options?.instagram ?? {});
  }
  const ready = await igWaitContainer(token, r.container_id, 45_000);
  if (!ready) return { ...r, status: "processing", account_id: account.id };
  const published = await igPublishContainer(token, account.external_id, r.container_id);
  return { status: "published", id: published.id, permalink: published.permalink, account_id: account.id };
}

/** O TikTok só puxa mídia de URLs verificadas; servimos o storage pelo domínio do site (rewrite /media na Vercel). */
function tiktokUrl(url: string) {
  const storage = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/media/`;
  const app = Deno.env.get("APP_URL");
  return app && url.startsWith(storage) ? `${app.replace(/\/$/, "")}/media/${url.slice(storage.length)}` : url;
}

async function stepTikTok(db: SupabaseClient, post: Post, r: PlatformResult): Promise<PlatformResult> {
  const account = await accountFor(db, post, "tiktok");
  const token = await ttTokenFor(db, account.id);
  const opts = post.options?.tiktok ?? {};
  if (!r.publish_id) {
    const video = ["reel", "video"].includes(post.kind);
    const urls = video ? [tiktokUrl(post.media[0].url)] : post.media.filter((m) => m.type === "image").map((m) => tiktokUrl(m.url));
    try {
      if (opts.mode === "inbox") throw new TikTokError("inbox", "");
      r.publish_id = video ? await ttPublishVideo(token, post.caption, urls[0], opts) : await ttPublishPhotos(token, post.caption, urls, opts);
    } catch (e) {
      // Antes da auditoria do TikTok a postagem direta só vale para conta privada: manda para o app como rascunho
      if (!(e instanceof TikTokError) || !["inbox", "unaudited_client_can_only_post_to_private_accounts"].includes(e.code)) throw e;
      r.publish_id = await ttUploadToInbox(token, post.caption, video ? "video" : "photo", urls);
      r.inbox = true;
    }
  }
  const status = await ttPublishStatus(token, r.publish_id);
  if (r.inbox && status.status === "SEND_TO_USER_INBOX") {
    return { status: "published", publish_id: r.publish_id, inbox: true, account_id: account.id };
  }
  if (status.status === "PUBLISH_COMPLETE") {
    return { status: "published", publish_id: r.publish_id, id: status.publicaly_available_post_id?.[0], account_id: account.id };
  }
  if (status.status === "FAILED") return { status: "failed", publish_id: r.publish_id, error: status.fail_reason ?? "Falha no TikTok" };
  return { ...r, status: "processing", account_id: account.id };
}

export async function advancePost(db: SupabaseClient, post: Post) {
  const results: Record<string, PlatformResult> = { ...(post.results ?? {}) };
  const invalid = validatePost(post);

  for (const platform of post.platforms) {
    const current = results[platform] ?? {};
    if (current.status === "published" || current.status === "failed") continue;
    if (invalid) {
      results[platform] = { status: "failed", error: invalid };
      continue;
    }
    try {
      results[platform] = platform === "instagram"
        ? await stepInstagram(db, post, current)
        : await stepTikTok(db, post, current);
    } catch (e) {
      results[platform] = { ...current, status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  }

  const statuses = post.platforms.map((p) => results[p]?.status);
  const status = statuses.every((s) => s === "published")
    ? "published"
    : statuses.some((s) => s === "processing")
    ? "publishing"
    : "failed";

  await db.from("posts").update({
    results,
    status,
    published_at: status === "published" ? new Date().toISOString() : null,
  }).eq("id", post.id);

  return { id: post.id, status, results };
}

/** Pega posts vencidos (ou em processamento) com trava otimista para não publicar em dobro. */
export async function runDuePosts(db: SupabaseClient, limit = 5) {
  const now = new Date();
  const stale = new Date(now.getTime() - 90_000).toISOString();
  const { data: candidates } = await db
    .from("posts")
    .select("*")
    .or(`and(status.eq.scheduled,scheduled_at.lte.${now.toISOString()}),and(status.eq.publishing,updated_at.lt.${stale})`)
    .order("scheduled_at")
    .limit(limit);

  const done = [];
  for (const post of candidates ?? []) {
    const { data: claimed } = await db
      .from("posts")
      .update({ status: "publishing" })
      .eq("id", post.id)
      .eq("updated_at", post.updated_at)
      .select()
      .maybeSingle();
    if (!claimed) continue; // outra execução já pegou
    done.push(await advancePost(db, claimed as Post));
  }
  return done;
}
