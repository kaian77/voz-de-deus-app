// GET  ?action=start (com JWT do app) -> { url } para autorizar o app na loja Nuvemshop
// GET  ?code=...&state=...            -> callback da Nuvemshop (URL de redirecionamento do app)
// POST ?lgpd=store_redact|customers_redact|customers_data_request -> webhooks obrigatórios da LGPD
import { adminClient, appUrl, corsHeaders, env, handleError, hmacHex, json, requireUser, signState, timingSafeEqual, verifyState } from "../_shared/util.ts";
import { nsAuthorizeUrl, nsExchangeCode, nsStore } from "../_shared/nuvemshop.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  try {
    if (req.method === "POST") {
      // Webhooks da Nuvemshop: assinados com o client secret do app
      const raw = await req.text();
      const signature = req.headers.get("x-linkedstore-hmac-sha256") ?? "";
      const expected = await hmacHex(env("NUVEMSHOP_CLIENT_SECRET"), raw);
      if (!timingSafeEqual(expected, signature)) return json({ error: "Assinatura inválida" }, 401);
      const body = JSON.parse(raw || "{}");
      // Não guardamos dados de clientes da loja (os pedidos são lidos na hora, direto da API).
      // Quando a loja remove o app (store/redact), apagamos a conexão e o token.
      if (url.searchParams.get("lgpd") === "store_redact" && body.store_id) {
        await adminClient().from("social_accounts").delete().eq("platform", "nuvemshop").eq("external_id", String(body.store_id));
      }
      return json({ ok: true });
    }

    if (url.searchParams.get("action") === "start") {
      const userId = await requireUser(req);
      return json({ url: nsAuthorizeUrl(await signState(userId)) });
    }

    const code = url.searchParams.get("code");
    if (!code) throw new Error("Código ausente");
    const userId = await verifyState(url.searchParams.get("state"));
    const token = await nsExchangeCode(code);
    const storeId = String(token.user_id);
    const store = await nsStore(token.access_token, storeId).catch(() => null);
    const db = adminClient();

    const { data: account, error } = await db.from("social_accounts").upsert({
      user_id: userId,
      platform: "nuvemshop",
      external_id: storeId,
      username: store?.url?.replace(/^https?:\/\//, "") ?? storeId,
      display_name: store?.name ?? "Loja Nuvemshop",
      meta: { url: store?.url, scope: token.scope },
      connected_at: new Date().toISOString(),
    }, { onConflict: "platform,external_id" }).select().single();
    if (error) throw error;

    await db.from("account_tokens").upsert({
      account_id: account.id,
      access_token: token.access_token,
      updated_at: new Date().toISOString(),
    });

    return Response.redirect(appUrl("/studio/contas?connected=nuvemshop"), 302);
  } catch (err) {
    if (url.searchParams.has("code")) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.redirect(appUrl(`/studio/contas?error=${encodeURIComponent(message)}`), 302);
    }
    return handleError(err);
  }
});
