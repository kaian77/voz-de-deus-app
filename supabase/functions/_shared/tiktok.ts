// Cliente da TikTok Content Posting API.
// Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
// Atenção: enquanto o app não passar na auditoria do TikTok, os posts só podem ser privados (SELF_ONLY).
// A tela de post segue as diretrizes de compartilhamento do TikTok (conta, privacidade sem padrão,
// interações, divulgação comercial e declaração de uso de música).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env } from "./util.ts";

export const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.upload"];
const API = "https://open.tiktokapis.com/v2";

async function tt<T = any>(token: string, path: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.error && data.error.code && data.error.code !== "ok")) {
    throw new Error(`TikTok: ${data.error?.message || data.error?.code || res.status}`);
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

export async function ttPublishStatus(token: string, publishId: string) {
  return tt<{ status: string; fail_reason?: string; publicaly_available_post_id?: string[] }>(
    token,
    "post/publish/status/fetch/",
    { publish_id: publishId },
  );
}
