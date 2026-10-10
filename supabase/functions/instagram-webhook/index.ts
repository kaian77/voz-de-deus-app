// Webhook do Instagram: o coração do "ManyChat" + agente de DMs.
// GET  -> verificação do Meta (hub.challenge)
// POST -> "comments": procura automação, responde publicamente e manda DM (private reply)
//         "messages": registra a DM na caixa de entrada e o agente de IA responde
import { adminClient, env, hmacHex, timingSafeEqual } from "../_shared/util.ts";
import { igPrivateReply, igReplyToComment, igRequest, igTokenFor } from "../_shared/instagram.ts";
import { autoReply, recordInbound } from "../_shared/inbox.ts";
import { aiEnabled, brandContext, generateText } from "../_shared/claude.ts";
import { matches } from "../_shared/matching.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

type CommentValue = {
  id: string;
  text?: string;
  parent_id?: string;
  from?: { id: string; username?: string };
  media?: { id: string; media_product_type?: string };
};

const fill = (template: string, username?: string) =>
  template.replaceAll("{username}", username ? `@${username}` : "").replaceAll("{nome}", username ?? "").trim();

async function handleComment(igUserId: string, value: CommentValue) {
  const db = adminClient();
  const { data: account } = await db.from("social_accounts").select("*").eq("platform", "instagram").eq("external_id", igUserId).maybeSingle();
  if (!account) return;
  if (!value.id || value.from?.id === igUserId) return; // ignora comentários da própria conta (evita loop)

  const { data: event, error } = await db.from("comment_events").insert({
    user_id: account.user_id,
    account_id: account.id,
    comment_id: value.id,
    media_id: value.media?.id,
    from_id: value.from?.id,
    from_username: value.from?.username,
    text: value.text ?? "",
  }).select().single();
  if (error) return; // entrega duplicada do webhook (comment_id único)

  const { data: automations } = await db
    .from("automations")
    .select("*")
    .eq("user_id", account.user_id)
    .eq("active", true)
    .or(`account_id.is.null,account_id.eq.${account.id}`)
    .order("created_at");

  // Automações específicas de um post têm prioridade sobre as gerais
  const sorted = (automations ?? []).sort((a, b) => (b.media_ids?.length ? 1 : 0) - (a.media_ids?.length ? 1 : 0));
  const automation = sorted.find((a) => matches(a, value.text ?? "", value.media?.id));
  if (!automation) {
    await db.from("comment_events").update({ status: "ignored", error: "Nenhuma automação correspondente" }).eq("id", event.id);
    return;
  }

  if (automation.once_per_user && value.from?.id) {
    const { count } = await db.from("comment_events").select("id", { count: "exact", head: true })
      .eq("automation_id", automation.id).eq("from_id", value.from.id).eq("status", "replied");
    if (count) {
      await db.from("comment_events").update({ status: "ignored", automation_id: automation.id, error: "Usuário já recebeu esta automação" }).eq("id", event.id);
      return;
    }
  }

  const token = await igTokenFor(db, account.id);
  let replyText: string | null = null;
  let dmText: string | null = null;
  const errors: string[] = [];

  try {
    if (automation.use_ai && aiEnabled()) {
      const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", account.user_id).maybeSingle();
      replyText = await generateText(
        `Você responde comentários no Instagram em nome da marca. Responda em português do Brasil, em 1 ou 2 frases curtas, calorosas e naturais, sem hashtags. Nunca prometa o que a marca não oferece.\n\n${brandContext(settings)}\n\nInstruções extras: ${automation.ai_instructions ?? "nenhuma"}`,
        `Comentário de @${value.from?.username ?? "seguidor"}: "${value.text}"\n\nEscreva somente a resposta.`,
      );
    } else if (automation.reply_variants?.length) {
      replyText = fill(automation.reply_variants[Math.floor(Math.random() * automation.reply_variants.length)], value.from?.username);
    }
    if (replyText) await igReplyToComment(token, value.id, replyText);
  } catch (e) {
    errors.push(`Resposta pública: ${e instanceof Error ? e.message : e}`);
  }

  try {
    if (automation.dm_message) {
      dmText = fill(automation.dm_message, value.from?.username);
      await igPrivateReply(token, igUserId, value.id, dmText);
    }
  } catch (e) {
    errors.push(`DM: ${e instanceof Error ? e.message : e}`);
  }

  // "replied" se pelo menos uma ação (resposta pública ou DM) deu certo; erros ficam registrados
  const attempted = Number(replyText !== null) + Number(dmText !== null);
  const ok = attempted > errors.length;
  await db.from("comment_events").update({
    automation_id: automation.id,
    reply_text: replyText,
    dm_text: dmText,
    status: ok ? "replied" : "failed",
    error: errors.join(" | ") || null,
  }).eq("id", event.id);
  if (ok) await db.rpc("increment_automation", { automation: automation.id });
}

type MessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  message?: { mid: string; text?: string; is_echo?: boolean; attachments?: { type: string }[] };
};

async function handleDirectMessage(igUserId: string, event: MessagingEvent) {
  const msg = event.message;
  if (!msg || msg.is_echo || event.sender.id === igUserId) return; // ignora mensagens enviadas pela própria conta
  const db = adminClient();
  const { data: account } = await db.from("social_accounts").select("*").eq("platform", "instagram").eq("external_id", igUserId).maybeSingle();
  if (!account) return;

  const token = await igTokenFor(db, account.id);
  const profile = await igRequest<{ name?: string; username?: string }>(token, event.sender.id, { params: { fields: "name,username" } }).catch(() => ({} as { name?: string; username?: string }));
  const text = msg.text ?? (msg.attachments?.length ? `[${msg.attachments.map((a) => a.type).join(", ")} enviado]` : "");
  const recorded = await recordInbound(db, account, "instagram", { id: event.sender.id, name: profile.name, username: profile.username }, { externalId: msg.mid, text });
  if (recorded) await autoReply(db, recorded.conversation, recorded.message.id);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env("META_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge")) : new Response("Forbidden", { status: 403 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256")?.replace("sha256=", "") ?? "";
  const expected = await hmacHex(env("IG_APP_SECRET"), raw);
  if (!timingSafeEqual(signature, expected)) return new Response("Assinatura inválida", { status: 401 });

  const body = JSON.parse(raw);
  const jobs: Promise<unknown>[] = [];
  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      jobs.push(handleDirectMessage(String(entry.id), event).catch((e) => console.error("DM falhou", e)));
    }
    for (const change of entry.changes ?? []) {
      if (change.field === "comments" || change.field === "live_comments") {
        jobs.push(handleComment(String(entry.id), change.value).catch((e) => console.error("comentário falhou", e)));
      }
    }
  }

  // Responde 200 rápido para o Meta e processa em segundo plano
  const all = Promise.all(jobs);
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(all);
  else await all;
  return new Response("EVENT_RECEIVED");
});
