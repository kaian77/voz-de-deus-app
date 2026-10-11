// Cadastro de produtos a partir de fotos: modelo de cadastro + nome (sugerido pela IA olhando a foto, se faltar).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { aiEnabled, brandContext, generateJSON } from "./claude.ts";
import { applyTemplate, nsCreateProduct, type ProductChanges, type ProductTemplate, storeFor } from "./nuvemshop.ts";

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

/**
 * Divulga um produto novo: cria um post (foto ou carrossel) para as redes conectadas com legenda chamativa.
 * Respeita a aprovação da marca: com "Exigir minha aprovação" ligado, o post fica em Aprovações.
 */
export async function announceProduct(
  db: SupabaseClient,
  userId: string,
  product: { name: string; images: string[]; url?: string | null; price?: string; description?: string },
) {
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
  if (settings && settings.product_autopost === false) return null;
  const { data: accounts } = await db.from("social_accounts").select("platform").eq("user_id", userId).in("platform", ["instagram", "tiktok"]);
  const platforms = [...new Set((accounts ?? []).map((a) => a.platform as string))];
  if (!platforms.length || !product.images.length) return null;

  const cta = settings?.default_cta || "Garanta o seu pelo link da bio!";
  let caption = `NOVIDADE NA LOJA! 🔥\n\n${product.name}${product.price ? ` por ${product.price}` : ""}.\n\n${cta}`;
  if (aiEnabled()) {
    try {
      const r = await generateJSON(Caption,
        `Você é social media de uma loja brasileira e escreve legendas que vendem, em português do Brasil, com energia e no máximo 3 emojis. ` +
          `Nunca invente características que não estejam nos dados ou na foto.\n\n${brandContext(settings)}`,
        `Produto novo acabou de chegar na loja: "${product.name}"${product.price ? `, preço ${product.price}` : ""}.\n` +
          `${product.description ? `Descrição da loja: ${product.description.replace(/<[^>]+>/g, " ").slice(0, 800)}\n` : ""}` +
          `O link do produto não é clicável na legenda: termine com o CTA "${cta}" (ou variação dele). Serve para Instagram e TikTok.`,
        "low", product.images.slice(0, 3));
      const tags = [...new Set([...(settings?.default_hashtags ?? "").split(/[\s,#]+/), ...r.hashtags])].filter(Boolean).slice(0, 12);
      caption = `${r.caption.trim()}\n\n${tags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}`;
    } catch (e) {
      console.error("legenda do produto", e);
    }
  }

  const media = product.images.slice(0, 10).map((url) => ({ url, type: "image" }));
  const approval = settings?.approval_required ?? true;
  const { data: post, error } = await db.from("posts").insert({
    user_id: userId,
    title: `Produto novo: ${product.name}`,
    kind: media.length > 1 ? "carousel" : "image",
    platforms,
    caption,
    media,
    scheduled_at: nextSlot(settings?.timezone ?? "America/Sao_Paulo"),
    status: approval ? "pending_approval" : "scheduled",
    created_by: "agent",
    notes: `Divulgação automática do produto cadastrado${product.url ? `: ${product.url}` : ""}.`,
    options: {},
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

/** A IA olha as fotos e sugere nome e descrição seguindo o modelo e o tom da marca. */
export async function suggestProduct(db: SupabaseClient, userId: string, images: string[], template: ProductTemplate | undefined, name?: string) {
  if (!aiEnabled()) throw new Error("Configure a chave da IA para sugerir nome e descrição.");
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
  return generateJSON(Suggestion,
    `Você cadastra produtos numa loja virtual brasileira. Escreve em português do Brasil, sem inventar materiais, medidas ou ` +
      `características que não dá para ver na foto ou que não estejam no modelo.\n\n${brandContext(settings)}`,
    `${name ? `O produto se chama "${name}". Mantenha esse nome no campo name.` : "Dê um nome curto e claro para o produto da foto."}\n` +
      `Padrão do nome na loja: ${template?.name_pattern || "{nome}"} (o {nome} é o que você devolve em name).\n` +
      `Escreva a descrição de venda${template?.description ? ` seguindo esta descrição-base da loja (mantenha as informações dela, como medidas, material e envio):\n${template.description}` : "."}`,
    "low", images);
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
    const overrides = { ...(draft.overrides ?? {}), ...extra } as ProductChanges;
    let baseName = (draft.name ?? "").trim();
    let description = overrides.description;
    if (!baseName || (tpl.ai_description && description === undefined && aiEnabled())) {
      const s = await suggestProduct(db, userId, draft.images, tpl, baseName || undefined);
      baseName ||= s.name;
      if (tpl.ai_description && description === undefined) description = s.description;
    }
    // social_images: versões 4:5 das fotos (o Instagram recusa fotos muito altas), geradas no envio
    const { social_images: socialImages, ...productOverrides } = overrides as ProductChanges & { social_images?: string[] };
    const fields = applyTemplate(tpl, baseName, { ...productOverrides, ...(description !== undefined ? { description } : {}) });
    const product = await nsCreateProduct(store.token, store.storeId, fields, draft.images);
    const { data } = await db.from("product_drafts").update({
      status: "created", name: baseName, product_id: String(product.id), product_url: product.url ?? null, error: null,
    }).eq("id", draft.id).select().single();
    const post = await announceProduct(db, userId, {
      name: fields.name ?? baseName, images: socialImages?.length ? socialImages : draft.images, url: product.url, price: product.price, description: fields.description,
    }).catch((e) => {
      console.error("divulgação", e);
      return null;
    });
    return { ...data, product, post };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("product_drafts").update({ status: "failed", error: message }).eq("id", draft.id);
    throw e;
  }
}
