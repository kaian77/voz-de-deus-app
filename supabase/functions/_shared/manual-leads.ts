/**
 * Prospecção da Montagem 3D: acha marcas de móveis com avaliações reclamando do manual / da montagem.
 * Esta parte lê o Mercado Livre (Brasil e Mercado Libre de fora, mesma API e mesmo token da conta conectada);
 * Google Maps e Etsy rodam no workflow "Leads do Google Maps" (video/manual_leads.py, mesmas palavras de lá).
 * Resultado: uma linha por marca em manual_leads, com a nota, quantas reclamações e frases reais dos clientes.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ml, mlTokenFor } from "./mercadolivre.ts";

export const ML_SITES: Record<string, { country: string; label: string }> = {
  MLB: { country: "BR", label: "Brasil" },
  MLM: { country: "MX", label: "México" },
  MLA: { country: "AR", label: "Argentina" },
  MCO: { country: "CO", label: "Colômbia" },
  MLC: { country: "CL", label: "Chile" },
  MLU: { country: "UY", label: "Uruguai" },
  MPE: { country: "PE", label: "Peru" },
};

// Assunto: manual, instruções, montagem, furos, parafusos, peças faltando (pt, es, en)
const TOPIC =
  /manual|instru[cç]|instructivo|diagram|passo a passo|paso a paso|montag|montar|mont[ae]i|armad|armar|arm[eé]|ensambl|assembl|put together|fur[oa]|fura[cç]|agujer|\bholes?\b|parafus|tornill|screws?|pe[cç]as? falt|falt\w* (pe[cç]|parafus|piez|tornill)|missing (part|piece|screw|hardware)|faltan? (piez|tornill)/i;
// Tom de reclamação (para avaliação de 4-5 estrelas que fala do assunto contar, precisa disso)
const NEG =
  /dif[ií]cil|complicad|confus|ruim|p[eé]ssim|horr[ií]vel|errad|n[aã]o encaix|n[aã]o bat|falt(ou|ando|aram|an|[oó])|sem manual|sin manual|n[aã]o vem|n[aã]o veio|n[aã]o tem manual|n[aã]o entend|mal explic|terrible|awful|confusing|unclear|missing|wrong|poor|hard to|difficult|nightmare|didn'?t|did not|doesn'?t|useless|\bmal[oa]?\b|no encaj|no vien|no trae|no se entiende|horrible|incomplet|nada claro|pouco claro|poco claro/i;

/** A avaliação reclama do manual/montagem? */
export function isComplaint(text: string, rate: number | null | undefined) {
  if (!text || !TOPIC.test(text)) return false;
  return (rate != null && rate <= 3) || NEG.test(text);
}

type Sample = { text: string; rate: number | null; product: string; url?: string };
type Brand = { key: string; name: string; country: string; url?: string; ratings: number[]; read: number; complaints: number; samples: Sample[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]).catch(() => {});
  }));
}

// deno-lint-ignore no-explicit-any
type Any = any;

/** Anúncios para ler: busca do site + mais vendidos da categoria + catálogo (a busca pública às vezes é recusada). */
async function candidates(token: string, site: string, q: string): Promise<{ ids: Set<string>; notes: string[] }> {
  const ids = new Set<string>();
  const notes: string[] = [];
  const qs = encodeURIComponent(q);
  const search = await ml<Any>(token, `/sites/${site}/search?q=${qs}&limit=50`).catch((e) => (notes.push(`busca: ${(e as Error).message}`), null));
  for (const r of search?.results ?? []) ids.add(r.id);
  const fromProducts = async (pids: string[]) =>
    pool(pids.slice(0, 20), 5, async (pid) => {
      const r = await ml<Any>(token, `/products/${pid}/items?limit=3`);
      for (const it of r.results ?? []) if (it.item_id) ids.add(it.item_id);
    });
  // Mais vendidos da categoria: são os que têm mais avaliações
  const cats = await ml<Any[]>(token, `/sites/${site}/domain_discovery/search?q=${qs}&limit=2`).catch(() => []);
  for (const c of (cats ?? []).slice(0, 2)) {
    const h = await ml<Any>(token, `/highlights/${site}/category/${c.category_id}`).catch(() => null);
    const content: Any[] = h?.content ?? [];
    for (const x of content) if (x.type === "ITEM") ids.add(x.id);
    await fromProducts(content.filter((x) => x.type === "PRODUCT").map((x) => x.id));
  }
  if (ids.size < 20) {
    const p = await ml<Any>(token, `/products/search?status=active&site_id=${site}&q=${qs}&limit=30`).catch((e) => (notes.push(`catálogo: ${(e as Error).message}`), null));
    await fromProducts((p?.results ?? []).map((x: Any) => x.id));
  }
  return { ids, notes };
}

/** Roda uma busca do Mercado Livre (status e resultado gravados em manual_searches / manual_leads). */
export async function runMlManualSearch(db: SupabaseClient, searchId: string) {
  const { data: s } = await db.from("manual_searches").select("*").eq("id", searchId).single();
  if (!s) return;
  const upd = (patch: Record<string, unknown>) => db.from("manual_searches").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", searchId);
  await upd({ status: "running", error: null });
  try {
    const { data: acc } = await db.from("social_accounts").select("id").eq("user_id", s.user_id).eq("platform", "mercadolivre").order("connected_at").limit(1).maybeSingle();
    if (!acc) throw new Error("Conecte o Mercado Livre em Contas (a busca usa o acesso da sua conta)");
    const token = await mlTokenFor(db, acc.id);
    const site = ML_SITES[s.site] ? s.site : "MLB";
    const country = ML_SITES[site].country;
    const ids = new Set<string>();
    const notes: string[] = [];
    for (const q of String(s.query).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 4)) {
      const c = await candidates(token, site, q);
      c.ids.forEach((id) => ids.add(id));
      notes.push(...c.notes);
    }
    if (!ids.size) throw new Error(notes[0] ? `O Mercado Livre não deixou buscar (${notes[0]})` : "Nenhum anúncio encontrado; tente outra palavra (ex.: rack, guarda-roupa)");

    // Dados dos anúncios (marca, vendedor, link) em lotes de 20
    const list = [...ids].slice(0, 150);
    const items: Any[] = [];
    for (let i = 0; i < list.length; i += 20) {
      const r = await ml<Any[]>(token, `/items?ids=${list.slice(i, i + 20).join(",")}&attributes=id,title,permalink,seller_id,attributes`).catch(() => []);
      for (const x of r ?? []) if (x.code === 200 && x.body) items.push(x.body);
    }
    const sellers = new Map<number, string>();
    const brands = new Map<string, Brand>();
    let scanned = 0;
    await pool(items, 6, async (it) => {
      const r = await ml<Any>(token, `/reviews/item/${it.id}?limit=50`).catch(() => null);
      const reviews: Any[] = r?.reviews ?? [];
      if (!reviews.length) return;
      let brand = String(it.attributes?.find((a: Any) => a.id === "BRAND")?.value_name ?? "").trim();
      if (!brand || /gen[eé]ric|sem marca|sin marca/i.test(brand)) {
        if (!sellers.has(it.seller_id)) {
          const u = await ml<Any>(token, `/users/${it.seller_id}`).catch(() => null);
          sellers.set(it.seller_id, u?.nickname ?? `Vendedor ${it.seller_id}`);
        }
        brand = sellers.get(it.seller_id)!;
      }
      const key = norm(brand);
      if (!key) return;
      const b = brands.get(key) ?? { key, name: brand, country, ratings: [], read: 0, complaints: 0, samples: [] };
      brands.set(key, b);
      b.url ??= it.permalink;
      if (r.rating_average) b.ratings.push(Number(r.rating_average));
      for (const v of reviews) {
        const text = [v.title, v.content].filter(Boolean).join(". ").trim();
        if (!text) continue;
        b.read++;
        scanned++;
        if (isComplaint(text, v.rate)) {
          b.complaints++;
          if (b.samples.length < 6) b.samples.push({ text: text.slice(0, 280), rate: v.rate ?? null, product: String(it.title).slice(0, 90), url: it.permalink });
        }
      }
    });

    const rows = [...brands.values()].filter((b) => b.complaints > 0).map((b) => ({
      user_id: s.user_id, search_id: s.id, source: "ml", key: `${site}:${b.key}`, name: b.name.slice(0, 120), country, url: b.url ?? null,
      rating: b.ratings.length ? Math.round((b.ratings.reduce((x, y) => x + y, 0) / b.ratings.length) * 10) / 10 : null,
      reviews_read: b.read, complaints: b.complaints, samples: b.samples, updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await db.from("manual_leads").upsert(rows, { onConflict: "user_id,source,key" });
      if (error) throw new Error(error.message);
    }
    await upd({ status: "done", found: rows.length, scanned });
  } catch (e) {
    await upd({ status: "failed", error: (e as Error).message.slice(0, 500) });
  }
}
