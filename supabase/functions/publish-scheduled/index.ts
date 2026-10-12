// Chamado pelo pg_cron a cada minuto (ver SETUP_SOCIAL_STUDIO.md): publica posts e, a cada 2 min,
// busca comentários/DMs novos do Instagram e cria os posts dos vídeos de produto prontos.
// Também aceita { post_id } com JWT do usuário para "Publicar agora".
import { adminClient, corsHeaders, env, handleError, HttpError, json, requireUser, timingSafeEqual } from "../_shared/util.ts";
import { advancePost, runDuePosts } from "../_shared/publisher.ts";
import { pollInstagram } from "../_shared/instagram-poller.ts";
import { finishRenderedVideos } from "../_shared/product-video.ts";

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
    // Vídeos animados que o GitHub Actions terminou de renderizar viram post
    const videos = await finishRenderedVideos(db).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }]);
    return json({ processed, polled, videos });
  } catch (err) {
    return handleError(err);
  }
});
