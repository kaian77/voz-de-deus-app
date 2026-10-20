// Cliente da "Instagram API with Instagram Login" (graph.instagram.com).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env, sleep } from "./util.ts";

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
  "instagram_business_manage_insights",
];

const version = () => env("META_GRAPH_VERSION", "v24.0");
const graph = (path: string) => `https://graph.instagram.com/${version()}/${path.replace(/^\//, "")}`;

export class GraphError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

export async function igRequest<T = any>(
  token: string,
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; params?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(path.startsWith("https://") ? path : graph(path));
  for (const [k, v] of Object.entries(init.params ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new GraphError(data.error?.message ?? `Instagram respondeu ${res.status}`, data.error?.code);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------
export function igAuthorizeUrl(redirectUri: string, state: string) {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", env("IG_APP_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", IG_SCOPES.join(","));
  url.searchParams.set("state", state);
  // Pede login de novo: sem isso o Instagram entra direto na conta já aberta no navegador (ex.: a da loja ao conectar o @ da PáginasPro)
  url.searchParams.set("force_reauth", "true");
  return url.toString();
}

export async function igExchangeCode(code: string, redirectUri: string) {
  const form = new URLSearchParams({
    client_id: env("IG_APP_ID"),
    client_secret: env("IG_APP_SECRET"),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
  const data = await res.json();
  const short = data.data?.[0] ?? data;
  if (!short.access_token) throw new GraphError(data.error_message ?? data.error?.message ?? "Falha no login do Instagram");

  // Troca por token de longa duração (60 dias)
  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", env("IG_APP_SECRET"));
  longUrl.searchParams.set("access_token", short.access_token);
  const long = await (await fetch(longUrl)).json();
  if (!long.access_token) throw new GraphError(long.error?.message ?? "Falha ao gerar token de longa duração");
  return { accessToken: long.access_token as string, expiresIn: Number(long.expires_in ?? 5184000) };
}

export async function igRefreshToken(token: string) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const data = await (await fetch(url)).json();
  if (!data.access_token) throw new GraphError(data.error?.message ?? "Falha ao renovar token");
  return { accessToken: data.access_token as string, expiresIn: Number(data.expires_in ?? 5184000) };
}

/** Retorna o token da conta, renovando se faltar menos de 7 dias para expirar. */
export async function igTokenFor(db: SupabaseClient, accountId: string): Promise<string> {
  const { data, error } = await db.from("account_tokens").select("*").eq("account_id", accountId).single();
  if (error || !data) throw new Error("Conta do Instagram sem token — reconecte em Contas");
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : Infinity;
  if (expiresAt - Date.now() < 7 * 24 * 3600 * 1000) {
    try {
      const fresh = await igRefreshToken(data.access_token);
      await db.from("account_tokens").update({
        access_token: fresh.accessToken,
        expires_at: new Date(Date.now() + fresh.expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("account_id", accountId);
      return fresh.accessToken;
    } catch (e) {
      console.error("Falha ao renovar token IG", e);
    }
  }
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Perfil e mídia
// ---------------------------------------------------------------------------
export const PROFILE_FIELDS = "user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website";
export const MEDIA_FIELDS = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";

export async function igProfile(token: string) {
  return igRequest(token, "me", { params: { fields: PROFILE_FIELDS } });
}

export async function igRecentMedia(token: string, igUserId: string, limit = 24) {
  const data = await igRequest<{ data: any[] }>(token, `${igUserId}/media`, { params: { fields: MEDIA_FIELDS, limit } });
  return data.data ?? [];
}

// ---------------------------------------------------------------------------
// Publicação (container -> status -> media_publish)
// ---------------------------------------------------------------------------
type MediaItem = { url: string; type: "image" | "video" };

export async function igCreateContainer(token: string, igUserId: string, kind: string, caption: string, media: MediaItem[], options: Record<string, unknown> = {}) {
  const create = (params: Record<string, string | boolean | undefined>) =>
    igRequest<{ id: string }>(token, `${igUserId}/media`, { method: "POST", params }).then((r) => r.id);
  const first = media[0];
  if (!first) throw new Error("Post sem mídia");

  switch (kind) {
    case "image":
      return create({ image_url: first.url, caption });
    case "reel":
    case "video":
      return create({
        media_type: "REELS",
        video_url: first.url,
        caption,
        share_to_feed: options.share_to_feed === false ? false : true,
        cover_url: options.cover_url as string | undefined,
      });
    case "story":
      return create(first.type === "video" ? { media_type: "STORIES", video_url: first.url } : { media_type: "STORIES", image_url: first.url });
    case "carousel":
    case "photos": {
      if (media.length < 2) return create({ image_url: first.url, caption });
      const children: string[] = [];
      for (const item of media.slice(0, 10)) {
        children.push(await create(item.type === "video"
          ? { media_type: "VIDEO", video_url: item.url, is_carousel_item: true }
          : { image_url: item.url, is_carousel_item: true }));
      }
      // Vídeos dentro do carrossel precisam terminar de processar antes do container pai
      for (const child of children) await igWaitContainer(token, child, 90_000);
      return create({ media_type: "CAROUSEL", children: children.join(","), caption });
    }
    default:
      throw new Error(`Tipo de post não suportado no Instagram: ${kind}`);
  }
}

export async function igContainerStatus(token: string, containerId: string): Promise<string> {
  const data = await igRequest<{ status_code: string }>(token, containerId, { params: { fields: "status_code" } });
  return data.status_code;
}

/** Espera o container ficar FINISHED; retorna false se ainda estiver processando ao fim do prazo. */
export async function igWaitContainer(token: string, containerId: string, timeoutMs = 60_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await igContainerStatus(token, containerId);
    if (status === "FINISHED") return true;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`Instagram recusou a mídia (status ${status})`);
    await sleep(4000);
  }
  return false;
}

export async function igPublishContainer(token: string, igUserId: string, containerId: string) {
  const { id } = await igRequest<{ id: string }>(token, `${igUserId}/media_publish`, { method: "POST", params: { creation_id: containerId } });
  const info = await igRequest<{ permalink?: string }>(token, id, { params: { fields: "permalink" } }).catch(() => ({ permalink: undefined }));
  return { id, permalink: info.permalink };
}

// ---------------------------------------------------------------------------
// Comentários e mensagens
// ---------------------------------------------------------------------------
export function igReplyToComment(token: string, commentId: string, message: string) {
  return igRequest<{ id: string }>(token, `${commentId}/replies`, { method: "POST", params: { message } });
}

/** Private reply: DM para quem comentou (1 por comentário, até 7 dias depois). */
export function igPrivateReply(token: string, igUserId: string, commentId: string, text: string) {
  return igRequest(token, `${igUserId}/messages`, {
    method: "POST",
    body: { recipient: { comment_id: commentId }, message: { text } },
  });
}

export function igSubscribeWebhooks(token: string) {
  return igRequest(token, "me/subscribed_apps", { method: "POST", params: { subscribed_fields: "comments,messages" } });
}

/** Campos de webhook em que a conta está inscrita para este app (vazio = a Meta não envia nada dela). */
export async function igSubscribedFields(token: string): Promise<string[]> {
  const r = await igRequest<{ data?: { subscribed_fields?: string[] }[] }>(token, "me/subscribed_apps");
  return [...new Set((r.data ?? []).flatMap((d) => d.subscribed_fields ?? []))];
}

// ---------------------------------------------------------------------------
// Concorrentes — Business Discovery (só existe na API com Facebook Login).
// Opcional: configure META_FB_ACCESS_TOKEN + META_FB_IG_USER_ID para ativar.
// ---------------------------------------------------------------------------
export function businessDiscoveryEnabled() {
  return Boolean(Deno.env.get("META_FB_ACCESS_TOKEN") && Deno.env.get("META_FB_IG_USER_ID"));
}

export async function igBusinessDiscovery(username: string) {
  const token = env("META_FB_ACCESS_TOKEN");
  const igUserId = env("META_FB_IG_USER_ID");
  const fields = `business_discovery.username(${username}){username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url,media.limit(24){caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink}}`;
  const url = new URL(`https://graph.facebook.com/${version()}/${igUserId}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);
  const data = await (await fetch(url)).json();
  if (data.error) throw new GraphError(data.error.message, data.error.code);
  const bd = data.business_discovery;
  return { ...bd, media: bd.media?.data ?? [] };
}

/** Perfil público de outra conta para a landing page de um cliente: bio e fotos dos posts.
 *  Business Discovery quando configurado (conta profissional); senão a página pública do Instagram (pode recusar). */
export async function igPublicProfile(username: string): Promise<{ name?: string; bio?: string; category?: string; picture?: string; photos: string[] }> {
  if (businessDiscoveryEnabled()) {
    const url = new URL(`https://graph.facebook.com/${version()}/${env("META_FB_IG_USER_ID")}`);
    url.searchParams.set("fields", `business_discovery.username(${username}){name,biography,profile_picture_url,media.limit(18){media_type,media_url,thumbnail_url}}`);
    url.searchParams.set("access_token", env("META_FB_ACCESS_TOKEN"));
    const data = await (await fetch(url)).json().catch(() => ({}));
    const bd = data.business_discovery;
    if (bd) {
      const photos = (bd.media?.data ?? []).map((m: Record<string, string>) => (m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url)).filter(Boolean);
      return { name: bd.name, bio: bd.biography, picture: bd.profile_picture_url, photos };
    }
  }
  const res = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
    headers: {
      "x-ig-app-id": "936619743392459",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      Accept: "application/json",
    },
  });
  const user = res.ok ? (await res.json().catch(() => null))?.data?.user : null;
  if (!user) throw new Error(res.status === 404 ? "perfil não encontrado" : "o Instagram não liberou o perfil agora");
  const edges = user.edge_owner_to_timeline_media?.edges ?? [];
  const photos = edges.map((e: { node: Record<string, string> }) => e.node.display_url || e.node.thumbnail_src).filter(Boolean);
  return { name: user.full_name, bio: user.biography, category: user.category_name ?? user.business_category_name, picture: user.profile_pic_url_hd, photos };
}
