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

/** O que se sabe de cada anúncio antes de ler as avaliações (a busca e o catálogo já trazem título, marca e link). */
type Meta = { id: string; title?: string; permalink?: string; seller_id?: number; brand?: string; product?: string };
/** Contagem de cada etapa (fica em manual_searches.log para entender busca que volta vazia). */
type Log = Record<string, number | string[]>;

const brandOf = (attrs: Any[] | undefined) => String(attrs?.find((a: Any) => a.id === "BRAND")?.value_name ?? "").trim() || undefined;

function note(log: Log, step: string, e: unknown) {
  const errs = (log.errors as string[]) ?? (log.errors = []);
  const msg = `${step}: ${(e as Error).message ?? e}`.slice(0, 160);
  if (errs.length < 6 && !errs.includes(msg)) errs.push(msg);
}
const bump = (log: Log, k: string, n = 1) => (log[k] = ((log[k] as number) ?? 0) + n);

/** Anúncios para ler: busca do site + mais vendidos da categoria + catálogo (a busca pública às vezes é recusada). */
async function candidates(token: string, site: string, q: string, metas: Map<string, Meta>, log: Log) {
  const qs = encodeURIComponent(q);
  const add = (m: Meta) => metas.set(m.id, { ...metas.get(m.id), ...Object.fromEntries(Object.entries(m).filter(([, v]) => v != null)) } as Meta);
  const search = await ml<Any>(token, `/sites/${site}/search?q=${qs}&limit=50`).catch((e) => (note(log, "busca", e), null));
  for (const r of search?.results ?? []) {
    bump(log, "busca");
    add({ id: r.id, title: r.title, permalink: r.permalink, seller_id: r.seller?.id ?? r.seller_id, brand: brandOf(r.attributes) });
  }
  // Produto do catálogo: nome e marca vêm do próprio produto; os anúncios dele, de /products/{id}/items
  const fromProducts = (pids: string[]) =>
    pool(pids.slice(0, 25), 5, async (pid) => {
      const p = await ml<Any>(token, `/products/${pid}`).catch((e) => (note(log, "produto", e), null));
      const base = { title: p?.name, brand: brandOf(p?.attributes), product: pid, permalink: p?.permalink };
      const r = await ml<Any>(token, `/products/${pid}/items?limit=3`).catch((e) => (note(log, "anúncios do produto", e), null));
      const its: Any[] = r?.results ?? [];
      for (const it of its) if (it.item_id) add({ id: it.item_id, seller_id: it.seller_id, ...base });
      // Sem anúncios liberados: tenta as avaliações pelo próprio produto
      if (!its.length && p) add({ id: pid, ...base });
      bump(log, "produtos");
    });
  // Mais vendidos da categoria: são os que têm mais avaliações
  const cats = await ml<Any[]>(token, `/sites/${site}/domain_discovery/search?q=${qs}&limit=2`).catch((e) => (note(log, "categoria", e), []));
  for (const c of (cats ?? []).slice(0, 2)) {
    const h = await ml<Any>(token, `/highlights/${site}/category/${c.category_id}`).catch((e) => (note(log, "mais vendidos", e), null));
    const content: Any[] = h?.content ?? [];
    bump(log, "mais_vendidos", content.length);
    for (const x of content) if (x.type === "ITEM") add({ id: x.id });
    await fromProducts(content.filter((x) => x.type !== "ITEM").map((x) => x.id));
  }
  if (metas.size < 30) {
    const p = await ml<Any>(token, `/products/search?status=active&site_id=${site}&q=${qs}&limit=30`).catch((e) => (note(log, "catálogo", e), null));
    bump(log, "catalogo", (p?.results ?? []).length);
    await fromProducts((p?.results ?? []).map((x: Any) => x.id));
  }
}

/** Avaliações de um anúncio (ou produto do catálogo); tenta os jeitos que a API aceita. */
async function reviewsOf(token: string, m: Meta, log: Log): Promise<Any | null> {
  const tries = [`/reviews/item/${m.id}?limit=50`];
  if (m.product && m.product !== m.id) tries.push(`/reviews/item/${m.id}?limit=50&catalog_product_id=${m.product}`);
  if (m.product === m.id) tries.unshift(`/reviews/item/${m.id}?limit=50&catalog_product_id=${m.id}`);
  for (const path of tries) {
    const r = await ml<Any>(token, path).catch((e) => (note(log, "avaliações", e), null));
    if (r?.reviews?.length) return r;
  }
  return null;
}

/** Roda uma busca do Mercado Livre (status e resultado gravados em manual_searches / manual_leads). */
export async function runMlManualSearch(db: SupabaseClient, searchId: string) {
  const { data: s } = await db.from("manual_searches").select("*").eq("id", searchId).single();
  if (!s) return;
  const log: Log = {};
  const upd = (patch: Record<string, unknown>) => db.from("manual_searches").update({ ...patch, log, updated_at: new Date().toISOString() }).eq("id", searchId);
  await upd({ status: "running", error: null });
  try {
    const { data: acc } = await db.from("social_accounts").select("id").eq("user_id", s.user_id).eq("platform", "mercadolivre").order("connected_at").limit(1).maybeSingle();
    if (!acc) throw new Error("Conecte o Mercado Livre em Contas (a busca usa o acesso da sua conta)");
    const token = await mlTokenFor(db, acc.id);
    const site = ML_SITES[s.site] ? s.site : "MLB";
    const country = ML_SITES[site].country;
    const metas = new Map<string, Meta>();
    for (const q of String(s.query).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 4)) await candidates(token, site, q, metas, log);
    log.anuncios = metas.size;
    if (!metas.size) throw new Error(`O Mercado Livre não devolveu anúncios${(log.errors as string[])?.[0] ? ` (${(log.errors as string[])[0]})` : ""}`);

    // Completa marca/vendedor/link de quem veio só com o id (lotes de 20; se o lote for recusado, segue com o que tem)
    const missing = [...metas.values()].filter((m) => !m.title && m.id !== m.product).map((m) => m.id).slice(0, 150);
    for (let i = 0; i < missing.length; i += 20) {
      const r = await ml<Any[]>(token, `/items?ids=${missing.slice(i, i + 20).join(",")}&attributes=id,title,permalink,seller_id,attributes`)
        .catch((e) => (note(log, "anúncios", e), []));
      for (const x of r ?? []) {
        if (x.code !== 200 || !x.body) continue;
        bump(log, "detalhes");
        const m = metas.get(x.body.id)!;
        Object.assign(m, { title: x.body.title, permalink: x.body.permalink, seller_id: x.body.seller_id, brand: m.brand ?? brandOf(x.body.attributes) });
      }
    }

    const sellers = new Map<number, string>();
    const brands = new Map<string, Brand>();
    let scanned = 0;
    await pool([...metas.values()].slice(0, 160), 6, async (m) => {
      const r = await reviewsOf(token, m, log);
      if (!r) {
        bump(log, "sem_avaliacoes");
        return;
      }
      bump(log, "com_avaliacoes");
      let brand = m.brand && !/gen[eé]ric|sem marca|sin marca/i.test(m.brand) ? m.brand : "";
      if (!brand && m.seller_id) {
        if (!sellers.has(m.seller_id)) {
          const u = await ml<Any>(token, `/users/${m.seller_id}`).catch(() => null);
          sellers.set(m.seller_id, u?.nickname ?? `Vendedor ${m.seller_id}`);
        }
        brand = sellers.get(m.seller_id)!;
      }
      brand ||= String(m.title ?? "").split(/\s+/).slice(0, 3).join(" ") || m.id;
      const key = norm(brand);
      if (!key) return;
      const b = brands.get(key) ?? { key, name: brand, country, ratings: [], read: 0, complaints: 0, samples: [] };
      brands.set(key, b);
      b.url ??= m.permalink;
      if (r.rating_average) b.ratings.push(Number(r.rating_average));
      for (const v of r.reviews as Any[]) {
        const text = [v.title, v.content].filter(Boolean).join(". ").trim();
        if (!text) continue;
        b.read++;
        scanned++;
        if (isComplaint(text, v.rate)) {
          b.complaints++;
          if (b.samples.length < 6) b.samples.push({ text: text.slice(0, 280), rate: v.rate ?? null, product: String(m.title ?? "").slice(0, 90), url: m.permalink });
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
    if (!scanned) throw new Error(`Achei ${metas.size} anúncios, mas o Mercado Livre não liberou as avaliações${(log.errors as string[])?.length ? ` (${(log.errors as string[]).at(-1)})` : ""}`);
    await upd({ status: "done", found: rows.length, scanned });
  } catch (e) {
    await upd({ status: "failed", error: (e as Error).message.slice(0, 500) });
  }
}
