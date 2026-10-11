// Ações da caixa de entrada chamadas pelo app (JWT do usuário):
//   { action: "send", conversation_id, text }      -> envia resposta manual
//   { action: "suggest", conversation_id }         -> IA sugere uma resposta (não envia)
//   { action: "connect_whatsapp", phone_number_id, access_token, waba_id? }   -> API oficial da Meta
//   { action: "connect_waha", base_url, session?, api_key? }                   -> WAHA (self-hosted, grátis)
import { adminClient, assertPublicHttpsUrl, corsHeaders, functionsUrl, handleError, HttpError, json, requireUser } from "../_shared/util.ts";
import { draftReply, sendMessage } from "../_shared/inbox.ts";
import { waPhoneInfo, waSubscribeApp, wahaSession, wahaSetWebhook } from "../_shared/whatsapp.ts";
import { aiEnabled } from "../_shared/claude.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const userId = await requireUser(req);
    const db = adminClient();
    const body = await req.json();

    const ownConversation = async (id: string) => {
      const { data } = await db.from("conversations").select("*").eq("id", id).eq("user_id", userId).single();
      if (!data) throw new HttpError(404, "Conversa não encontrada");
      return data;
    };

    switch (body.action) {
      case "send": {
        if (!body.text?.trim()) throw new HttpError(400, "Mensagem vazia");
        await ownConversation(body.conversation_id);
        return json(await sendMessage(db, body.conversation_id, body.text.trim(), "human"));
      }
      case "suggest": {
        if (!aiEnabled()) throw new HttpError(400, "Configure ANTHROPIC_API_KEY para usar a IA.");
        const draft = await draftReply(db, await ownConversation(body.conversation_id));
        return json({ reply: draft.reply, handoff: draft.handoff, handoff_reason: draft.handoff_reason });
      }
      case "connect_whatsapp": {
        const { phone_number_id, access_token, waba_id } = body;
        if (!phone_number_id || !access_token) throw new HttpError(400, "Informe o Phone Number ID e o token");
        const info = await waPhoneInfo(access_token, phone_number_id);
        if (waba_id) await waSubscribeApp(access_token, waba_id);
        const { data: account, error } = await db.from("social_accounts").upsert({
          user_id: userId,
          platform: "whatsapp",
          external_id: String(phone_number_id),
          username: info.display_phone_number,
          display_name: info.verified_name,
          meta: { provider: "meta", waba_id },
          connected_at: new Date().toISOString(),
        }, { onConflict: "platform,external_id" }).select().single();
        if (error) throw error;
        await db.from("account_tokens").upsert({ account_id: account.id, access_token, updated_at: new Date().toISOString() });
        return json(account);
      }
      case "connect_waha": {
        const cfg = { base_url: String(body.base_url ?? "").replace(/\/$/, ""), session: body.session || "default", api_key: body.api_key || null };
        assertPublicHttpsUrl(cfg.base_url);
        const session = await wahaSession(cfg);
        if (session.status !== "WORKING") throw new HttpError(400, `Sessão "${cfg.session}" está ${session.status}. Escaneie o QR Code no painel do WAHA e tente de novo.`);
        const phone = session.me?.id?.split("@")[0] ?? cfg.session;
        const { data: account, error } = await db.from("social_accounts").upsert({
          user_id: userId,
          platform: "whatsapp",
          external_id: `waha:${new URL(cfg.base_url).host}:${cfg.session}`,
          username: phone,
          display_name: session.me?.pushName ?? "WhatsApp (WAHA)",
          meta: { provider: "waha", base_url: cfg.base_url, session: cfg.session },
          connected_at: new Date().toISOString(),
        }, { onConflict: "platform,external_id" }).select().single();
        if (error) throw error;
        const secret = crypto.randomUUID().replaceAll("-", "");
        await db.from("account_tokens").upsert({ account_id: account.id, access_token: cfg.api_key ?? "", webhook_secret: secret, updated_at: new Date().toISOString() });
        const webhookUrl = `${functionsUrl("whatsapp-webhook")}?account=${account.id}&secret=${secret}`;
        const configured = await wahaSetWebhook(cfg, webhookUrl).then(() => true).catch(() => false);
        return json({ account, webhook_url: webhookUrl, webhook_configured: configured });
      }
      default:
        throw new HttpError(400, `Ação desconhecida: ${body.action}`);
    }
  } catch (err) {
    return handleError(err);
  }
});
