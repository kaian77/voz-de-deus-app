// Webhook do Instagram: o coração do "ManyChat" + agente de DMs.
// GET  -> verificação do Meta (hub.challenge)
// POST -> "comments": procura automação, responde publicamente e manda DM (private reply)
//         "messages": registra a DM na caixa de entrada e o agente de IA responde
import { adminClient, env, hmacHex, timingSafeEqual } from "../_shared/util.ts";
import { handleComment, handleDirectMessage } from "../_shared/instagram-events.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Diagnóstico: guarda que a notificação chegou (sem o conteúdo) e mantém só as mais recentes. */
async function logWebhook(row: { status: string; account_external_id?: string | null; kinds?: string[] }) {
  try {
    const db = adminClient();
    const { data } = await db.from("webhook_log").insert({ platform: "instagram", kinds: [], ...row }).select("id").single();
    if (data && data.id % 50 === 0) await db.from("webhook_log").delete().lt("id", data.id - 500);
  } catch (e) {
    console.error("webhook_log", e);
  }
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
  if (!timingSafeEqual(signature, expected)) {
    await logWebhook({ status: "bad_signature" });
    return new Response("Assinatura inválida", { status: 401 });
  }

  const body = JSON.parse(raw);
  await logWebhook({
    status: "ok",
    account_external_id: body.entry?.[0]?.id ? String(body.entry[0].id) : null,
    kinds: [...new Set((body.entry ?? []).flatMap((e: any) => [
      ...(e.messaging?.length ? ["messages"] : []),
      ...(e.changes ?? []).map((c: any) => String(c.field)),
    ]))] as string[],
  });
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
