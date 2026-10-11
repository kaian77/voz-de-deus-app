// Chamado pelo pg_cron a cada minuto (ver SETUP_SOCIAL_STUDIO.md).
// Também aceita { post_id } com JWT do usuário para "Publicar agora".
import { adminClient, corsHeaders, env, handleError, HttpError, json, requireUser, timingSafeEqual } from "../_shared/util.ts";
import { advancePost, runDuePosts } from "../_shared/publisher.ts";

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
    return json({ processed: await runDuePosts(db) });
  } catch (err) {
    return handleError(err);
  }
});
