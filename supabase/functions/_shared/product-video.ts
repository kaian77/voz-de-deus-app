// Vídeo animado do produto (Reels/TikTok), sem custo por vídeo.
// 1) Aqui a IA escreve os textos do vídeo olhando a foto e o vídeo entra na fila (product_videos, "queued").
// 2) O GitHub Actions (video/worker.py) renderiza o MP4 vertical e marca "rendered".
// 3) O cron do Studio (finishRenderedVideos) cria o post no próximo horário nobre livre — menos nos vídeos
//    avulsos (autopost = false), que ficam só para baixar.
// Com o secret VIDEO_DISPATCH_TOKEN (token do GitHub com permissão de Actions), a renderização começa na hora;
// sem ele, o workflow roda de hora em hora.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { aiEnabled, brandContext, generateJSON } from "./claude.ts";
import { freeSlot, productCaption, type ProductInfo } from "./products.ts";

const Brief = z.object({
  hook: z.string().describe("Frase de abertura de até 7 palavras que prende nos 2 primeiros segundos; destaque 1 ou 2 palavras com *asteriscos*"),
  hook_sub: z.string().describe("Linha curta abaixo do gancho, ex.: 'Conheça a Maria Gotinha'"),
  subtitle: z.string().describe("O que é o produto, até 5 palavras, ex.: 'Pin de metal esmaltado'"),
  detail_title: z.string().describe("Título curto da cena da foto original, até 3 palavras"),
  detail_sub: z.string().describe("Complemento curto, até 7 palavras"),
  features: z.array(z.string()).describe("3 motivos para comprar, até 6 palavras cada, só com o que dá para ver na foto ou está nos dados"),
  cta: z.string().describe("Chamada do botão, até 3 palavras, ex.: 'Garanta a sua'"),
  urgency: z.string().describe("Frase curta acima do botão com um fato real da marca (ex.: 'Enviamos para todo o Brasil'); vazia se não houver"),
  motif: z.enum(["none", "hearts", "ribbons", "petals", "stars"]).describe(
    "Enfeite animado que cai pela tela, de acordo com o tema do vídeo/produto: ribbons = laços de campanha (Outubro Rosa, Novembro Azul, " +
      "Setembro Amarelo, conscientização); hearts = amor, Dia das Mães/Pais/Namorados, doação; stars = Natal, festas, conquistas; " +
      "petals = flores, primavera, Dia da Mulher; none = produto sem tema especial",
  ),
  theme_colors: z.object({ primary: z.string(), secondary: z.string(), accent: z.string() }).nullable().describe(
    "Só quando o tema tem cores próprias (ex.: Outubro Rosa: primary #E8559A, secondary #2B0A1A, accent #FFC1DA); hex. null = cores da marca",
  ),
});

/** Pede ao GitHub para rodar o workflow de vídeos agora. Devolve false quando não há token (fica para o horário). */
export async function dispatchRender(): Promise<boolean> {
  const token = Deno.env.get("VIDEO_DISPATCH_TOKEN");
  if (!token) return false;
  const repo = Deno.env.get("VIDEO_REPO") || "kaian77/voz-de-deus-app";
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/product-videos.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "BraxStudio", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: "main" }),
  }).catch((e) => {
    console.error("dispatch do vídeo", e);
    return null;
  });
  if (res && !res.ok) console.error("dispatch do vídeo", res.status, await res.text().catch(() => ""));
  return !!res?.ok;
}

/** Põe o vídeo do produto na fila de renderização. Com autopost false, o vídeo fica só para baixar. */
export async function queueProductVideo(db: SupabaseClient, userId: string, product: ProductInfo, opts: { autopost?: boolean } = {}) {
  const images = (product.video_images?.length ? product.video_images : product.images).slice(0, 4);
  if (!images.length) throw new Error("O produto precisa de pelo menos uma foto");
  // Evita vídeo duplicado do mesmo produto (ex.: clique duplo)
  const { data: recent } = await db.from("product_videos").select("*").eq("user_id", userId).eq("name", product.name)
    .in("status", ["queued", "rendering"]).limit(1).maybeSingle();
  if (recent) return { ...recent, dispatched: await dispatchRender() };

  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
  const { data: ig } = await db.from("social_accounts").select("username").eq("user_id", userId).eq("platform", "instagram").limit(1).maybeSingle();
  let brief: Record<string, unknown> = { hook: `Chegou *${product.name}*`, hook_sub: "Novidade na loja", cta: "Garanta o seu", features: [] };
  if (aiEnabled()) {
    brief = await generateJSON(Brief,
      `Você escreve os textos curtos de um vídeo animado de produto (Reels/TikTok) de uma loja brasileira. Textos curtíssimos, ` +
        `fortes e em português do Brasil, sem emojis e sem hashtags. Concorde o gênero com o produto (ex.: "Garanta a sua" para ` +
        `"a Maria Gotinha"). Nunca invente características, materiais, medidas, preços, prazos ou promoções que não estejam nos dados, ` +
        `na foto ou no contexto da marca.\n\n${brandContext(settings)}`,
      `Produto: "${product.name}".\n` +
        `${product.description ? `Informações do produto: ${product.description.replace(/<[^>]+>/g, " ").slice(0, 800)}\n` : ""}` +
        `Escreva os textos do vídeo. O preço não aparece no vídeo. Escolha o enfeite animado (motif) pelo tema e, se o tema tiver cores próprias, theme_colors.`,
      "low", images.slice(0, 2));
  }
  const caption = await productCaption(settings, { ...product, caption: product.caption }, "video");
  const { data, error } = await db.from("product_videos").insert({
    user_id: userId,
    name: product.name,
    product_url: product.url ?? null,
    images,
    brief: {
      ...brief,
      ...(brief.theme_colors && !brief.colors ? { colors: brief.theme_colors } : {}),
      title: product.name,
      brand: settings?.brand_name ?? "",
      handle: ig?.username ? `@${ig.username}` : "",
      // Guardado para o "Refazer" escrever os textos com as mesmas informações
      ...(product.description ? { notes: product.description.replace(/<[^>]+>/g, " ").slice(0, 800) } : {}),
    },
    caption,
    status: "queued",
    autopost: opts.autopost ?? true,
  }).select().single();
  if (error) throw error;
  return { ...data, dispatched: await dispatchRender() };
}

/** Cria o post (Reels + TikTok) de um vídeo pronto, no próximo horário nobre livre. Devolve null sem contas conectadas. */
// deno-lint-ignore no-explicit-any
export async function postVideo(db: SupabaseClient, v: any) {
  const { data: settings } = await db.from("brand_settings").select("approval_required,timezone").eq("user_id", v.user_id).maybeSingle();
  const { data: accounts } = await db.from("social_accounts").select("platform").eq("user_id", v.user_id).in("platform", ["instagram", "tiktok"]);
  const platforms = [...new Set((accounts ?? []).map((a) => a.platform as string))];
  if (!platforms.length) return null;
  // Vídeo do piloto automático: vai para Aprovações no horário escolhido para a data (se ainda estiver livre)
  const approval = v.brief?.approval === true || (settings?.approval_required ?? true);
  let at: string | null = null;
  if (typeof v.brief?.post_at === "string" && new Date(v.brief.post_at).getTime() > Date.now() + 30 * 60_000) {
    const { count } = await db.from("posts").select("id", { count: "exact", head: true }).eq("user_id", v.user_id)
      .eq("scheduled_at", v.brief.post_at).in("status", ["pending_approval", "scheduled"]);
    if (!count) at = v.brief.post_at;
  }
  const { data: post, error } = await db.from("posts").insert({
    user_id: v.user_id,
    title: v.brief?.theme ? `${v.brief.theme}: ${v.name}` : `Vídeo: ${v.name}`,
    kind: "reel",
    platforms,
    caption: v.caption ?? v.name,
    media: [{ url: v.video_url, type: "video" }],
    scheduled_at: at ?? await freeSlot(db, v.user_id, settings?.timezone ?? "America/Sao_Paulo"),
    status: approval ? "pending_approval" : "scheduled",
    created_by: "agent",
    notes: v.brief?.why || `Vídeo animado do produto${v.product_url ? `: ${v.product_url}` : ""}.`,
    options: {
      ...(v.brief?.idea_key ? { idea: { key: v.brief.idea_key, theme: v.brief.theme, why: v.brief.why } } : {}),
      ...(v.product_url ? { product: { name: v.name, url: v.product_url } } : {}),
    },
  }).select("id,status").single();
  if (error) throw error;
  await db.from("product_videos").update({ post_id: post.id }).eq("id", v.id);
  return post;
}

/** Chamado pelo cron: vídeos renderizados viram post (Reels + TikTok) no próximo horário nobre livre (os avulsos só ficam prontos). */
export async function finishRenderedVideos(db: SupabaseClient) {
  const { data: rows } = await db.from("product_videos").select("*").eq("status", "rendered").order("created_at").limit(5);
  const report = [];
  for (const v of rows ?? []) {
    // Trava: só uma execução do cron cria o post
    const { data: claimed } = await db.from("product_videos").update({ status: "ready" }).eq("id", v.id).eq("status", "rendered").select("id").maybeSingle();
    if (!claimed) continue;
    if (v.autopost === false) {
      report.push({ id: v.id, status: "ready", post: null });
      continue;
    }
    try {
      const post = await postVideo(db, v);
      report.push({ id: v.id, status: "ready", post: post?.id ?? null });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("product_videos").update({ status: "rendered", error: message }).eq("id", v.id);
      report.push({ id: v.id, error: message });
    }
  }
  return report;
}
