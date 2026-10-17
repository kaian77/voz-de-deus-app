// GET ?action=start (com JWT do app) -> { url } para abrir o login do Google
// GET ?code=...&state=...            -> callback do Google: salva o canal e o token
import { adminClient, appUrl, corsHeaders, functionsUrl, handleError, json, requireUser, signState, verifyState } from "../_shared/util.ts";
import { ytAuthorizeUrl, ytExchangeCode, ytMyChannel } from "../_shared/youtube.ts";

const redirectUri = () => functionsUrl("oauth-youtube");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  try {
    if (url.searchParams.get("action") === "start") {
      const userId = await requireUser(req);
      return json({ url: ytAuthorizeUrl(redirectUri(), await signState(userId)) });
    }

    if (url.searchParams.get("error")) {
      return Response.redirect(appUrl(`/studio/youtube?error=${encodeURIComponent(url.searchParams.get("error") ?? "Login cancelado")}`), 302);
    }

    const userId = await verifyState(url.searchParams.get("state"));
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Código ausente");

    const token = await ytExchangeCode(code, redirectUri());
    if (!token.refresh_token) throw new Error("O Google não mandou acesso permanente. Remova o app em myaccount.google.com/permissions e conecte de novo.");
    const channel = await ytMyChannel(token.access_token);
    const db = adminClient();

    const { data: row, error } = await db.from("yt_channels").upsert({
      user_id: userId, channel_id: channel.id, title: channel.title, thumbnail: channel.thumbnail ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: "channel_id" }).select().single();
    if (error) throw error;

    await db.from("yt_tokens").upsert({
      channel_ref: row.id,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    return Response.redirect(appUrl("/studio/youtube?connected=1"), 302);
  } catch (err) {
    if (url.searchParams.has("code")) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.redirect(appUrl(`/studio/youtube?error=${encodeURIComponent(message)}`), 302);
    }
    return handleError(err);
  }
});
