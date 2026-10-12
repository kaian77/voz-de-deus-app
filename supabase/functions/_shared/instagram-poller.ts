// Busca periódica de comentários e DMs do Instagram.
// Sem Acesso Avançado (análise da Meta) os webhooks de comentários/mensagens reais não chegam;
// enquanto isso, o cron consulta a API e trata o que for novo como se tivesse vindo pelo webhook.
// Quando os webhooks estão chegando para a conta, a busca é pulada.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { igRecentMedia, igRequest, igTokenFor } from "./instagram.ts";
import { handleComment, handleDirectMessage } from "./instagram-events.ts";

const RECENT_MEDIA = 4; // últimos posts verificados (além dos posts com automação específica)
const WEBHOOK_FRESH_MS = 6 * 3600_000; // webhook recebido nas últimas 6h = não precisa buscar

type ApiComment = { id: string; text?: string; timestamp?: string; username?: string; from?: { id: string; username?: string } };
type ApiConversation = {
  id: string;
  updated_time?: string;
  messages?: { data?: { id: string; message?: string; created_time?: string; from?: { id: string; username?: string } }[] };
};

async function webhooksWorking(db: SupabaseClient, externalId: string) {
  const { data } = await db.from("webhook_log").select("received_at").eq("platform", "instagram").eq("status", "ok")
    .eq("account_external_id", externalId).order("received_at", { ascending: false }).limit(1).maybeSingle();
  return Boolean(data && Date.now() - new Date(data.received_at).getTime() < WEBHOOK_FRESH_MS);
}

export async function pollInstagram(db: SupabaseClient) {
  const { data: accounts } = await db.from("social_accounts").select("*").eq("platform", "instagram");
  const report = [];
  for (const account of accounts ?? []) {
    const igUserId = String(account.external_id);
    if (await webhooksWorking(db, igUserId)) {
      report.push({ account: account.username, skipped: "webhooks ativos" });
      continue;
    }
    const startedAt = new Date().toISOString();
    const since = account.meta?.poll_since ? new Date(account.meta.poll_since).getTime() : null;
    // Primeira execução: só marca o ponto de partida (não responde comentários antigos)
    if (!since) {
      await db.from("social_accounts").update({ meta: { ...(account.meta ?? {}), poll_since: startedAt } }).eq("id", account.id);
      report.push({ account: account.username, started: true });
      continue;
    }
    const isNew = (ts?: string) => Boolean(ts && new Date(ts).getTime() > since - 60_000); // 1 min de folga

    const result = { account: account.username, comments: 0, messages: 0, errors: [] as string[] };
    try {
      const token = await igTokenFor(db, account.id);

      // Comentários: posts recentes + posts que têm automação específica
      const { data: automations } = await db.from("automations").select("media_ids").eq("user_id", account.user_id).eq("active", true);
      const mediaIds = new Set<string>((automations ?? []).flatMap((a) => a.media_ids ?? []));
      try {
        for (const m of await igRecentMedia(token, igUserId, RECENT_MEDIA)) mediaIds.add(m.id);
      } catch (e) {
        result.errors.push(`posts: ${e instanceof Error ? e.message : e}`);
      }
      for (const mediaId of mediaIds) {
        try {
          const r = await igRequest<{ data?: ApiComment[] }>(token, `${mediaId}/comments`, { params: { fields: "id,text,timestamp,username,from", limit: 50 } });
          for (const c of r.data ?? []) {
            if (!isNew(c.timestamp) || c.from?.id === igUserId || (c.username && c.username === account.username)) continue;
            await handleComment(igUserId, {
              id: c.id,
              text: c.text,
              from: c.from ?? (c.username ? { id: "", username: c.username } : undefined),
              media: { id: mediaId },
            });
            result.comments++;
          }
        } catch (e) {
          result.errors.push(`comentários ${mediaId}: ${e instanceof Error ? e.message : e}`);
        }
      }

      // Direct: conversas atualizadas desde a última busca
      try {
        const r = await igRequest<{ data?: ApiConversation[] }>(token, "me/conversations", {
          params: { platform: "instagram", fields: "id,updated_time,messages.limit(5){id,message,created_time,from}", limit: 20 },
        });
        for (const conv of r.data ?? []) {
          if (!isNew(conv.updated_time)) continue;
          // Mais antigas primeiro, para a conversa ficar na ordem certa
          for (const m of [...(conv.messages?.data ?? [])].reverse()) {
            if (!m.from?.id || m.from.id === igUserId || !isNew(m.created_time)) continue;
            await handleDirectMessage(igUserId, {
              sender: { id: m.from.id },
              recipient: { id: igUserId },
              message: { mid: m.id, text: m.message ?? "" },
              username: m.from.username,
            });
            result.messages++;
          }
        }
      } catch (e) {
        result.errors.push(`direct: ${e instanceof Error ? e.message : e}`);
      }
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }

    const { data: fresh } = await db.from("social_accounts").select("meta").eq("id", account.id).single();
    await db.from("social_accounts").update({
      meta: { ...(fresh?.meta ?? {}), poll_since: startedAt, poll_last: { at: startedAt, ...result } },
    }).eq("id", account.id);
    report.push(result);
  }
  return report;
}
