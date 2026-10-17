// Ferramentas que o Claude (ou qualquer agente) usa para operar o Studio.
// Expostas por REST (/agent/tools/<nome>) e por MCP (/agent/mcp) na função "agent".
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { businessDiscoveryEnabled, igBusinessDiscovery, igProfile, igRecentMedia, igSubscribedFields, igSubscribeWebhooks, igTokenFor } from "./instagram.ts";
import { advancePost, validatePost } from "./publisher.ts";
import { assertPublicHttpsUrl } from "./util.ts";
import { sendMessage, transcript } from "./inbox.ts";
import { aiEnabled, generateJSON, researchWeb } from "./claude.ts";
import { ns, nsCategories, nsCreateProduct, nsFindOrder, nsOrders, nsPages, nsProducts, nsStore, nsUpdateProduct, storeFor } from "./nuvemshop.ts";
import { announceProduct, buildProduct, createFromDraft, templateFor } from "./products.ts";
import { queueProductVideo, videoOptions } from "./product-video.ts";
import { analyzeMarketplace, mercadoLivreListings, publishToMercadoLivre } from "./marketplaces.ts";
import { fixSharedListings, mlSyncStatus, startMlSync } from "./ml-sync.ts";
import { generateIdeas } from "./content-ideas.ts";

type Ctx = { db: SupabaseClient; userId: string };

const MediaInput = z.union([
  z.string().url(),
  z.object({ url: z.string().url(), type: z.enum(["image", "video"]).optional() }),
]);
const Kind = z.enum(["image", "carousel", "reel", "story", "video", "photos"]);
const Platform = z.enum(["instagram", "tiktok"]);
const Slide = z.object({
  title: z.string().describe("Texto principal do slide (curto, forte)"),
  body: z.string().optional().describe("Texto de apoio"),
  footer: z.string().optional(),
  image_url: z.string().url().optional().describe("Imagem de fundo opcional"),
  product_image: z.string().url().optional().describe("Foto do produto mostrada inteira num cartão abaixo do texto"),
});
const Design = z.object({
  theme: z.enum(["marca", "divino", "claro", "escuro", "papel", "vibrante"]).optional(),
  handle: z.string().optional().describe("@ exibido nos slides"),
  palette: z.object({ primary: z.string(), secondary: z.string(), accent: z.string() }).optional()
    .describe("Cores de uma campanha (hex), ex.: Outubro Rosa; sem isso vale o tema (padrão 'marca': vermelho, preto e dourado)"),
}).optional();

function normalizeMedia(items: z.infer<typeof MediaInput>[] = []) {
  return items.map((m) => {
    const url = typeof m === "string" ? m : m.url;
    const type = typeof m === "string" || !m.type ? (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? "video" : "image") : m.type;
    return { url, type };
  });
}

async function store(ctx: Ctx) {
  const s = await storeFor(ctx.db, ctx.userId);
  if (!s) throw new Error("Nenhuma loja Nuvemshop conectada. Conecte em Studio > Contas.");
  return s;
}

/** Baixa uma página pública e devolve só o texto legível (sem scripts, estilos e tags). */
export async function readWebPage(raw: string, maxChars = 20000) {
  // Segue redirecionamentos manualmente para checar cada destino (proteção contra SSRF)
  let current = assertPublicHttpsUrl(raw);
  let res: Response | undefined;
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SocialStudio/1.0)", Accept: "text/html,text/plain" },
    });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) break;
    await res.body?.cancel();
    current = assertPublicHttpsUrl(new URL(location, current).toString());
  }
  if (!res) throw new Error("Não consegui abrir a página");
  if (!res.ok) throw new Error(`Não consegui abrir a página (${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw new Error(`A página não é texto (${type})`);
  const html = (await res.text()).slice(0, 2_000_000);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const links = [...html.matchAll(/<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }))
    .filter((l) => l.text && !/^(javascript|mailto|tel):/i.test(l.href))
    .map((l) => { try { return { text: l.text.slice(0, 80), url: new URL(l.href, current).toString() }; } catch { return null; } })
    .filter((l): l is { text: string; url: string } => l !== null)
    .slice(0, 150);
  const text = html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return { url: current.toString(), title, text: text.slice(0, maxChars), truncated: text.length > maxChars, links };
}

const WebSnapshot = z.object({
  name: z.string().describe("Nome exibido no perfil, ou vazio"),
  biography: z.string().describe("Bio do perfil, ou vazio"),
  followers_count: z.number().nullable().describe("Seguidores, só se aparecer nas fontes"),
  media_count: z.number().nullable().describe("Número de posts, só se aparecer nas fontes"),
  summary: z.string().describe("O que o perfil vende/publica, formatos, temas, frequência, preços e diferenciais encontrados"),
});

/** Sem Business Discovery: a IA pesquisa o perfil público na web e resume o que encontrou (com fontes). */
async function researchCompetitor(username: string, platform: "instagram" | "tiktok") {
  const where = platform === "instagram" ? `instagram.com/${username}` : `tiktok.com/@${username}`;
  const research = await researchWeb(
    "Você pesquisa perfis de marcas nas redes sociais para análise de concorrência. Responda em português do Brasil. " +
      "Só afirme o que encontrar nas fontes; quando um número não aparecer, diga que não foi encontrado.",
    `Pesquise o perfil @${username} (${where}) e o site/loja da marca, se houver. Levante: nome, bio, número de seguidores e de posts ` +
      `(se aparecerem), o que vendem, faixa de preço, temas e formatos de conteúdo, frequência de postagem, campanhas e diferenciais.`,
  );
  if (!research.text) throw new Error(`Não encontrei informações públicas sobre @${username}.`);
  const parsed = await generateJSON(WebSnapshot, "Extraia os dados do texto de pesquisa. Não invente números.", research.text, "low");
  return {
    username,
    source: "web",
    name: parsed.name || undefined,
    biography: parsed.biography || undefined,
    followers_count: parsed.followers_count ?? undefined,
    media_count: parsed.media_count ?? undefined,
    summary: parsed.summary,
    sources: research.sources,
  };
}

/** Diagnóstico: últimas notificações da Meta recebidas para as contas do usuário (e as recusadas por assinatura). */
async function webhookHealth(ctx: Ctx) {
  const { data: igs } = await ctx.db.from("social_accounts").select("external_id").eq("user_id", ctx.userId).eq("platform", "instagram");
  const ids = (igs ?? []).map((a) => a.external_id as string);
  const [mine, rejected, any] = await Promise.all([
    ids.length
      ? ctx.db.from("webhook_log").select("status,kinds,received_at").eq("platform", "instagram").in("account_external_id", ids).order("received_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    ctx.db.from("webhook_log").select("received_at").eq("platform", "instagram").eq("status", "bad_signature").order("received_at", { ascending: false }).limit(5),
    // Inclui os eventos de teste do painel da Meta (vêm com uma conta fictícia), sem expor de qual conta são
    ctx.db.from("webhook_log").select("status,kinds,received_at").eq("platform", "instagram").order("received_at", { ascending: false }).limit(5),
  ]);
  // Inscrição da conta no app: sem ela a Meta não envia comentários/DMs reais. Refaz se estiver faltando.
  const { data: accounts } = await ctx.db.from("social_accounts").select("id,username,meta").eq("user_id", ctx.userId).eq("platform", "instagram");
  const subscriptions = [];
  for (const a of accounts ?? []) {
    try {
      const token = await igTokenFor(ctx.db, a.id);
      const before = await igSubscribedFields(token);
      let after = before;
      if (!before.includes("comments") || !before.includes("messages")) {
        await igSubscribeWebhooks(token);
        after = await igSubscribedFields(token);
      }
      subscriptions.push({ username: a.username, before, after, last_poll: a.meta?.poll_last ?? null });
    } catch (e) {
      subscriptions.push({ username: a.username, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { received: mine.data ?? [], rejected_bad_signature: rejected.data ?? [], latest_any_account: any.data ?? [], subscriptions };
}

async function settings(ctx: Ctx) {
  const { data } = await ctx.db.from("brand_settings").select("*").eq("user_id", ctx.userId).maybeSingle();
  return data;
}

async function instagramAccount(ctx: Ctx, accountId?: string) {
  let q = ctx.db.from("social_accounts").select("*").eq("user_id", ctx.userId).eq("platform", "instagram");
  if (accountId) q = q.eq("id", accountId);
  const { data } = await q.order("connected_at").limit(1);
  if (!data?.[0]) throw new Error("Nenhuma conta do Instagram conectada. Conecte em Studio > Contas.");
  return data[0];
}

export function bestTimes(media: { timestamp: string; like_count?: number; comments_count?: number }[], timeZone: string) {
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long", hour: "2-digit", hourCycle: "h23" });
  const buckets = new Map<string, { total: number; n: number }>();
  for (const m of media) {
    const parts = fmt.formatToParts(new Date(m.timestamp));
    const key = `${parts.find((p) => p.type === "weekday")?.value} ${parts.find((p) => p.type === "hour")?.value}h`;
    const b = buckets.get(key) ?? { total: 0, n: 0 };
    b.total += (m.like_count ?? 0) + 3 * (m.comments_count ?? 0);
    b.n++;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .map(([slot, b]) => ({ slot, avg_engagement: Math.round(b.total / b.n), posts: b.n }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement)
    .slice(0, 5);
}

const ProductFields = {
  price: z.number().positive().optional().describe("Preço em reais, ex.: 29.9"),
  promotional_price: z.number().positive().nullable().optional().describe("Preço promocional (null remove a promoção)"),
  stock: z.number().int().min(0).nullable().optional().describe("Estoque (null = infinito)"),
  weight: z.number().positive().optional().describe("Peso em kg, ex.: 0.05"),
  width: z.number().positive().optional().describe("Largura em cm"),
  height: z.number().positive().optional().describe("Altura em cm"),
  depth: z.number().positive().optional().describe("Profundidade em cm"),
  category_ids: z.array(z.number().int()).optional().describe("Ids das categorias (veja list_store_categories)"),
  description: z.string().optional().describe("Descrição em texto simples; {nome} vira o nome do produto nos modelos"),
  tags: z.string().optional().describe("Tags separadas por vírgula"),
  brand: z.string().optional(),
  published: z.boolean().optional().describe("Visível na loja"),
  free_shipping: z.boolean().optional(),
  seo_title: z.string().optional(),
  seo_description: z.string().optional(),
};
const TemplateData = z.object({
  ...ProductFields,
  name_pattern: z.string().optional().describe("Padrão do nome, ex.: 'Pin {nome}'"),
  sku_prefix: z.string().optional().describe("Prefixo do SKU, ex.: 'PIN-'"),
  ai_description: z.boolean().optional().describe("A IA escreve a descrição olhando a foto, usando description como base"),
  ai_guide: z.string().optional().describe("Padrão de cadastro escrito pelo lojista (formato do nome, descrição, código, tags, SEO, URL e legenda). Quando existe, a IA preenche tudo seguindo esse padrão"),
  fiscal_ncm: z.string().optional(),
  fiscal_origin: z.string().optional(),
  fiscal_type: z.string().optional(),
  age_group: z.enum(["newborn", "infant", "toddler", "kids", "adult"]).optional().describe("Faixa etária (Instagram e Google Shopping); padrão adult"),
  gender: z.enum(["female", "male", "unisex"]).optional().describe("Gênero (Instagram e Google Shopping); padrão unisex"),
});

const tools = {
  get_overview: {
    description: "Resumo do Studio: contas conectadas, configurações da marca, próximos posts, posts aguardando aprovação, automações, comentários recentes e conversas esperando humano. Comece por aqui.",
    input: z.object({}),
    run: async (ctx: Ctx) => {
      const now = new Date().toISOString();
      const [accounts, upcoming, pending, automations, comments, waiting] = await Promise.all([
        ctx.db.from("social_accounts").select("id,platform,username,display_name,followers_count,meta").eq("user_id", ctx.userId),
        ctx.db.from("posts").select("id,title,kind,platforms,scheduled_at,status").eq("user_id", ctx.userId).eq("status", "scheduled").gte("scheduled_at", now).order("scheduled_at").limit(15),
        ctx.db.from("posts").select("id,title,kind,platforms,scheduled_at").eq("user_id", ctx.userId).eq("status", "pending_approval").limit(20),
        ctx.db.from("automations").select("id,name,active,keywords,triggered_count").eq("user_id", ctx.userId),
        ctx.db.from("comment_events").select("from_username,text,status,reply_text,created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(10),
        ctx.db.from("conversations").select("id,channel,contact_name,handoff_reason,last_message_at").eq("user_id", ctx.userId).eq("status", "needs_human").limit(20),
      ]);
      return {
        now,
        brand_settings: await settings(ctx),
        accounts: (accounts.data ?? []).map(({ meta: _meta, ...a }) => a),
        upcoming_posts: upcoming.data,
        pending_approval: pending.data,
        automations: automations.data,
        recent_comments: comments.data,
        conversations_needing_human: waiting.data,
        instagram_webhooks: await webhookHealth(ctx),
        marketplaces: (accounts.data ?? []).filter((a) => ["mercadolivre", "shopee"].includes(a.platform))
          .map((a) => ({ platform: a.platform, username: a.username, analysis: a.meta?.analysis ?? null })),
      };
    },
  },

  update_brand_settings: {
    description: "Atualiza o perfil da marca (nicho, público, tom de voz, hashtags, CTA, se posts do agente exigem aprovação, fuso horário).",
    input: z.object({
      brand_name: z.string().optional(),
      niche: z.string().optional(),
      audience: z.string().optional(),
      tone: z.string().optional(),
      default_hashtags: z.string().optional(),
      default_cta: z.string().optional(),
      product_autopost: z.boolean().optional().describe("Divulgar no Instagram/TikTok cada produto novo cadastrado"),
      video_enabled: z.boolean().optional().describe("Gerar também um vídeo animado (Reels/TikTok) para cada produto novo"),
      marketplace_autopublish: z.boolean().optional().describe("Publicar cada produto novo também no Mercado Livre (seguindo o padrão dos anúncios atuais)"),
      approval_required: z.boolean().optional(),
      timezone: z.string().optional(),
      agent_enabled: z.boolean().optional().describe("Liga/desliga o agente de IA que responde DMs e WhatsApp"),
      agent_instructions: z.string().optional().describe("Como o agente de mensagens deve atender"),
      agent_knowledge: z.string().optional().describe("Base de conhecimento: FAQ, links, preços, horários"),
      agent_handoff_message: z.string().optional(),
    }),
    run: async (ctx: Ctx, input: Record<string, unknown>) => {
      const { data, error } = await ctx.db.from("brand_settings").upsert({ user_id: ctx.userId, ...input, updated_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      return data;
    },
  },

  list_posts: {
    description: "Lista posts filtrando por status e período.",
    input: z.object({
      status: z.enum(["draft", "pending_approval", "scheduled", "publishing", "published", "failed"]).optional(),
      from: z.string().optional().describe("ISO 8601"),
      to: z.string().optional().describe("ISO 8601"),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    run: async (ctx: Ctx, input: { status?: string; from?: string; to?: string; limit?: number }) => {
      let q = ctx.db.from("posts").select("*").eq("user_id", ctx.userId);
      if (input.status) q = q.eq("status", input.status);
      if (input.from) q = q.gte("scheduled_at", input.from);
      if (input.to) q = q.lte("scheduled_at", input.to);
      const { data, error } = await q.order("scheduled_at", { ascending: true, nullsFirst: false }).limit(input.limit ?? 30);
      if (error) throw error;
      return data;
    },
  },

  create_post: {
    description:
      "Cria um post para Instagram e/ou TikTok. Use media (URLs públicas; use import_media antes se precisar) OU slides para um carrossel desenhado pelo app (o app renderiza as imagens quando o usuário aprovar). Se scheduled_at for informado e a marca não exigir aprovação, o post já fica agendado. kind: image, carousel, reel, story (só IG), video (TikTok/Reels), photos (carrossel de fotos do TikTok).",
    input: z.object({
      kind: Kind,
      platforms: z.array(Platform).min(1),
      caption: z.string().describe("Legenda completa, com hashtags e CTA"),
      title: z.string().optional().describe("Nome interno do post"),
      media: z.array(MediaInput).optional(),
      slides: z.array(Slide).max(10).optional(),
      design: Design,
      scheduled_at: z.string().optional().describe("ISO 8601 com fuso, ex: 2026-10-12T18:30:00-03:00"),
      notes: z.string().optional().describe("Raciocínio/estratégia para o usuário ler na aprovação"),
      tiktok_privacy: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]).optional(),
    }),
    run: async (ctx: Ctx, input: any) => {
      const media = normalizeMedia(input.media);
      const brand = await settings(ctx);
      const needsRender = Boolean(input.slides?.length) && media.length === 0;
      if (!needsRender) {
        const problem = validatePost({ kind: input.kind, platforms: input.platforms, media });
        if (problem) throw new Error(problem);
      }
      const approval = brand?.approval_required ?? true;
      const status = needsRender || approval ? "pending_approval" : input.scheduled_at ? "scheduled" : "draft";
      const { data, error } = await ctx.db.from("posts").insert({
        user_id: ctx.userId,
        kind: input.kind,
        platforms: input.platforms,
        caption: input.caption,
        title: input.title,
        media,
        slides: input.slides ?? null,
        design: input.design ?? null,
        scheduled_at: input.scheduled_at ?? null,
        notes: input.notes,
        status,
        created_by: "agent",
        options: input.tiktok_privacy ? { tiktok: { privacy_level: input.tiktok_privacy } } : {},
      }).select().single();
      if (error) throw error;
      return {
        post: data,
        message: status === "pending_approval"
          ? "Post criado e aguardando aprovação do usuário em Studio > Aprovações."
          : status === "scheduled" ? "Post agendado." : "Rascunho criado.",
      };
    },
  },

  update_post: {
    description: "Edita um post que ainda não foi publicado (legenda, horário, mídia, slides, status draft/scheduled).",
    input: z.object({
      id: z.string().uuid(),
      caption: z.string().optional(),
      title: z.string().optional(),
      scheduled_at: z.string().nullable().optional(),
      media: z.array(MediaInput).optional(),
      slides: z.array(Slide).max(10).optional(),
      design: Design,
      platforms: z.array(Platform).optional(),
      notes: z.string().optional(),
      status: z.enum(["draft", "scheduled"]).optional().describe("scheduled só é aceito se a marca não exigir aprovação"),
    }),
    run: async (ctx: Ctx, input: any) => {
      const { id, media, status, ...rest } = input;
      const { data: post } = await ctx.db.from("posts").select("*").eq("id", id).eq("user_id", ctx.userId).single();
      if (!post) throw new Error("Post não encontrado");
      if (["published", "publishing"].includes(post.status)) throw new Error("Post já publicado/publicando não pode ser editado");
      const patch: Record<string, unknown> = { ...rest };
      if (media) patch.media = normalizeMedia(media);
      if (status) {
        const brand = await settings(ctx);
        if (status === "scheduled" && (brand?.approval_required ?? true) && post.created_by === "agent" && post.status === "pending_approval") {
          throw new Error("A marca exige aprovação: o usuário precisa aprovar este post no app.");
        }
        patch.status = status;
      }
      const { data, error } = await ctx.db.from("posts").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
  },

  delete_post: {
    description: "Apaga um post não publicado.",
    input: z.object({ id: z.string().uuid() }),
    run: async (ctx: Ctx, input: { id: string }) => {
      const { error } = await ctx.db.from("posts").delete().eq("id", input.id).eq("user_id", ctx.userId).neq("status", "published");
      if (error) throw error;
      return { deleted: input.id };
    },
  },

  publish_post_now: {
    description: "Publica imediatamente um post já aprovado (status draft ou scheduled) que tenha mídia.",
    input: z.object({ id: z.string().uuid() }),
    run: async (ctx: Ctx, input: { id: string }) => {
      const { data: post } = await ctx.db.from("posts").select("*").eq("id", input.id).eq("user_id", ctx.userId).single();
      if (!post) throw new Error("Post não encontrado");
      if (!["draft", "scheduled", "failed"].includes(post.status)) throw new Error(`Post com status ${post.status} não pode ser publicado agora`);
      const { data: claimed } = await ctx.db.from("posts").update({ status: "publishing" }).eq("id", post.id).select().single();
      return advancePost(ctx.db, claimed);
    },
  },

  list_automations: {
    description: "Lista as automações de resposta a comentários (estilo ManyChat).",
    input: z.object({}),
    run: async (ctx: Ctx) => (await ctx.db.from("automations").select("*").eq("user_id", ctx.userId).order("created_at")).data,
  },

  upsert_automation: {
    description:
      "Cria ou atualiza (com id) uma automação: quando alguém comentar uma palavra-chave, responde publicamente e manda DM. Use {username} nos textos. match_mode: contains (padrão), exact, any (qualquer comentário). media_ids vazio = todos os posts.",
    input: z.object({
      id: z.string().uuid().optional(),
      name: z.string(),
      active: z.boolean().optional(),
      keywords: z.array(z.string()).optional(),
      match_mode: z.enum(["contains", "exact", "any"]).optional(),
      media_ids: z.array(z.string()).optional(),
      reply_variants: z.array(z.string()).optional().describe("Respostas públicas; uma é sorteada a cada comentário"),
      dm_message: z.string().optional().describe("Mensagem privada enviada a quem comentou (pode ter link)"),
      use_ai: z.boolean().optional().describe("Se true, a resposta pública é escrita pela IA"),
      ai_instructions: z.string().optional(),
      once_per_user: z.boolean().optional(),
    }),
    run: async (ctx: Ctx, input: any) => {
      const { id, ...fields } = input;
      if (!id) {
        const account = await instagramAccount(ctx).catch(() => null);
        const { data, error } = await ctx.db.from("automations").insert({ user_id: ctx.userId, account_id: account?.id ?? null, ...fields }).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await ctx.db.from("automations").update(fields).eq("id", id).eq("user_id", ctx.userId).select().single();
      if (error) throw error;
      return data;
    },
  },

  delete_automation: {
    description: "Apaga uma automação.",
    input: z.object({ id: z.string().uuid() }),
    run: async (ctx: Ctx, input: { id: string }) => {
      await ctx.db.from("automations").delete().eq("id", input.id).eq("user_id", ctx.userId);
      return { deleted: input.id };
    },
  },

  list_comments: {
    description: "Últimos comentários recebidos e o que a automação fez com cada um.",
    input: z.object({ status: z.enum(["pending", "replied", "ignored", "failed"]).optional(), limit: z.number().int().max(200).optional() }),
    run: async (ctx: Ctx, input: { status?: string; limit?: number }) => {
      let q = ctx.db.from("comment_events").select("*").eq("user_id", ctx.userId);
      if (input.status) q = q.eq("status", input.status);
      return (await q.order("created_at", { ascending: false }).limit(input.limit ?? 50)).data;
    },
  },

  create_content_ideas: {
    description: "Cria posts sozinho a partir das datas comemorativas e campanhas dos próximos dias (Outubro Rosa, Dia do Médico...), dos produtos da loja e do que o público curte: carrosséis com as fotos dos produtos vão para Aprovações e vídeos entram na fila (chegam em Aprovações quando ficam prontos). Use focus para pedir um tema.",
    input: z.object({ count: z.number().int().min(1).max(8).optional(), focus: z.string().optional() }),
    run: (ctx: Ctx, input: { count?: number; focus?: string }) => generateIdeas(ctx.db, ctx.userId, input),
  },

  get_instagram_profile: {
    description: "Dados ao vivo do perfil do Instagram (bio, seguidores) + últimos posts com curtidas/comentários e os melhores horários calculados. Use para auditar a vitrine e planejar conteúdo.",
    input: z.object({ account_id: z.string().uuid().optional(), media_limit: z.number().int().max(50).optional() }),
    run: async (ctx: Ctx, input: { account_id?: string; media_limit?: number }) => {
      const account = await instagramAccount(ctx, input.account_id);
      const token = await igTokenFor(ctx.db, account.id);
      const [profile, media] = await Promise.all([igProfile(token), igRecentMedia(token, account.external_id, input.media_limit ?? 24)]);
      const brand = await settings(ctx);
      return { profile, media, best_times: bestTimes(media, brand?.timezone ?? "America/Sao_Paulo") };
    },
  },

  save_profile_audit: {
    description: "Salva no app sua auditoria da vitrine (bio sugerida, destaques, grade, pilares de conteúdo, ações rápidas) para o usuário ver em Studio > Vitrine.",
    input: z.object({
      account_id: z.string().uuid().optional(),
      analysis: z.object({
        score: z.number().min(0).max(100),
        summary: z.string(),
        bio_suggestions: z.array(z.string()),
        highlight_ideas: z.array(z.string()),
        grid_feedback: z.string(),
        content_pillars: z.array(z.string()),
        best_times: z.array(z.string()),
        quick_wins: z.array(z.string()),
      }),
    }),
    run: async (ctx: Ctx, input: any) => {
      const account = await instagramAccount(ctx, input.account_id).catch(() => null);
      const { data, error } = await ctx.db.from("profile_audits").insert({
        user_id: ctx.userId,
        account_id: account?.id ?? null,
        source: "agent",
        analysis: input.analysis,
      }).select().single();
      if (error) throw error;
      return data;
    },
  },

  list_competitors: {
    description: "Lista concorrentes monitorados com o último snapshot e análise.",
    input: z.object({}),
    run: async (ctx: Ctx) => (await ctx.db.from("competitors").select("*").eq("user_id", ctx.userId).order("created_at")).data,
  },

  upsert_competitor: {
    description: "Adiciona/atualiza um concorrente. Pode salvar snapshot (dados coletados) e analysis (sua análise) diretamente.",
    input: z.object({
      username: z.string().describe("Sem @"),
      platform: Platform.optional(),
      notes: z.string().optional(),
      snapshot: z.record(z.string(), z.any()).optional(),
      analysis: z.object({
        summary: z.string(),
        strengths: z.array(z.string()),
        content_patterns: z.array(z.string()),
        opportunities: z.array(z.string()),
        ideas_to_adapt: z.array(z.string()),
      }).optional(),
    }),
    run: async (ctx: Ctx, input: any) => {
      const row: Record<string, unknown> = {
        user_id: ctx.userId,
        platform: input.platform ?? "instagram",
        username: input.username.replace(/^@/, "").toLowerCase(),
      };
      if (input.notes !== undefined) row.notes = input.notes;
      if (input.snapshot) Object.assign(row, { snapshot: input.snapshot, synced_at: new Date().toISOString() });
      if (input.analysis) row.analysis = input.analysis;
      const { data, error } = await ctx.db.from("competitors").upsert(row, { onConflict: "user_id,platform,username" }).select().single();
      if (error) throw error;
      return data;
    },
  },

  sync_competitor: {
    description: "Atualiza os dados públicos de um concorrente. Instagram: Business Discovery (números exatos) quando configurado; senão (e no TikTok), a IA pesquisa o perfil na web e salva um resumo com as fontes.",
    input: z.object({ username: z.string(), platform: z.enum(["instagram", "tiktok"]).optional() }),
    run: async (ctx: Ctx, input: { username: string; platform?: "instagram" | "tiktok" }) => {
      const username = input.username.replace(/^@/, "").toLowerCase().trim();
      const platform = input.platform ?? "instagram";
      let snapshot: Record<string, unknown>;
      if (platform === "instagram" && businessDiscoveryEnabled()) {
        snapshot = await igBusinessDiscovery(username);
      } else {
        if (!aiEnabled()) throw new Error("Configure a chave da IA para pesquisar concorrentes.");
        snapshot = await researchCompetitor(username, platform);
      }
      const { data, error } = await ctx.db.from("competitors").upsert({
        user_id: ctx.userId, platform, username, snapshot, synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,platform,username" }).select().single();
      if (error) throw error;
      return data;
    },
  },

  list_conversations: {
    description: "Lista conversas da caixa de entrada (DMs do Instagram e WhatsApp). status needs_human = esperando atendimento humano.",
    input: z.object({ status: z.enum(["open", "needs_human", "closed"]).optional(), channel: z.enum(["instagram", "whatsapp"]).optional(), limit: z.number().int().max(100).optional() }),
    run: async (ctx: Ctx, input: { status?: string; channel?: string; limit?: number }) => {
      let q = ctx.db.from("conversations").select("id,channel,contact_name,contact_username,status,handoff_reason,ai_enabled,unread,last_message_at,last_inbound_at").eq("user_id", ctx.userId);
      if (input.status) q = q.eq("status", input.status);
      if (input.channel) q = q.eq("channel", input.channel);
      return (await q.order("last_message_at", { ascending: false }).limit(input.limit ?? 30)).data;
    },
  },

  get_conversation: {
    description: "Histórico de mensagens de uma conversa.",
    input: z.object({ id: z.string().uuid(), limit: z.number().int().max(200).optional() }),
    run: async (ctx: Ctx, input: { id: string; limit?: number }) => {
      const { data: conversation } = await ctx.db.from("conversations").select("*").eq("id", input.id).eq("user_id", ctx.userId).single();
      if (!conversation) throw new Error("Conversa não encontrada");
      return { conversation, messages: await transcript(ctx.db, input.id, input.limit ?? 50) };
    },
  },

  send_message: {
    description: "Envia uma mensagem numa conversa (DM do Instagram ou WhatsApp) em nome da marca. Nas APIs oficiais só funciona até 24h após a última mensagem do contato.",
    input: z.object({ conversation_id: z.string().uuid(), text: z.string().min(1) }),
    run: async (ctx: Ctx, input: { conversation_id: string; text: string }) => {
      const { data: conv } = await ctx.db.from("conversations").select("id").eq("id", input.conversation_id).eq("user_id", ctx.userId).single();
      if (!conv) throw new Error("Conversa não encontrada");
      return sendMessage(ctx.db, conv.id, input.text, "agent");
    },
  },

  update_conversation: {
    description: "Muda o status (open, needs_human, closed) ou liga/desliga a IA numa conversa.",
    input: z.object({ id: z.string().uuid(), status: z.enum(["open", "needs_human", "closed"]).optional(), ai_enabled: z.boolean().optional() }),
    run: async (ctx: Ctx, input: { id: string; status?: string; ai_enabled?: boolean }) => {
      const { id, ...patch } = input;
      const { data, error } = await ctx.db.from("conversations").update({ ...patch, ...(patch.status === "open" ? { handoff_reason: null } : {}) }).eq("id", id).eq("user_id", ctx.userId).select().single();
      if (error) throw error;
      return data;
    },
  },

  import_media: {
    description: "Copia uma imagem/vídeo (de uma URL ou base64) para o armazenamento público do Studio e retorna a URL para usar em create_post. Instagram aceita imagens JPEG.",
    input: z.object({
      url: z.string().url().optional(),
      data_base64: z.string().optional(),
      content_type: z.string().optional().describe("ex: image/jpeg, video/mp4"),
      filename: z.string().optional(),
    }),
    run: async (ctx: Ctx, input: { url?: string; data_base64?: string; content_type?: string; filename?: string }) => {
      let bytes: Uint8Array;
      let type = input.content_type;
      if (input.data_base64) {
        bytes = Uint8Array.from(atob(input.data_base64.replace(/^data:[^,]+,/, "")), (c) => c.charCodeAt(0));
      } else if (input.url) {
        const res = await fetch(assertPublicHttpsUrl(input.url), { redirect: "error" });
        if (!res.ok) throw new Error(`Não consegui baixar a mídia (${res.status})`);
        bytes = new Uint8Array(await res.arrayBuffer());
        type ??= res.headers.get("content-type") ?? undefined;
      } else throw new Error("Informe url ou data_base64");
      type ??= "image/jpeg";
      const ext = type.includes("png") ? "png" : type.includes("mp4") ? "mp4" : type.includes("quicktime") ? "mov" : "jpg";
      const path = `${ctx.userId}/${crypto.randomUUID()}-${(input.filename ?? `agente.${ext}`).replace(/[^\w.-]/g, "_")}`;
      const { error } = await ctx.db.storage.from("media").upload(path, bytes, { contentType: type });
      if (error) throw error;
      const { data } = ctx.db.storage.from("media").getPublicUrl(path);
      return { url: data.publicUrl, type: type.startsWith("video") ? "video" : "image" };
    },
  },
  read_web_page: {
    description: "Abre uma página pública (https) — ex.: o site da loja, políticas de troca/envio, perguntas frequentes — e devolve o texto e os links. Use para montar a base de conhecimento do agente ou pesquisar concorrentes.",
    input: z.object({ url: z.string().url(), max_chars: z.number().int().min(1000).max(60000).optional() }),
    run: async (_ctx: Ctx, input: { url: string; max_chars?: number }) => readWebPage(input.url, input.max_chars),
  },

  get_store_info: {
    description: "Dados da loja Nuvemshop conectada (nome, site, contatos) e as páginas de conteúdo (trocas, envio, perguntas frequentes).",
    input: z.object({}),
    run: async (ctx: Ctx) => {
      const s = await store(ctx);
      const [info, pages] = await Promise.all([nsStore(s.token, s.storeId), nsPages(s.token, s.storeId)]);
      return { store: info, pages };
    },
  },

  list_store_products: {
    description: "Produtos publicados na loja Nuvemshop, com preço (já com promoção), estoque e link. q filtra por nome.",
    input: z.object({ q: z.string().optional(), limit: z.number().int().min(1).max(200).optional() }),
    run: async (ctx: Ctx, input: { q?: string; limit?: number }) => {
      const s = await store(ctx);
      return nsProducts(s.token, s.storeId, input);
    },
  },

  list_orders: {
    description: "Pedidos da loja Nuvemshop (mais recentes primeiro): pagamento, envio, rastreio, itens e total. status: open (em andamento), closed (concluídos), cancelled, any. q busca por número do pedido, nome ou e-mail do cliente.",
    input: z.object({ status: z.enum(["open", "closed", "cancelled", "any"]).optional(), q: z.string().optional(), limit: z.number().int().min(1).max(200).optional() }),
    run: async (ctx: Ctx, input: { status?: string; q?: string; limit?: number }) => {
      const s = await store(ctx);
      return nsOrders(s.token, s.storeId, input);
    },
  },

  get_order: {
    description: "Um pedido da loja pelo número que o cliente vê (ex.: 1234) ou pelo id interno: situação do pagamento e do envio, código e link de rastreio.",
    input: z.object({ number: z.union([z.string(), z.number()]) }),
    run: async (ctx: Ctx, input: { number: string | number }) => {
      const s = await store(ctx);
      const order = await nsFindOrder(s.token, s.storeId, input.number);
      if (!order) throw new Error(`Pedido ${input.number} não encontrado`);
      return order;
    },
  },
  list_coupons: {
    description: "Todos os cupons da loja Nuvemshop (inclusive inativos/vencidos), com tipo, valor, usos, datas, valor mínimo e se é só para primeira compra.",
    input: z.object({}),
    run: async (ctx: Ctx) => {
      const s = await store(ctx);
      // deno-lint-ignore no-explicit-any
      const list = await ns<any[]>(s.token, s.storeId, "coupons?per_page=200");
      return (Array.isArray(list) ? list : []).map((c) => ({
        code: c.code, type: c.type, value: c.value, valid: c.valid, used: c.used, max_uses: c.max_uses, start_date: c.start_date,
        end_date: c.end_date, min_price: c.min_price, first_consumer_purchase: c.first_consumer_purchase, deleted_at: c.deleted_at,
      }));
    },
  },

  list_product_templates: {
    description: "Modelos de cadastro de produto (preço, peso, medidas, categoria, descrição-base, padrão do nome...). O modelo padrão é usado quando nenhum é informado.",
    input: z.object({}),
    run: async (ctx: Ctx) => (await ctx.db.from("product_templates").select("id,name,is_default,data").eq("user_id", ctx.userId).order("created_at")).data,
  },

  save_product_template: {
    description: "Cria ou atualiza (com id) um modelo de cadastro de produto. data substitui o conteúdo do modelo inteiro.",
    input: z.object({ id: z.string().uuid().optional(), name: z.string().min(1), is_default: z.boolean().optional(), data: TemplateData }),
    run: async (ctx: Ctx, input: { id?: string; name: string; is_default?: boolean; data: Record<string, unknown> }) => {
      if (input.is_default) await ctx.db.from("product_templates").update({ is_default: false }).eq("user_id", ctx.userId);
      const row = { user_id: ctx.userId, name: input.name, data: input.data, ...(input.is_default !== undefined ? { is_default: input.is_default } : {}) };
      const { data, error } = input.id
        ? await ctx.db.from("product_templates").update(row).eq("id", input.id).eq("user_id", ctx.userId).select().single()
        : await ctx.db.from("product_templates").insert(row).select().single();
      if (error) throw error;
      return data;
    },
  },

  list_store_categories: {
    description: "Categorias da loja Nuvemshop (id e nome) para usar nos modelos e produtos.",
    input: z.object({}),
    run: async (ctx: Ctx) => {
      const s = await store(ctx);
      return nsCategories(s.token, s.storeId);
    },
  },

  list_product_drafts: {
    description: "Fotos enviadas no Studio (página Produtos) esperando virar produto. status pending = ainda não cadastrado.",
    input: z.object({ status: z.enum(["pending", "failed", "created"]).optional(), limit: z.number().int().max(100).optional() }),
    run: async (ctx: Ctx, input: { status?: string; limit?: number }) => {
      let q = ctx.db.from("product_drafts").select("id,images,name,template_id,status,error,product_url,created_at").eq("user_id", ctx.userId);
      q = input.status ? q.eq("status", input.status) : q.in("status", ["pending", "failed"]);
      return (await q.order("created_at").limit(input.limit ?? 50)).data;
    },
  },

  create_product_from_draft: {
    description: "Cadastra na loja o produto de um rascunho (fotos enviadas no Studio) usando o modelo dele. Se name não for informado, a IA olha a foto e dá o nome. Campos extras sobrescrevem o modelo.",
    input: z.object({ draft_id: z.string().uuid(), name: z.string().optional(), ...ProductFields }),
    run: async (ctx: Ctx, input: { draft_id: string; name?: string } & Record<string, unknown>) => {
      const { draft_id, name, ...extra } = input;
      if (name) await ctx.db.from("product_drafts").update({ name }).eq("id", draft_id).eq("user_id", ctx.userId);
      return createFromDraft(ctx.db, ctx.userId, draft_id, extra);
    },
  },

  create_store_product: {
    description: "Cadastra um produto na loja Nuvemshop a partir de fotos (URLs públicas; use import_media antes se precisar) aplicando um modelo de cadastro (o padrão, se template_id não vier). name é o nome-base. Se o modelo tiver padrão escrito (ai_guide) e você não mandar description, a IA preenche nome completo, descrição, código, URL, tags, SEO e a legenda seguindo o padrão.",
    input: z.object({
      name: z.string().min(1),
      image_urls: z.array(z.string().url()).min(1).max(20),
      template_id: z.string().uuid().optional(),
      announce: z.boolean().optional().describe("Criar o post de divulgação no Instagram/TikTok (padrão: segue a configuração da marca)"),
      ...ProductFields,
    }),
    run: async (ctx: Ctx, input: { name: string; image_urls: string[]; template_id?: string; announce?: boolean } & Record<string, unknown>) => {
      const { name, image_urls, template_id, announce, ...extra } = input;
      for (const u of image_urls) assertPublicHttpsUrl(u);
      const s = await store(ctx);
      const template = await templateFor(ctx.db, ctx.userId, template_id);
      const tpl = template?.data ?? {};
      const { fields, caption } = await buildProduct(ctx.db, ctx.userId, tpl, image_urls, name, extra);
      const product = await nsCreateProduct(s.token, s.storeId, fields, image_urls, { ncm: tpl.fiscal_ncm });
      const post = announce === false ? null : await announceProduct(ctx.db, ctx.userId, {
        name: fields.name ?? name, images: image_urls, url: product.url, price: product.price, description: fields.description, caption,
      }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
      return { product, post };
    },
  },

  create_product_video: {
    description: "Gera um vídeo animado vertical (Reels/TikTok, ~15 s, com música) de um produto a partir das fotos: a IA escreve os textos e o vídeo entra na fila de renderização (fica pronto em até 1 hora). Quando fica pronto vira um post (em Aprovações se a marca exigir aprovação).",
    input: z.object({
      name: z.string().min(1),
      image_urls: z.array(z.string().url()).min(1).max(7).describe("A primeira é a principal (de preferência a foto original, sem moldura); no estilo cinema cada foto vira closes"),
      description: z.string().optional(),
      product_url: z.string().url().optional(),
      instructions: z.string().max(1500).optional().describe("Pedido do dono para o vídeo: tema, gancho, frases exatas entre aspas, cores, clima"),
      style: z.enum(["cinema", "classic"]).optional().describe("cinema (padrão): closes de câmera sobre a foto original, luz e textos premium; classic: animação antiga"),
    }),
    run: async (ctx: Ctx, input: { name: string; image_urls: string[]; description?: string; product_url?: string; instructions?: string; style?: "cinema" | "classic" }) => {
      for (const u of input.image_urls) assertPublicHttpsUrl(u);
      return queueProductVideo(ctx.db, ctx.userId, { name: input.name, images: input.image_urls, description: input.description, url: input.product_url },
        videoOptions(input));
    },
  },

  list_product_videos: {
    description: "Lista os vídeos animados de produto (na fila, renderizando, prontos ou com erro) e o post criado para cada um.",
    input: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    run: async (ctx: Ctx, input: { limit?: number }) => {
      const { data } = await ctx.db.from("product_videos").select("id,name,status,error,video_url,post_id,brief,created_at")
        .eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(input.limit ?? 10);
      return data;
    },
  },

  analyze_marketplace: {
    description: "Lê os anúncios atuais do Mercado Livre ou da Shopee, compara os preços com a loja Nuvemshop e descobre o padrão (regra de preço, categoria, tipo de anúncio, frete, dados fiscais e anúncio de referência). O resultado também aparece em get_overview.marketplaces.",
    input: z.object({ platform: z.enum(["mercadolivre", "shopee"]) }),
    run: async (ctx: Ctx, input: { platform: "mercadolivre" | "shopee" }) => analyzeMarketplace(ctx.db, ctx.userId, input.platform),
  },

  list_mercadolivre_listings: {
    description: "Anúncios do Mercado Livre (todos menos os encerrados) com o produto da loja correspondente, e a lista `missing` dos produtos da loja Nuvemshop que ainda não têm anúncio no Mercado Livre.",
    input: z.object({}),
    run: async (ctx: Ctx) => mercadoLivreListings(ctx.db, ctx.userId),
  },

  sync_mercadolivre: {
    description: "Sincroniza a loja Nuvemshop inteira com o Mercado Livre em segundo plano (3 produtos por minuto): atualiza o anúncio que já existe (fotos da loja tratadas no padrão do ML — 1200x1200, fundo branco, pin centralizado —, título sem cor/estampa errada, descrição no padrão da marca, estoque 200, reativa os inativos) ou cria um novo. Kits e produtos de teste ficam de fora. action \"start\" começa (refaz do zero); \"status\" mostra o andamento (shared = pins diferentes no mesmo anúncio); \"fix_shared\" separa esses pins (o primeiro fica com o anúncio, os outros ganham anúncio próprio).",
    input: z.object({ action: z.enum(["start", "status", "fix_shared"]) }),
    run: async (ctx: Ctx, input: { action: "start" | "status" | "fix_shared" }) =>
      input.action === "start" ? startMlSync(ctx.db, ctx.userId)
      : input.action === "fix_shared" ? fixSharedListings(ctx.db, ctx.userId)
      : mlSyncStatus(ctx.db, ctx.userId),
  },

  publish_to_mercadolivre: {
    description: "Publica um produto no Mercado Livre copiando o padrão do anúncio de referência do lojista (categoria, tipo de anúncio, frete, garantia, atributos) e aplicando a regra de preço descoberta (price é o preço da loja).",
    input: z.object({
      name: z.string().min(1),
      image_urls: z.array(z.string().url()).min(1).max(10),
      price: z.number().positive().describe("Preço na loja Nuvemshop; a regra de preço do marketplace é aplicada em cima"),
      description: z.string().optional(),
      sku: z.string().optional(),
      stock: z.number().int().min(0).optional(),
    }),
    run: async (ctx: Ctx, input: { name: string; image_urls: string[]; price: number; description?: string; sku?: string; stock?: number }) => {
      for (const u of input.image_urls) assertPublicHttpsUrl(u);
      return publishToMercadoLivre(ctx.db, ctx.userId, { ...input, images: input.image_urls });
    },
  },

  update_store_product: {
    description: "Altera um produto da loja pelo nome (ou id): nome, preço, promoção, estoque, descrição, categorias, visibilidade, SEO e adiciona fotos. Preço/estoque/peso valem para todas as variações. Se o nome bater com mais de um produto, retorna as opções.",
    input: z.object({ product: z.union([z.string(), z.number()]).describe("Nome atual do produto ou id"), new_name: z.string().optional(), add_image_urls: z.array(z.string().url()).max(20).optional(), ...ProductFields }),
    run: async (ctx: Ctx, input: { product: string | number; new_name?: string; add_image_urls?: string[] } & Record<string, unknown>) => {
      const { product, new_name, add_image_urls, ...changes } = input;
      for (const u of add_image_urls ?? []) assertPublicHttpsUrl(u);
      const s = await store(ctx);
      return nsUpdateProduct(s.token, s.storeId, product, { ...changes, ...(new_name ? { name: new_name } : {}) }, add_image_urls);
    },
  },
} satisfies Record<string, { description: string; input: z.ZodTypeAny; run: (ctx: Ctx, input: any) => Promise<unknown> }>;

export type ToolName = keyof typeof tools;

export function toolList() {
  return Object.entries(tools).map(([name, t]) => {
    const { $schema: _ignored, ...schema } = z.toJSONSchema(t.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    return { name, description: t.description, inputSchema: schema };
  });
}

export async function runTool(ctx: Ctx, name: string, args: unknown) {
  const tool = (tools as Record<string, (typeof tools)[ToolName]>)[name];
  if (!tool) throw new Error(`Ferramenta desconhecida: ${name}`);
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) throw new Error(`Parâmetros inválidos: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return tool.run(ctx, parsed.data as never);
}
