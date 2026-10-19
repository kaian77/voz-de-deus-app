// Chamado pelo pg_cron a cada minuto (ver SETUP_SOCIAL_STUDIO.md): publica posts e, a cada 2 min,
// busca comentários/DMs novos do Instagram, cria os posts dos vídeos de produto prontos e roda o piloto automático.
// Também aceita { post_id } com JWT do usuário para "Publicar agora".
import { adminClient, corsHeaders, env, handleError, HttpError, json, requireUser, timingSafeEqual } from "../_shared/util.ts";
import { advancePost, runDuePosts } from "../_shared/publisher.ts";
import { pollInstagram } from "../_shared/instagram-poller.ts";
import { autoLinkPosts } from "../_shared/auto-link.ts";
import { finishRenderedVideos, prepareBriefs } from "../_shared/product-video.ts";
import { pollAiVideos } from "../_shared/ai-video.ts";
import { runAutopilot } from "../_shared/content-ideas.ts";
import { cleanupStorage } from "../_shared/storage-cleanup.ts";
import { wahaKeepAlive } from "../_shared/whatsapp.ts";
import { runSaleAlerts } from "../_shared/sale-alerts.ts";
import { runDailyDigest } from "../_shared/daily.ts";
import { runDailyVideos } from "../_shared/video-autopilot.ts";
import { sendPendingReviewEmails } from "../_shared/reviews.ts";
import { runMlSync, watchNewProducts } from "../_shared/ml-sync.ts";
import { ytAutopilot } from "../_shared/youtube.ts";
import { runPaginasproJobs } from "../_shared/paginaspro-agent.ts";
import { sendPendingPush } from "../_shared/push.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = adminClient();
    const body = await req.json().catch(() => ({}));

    if (body.post_id) {
      const userId = await requireUser(req);
      const { data: post } = await db.from("posts").select("*").eq("id", body.post_id).eq("user_id", userId).single();
      if (!post) throw new HttpError(404, "Post não encontrado");
      if (post.status === "published") return json({ id: post.id, status: post.status, results: post.results });
      // "Tentar de novo": limpa só as plataformas que falharam
      const results = Object.fromEntries(Object.entries(post.results ?? {}).filter(([, r]: [string, any]) => r?.status !== "failed"));
      const { data: claimed } = await db.from("posts").update({ status: "publishing", results }).eq("id", post.id).select().single();
      return json(await advancePost(db, claimed));
    }

    if (!timingSafeEqual(req.headers.get("x-cron-secret") ?? "", env("CRON_SECRET"))) throw new HttpError(401, "Não autorizado");
    const processed = await runDuePosts(db);
    // A cada 2 minutos: busca comentários/DMs novos (enquanto os webhooks da Meta não chegam)
    const polled = new Date().getUTCMinutes() % 2 === 0
      ? await pollInstagram(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }])
      : undefined;
    // Posts novos no Instagram ganham a automação com o link do produto (a função se limita a 1 consulta a cada 5 min)
    const autolink = await autoLinkPosts(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }]);
    // Vídeos animados que o GitHub Actions terminou de renderizar viram post
    const videos = await finishRenderedVideos(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }]);
    // Vídeos em lote (estratégia): a IA escreve os textos de alguns por minuto e manda renderizar
    const briefs = await prepareBriefs(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }]);
    // Vídeos IA (Kling / Higgsfield): confere as tarefas em andamento e guarda os prontos no storage
    const aivideos = await pollAiVideos(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }]);
    // A cada 10 minutos: piloto automático de conteúdo (uma vez por semana por usuário, em segundo plano)
    const autopilot = new Date().getUTCMinutes() % 10 === 5
      ? await runAutopilot(db).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
      : undefined;
    // Uma vez por hora: apaga os vídeos antigos (já baixados ou publicados) para liberar espaço
    const cleanup = new Date().getUTCMinutes() === 50
      ? await cleanupStorage(db).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
      : undefined;
    // A cada 10 minutos: "acorda" os servidores WAHA (hospedagem grátis dorme após 15 min sem acesso)
    const waha = new Date().getUTCMinutes() % 10 === 7
      ? await wahaKeepAlive(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }])
      : undefined;
    // Sincronização da loja com o Mercado Livre (alguns produtos por minuto, enquanto houver fila)
    const mlsync = await runMlSync(db).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    // A cada 10 minutos: produto novo na loja entra na fila do Mercado Livre
    const mlnew = new Date().getUTCMinutes() % 10 === 3
      ? await watchNewProducts(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }])
      : undefined;
    // A cada 10 minutos: cupom de quem avaliou e o e-mail ainda não saiu
    const reviews = new Date().getUTCMinutes() % 10 === 5
      ? await sendPendingReviewEmails(db).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
      : undefined;
    // A cada 2 minutos: aviso de venda no WhatsApp (Mercado Livre, Shopee, site)
    const sales = new Date().getUTCMinutes() % 2 === 1
      ? await runSaleAlerts(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }])
      : undefined;
    // Avisos no celular (Studio instalado como app)
    const push = await sendPendingPush(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }]);
    // Resumo do dia no WhatsApp (só às 8h de Brasília, uma vez por dia)
    const digest = await runDailyDigest(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }]);
    // Vídeos diários do TikTok (às 9h de Brasília, sem repetir produto no ciclo)
    const daily = await runDailyVideos(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }]);
    // Canal do YouTube: planeja o dia seguinte (depois das 15h) e escreve um roteiro por rodada, em segundo plano
    const youtube = ytAutopilot(db).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(youtube);
    // PáginasPro: prévias pedidas pelo atendente (a IA leva ~1 min; roda em segundo plano)
    const paginaspro = runPaginasproJobs(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }]);
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(paginaspro);
    return json({ processed, polled, autolink, videos, aivideos, briefs, digest, daily, autopilot, cleanup, waha, mlsync, mlnew, sales, reviews, push });
  } catch (err) {
    return handleError(err);
  }
});
