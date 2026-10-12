// Vídeo do produto com a apresentadora da marca (avatar + voz na HeyGen), para Reels e TikTok.
// 1) A IA escreve um roteiro curto com gancho forte olhando as fotos do produto.
// 2) O Video Agent da HeyGen monta o vídeo vertical (fotos do produto + voz/rosto da apresentadora).
// 3) O cron acompanha a renderização, copia o MP4 para o storage do Studio e cria o post (Reels + TikTok).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { aiEnabled, brandContext, generateJSON } from "./claude.ts";
import { heygenEnabled, hgAgentSession, hgCreateAgentVideo, hgVideo } from "./heygen.ts";
import { freeSlot, productCaption, type ProductInfo } from "./products.ts";

export type VideoStyle = "pov" | "presenter";
const MAX_WAIT_MS = 3 * 3600_000;

const Script = z.object({
  hook: z.string().describe("Primeira frase (até 8 palavras) que prende a atenção nos 2 primeiros segundos"),
  script: z.string().describe("Fala completa da apresentadora, começando pelo gancho, 45 a 70 palavras, em português do Brasil falado"),
});

async function writeScript(settings: Record<string, unknown> | null, product: ProductInfo, style: VideoStyle, presenter: string) {
  const cta = (settings?.default_cta as string) || "Link na bio!";
  if (!aiEnabled()) {
    return { hook: "Olha o que acabou de chegar!", script: `Olha o que acabou de chegar! ${product.name}${product.price ? `, por ${product.price}` : ""}. ${cta}` };
  }
  return generateJSON(Script,
    `Você escreve roteiros de vídeos curtos (Reels/TikTok) que vendem, para a ${presenter}, apresentadora da marca. ` +
      `Fala natural de brasileira conversando com a câmera, frases curtas, energia alta sem gritar, sem emojis e sem hashtags ` +
      `(o texto vai ser falado). Nunca invente características, medidas, materiais, prazos ou promoções que não estejam nos dados ` +
      `ou nas fotos. Pode usar o preço se ele for informado.\n\n${brandContext(settings)}`,
    `Produto: "${product.name}"${product.price ? `, preço ${product.price}` : ""}.\n` +
      `${product.description ? `Descrição da loja: ${product.description.replace(/<[^>]+>/g, " ").slice(0, 800)}\n` : ""}` +
      `${style === "pov"
        ? "Formato POV: a câmera mostra só as mãos segurando e girando o produto bem de perto; a apresentadora narra em primeira pessoa (\"olha só o que eu peguei\")."
        : "Formato apresentadora: ela aparece falando com a câmera e mostrando o produto."}\n` +
      `Estrutura: gancho (curiosidade ou identificação com o público) -> o que é e por que é especial (detalhes visíveis nas fotos) -> ` +
      `para quem é -> CTA final "${cta}" (ou variação curta). Duração falada: 20 a 30 segundos.`,
    "low", product.images.slice(0, 4));
}

function agentPrompt(style: VideoStyle, script: string, product: ProductInfo, notes?: string | null) {
  const format = style === "pov"
    ? "POV / first-person product video. Show ONLY the product and a pair of hands holding, turning and showing it close to the camera, " +
      "using the attached photos as the exact product reference (keep the real design, colors and details). Animate the photos with " +
      "smooth zooms and pans when needed. Do NOT show the presenter's face or body on screen: use the selected avatar's voice only, as voice-over."
    : "The presenter (the selected avatar) talks straight to the camera like a creator showing a new arrival, intercut every few seconds " +
      "with full-screen close-ups of the product made from the attached photos (keep the real design, colors and details).";
  return [
    "Create a vertical 9:16 short video for Instagram Reels and TikTok, 20 to 30 seconds long, for a Brazilian online store.",
    format,
    "The first 2 seconds must grab attention (start with motion and the hook line). Fast, dynamic cuts every 2-3 seconds.",
    "Add large, bold burned-in captions in Brazilian Portuguese synced to the narration, centered in the lower third and inside the safe area (not at the very bottom).",
    `End with a short end card showing the product name ("${product.name}")${product.price ? ` and the price (${product.price})` : ""} and the text "Link na bio".`,
    "Do not add claims, prices, discounts or text that are not in the script below. No background music louder than the voice.",
    notes ? `Extra instructions from the brand: ${notes}` : "",
    `Narration (Brazilian Portuguese, speak EXACTLY this text, natural and upbeat):\n"""${script}"""`,
  ].filter(Boolean).join("\n\n");
}

/**
 * Começa a gerar o vídeo do produto. Fica em product_videos com status "generating";
 * o cron (advanceProductVideos) termina o trabalho.
 */
export async function startProductVideo(
  db: SupabaseClient,
  userId: string,
  product: ProductInfo,
  opts: { style?: VideoStyle; force?: boolean } = {},
) {
  if (!heygenEnabled()) throw new Error("Configure a chave da HeyGen (secret HEYGEN_API_KEY no GitHub) e rode o deploy.");
  if (!product.images.length) throw new Error("O produto precisa de pelo menos uma foto");
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
  if (!settings?.heygen_avatar_id && !settings?.heygen_voice_id) {
    throw new Error("Escolha a apresentadora (avatar e voz da HeyGen) em Produtos > Vídeo com a apresentadora.");
  }
  // Evita gerar duas vezes o mesmo produto (ex.: clique duplo)
  if (!opts.force) {
    const { data: recent } = await db.from("product_videos").select("*").eq("user_id", userId).eq("name", product.name)
      .in("status", ["generating", "ready"]).gte("created_at", new Date(Date.now() - 3600_000).toISOString()).limit(1).maybeSingle();
    if (recent) return recent;
  }

  const style: VideoStyle = opts.style ?? (settings.video_style === "presenter" ? "presenter" : "pov");
  const presenter = (settings.video_presenter_name as string) || "apresentadora";
  const { script } = await writeScript(settings, product, style, presenter);
  const caption = await productCaption(settings, { ...product, caption: undefined }, "video");

  const { data: row, error } = await db.from("product_videos").insert({
    user_id: userId,
    name: product.name,
    product_url: product.url ?? null,
    images: product.images.slice(0, 10),
    style,
    script,
    caption,
    status: "generating",
  }).select().single();
  if (error) throw error;

  try {
    const r = await hgCreateAgentVideo({
      prompt: agentPrompt(style, script, product, settings.video_notes),
      avatarId: settings.heygen_avatar_id,
      voiceId: settings.heygen_voice_id,
      images: product.images,
    });
    const { data } = await db.from("product_videos").update({ heygen_session_id: r.sessionId, heygen_video_id: r.videoId })
      .eq("id", row.id).select().single();
    return data;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("product_videos").update({ status: "failed", error: message }).eq("id", row.id);
    throw e;
  }
}

/** Copia o MP4 (o link da HeyGen expira) para o storage público do Studio. */
async function storeVideo(db: SupabaseClient, userId: string, id: string, url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não consegui baixar o vídeo da HeyGen (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const path = `${userId}/videos/${id}.mp4`;
  const { error } = await db.storage.from("media").upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`Storage: ${error.message}`);
  return db.storage.from("media").getPublicUrl(path).data.publicUrl;
}

// deno-lint-ignore no-explicit-any
async function createVideoPost(db: SupabaseClient, video: any, videoUrl: string) {
  const { data: settings } = await db.from("brand_settings").select("approval_required,timezone").eq("user_id", video.user_id).maybeSingle();
  const { data: accounts } = await db.from("social_accounts").select("platform").eq("user_id", video.user_id).in("platform", ["instagram", "tiktok"]);
  const platforms = [...new Set((accounts ?? []).map((a) => a.platform as string))];
  if (!platforms.length) return null;
  const approval = settings?.approval_required ?? true;
  const { data: post, error } = await db.from("posts").insert({
    user_id: video.user_id,
    title: `Vídeo: ${video.name}`,
    kind: "reel",
    platforms,
    caption: video.caption ?? video.name,
    media: [{ url: videoUrl, type: "video" }],
    scheduled_at: await freeSlot(db, video.user_id, settings?.timezone ?? "America/Sao_Paulo"),
    status: approval ? "pending_approval" : "scheduled",
    created_by: "agent",
    notes: `Vídeo do produto com a apresentadora (HeyGen)${video.product_url ? `: ${video.product_url}` : ""}.`,
    options: {},
  }).select("id").single();
  if (error) throw error;
  return post.id as string;
}

/** Chamado pelo cron: acompanha os vídeos em produção e cria o post quando ficam prontos. */
export async function advanceProductVideos(db: SupabaseClient) {
  const { data: rows } = await db.from("product_videos").select("*").eq("status", "generating").order("created_at").limit(5);
  const report = [];
  for (const v of rows ?? []) {
    const fail = (error: string) => db.from("product_videos").update({ status: "failed", error }).eq("id", v.id);
    try {
      if (Date.now() - new Date(v.created_at).getTime() > MAX_WAIT_MS) {
        await fail("A HeyGen demorou mais de 3 horas. Tente gerar de novo.");
        report.push({ id: v.id, status: "timeout" });
        continue;
      }
      if (!v.heygen_session_id && !v.heygen_video_id) continue;
      let videoId = v.heygen_video_id as string | null;
      if (!videoId) {
        const s = await hgAgentSession(v.heygen_session_id);
        if (/fail|error|cancel/i.test(s.status)) {
          await fail(s.error ?? `A HeyGen não conseguiu criar o vídeo (${s.status})`);
          report.push({ id: v.id, status: "failed" });
          continue;
        }
        if (!s.videoId) {
          report.push({ id: v.id, status: s.status || "waiting" });
          continue;
        }
        videoId = s.videoId;
        await db.from("product_videos").update({ heygen_video_id: videoId }).eq("id", v.id);
      }
      const r = await hgVideo(videoId);
      if (r.status === "failed" || r.status === "cancelled") {
        await fail(r.error ?? "A HeyGen não conseguiu renderizar o vídeo");
        report.push({ id: v.id, status: "failed" });
        continue;
      }
      if (r.status !== "completed" || !r.url) {
        report.push({ id: v.id, status: r.status || "processing" });
        continue;
      }
      // Trava: só uma execução do cron finaliza o vídeo
      const { data: claimed } = await db.from("product_videos").update({ status: "finishing" })
        .eq("id", v.id).eq("status", "generating").select("id").maybeSingle();
      if (!claimed) continue;
      try {
        const url = await storeVideo(db, v.user_id, v.id, r.url);
        const postId = await createVideoPost(db, v, url);
        await db.from("product_videos").update({ status: "ready", video_url: url, thumbnail_url: r.thumbnail, post_id: postId, error: null }).eq("id", v.id);
        report.push({ id: v.id, status: "ready", post_id: postId });
      } catch (e) {
        await db.from("product_videos").update({ status: "generating", error: e instanceof Error ? e.message : String(e) }).eq("id", v.id);
        throw e;
      }
    } catch (e) {
      report.push({ id: v.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}
