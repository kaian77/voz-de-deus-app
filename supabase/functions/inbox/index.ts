// Ações da caixa de entrada chamadas pelo app (JWT do usuário):
//   { action: "send", conversation_id, text }      -> envia resposta manual
//   { action: "suggest", conversation_id }         -> IA sugere uma resposta (não envia)
//   { action: "connect_whatsapp", phone_number_id, access_token, waba_id? }   -> API oficial da Meta
//   { action: "connect_waha", base_url, session?, api_key? }                   -> WAHA (self-hosted, grátis)
//   { action: "test_sale_alert", phone }            -> manda um aviso de venda de teste para o número
//   { action: "whatsapp_settings", account_id, agent?, agent_numbers?, agent_prompt? } -> onde e como a IA responde no número
//   { action: "wa_signup_config" }                  -> dados públicos do botão "Conectar com Facebook" (coexistência)
//   { action: "connect_whatsapp_signup", code, phone_number_id, waba_id } -> conecta o WhatsApp Business da PáginasPro (app + API)
//   { action: "account_brand", account_id, brand }  -> conta da Brax Pins ou da PáginasPro
// Nos dois: label ("Loja", "Pessoal"...) e agent (a IA responde sozinha nesse número?). Dá para ter vários números.
import { adminClient, assertPublicHttpsUrl, corsHeaders, functionsUrl, handleError, HttpError, json, requireUser } from "../_shared/util.ts";
import { autoReply, draftReply, sendMessage } from "../_shared/inbox.ts";
import { buildPreviewFromConversation } from "../_shared/paginaspro-agent.ts";
import { agentAllowed, waExchangeCode, waPhoneInfo, waSignupConfig, waSubscribeApp, waSyncCoexistence, wahaSession, wahaSetWebhook, wahaStart } from "../_shared/whatsapp.ts";
import { aiEnabled } from "../_shared/claude.ts";
import { saleMessage, sendWhatsAppTo } from "../_shared/sale-alerts.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

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

    // Rótulo do número e se a IA responde nele (no pessoal o app manda agent=false por padrão)
    const label = String(body.label ?? "").trim().slice(0, 40) || null;
    const agent = typeof body.agent === "boolean" ? body.agent : true;

    switch (body.action) {
      case "send": {
        if (!body.text?.trim()) throw new HttpError(400, "Mensagem vazia");
        await ownConversation(body.conversation_id);
        return json(await sendMessage(db, body.conversation_id, body.text.trim(), "human"));
      }
      case "resume": {
        // "Devolver para a IA": tira de "com você" e, se a última mensagem é do cliente e ficou sem resposta, a IA responde agora
        const conv = await ownConversation(body.conversation_id);
        const { data: updated } = await db.from("conversations").update({ status: "open", handoff_reason: null, ai_enabled: true })
          .eq("id", conv.id).select().single();
        const { data: last } = await db.from("messages").select("id,direction").eq("conversation_id", conv.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (updated && last?.direction === "in") {
          const job = autoReply(db, updated, last.id).catch((e) => console.error("resume", conv.id, e));
          if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
          else await job;
        }
        return json({ ok: true, replying: last?.direction === "in" });
      }
      case "pp_preview": {
        // PáginasPro: monta a prévia com o que a conversa já tem (quando a IA não conseguiu); o link chega na conversa sozinho
        const conv = await ownConversation(body.conversation_id);
        const r = await buildPreviewFromConversation(db, conv);
        if ("erro" in r) throw new HttpError(400, String(r.erro));
        return json(r);
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
          meta: { provider: "meta", waba_id, label, agent },
          connected_at: new Date().toISOString(),
        }, { onConflict: "platform,external_id" }).select().single();
        if (error) throw error;
        await db.from("account_tokens").upsert({ account_id: account.id, access_token, updated_at: new Date().toISOString() });
        return json(account);
      }
      case "wa_signup_config":
        return json(waSignupConfig());
      case "connect_whatsapp_signup": {
        // Coexistência: o número continua no app do celular e a IA da PáginasPro responde pela API
        const code = String(body.code ?? "");
        const phoneId = String(body.phone_number_id ?? "");
        const wabaId = String(body.waba_id ?? "");
        if (!code || !phoneId || !wabaId) throw new HttpError(400, "A conexão não terminou: tente de novo e vá até o fim no Facebook");
        const token = await waExchangeCode(code);
        const info = await waPhoneInfo(token, phoneId);
        await waSubscribeApp(token, wabaId);
        const { data: account, error } = await db.from("social_accounts").upsert({
          user_id: userId, platform: "whatsapp", external_id: phoneId,
          username: info.display_phone_number, display_name: info.verified_name || "PáginasPro",
          meta: { provider: "meta", brand: "paginaspro", coexistence: true, waba_id: wabaId, label: "PáginasPro", agent: true },
          connected_at: new Date().toISOString(),
        }, { onConflict: "platform,external_id" }).select().single();
        if (error) throw error;
        await db.from("account_tokens").upsert({ account_id: account.id, access_token: token, updated_at: new Date().toISOString() });
        await waSyncCoexistence(token, phoneId);
        return json(account);
      }
      case "account_brand": {
        // Marca da conta: a da PáginasPro não recebe automações, piloto automático nem atendente da loja
        const brand = body.brand === "paginaspro" ? "paginaspro" : "brax";
        const { data: acc } = await db.from("social_accounts").select("*").eq("id", body.account_id).eq("user_id", userId).in("platform", ["instagram", "whatsapp"]).maybeSingle();
        if (!acc) throw new HttpError(404, "Conta não encontrada");
        const meta = { ...acc.meta, brand };
        const { error } = await db.from("social_accounts").update({ meta }).eq("id", acc.id);
        if (error) throw error;
        return json({ meta });
      }
      case "connect_waha": {
        const cfg = { base_url: String(body.base_url ?? "").replace(/\/$/, ""), session: body.session || "default", api_key: body.api_key || null };
        assertPublicHttpsUrl(cfg.base_url);
        // Conecta mesmo sem o QR lido: assim o Studio já mantém o servidor acordado e liga a sessão se ela parar
        const session = await wahaSession(cfg);
        if (session.status === "STOPPED" || session.status === "FAILED") await wahaStart(cfg);
        const phone = session.me?.id?.split("@")[0] ?? cfg.session;
        const { data: account, error } = await db.from("social_accounts").upsert({
          user_id: userId,
          platform: "whatsapp",
          external_id: `waha:${new URL(cfg.base_url).host}:${cfg.session}`,
          username: phone,
          display_name: session.me?.pushName ?? "WhatsApp (WAHA)",
          meta: { provider: "waha", base_url: cfg.base_url, session: cfg.session, label, agent, status: session.status },
          connected_at: new Date().toISOString(),
        }, { onConflict: "platform,external_id" }).select().single();
        if (error) throw error;
        const secret = crypto.randomUUID().replaceAll("-", "");
        await db.from("account_tokens").upsert({ account_id: account.id, access_token: cfg.api_key ?? "", webhook_secret: secret, updated_at: new Date().toISOString() });
        const webhookUrl = `${functionsUrl("whatsapp-webhook")}?account=${account.id}&secret=${secret}`;
        const configured = await wahaSetWebhook(cfg, webhookUrl).then(() => true).catch(() => false);
        return json({ account, webhook_url: webhookUrl, webhook_configured: configured, status: session.status });
      }
      case "test_sale_alert": {
        const phone = String(body.phone ?? "").replace(/\D/g, "");
        if (phone.length < 10) throw new HttpError(400, "Informe o número com DDD");
        const text = saleMessage({ channel: "mercadolivre", id: "teste", number: "TESTE", items: ["1x Pin Zé Gotinha (exemplo)"], total: "R$ 0,00", buyer: "Teste do Studio" });
        await sendWhatsAppTo(db, userId, phone, text);
        return json({ ok: true });
      }
      case "whatsapp_settings": {
        // O navegador só lê social_accounts (segurança); a configuração da IA passa por aqui
        const { data: acc } = await db.from("social_accounts").select("*").eq("id", body.account_id).eq("user_id", userId).eq("platform", "whatsapp").maybeSingle();
        if (!acc) throw new HttpError(404, "Número não encontrado");
        const meta = { ...acc.meta };
        if (typeof body.agent === "boolean") meta.agent = body.agent;
        if (Array.isArray(body.agent_numbers)) meta.agent_numbers = body.agent_numbers.map((n: unknown) => String(n).trim()).filter(Boolean).slice(0, 200);
        if (typeof body.agent_prompt === "string") meta.agent_prompt = body.agent_prompt.trim().slice(0, 4000);
        const { error } = await db.from("social_accounts").update({ meta }).eq("id", acc.id);
        if (error) throw error;
        // Liga/desliga a IA nas conversas que já existem conforme a nova regra
        if (typeof body.agent === "boolean" || Array.isArray(body.agent_numbers)) {
          const { data: convs } = await db.from("conversations").select("id, contact_id").eq("account_id", acc.id);
          const on = (convs ?? []).filter((c) => agentAllowed(meta, c.contact_id)).map((c) => c.id);
          const off = (convs ?? []).filter((c) => !on.includes(c.id)).map((c) => c.id);
          if (on.length) await db.from("conversations").update({ ai_enabled: true }).in("id", on);
          if (off.length) await db.from("conversations").update({ ai_enabled: false }).in("id", off);
        }
        return json({ meta });
      }
      default:
        throw new HttpError(400, `Ação desconhecida: ${body.action}`);
    }
  } catch (err) {
    return handleError(err);
  }
});
