// Vídeo animado do produto (Reels/TikTok), sem custo por vídeo.
// 1) Aqui a IA escreve os textos do vídeo olhando a foto e o vídeo entra na fila (product_videos, "queued").
// 2) O GitHub Actions (video/worker.py) renderiza o MP4 vertical e marca "rendered".
// 3) O cron do Studio (finishRenderedVideos) cria o post no próximo horário nobre livre.
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
});

/** Põe o vídeo do produto na fila de renderização. */
export async function queueProductVideo(db: SupabaseClient, userId: string, product: ProductInfo) {
  const images = (product.video_images?.length ? product.video_images : product.images).slice(0, 4);
  if (!images.length) throw new Error("O produto precisa de pelo menos uma foto");
  // Evita vídeo duplicado do mesmo produto (ex.: clique duplo)
  const { data: recent } = await db.from("product_videos").select("*").eq("user_id", userId).eq("name", product.name)
    .in("status", ["queued", "rendering"]).limit(1).maybeSingle();
  if (recent) return recent;

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
        `${product.description ? `Descrição da loja: ${product.description.replace(/<[^>]+>/g, " ").slice(0, 800)}\n` : ""}` +
        `Escreva os textos do vídeo. O preço não aparece no vídeo.`,
      "low", images.slice(0, 2));
  }
  const caption = await productCaption(settings, { ...product, caption: product.caption }, "video");
  const { data, error } = await db.from("product_videos").insert({
    user_id: userId,
    name: product.name,
    product_url: product.url ?? null,
    images,
    brief: { ...brief, title: product.name, brand: settings?.brand_name ?? "", handle: ig?.username ? `@${ig.username}` : "" },
    caption,
    status: "queued",
  }).select().single();
  if (error) throw error;
  return data;
}

/** Chamado pelo cron: vídeos renderizados viram post (Reels + TikTok) no próximo horário nobre livre. */
export async function finishRenderedVideos(db: SupabaseClient) {
  const { data: rows } = await db.from("product_videos").select("*").eq("status", "rendered").order("created_at").limit(5);
  const report = [];
  for (const v of rows ?? []) {
    // Trava: só uma execução do cron cria o post
    const { data: claimed } = await db.from("product_videos").update({ status: "ready" }).eq("id", v.id).eq("status", "rendered").select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const { data: settings } = await db.from("brand_settings").select("approval_required,timezone").eq("user_id", v.user_id).maybeSingle();
      const { data: accounts } = await db.from("social_accounts").select("platform").eq("user_id", v.user_id).in("platform", ["instagram", "tiktok"]);
      const platforms = [...new Set((accounts ?? []).map((a) => a.platform as string))];
      if (!platforms.length) {
        report.push({ id: v.id, status: "ready", post: null });
        continue;
      }
      const approval = settings?.approval_required ?? true;
      const { data: post, error } = await db.from("posts").insert({
        user_id: v.user_id,
        title: `Vídeo: ${v.name}`,
        kind: "reel",
        platforms,
        caption: v.caption ?? v.name,
        media: [{ url: v.video_url, type: "video" }],
        scheduled_at: await freeSlot(db, v.user_id, settings?.timezone ?? "America/Sao_Paulo"),
        status: approval ? "pending_approval" : "scheduled",
        created_by: "agent",
        notes: `Vídeo animado do produto${v.product_url ? `: ${v.product_url}` : ""}.`,
        options: {},
      }).select("id").single();
      if (error) throw error;
      await db.from("product_videos").update({ post_id: post.id }).eq("id", v.id);
      report.push({ id: v.id, status: "ready", post: post.id });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("product_videos").update({ status: "rendered", error: message }).eq("id", v.id);
      report.push({ id: v.id, error: message });
    }
  }
  return report;
}
