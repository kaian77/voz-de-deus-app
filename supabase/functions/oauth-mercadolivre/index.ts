// GET ?action=start (com JWT do app) -> { url } para autorizar o Studio na conta do Mercado Livre
// GET ?code=...&state=...            -> retorno do Mercado Livre (Redirect URI do app)
// POST                                 -> notificações dos tópicos do app (por enquanto só confirma o recebimento)
import { adminClient, appUrl, corsHeaders, handleError, json, requireUser, signState, verifyState } from "../_shared/util.ts";
import { ml, mlAuthorizeUrl, mlExchangeCode } from "../_shared/mercadolivre.ts";
import { analyzeMarketplace } from "../_shared/marketplaces.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  // O Mercado Livre exige uma URL de notificações; respondemos 200 para ele não desativar o envio
  if (req.method === "POST") return json({ ok: true });
  try {
    if (url.searchParams.get("action") === "start") {
      const userId = await requireUser(req);
      return json({ url: mlAuthorizeUrl(await signState(userId)) });
    }

    const code = url.searchParams.get("code");
    if (!code) throw new Error(url.searchParams.get("error_description") ?? "Código ausente");
    const userId = await verifyState(url.searchParams.get("state"));
    const token = await mlExchangeCode(code);
    const me = await ml(token.access_token, "/users/me").catch(() => ({}));
    const db = adminClient();

    const { data: account, error } = await db.from("social_accounts").upsert({
      user_id: userId,
      platform: "mercadolivre",
      external_id: String(token.user_id),
      username: me.nickname ?? String(token.user_id),
      display_name: me.nickname ?? "Mercado Livre",
      meta: { permalink: me.permalink, site: me.site_id },
      connected_at: new Date().toISOString(),
    }, { onConflict: "platform,external_id" }).select().single();
    if (error) throw error;

    await db.from("account_tokens").upsert({
      account_id: account.id,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    // Já lê os anúncios e descobre o padrão de preço (não trava a conexão se falhar)
    await analyzeMarketplace(db, userId, "mercadolivre").catch((e) => console.error("análise ML", e));

    return Response.redirect(appUrl("/studio/contas?connected=mercadolivre"), 302);
  } catch (err) {
    if (url.searchParams.has("code") || url.searchParams.has("error")) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.redirect(appUrl(`/studio/contas?error=${encodeURIComponent(message)}`), 302);
    }
    return handleError(err);
  }
});
