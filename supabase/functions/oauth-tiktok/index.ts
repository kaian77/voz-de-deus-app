// GET ?action=start (com JWT do app) -> { url } para abrir o login do TikTok
// GET ?code=...&state=...            -> callback do TikTok
import { adminClient, appUrl, corsHeaders, functionsUrl, handleError, json, requireUser, signState, verifyState } from "../_shared/util.ts";
import { ttAuthorizeUrl, ttExchangeCode, ttUserInfo } from "../_shared/tiktok.ts";

const redirectUri = () => functionsUrl("oauth-tiktok");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  try {
    if (url.searchParams.get("action") === "start") {
      const userId = await requireUser(req);
      return json({ url: ttAuthorizeUrl(redirectUri(), await signState(userId)) });
    }

    if (url.searchParams.get("error")) {
      return Response.redirect(appUrl(`/studio/contas?error=${encodeURIComponent(url.searchParams.get("error_description") ?? "Login cancelado")}`), 302);
    }

    const userId = await verifyState(url.searchParams.get("state"));
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Código ausente");

    const token = await ttExchangeCode(code, redirectUri());
    const user = await ttUserInfo(token.access_token);
    const db = adminClient();

    const { data: account, error } = await db.from("social_accounts").upsert({
      user_id: userId,
      platform: "tiktok",
      external_id: token.open_id,
      username: user.display_name,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      connected_at: new Date().toISOString(),
    }, { onConflict: "platform,external_id" }).select().single();
    if (error) throw error;

    await db.from("account_tokens").upsert({
      account_id: account.id,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      refresh_expires_at: new Date(Date.now() + token.refresh_expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    return Response.redirect(appUrl("/studio/contas?connected=tiktok"), 302);
  } catch (err) {
    if (url.searchParams.has("code")) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.redirect(appUrl(`/studio/contas?error=${encodeURIComponent(message)}`), 302);
    }
    return handleError(err);
  }
});
