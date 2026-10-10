// GET  ?action=start  (com JWT do app)  -> { url } para abrir o login do Instagram
// GET  ?code=...&state=...              -> callback do Instagram; salva a conta e volta para o app
import { adminClient, appUrl, corsHeaders, functionsUrl, handleError, json, requireUser, signState, verifyState } from "../_shared/util.ts";
import { igAuthorizeUrl, igExchangeCode, igProfile, igSubscribeWebhooks } from "../_shared/instagram.ts";

const redirectUri = () => functionsUrl("oauth-instagram");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  try {
    if (url.searchParams.get("action") === "start") {
      const userId = await requireUser(req);
      return json({ url: igAuthorizeUrl(redirectUri(), await signState(userId)) });
    }

    if (url.searchParams.get("error")) {
      return Response.redirect(appUrl(`/studio/contas?error=${encodeURIComponent(url.searchParams.get("error_description") ?? "Login cancelado")}`), 302);
    }

    const userId = await verifyState(url.searchParams.get("state"));
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Código ausente");

    const { accessToken, expiresIn } = await igExchangeCode(code, redirectUri());
    const profile = await igProfile(accessToken);
    const db = adminClient();

    const { data: account, error } = await db.from("social_accounts").upsert({
      user_id: userId,
      platform: "instagram",
      external_id: String(profile.user_id ?? profile.id),
      username: profile.username,
      display_name: profile.name,
      avatar_url: profile.profile_picture_url,
      followers_count: profile.followers_count,
      meta: { biography: profile.biography, website: profile.website, media_count: profile.media_count },
      connected_at: new Date().toISOString(),
    }, { onConflict: "platform,external_id" }).select().single();
    if (error) throw error;

    await db.from("account_tokens").upsert({
      account_id: account.id,
      access_token: accessToken,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Necessário para receber webhooks de comentários desta conta
    await igSubscribeWebhooks(accessToken).catch((e) => console.error("subscribed_apps falhou", e));

    return Response.redirect(appUrl("/studio/contas?connected=instagram"), 302);
  } catch (err) {
    if (url.searchParams.has("code")) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.redirect(appUrl(`/studio/contas?error=${encodeURIComponent(message)}`), 302);
    }
    return handleError(err);
  }
});
