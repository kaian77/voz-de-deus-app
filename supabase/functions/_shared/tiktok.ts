// Cliente da TikTok Content Posting API.
// Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
// Atenção: enquanto o app não passar na auditoria do TikTok, os posts só podem ser privados (SELF_ONLY).
// A tela de post segue as diretrizes de compartilhamento do TikTok (conta, privacidade sem padrão,
// interações, divulgação comercial e declaração de uso de música).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env } from "./util.ts";

export const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.upload"];
const API = "https://open.tiktokapis.com/v2";

/** Erros conhecidos da API, explicados em português. */
const TT_ERRORS: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts:
    "o app ainda não foi aprovado na auditoria do TikTok, então a postagem direta só funciona em conta privada",
  url_ownership_unverified: "o domínio do link da mídia não está verificado no app do TikTok",
  spam_risk_too_many_posts: "limite de posts do dia atingido no TikTok; tente amanhã",
  spam_risk_user_banned_from_posting: "a conta está temporariamente impedida de postar pelo TikTok",
  privacy_level_option_mismatch: "a privacidade escolhida não está disponível para esta conta",
  access_token_invalid: "a conexão com o TikTok expirou; conecte a conta de novo em Contas",
  scope_not_authorized: "falta permissão; conecte a conta do TikTok de novo em Contas",
};

export class TikTokError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function tt<T = any>(token: string, path: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.error && data.error.code && data.error.code !== "ok")) {
    const code = String(data.error?.code || res.status);
    throw new TikTokError(code, `TikTok: ${TT_ERRORS[code] ?? data.error?.message ?? code}`);
  }
  return data.data as T;
}

export function ttAuthorizeUrl(redirectUri: string, state: string) {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", env("TIKTOK_CLIENT_KEY"));
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), ...params }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`TikTok OAuth: ${data.error_description ?? data.error ?? res.status}`);
  return data as { access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number; open_id: string };
}

export const ttExchangeCode = (code: string, redirectUri: string) =>
  tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri });

export async function ttTokenFor(db: SupabaseClient, accountId: string): Promise<string> {
  const { data } = await db.from("account_tokens").select("*").eq("account_id", accountId).single();
  if (!data) throw new Error("Conta do TikTok sem token — reconecte em Contas");
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 5 * 60 * 1000) return data.access_token;
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await db.from("account_tokens").update({
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token,
    expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + fresh.refresh_expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("account_id", accountId);
  return fresh.access_token;
}

export async function ttUserInfo(token: string) {
  const res = await fetch(`${API}/user/info/?fields=open_id,union_id,avatar_url,display_name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.data?.user ?? {};
}

export type CreatorInfo = {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

export function ttCreatorInfo(token: string) {
  return tt<CreatorInfo>(token, "post/publish/creator_info/query/", {});
}

type Options = {
  privacy_level?: string;
  disable_comment?: boolean;
  disable_duet?: boolean;
  disable_stitch?: boolean;
  auto_add_music?: boolean;
  brand_content_toggle?: boolean; // "Conteúdo de marca" (parceria paga)
  brand_organic_toggle?: boolean; // "Sua marca" (conteúdo promocional)
};

/**
 * Regras do TikTok para Direct Post: a privacidade é escolhida pelo criador (nunca pré-definida como
 * pública pelo app) e conteúdo de marca não pode ser privado. Sem escolha válida, publica só para o criador.
 */
function postSettings(creator: CreatorInfo, options: Options) {
  const allowed = creator.privacy_level_options ?? [];
  const privacy = options.privacy_level && allowed.includes(options.privacy_level)
    ? options.privacy_level
    : allowed.includes("SELF_ONLY") ? "SELF_ONLY" : allowed[0];
  if (!privacy) throw new Error("TikTok: nenhuma opção de privacidade disponível para esta conta");
  if (options.brand_content_toggle && privacy === "SELF_ONLY") {
    throw new Error("TikTok: conteúdo de marca (parceria paga) não pode ser publicado como privado");
  }
  return {
    privacy_level: privacy,
    disable_comment: Boolean(options.disable_comment || creator.comment_disabled),
    brand_content_toggle: Boolean(options.brand_content_toggle),
    brand_organic_toggle: Boolean(options.brand_organic_toggle),
  };
}

export async function ttPublishVideo(token: string, caption: string, videoUrl: string, options: Options = {}) {
  const creator = await ttCreatorInfo(token);
  const data = await tt<{ publish_id: string }>(token, "post/publish/video/init/", {
    post_info: {
      title: caption.slice(0, 2200),
      ...postSettings(creator, options),
      disable_duet: Boolean(options.disable_duet || creator.duet_disabled),
      disable_stitch: Boolean(options.disable_stitch || creator.stitch_disabled),
    },
    source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
  });
  return data.publish_id;
}

export async function ttPublishPhotos(token: string, caption: string, imageUrls: string[], options: Options = {}) {
  const creator = await ttCreatorInfo(token);
  const [firstLine, ...rest] = caption.split("\n");
  const data = await tt<{ publish_id: string }>(token, "post/publish/content/init/", {
    post_info: {
      title: firstLine.slice(0, 90),
      description: (rest.join("\n").trim() || caption).slice(0, 4000),
      ...postSettings(creator, options),
      auto_add_music: options.auto_add_music ?? true,
    },
    source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: imageUrls.slice(0, 35) },
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
  });
  return data.publish_id;
}

/**
 * Envia para a caixa de entrada do app do TikTok (rascunho): o criador recebe uma notificação, revisa e publica
 * pelo app. Funciona mesmo antes da auditoria (a postagem direta, não).
 */
export async function ttUploadToInbox(token: string, caption: string, kind: "video" | "photo", urls: string[]) {
  if (kind === "video") {
    const data = await tt<{ publish_id: string }>(token, "post/publish/inbox/video/init/", {
      source_info: { source: "PULL_FROM_URL", video_url: urls[0] },
    });
    return data.publish_id;
  }
  const [firstLine, ...rest] = caption.split("\n");
  const data = await tt<{ publish_id: string }>(token, "post/publish/content/init/", {
    post_info: { title: firstLine.slice(0, 90), description: (rest.join("\n").trim() || caption).slice(0, 4000) },
    source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: urls.slice(0, 35) },
    post_mode: "MEDIA_UPLOAD",
    media_type: "PHOTO",
  });
  return data.publish_id;
}

export async function ttPublishStatus(token: string, publishId: string) {
  return tt<{ status: string; fail_reason?: string; publicaly_available_post_id?: string[] }>(
    token,
    "post/publish/status/fetch/",
    { publish_id: publishId },
  );
}

// O TikTok Shop pune vídeos/legendas que mandam o cliente para fora (link na bio, site, URL)
const URL_RE = /(https?:\/\/|www\.)\S+|\b[\w-]+(\.[\w-]+)*\.(com|net|shop|store)(\.br)?\b\S*/gi;
const OFFSITE = /\u0000|link\s+(na|da|do)\s+(bio|perfil)|\bsite\b|nuvemshop|whats/i;

/** Legenda para o TikTok: tira frases com link, site ou "link na bio" (o resto, inclusive hashtags, fica). */
export function tiktokCaption(caption: string, fallback = ""): string {
  const out = (caption ?? "").replace(URL_RE, "\u0000").split("\n").map((line) =>
    (line.match(/[^.!?]+[.!?]*\s*/g) ?? []).filter((s) => !OFFSITE.test(s)).join("").trim()
  ).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out || fallback;
}
