// Automação automática por post: quando sai um post novo no Instagram (pelo Studio ou direto no app),
// cria uma automação só daquele post que responde a chamada da legenda (ex.: "comente EU QUERO")
// e manda no direct o link do produto do post.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { igRecentMedia, igTokenFor } from "./instagram.ts";
import { aiEnabled, generateJSON } from "./claude.ts";
import { nsProducts, storeFor } from "./nuvemshop.ts";

const EVERY_MS = 5 * 60_000; // confere posts novos a cada 5 min (limite de chamadas da API do Instagram)
const DEFAULT_KEYWORDS = ["eu quero", "quero", "link"];
const REPLIES = [
  "Te mandei o link no direct, @{username}! 💌",
  "Corre no direct, @{username}! O link já está lá 🚀",
  "Já chegou no seu direct, @{username}! 😍",
];

const Match = z.object({
  product_id: z.number().nullable().describe("id do produto da lista que aparece/é divulgado no post, ou null se nenhum"),
  keyword: z.string().describe("Palavra/frase que a legenda pede para comentar (ex.: 'EU QUERO', 'LINK', 'ROSA'), em minúsculas; vazio se não houver"),
});

type Product = { id?: number; name: string; url: string };

/** Palavra que a legenda pede para comentar: "comente EU QUERO", "comenta 'rosa'"... */
export function ctaKeyword(caption: string) {
  const quoted = caption.match(/coment\p{L}*\s+["“'*]+([^"”'*\n]{2,30})["”'*]/iu)?.[1];
  if (quoted) return quoted.trim();
  return caption.match(/[Cc][Oo][Mm][Ee][Nn][Tt]\p{L}*\s+((?:[A-ZÀ-Ú0-9]{2,}\s?){1,4})/u)?.[1]?.trim() ?? "";
}

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// deno-lint-ignore no-explicit-any
async function productFor(db: SupabaseClient, userId: string, media: any): Promise<{ product: Product | null; keyword: string }> {
  // Post feito pelo Studio com produto vinculado
  const { data: post } = await db.from("posts").select("options").eq("user_id", userId).eq("results->instagram->>id", media.id).maybeSingle();
  const linked = post?.options?.product as Product | undefined;
  const caption = String(media.caption ?? "");
  const cta = ctaKeyword(caption);
  if (linked?.url) return { product: linked, keyword: cta };
  if (!aiEnabled()) return { product: null, keyword: cta };

  const store = await storeFor(db, userId).catch(() => null);
  if (!store) return { product: null, keyword: cta };
  const catalog = await nsProducts(store.token, store.storeId, { limit: 200 });
  if (!catalog.length) return { product: null, keyword: cta };
  const image = media.media_type === "VIDEO" ? media.thumbnail_url : media.media_url;
  const r = await generateJSON(Match,
    "Você liga posts do Instagram de uma loja de pins ao produto da loja que eles divulgam. Só escolha um produto se tiver certeza (nome/tema batem com a legenda ou a imagem).",
    `Legenda do post:\n${caption.slice(0, 1500) || "(sem legenda)"}\n\nProdutos da loja (id — nome):\n` +
      catalog.map((p) => `${p.id} — ${p.name}`).join("\n"),
    "low", image ? [image] : []).catch(() => null);
  const found = r?.product_id != null ? catalog.find((p) => p.id === r.product_id) : undefined;
  return { product: found?.url ? { id: found.id, name: found.name, url: found.url } : null, keyword: cta || r?.keyword || "" };
}

export async function autoLinkPosts(db: SupabaseClient) {
  const { data: accounts } = await db.from("social_accounts").select("*").eq("platform", "instagram");
  const report = [];
  for (const account of accounts ?? []) {
    const meta = account.meta ?? {};
    if (meta.autolink_at && Date.now() - new Date(meta.autolink_at).getTime() < EVERY_MS) continue;
    const { data: settings } = await db.from("brand_settings").select("auto_post_link").eq("user_id", account.user_id).maybeSingle();
    if (settings?.auto_post_link === false) continue;
    const now = new Date().toISOString();
    // Primeira vez: só marca o ponto de partida (não cria automação para posts antigos)
    const since = meta.autolink_since ? new Date(meta.autolink_since).getTime() : null;
    const done: string[] = Array.isArray(meta.autolink_done) ? meta.autolink_done : [];
    const created: string[] = [];
    try {
      if (since) {
        const token = await igTokenFor(db, account.id);
        const media = (await igRecentMedia(token, String(account.external_id), 6))
          .filter((m) => m.media_product_type !== "STORY" && new Date(m.timestamp).getTime() > since && !done.includes(m.id));
        const { data: autos } = await db.from("automations").select("media_ids").eq("user_id", account.user_id);
        const covered = new Set((autos ?? []).flatMap((a) => a.media_ids ?? []));
        for (const m of media) {
          done.push(m.id);
          if (covered.has(m.id)) continue;
          const { product, keyword } = await productFor(db, account.user_id, m);
          if (!product) continue; // sem produto: vale a automação geral (link do site)
          const keywords = [...new Set([norm(keyword), ...DEFAULT_KEYWORDS].filter((k) => k.length >= 2))];
          await db.from("automations").insert({
            user_id: account.user_id,
            account_id: account.id,
            name: `Post: ${product.name}`.slice(0, 120),
            active: true,
            auto: true,
            keywords,
            match_mode: "contains",
            media_ids: [m.id],
            reply_variants: REPLIES,
            dm_message: `Oi {username}! Aqui está o link do ${product.name} 👉 ${product.url}\nEntregamos para todo o Brasil 🚚`,
            once_per_user: true,
          });
          created.push(product.name);
        }
      }
    } catch (e) {
      report.push({ account: account.username, error: e instanceof Error ? e.message : String(e) });
    }
    await db.from("social_accounts").update({
      meta: { ...meta, autolink_at: now, autolink_since: meta.autolink_since ?? now, autolink_done: done.slice(-40) },
    }).eq("id", account.id);
    if (created.length) report.push({ account: account.username, created });
  }
  return report;
}
