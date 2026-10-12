// GET ?action=start (com JWT do app) -> { url } para autorizar o Studio na loja da Shopee
// GET ?state=...&code=...&shop_id=... -> retorno da Shopee (o state vai na própria URL de retorno)
import { adminClient, appUrl, corsHeaders, handleError, json, requireUser, signState, verifyState } from "../_shared/util.ts";
import { shopeeAuthorizeUrl, shopeeExchangeCode, shopeeShopInfo } from "../_shared/shopee.ts";
import { analyzeMarketplace } from "../_shared/marketplaces.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  try {
    if (url.searchParams.get("action") === "start") {
      const userId = await requireUser(req);
      return json({ url: await shopeeAuthorizeUrl(await signState(userId)) });
    }

    const code = url.searchParams.get("code");
    const shopId = url.searchParams.get("shop_id");
    if (!code || !shopId) throw new Error("A Shopee não devolveu a autorização da loja");
    const userId = await verifyState(url.searchParams.get("state"));
    const token = await shopeeExchangeCode(code, shopId);
    const info = await shopeeShopInfo(token.access_token, shopId);
    const db = adminClient();

    const { data: account, error } = await db.from("social_accounts").upsert({
      user_id: userId,
      platform: "shopee",
      external_id: shopId,
      username: info.shop_name ?? shopId,
      display_name: info.shop_name ?? "Loja Shopee",
      meta: {},
      connected_at: new Date().toISOString(),
    }, { onConflict: "platform,external_id" }).select().single();
    if (error) throw error;

    await db.from("account_tokens").upsert({
      account_id: account.id,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(Date.now() + token.expire_in * 1000).toISOString(),
      refresh_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    await analyzeMarketplace(db, userId, "shopee").catch((e) => console.error("análise Shopee", e));

    return Response.redirect(appUrl("/studio/contas?connected=shopee"), 302);
  } catch (err) {
    if (url.searchParams.has("code") || url.searchParams.has("state")) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.redirect(appUrl(`/studio/contas?error=${encodeURIComponent(message)}`), 302);
    }
    return handleError(err);
  }
});
