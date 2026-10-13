// Cadastro de produtos a partir de fotos: modelo de cadastro + nome (sugerido pela IA olhando a foto, se faltar).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { aiEnabled, brandContext, generateJSON } from "./claude.ts";
import { applyTemplate, nsCreateProduct, type ProductChanges, type ProductTemplate, storeFor } from "./nuvemshop.ts";
import { queueProductVideo } from "./product-video.ts";
import { publishToMercadoLivre } from "./marketplaces.ts";

/** Próximo horário nobre (13h ou 19h no fuso da marca) com pelo menos 2h de folga. */
export function nextSlot(timeZone = "America/Sao_Paulo", from = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" });
  const t = new Date(from.getTime() + 2 * 3600_000);
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 48; i++, t.setTime(t.getTime() + 3600_000)) {
    if (["13", "19"].includes(fmt.format(t))) return t.toISOString();
  }
  return t.toISOString();
}

const Caption = z.object({
  caption: z.string().describe("Legenda completa: gancho forte na 1ª linha, 2-4 linhas curtas vendendo o produto, preço se houver, CTA"),
  hashtags: z.array(z.string()).describe("5 a 10 hashtags sem #"),
});

/** Próximo horário nobre livre (sem outro post da marca no mesmo horário). */
export async function freeSlot(db: SupabaseClient, userId: string, timeZone = "America/Sao_Paulo") {
  let slot = nextSlot(timeZone);
  for (let i = 0; i < 150; i++) {
    const { count } = await db.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId)
      .eq("scheduled_at", slot).in("status", ["pending_approval", "scheduled"]);
    if (!count) return slot;
    slot = nextSlot(timeZone, new Date(new Date(slot).getTime() - 3600_000)); // o horário nobre seguinte
  }
  return slot;
}

export type ProductInfo = {
  name: string;
  images: string[];
  url?: string | null;
  price?: string;
  description?: string;
  caption?: string;
  /** Fotos originais (sem a moldura 4:5 das redes) para o vídeo animado */
  video_images?: string[];
};

/** Legenda chamativa para o produto (Instagram e TikTok). */
// deno-lint-ignore no-explicit-any
export async function productCaption(settings: any, product: ProductInfo, format: "post" | "video" = "post") {
  const cta = settings?.default_cta || "Garanta o seu pelo link da bio!";
  if (product.caption?.trim()) return product.caption.trim(); // legenda já escrita no padrão do lojista
  let caption = `NOVIDADE NA LOJA! 🔥\n\n${product.name}${product.price ? ` por ${product.price}` : ""}.\n\n${cta}`;
  if (!aiEnabled()) return caption;
  try {
    const r = await generateJSON(Caption,
      `Você é social media de uma loja brasileira e escreve legendas que vendem, em português do Brasil, com energia e no máximo 3 emojis. ` +
        `Nunca invente características que não estejam nos dados ou na foto.\n\n${brandContext(settings)}`,
      `Produto novo acabou de chegar na loja: "${product.name}"${product.price ? `, preço ${product.price}` : ""}.\n` +
        `${product.description ? `Descrição da loja: ${product.description.replace(/<[^>]+>/g, " ").slice(0, 800)}\n` : ""}` +
        `${format === "video" ? "A legenda acompanha um vídeo curto (Reels/TikTok) que apresenta o produto.\n" : ""}` +
        `O link do produto não é clicável na legenda: termine com o CTA "${cta}" (ou variação dele). Serve para Instagram e TikTok.`,
      "low", product.images.slice(0, 3));
    const tags = [...new Set([...(settings?.default_hashtags ?? "").split(/[\s,#]+/), ...r.hashtags])].filter(Boolean).slice(0, 12);
    caption = `${r.caption.trim()}\n\n${tags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}`;
  } catch (e) {
    console.error("legenda do produto", e);
  }
  return caption;
}

/**
 * Divulga um produto novo: cria um post (foto ou carrossel) para as redes conectadas com legenda chamativa.
 * Respeita a aprovação da marca: com "Exigir minha aprovação" ligado, o post fica em Aprovações.
 * Com o vídeo animado ligado, também põe o vídeo do produto na fila (vira um Reels/TikTok quando fica pronto).
 */
export async function announceProduct(db: SupabaseClient, userId: string, product: ProductInfo) {
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
  if (settings && settings.product_autopost === false) return null;
  const { data: accounts } = await db.from("social_accounts").select("platform").eq("user_id", userId).in("platform", ["instagram", "tiktok"]);
  const platforms = [...new Set((accounts ?? []).map((a) => a.platform as string))];
  if (!platforms.length || !product.images.length) return null;

  if (settings?.video_enabled) {
    await queueProductVideo(db, userId, product).catch((e) => console.error("vídeo do produto", e));
  }

  const caption = await productCaption(settings, product);
  const media = product.images.slice(0, 10).map((url) => ({ url, type: "image" }));
  const approval = settings?.approval_required ?? true;
  const { data: post, error } = await db.from("posts").insert({
    user_id: userId,
    title: `Produto novo: ${product.name}`,
    kind: media.length > 1 ? "carousel" : "image",
    platforms,
    caption,
    media,
    scheduled_at: await freeSlot(db, userId, settings?.timezone ?? "America/Sao_Paulo"),
    status: approval ? "pending_approval" : "scheduled",
    created_by: "agent",
    notes: `Divulgação automática do produto cadastrado${product.url ? `: ${product.url}` : ""}.`,
    options: product.url ? { product: { name: product.name, url: product.url } } : {},
  }).select("id,status,scheduled_at,platforms").single();
  if (error) throw error;
  return post;
}

export async function templateFor(db: SupabaseClient, userId: string, templateId?: string | null) {
  let q = db.from("product_templates").select("*").eq("user_id", userId);
  q = templateId ? q.eq("id", templateId) : q.order("is_default", { ascending: false }).order("created_at");
  const { data } = await q.limit(1).maybeSingle();
  if (templateId && !data) throw new Error("Modelo de cadastro não encontrado");
  return (data ?? null) as { id: string; name: string; data: ProductTemplate } | null;
}

const Suggestion = z.object({
  name: z.string().describe("Nome curto do produto, sem o prefixo do modelo (ex.: 'Zé Gotinha Veterinário com Gato')"),
  description: z.string().describe("Descrição de venda em texto simples, parágrafos curtos"),
});

/** Cadastro completo gerado pela IA seguindo o padrão escrito pelo lojista. */
const Listing = z.object({
  name: z.string().describe("Nome completo do produto exatamente no formato do padrão"),
  description: z.string().describe("Descrição no formato do padrão, em texto simples"),
  sku: z.string().describe("Código/SKU no formato do padrão"),
  handle: z.string().describe("URL/identificador no formato do padrão"),
  tags: z.array(z.string()).describe("Tags no formato do padrão"),
  seo_title: z.string(),
  seo_description: z.string(),
  caption: z.string().describe("Legenda do Instagram completa no formato do padrão, com hashtags; vazia se o padrão não tiver legenda"),
});
export type ListingData = z.infer<typeof Listing>;

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A IA olha as fotos e preenche o cadastro inteiro seguindo o padrão do lojista. */
export async function generateListing(db: SupabaseClient, userId: string, images: string[], template: ProductTemplate, hint?: string) {
  if (!aiEnabled()) throw new Error("Configure a chave da IA para preencher o cadastro.");
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
  const stock = template.stock;
  const r = await generateJSON(Listing,
    `Você cadastra produtos numa loja virtual brasileira seguindo EXATAMENTE o padrão de cadastro do lojista: mesma estrutura, ` +
      `mesma ordem, mesmo estilo, trocando só o que está entre colchetes. Português do Brasil, profissional e persuasivo.\n` +
      `Regras: descreva só o que dá para ver nas fotos (cores, símbolos, personagens, acessórios, quantidade de peças); não invente ` +
      `medidas nem materiais além dos que o padrão manda afirmar; escolha entre as opções do padrão (ex.: Pin ou Kit, Metal Esmaltado ` +
      `ou Metal Fundido) olhando a foto; frases marcadas "se aplicável" só entram quando houver base para isso` +
      `${stock != null && stock <= 10 ? ` (estoque deste produto: ${stock} unidades, então "pouquíssimas unidades" se aplica)` : " (escassez/\"pouquíssimas unidades\" NÃO se aplica: não há estoque baixo informado)"}.\n\n` +
      `${brandContext(settings)}`,
    `PADRÃO DE CADASTRO DO LOJISTA:\n${template.ai_guide}\n\n` +
      (hint
        ? `O lojista informou o nome do produto: "${hint}". Use-o como [Nome do Produto] (se já vier no formato completo, mantenha como está).\n`
        : "O lojista não informou o nome: dê um nome curto e fiel ao que aparece na foto.\n") +
      `As fotos a seguir são do produto. Preencha todos os campos.`,
    "medium", images);
  return {
    ...r,
    sku: r.sku.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60),
    handle: slug(r.handle).toLowerCase().slice(0, 120),
    tags: r.tags.map((t) => t.trim()).filter(Boolean),
  };
}

/** A IA olha as fotos e sugere nome e descrição (modo simples, sem padrão escrito). */
export async function suggestProduct(db: SupabaseClient, userId: string, images: string[], template: ProductTemplate | undefined, name?: string) {
  if (!aiEnabled()) throw new Error("Configure a chave da IA para sugerir nome e descrição.");
  if (template?.ai_guide) {
    const listing = await generateListing(db, userId, images, template, name);
    return { name: listing.name, description: listing.description, listing };
  }
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
  return generateJSON(Suggestion,
    `Você cadastra produtos numa loja virtual brasileira. Escreve em português do Brasil, sem inventar materiais, medidas ou ` +
      `características que não dá para ver na foto ou que não estejam no modelo.\n\n${brandContext(settings)}`,
    `${name ? `O produto se chama "${name}". Mantenha esse nome no campo name.` : "Dê um nome curto e claro para o produto da foto."}\n` +
      `Padrão do nome na loja: ${template?.name_pattern || "{nome}"} (o {nome} é o que você devolve em name).\n` +
      `Escreva a descrição de venda${template?.description ? ` seguindo esta descrição-base da loja (mantenha as informações dela, como medidas, material e envio):\n${template.description}` : "."}`,
    "low", images);
}

/**
 * Monta os campos do produto: valores fixos do modelo (preço, peso, categorias, marca...) + textos.
 * Com padrão escrito (ai_guide), a IA gera nome, descrição, código, URL, tags, SEO e a legenda.
 */
export async function buildProduct(
  db: SupabaseClient,
  userId: string,
  tpl: ProductTemplate,
  images: string[],
  name: string | undefined,
  overrides: ProductChanges,
  cached?: ListingData,
) {
  if (tpl.ai_guide && aiEnabled() && overrides.description === undefined) {
    const listing = cached && (!name || name === cached.name) ? cached : await generateListing(db, userId, images, tpl, name);
    const fields = applyTemplate(tpl, listing.name, {
      name: listing.name,
      description: listing.description,
      sku: listing.sku || undefined,
      handle: listing.handle || undefined,
      tags: listing.tags.length ? listing.tags.join(", ") : undefined,
      seo_title: listing.seo_title || undefined,
      seo_description: listing.seo_description || undefined,
      ...overrides,
    });
    return { fields, caption: listing.caption || undefined, baseName: listing.name };
  }
  let baseName = (name ?? "").trim();
  let description = overrides.description;
  if (!baseName || (tpl.ai_description && description === undefined && aiEnabled())) {
    const s = await suggestProduct(db, userId, images, tpl, baseName || undefined);
    baseName ||= s.name;
    if (tpl.ai_description && description === undefined) description = s.description;
  }
  return { fields: applyTemplate(tpl, baseName, { ...overrides, ...(description !== undefined ? { description } : {}) }), caption: undefined, baseName };
}

/**
 * Com "Publicar também nos marketplaces" ligado, publica o produto no Mercado Livre seguindo o padrão
 * dos anúncios atuais do lojista. Erros não desfazem o cadastro na loja: ficam registrados no rascunho.
 */
export async function publishToMarketplaces(
  db: SupabaseClient,
  userId: string,
  draftId: string | null,
  product: { name: string; description?: string; images: string[]; price: number; sku?: string; stock?: number | null },
  force = false,
) {
  const { data: settings } = await db.from("brand_settings").select("marketplace_autopublish").eq("user_id", userId).maybeSingle();
  if (!force && !settings?.marketplace_autopublish) return null;
  const { data: accounts } = await db.from("social_accounts").select("platform").eq("user_id", userId).in("platform", ["mercadolivre"]);
  const results: Record<string, unknown> = {};
  for (const platform of new Set((accounts ?? []).map((a) => a.platform as string))) {
    try {
      if (!(product.price > 0)) throw new Error("Produto sem preço");
      results[platform] = await publishToMercadoLivre(db, userId, product);
    } catch (e) {
      results[platform] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (draftId && Object.keys(results).length) await db.from("product_drafts").update({ marketplaces: results }).eq("id", draftId);
  return results;
}

/** Cria na Nuvemshop o produto de um rascunho (fotos enviadas no Studio). */
export async function createFromDraft(db: SupabaseClient, userId: string, draftId: string, extra: ProductChanges = {}) {
  const { data: draft } = await db.from("product_drafts").select("*").eq("id", draftId).eq("user_id", userId).single();
  if (!draft) throw new Error("Rascunho não encontrado");
  if (draft.status === "created") return draft;
  if (!draft.images?.length) throw new Error("O rascunho não tem fotos");
  const store = await storeFor(db, userId);
  if (!store) throw new Error("Conecte a loja Nuvemshop em Contas");

  // Trava contra clique duplo / duas execuções ao mesmo tempo
  const { data: claimed } = await db.from("product_drafts").update({ status: "creating", error: null })
    .eq("id", draft.id).in("status", ["pending", "failed"]).select().maybeSingle();
  if (!claimed) throw new Error("Este produto já está sendo cadastrado");

  try {
    const template = await templateFor(db, userId, draft.template_id);
    const tpl = template?.data ?? {};
    // social_images: versões 4:5 das fotos (o Instagram recusa fotos muito altas), geradas no envio
    // ai: cadastro já gerado pelo botão "Sugerir" (evita gerar de novo)
    const { social_images: socialImages, ai: cached, ...productOverrides } = { ...(draft.overrides ?? {}), ...extra } as ProductChanges & {
      social_images?: string[];
      ai?: ListingData;
    };
    const built = await buildProduct(db, userId, tpl, draft.images, (draft.name ?? "").trim() || undefined, productOverrides, cached);
    const product = await nsCreateProduct(store.token, store.storeId, built.fields, draft.images, { ncm: tpl.fiscal_ncm });
    const { data } = await db.from("product_drafts").update({
      status: "created", name: built.fields.name ?? built.baseName, product_id: String(product.id), product_url: product.url ?? null, error: null,
    }).eq("id", draft.id).select().single();
    const post = await announceProduct(db, userId, {
      name: built.fields.name ?? built.baseName,
      images: socialImages?.length ? socialImages : draft.images,
      url: product.url,
      price: product.price,
      description: built.fields.description,
      caption: built.caption,
      video_images: draft.images,
    }).catch((e) => {
      console.error("divulgação", e);
      return null;
    });
    const marketplaces = await publishToMarketplaces(db, userId, draft.id, {
      name: built.fields.name ?? built.baseName,
      description: built.fields.description,
      images: draft.images,
      price: Number(built.fields.price),
      sku: built.fields.sku,
      stock: built.fields.stock,
    });
    return { ...data, product, post, marketplaces };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("product_drafts").update({ status: "failed", error: message }).eq("id", draft.id);
    throw e;
  }
}
