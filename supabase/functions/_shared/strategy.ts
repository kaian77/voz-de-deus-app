// Motor de estratégia: junta as vendas do site (Nuvemshop) e do Mercado Livre, os números do TikTok que o dono
// colar, os vídeos já feitos e as datas que vêm aí, e a IA monta um plano para vender mais no TikTok e no site
// e ganhar seguidores. Também escolhe os produtos que mais merecem vídeo novo (um vídeo por produto).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { brandContext, generateJSON } from "./claude.ts";
import { ns, storeFor, txt } from "./nuvemshop.ts";
import { ml, mlTokenFor } from "./mercadolivre.ts";
import { upcomingDates } from "./content-ideas.ts";

const DAYS = 90;

export type StoreProduct = { id: number; name: string; url: string | null; images: string[]; price: number | null; description: string };
export type ProductStat = StoreProduct & { site_qty: number; site_revenue: number; ml_qty: number; last_video: string | null; score: number };

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&([a-z])(acute|grave|tilde|circ|cedil|uml);/gi, "$1")
    .replace(/&amp;/g, "&").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

/** Palavras que identificam o produto (sem "pin", "metal", acentos...), para casar títulos do ML com a loja. */
const STOP = new Set(["pin", "pins", "de", "do", "da", "dos", "das", "e", "com", "metal", "esmaltado", "pintado", "mao", "a", "o", "para", "em", "kit", "broche", "botton"]);
function words(name: string) {
  return new Set(name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));
}
function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / Math.min(a.size, b.size);
}

async function storeProducts(token: string, storeId: string): Promise<StoreProduct[]> {
  const out: StoreProduct[] = [];
  for (let page = 1; page <= 5; page++) {
    const list = await ns<any[]>(token, storeId, `products?per_page=200&page=${page}&published=true`).catch(() => []);
    if (!Array.isArray(list) || !list.length) break;
    for (const p of list) {
      const prices = (p.variants ?? []).map((v: any) => Number(v.promotional_price || v.price)).filter((n: number) => n > 0);
      out.push({
        id: p.id,
        name: txt(p.name),
        url: p.canonical_url ?? null,
        images: (p.images ?? []).map((i: any) => i.src).filter(Boolean).slice(0, 4),
        price: prices.length ? Math.min(...prices) : null,
        description: decode(txt(p.description)).slice(0, 600),
      });
    }
    if (list.length < 200) break;
  }
  return out;
}

async function siteOrders(token: string, storeId: string, since: Date) {
  const orders: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const params = new URLSearchParams({ created_at_min: since.toISOString(), payment_status: "paid", per_page: "200", page: String(page) });
    const list = await ns<any[]>(token, storeId, `orders?${params}`).catch(() => []);
    if (!Array.isArray(list) || !list.length) break;
    orders.push(...list);
    if (list.length < 200) break;
  }
  return orders;
}

async function mlOrders(db: SupabaseClient, userId: string, since: Date) {
  const { data: acc } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", "mercadolivre").order("connected_at").limit(1).maybeSingle();
  if (!acc) return null;
  const token = await mlTokenFor(db, acc.id);
  const from = encodeURIComponent(since.toISOString().replace("Z", "-00:00"));
  const items: { title: string; qty: number; total: number }[] = [];
  let orders = 0;
  for (let offset = 0; offset < 500; offset += 50) {
    const r = await ml<{ results?: any[]; paging?: { total?: number } }>(token,
      `/orders/search?seller=${acc.external_id}&order.status=paid&order.date_created.from=${from}&sort=date_desc&limit=50&offset=${offset}`);
    for (const o of r.results ?? []) {
      orders++;
      for (const i of o.order_items ?? []) items.push({ title: i.item?.title ?? "", qty: Number(i.quantity ?? 1), total: Number(i.unit_price ?? 0) * Number(i.quantity ?? 1) });
    }
    if (!r.results?.length || offset + 50 >= (r.paging?.total ?? 0)) break;
  }
  return { orders, items };
}

/** Dados de vendas e conteúdo dos últimos 90 dias, por produto. */
export async function salesSnapshot(db: SupabaseClient, userId: string) {
  const store = await storeFor(db, userId);
  if (!store) throw new Error("Conecte a Nuvemshop em Contas");
  const since = new Date(Date.now() - DAYS * 86400_000);
  const [products, orders, mlData, videos] = await Promise.all([
    storeProducts(store.token, store.storeId),
    siteOrders(store.token, store.storeId, since),
    mlOrders(db, userId, since).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
    db.from("product_videos").select("name, created_at, status").eq("user_id", userId).neq("status", "failed").order("created_at", { ascending: false }).limit(1000),
  ]);

  const stats = new Map<number, ProductStat>(products.map((p) => [p.id, { ...p, site_qty: 0, site_revenue: 0, ml_qty: 0, last_video: null, score: 0 }]));
  let siteRevenue = 0;
  const byName = new Map<string, number>();
  for (const o of orders) {
    siteRevenue += Number(o.total ?? 0);
    for (const item of o.products ?? []) {
      const s = stats.get(Number(item.product_id));
      const qty = Number(item.quantity ?? 1);
      if (s) {
        s.site_qty += qty;
        s.site_revenue += qty * Number(item.price ?? 0);
      } else {
        const n = txt(item.name);
        byName.set(n, (byName.get(n) ?? 0) + qty);
      }
    }
  }

  // Vendas do ML casadas com os produtos da loja pelo nome
  const keyed = [...stats.values()].map((s) => ({ s, w: words(s.name) }));
  const mlUnmatched = new Map<string, number>();
  const mlItems = mlData && "items" in mlData ? mlData.items : [];
  for (const it of mlItems) {
    const w = words(it.title);
    let best = -1;
    let bestScore = 0;
    keyed.forEach((k, i) => {
      const sc = similarity(w, k.w);
      if (sc > bestScore) {
        best = i;
        bestScore = sc;
      }
    });
    if (best >= 0 && bestScore >= 0.6) keyed[best].s.ml_qty += it.qty;
    else mlUnmatched.set(it.title, (mlUnmatched.get(it.title) ?? 0) + it.qty);
  }

  // Último vídeo de cada produto
  for (const v of videos.data ?? []) {
    const w = words(v.name);
    for (const k of keyed) {
      if (!k.s.last_video && similarity(w, k.w) >= 0.8) k.s.last_video = v.created_at;
    }
  }

  for (const s of stats.values()) s.score = s.site_qty * 2 + s.ml_qty;
  const ranked = [...stats.values()].sort((a, b) => b.score - a.score || (b.price ?? 0) - (a.price ?? 0));
  return {
    days: DAYS,
    products: ranked,
    site: { orders: orders.length, revenue: Math.round(siteRevenue * 100) / 100, unmatched: [...byName].slice(0, 20) },
    mercadolivre: mlData && "items" in mlData ? { orders: mlData.orders, unmatched: [...mlUnmatched].sort((a, b) => b[1] - a[1]).slice(0, 20) } : mlData,
    dates: upcomingDates(new Date(), 45),
  };
}

/**
 * Produtos que mais merecem vídeo novo: primeiro os que vendem e estão sem vídeo recente, depois os mais caros
 * (kits e caixas) e o resto do catálogo sem vídeo. Um vídeo por produto, sem repetir.
 */
export function pickVideoProducts(products: ProductStat[], count: number, extraNames: string[] = []) {
  const recent = Date.now() - 30 * 86400_000;
  const fresh = (p: ProductStat) => p.images.length > 0 && (!p.last_video || new Date(p.last_video).getTime() < recent);
  const wanted = extraNames.map(words);
  const boosted = products.filter((p) => fresh(p) && wanted.some((w) => similarity(w, words(p.name)) >= 0.6));
  const selling = products.filter((p) => fresh(p) && p.score > 0);
  const premium = [...products].filter((p) => fresh(p) && /kit|caixa|combo/i.test(p.name));
  const rest = products.filter(fresh);
  const out: ProductStat[] = [];
  for (const p of [...boosted, ...selling, ...premium, ...rest]) {
    if (out.length >= count) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

const Plan = z.object({
  summary: z.string().describe("Resumo em 2-3 frases da situação e da principal oportunidade"),
  diagnosis: z.array(z.object({ title: z.string(), detail: z.string() })).describe("3 a 5 pontos do que os números mostram"),
  priorities: z.array(z.object({
    title: z.string(),
    why: z.string(),
    channel: z.enum(["tiktok", "site", "instagram", "mercadolivre", "geral"]),
    actions: z.array(z.string()).describe("Passos concretos, curtos, que o dono consegue fazer esta semana"),
    products: z.array(z.string()).describe("Nomes exatos de produtos da lista, se a prioridade for sobre produtos"),
  })).describe("4 a 6 prioridades, da mais importante para a menos"),
  tiktok_ads: z.object({
    advice: z.string(),
    roi_target: z.string().describe("ROI alvo sugerido e por quê"),
    budget: z.string().describe("Orçamento diário sugerido e quando subir"),
    products: z.array(z.string()),
  }).describe("Conselho para o GMV Max do TikTok Shop"),
  kits: z.array(z.object({ name: z.string(), products: z.array(z.string()), why: z.string() })).describe("2 a 4 ideias de kit com produtos da lista que combinam"),
  content: z.array(z.object({ idea: z.string(), format: z.string(), channel: z.enum(["tiktok", "instagram", "ambos"]), product: z.string() }))
    .describe("6 a 10 ideias de conteúdo para ganhar seguidores e vender"),
  dates: z.array(z.object({ date: z.string(), name: z.string(), action: z.string() })).describe("Datas dos próximos 45 dias que valem campanha, com o que fazer"),
  weekly_checklist: z.array(z.string()).describe("5 a 8 tarefas para esta semana"),
});
export type StrategyPlan = z.infer<typeof Plan>;

/** Gera e guarda um plano novo. `tiktok` é o texto que o dono colou com os números do TikTok/GMV Max. */
export async function generateStrategy(db: SupabaseClient, userId: string, input: { tiktok?: string; goal?: string }) {
  const snap = await salesSnapshot(db, userId);
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
  const { data: accounts } = await db.from("social_accounts").select("platform, username, followers_count").eq("user_id", userId);
  const goal = input.goal?.trim() || "Vender mais no TikTok (TikTok Shop) e no site, ganhar seguidores e transformar seguidores em compradores.";
  const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
  const top = snap.products.filter((p) => p.score > 0).slice(0, 40)
    .map((p) => `- ${p.name} | site: ${p.site_qty} un (${brl(p.site_revenue)}) | ML: ${p.ml_qty} un | preço ${p.price != null ? brl(p.price) : "?"} | vídeo: ${p.last_video ? p.last_video.slice(0, 10) : "nunca"}`);
  const noSales = snap.products.filter((p) => p.score === 0);
  const ml = snap.mercadolivre && "orders" in snap.mercadolivre ? snap.mercadolivre : null;

  const data =
    `Período: últimos ${snap.days} dias.\n` +
    `Contas: ${(accounts ?? []).map((a) => `${a.platform}${a.username ? ` (${a.username}${a.followers_count ? `, ${a.followers_count} seguidores` : ""})` : ""}`).join(", ")}\n` +
    `Catálogo: ${snap.products.length} produtos publicados; ${noSales.length} sem nenhuma venda no período; ` +
    `${snap.products.filter((p) => !p.last_video).length} nunca tiveram vídeo.\n` +
    `Site (Nuvemshop): ${snap.site.orders} pedidos pagos, ${brl(snap.site.revenue)}.\n` +
    (ml ? `Mercado Livre: ${ml.orders} pedidos pagos.\n` : snap.mercadolivre ? `Mercado Livre: não consegui ler (${(snap.mercadolivre as any).error}).\n` : "Mercado Livre: não conectado.\n") +
    `\nMais vendidos (site + ML):\n${top.join("\n") || "(nenhuma venda registrada)"}\n` +
    (ml?.unmatched.length ? `\nVendas do ML sem produto correspondente na loja: ${ml.unmatched.slice(0, 10).map(([t, q]) => `${t} (${q})`).join("; ")}\n` : "") +
    `\nAlguns produtos sem venda: ${noSales.slice(0, 40).map((p) => p.name).join("; ")}\n` +
    `\nDatas e campanhas que vêm aí: ${snap.dates.dates.map((d) => `${d.date} ${d.name}`).join("; ")}; campanhas do mês: ${snap.dates.campaigns.join(", ")}\n` +
    (input.tiktok?.trim() ? `\nNúmeros do TikTok/TikTok Shop informados pelo dono:\n${input.tiktok.trim().slice(0, 3000)}\n` : "\nTikTok: o dono não informou números desta vez.\n");

  const plan = await generateJSON(Plan,
    `Você é estrategista de e-commerce e social commerce no Brasil (TikTok Shop, Instagram, loja própria e Mercado Livre). ` +
      `Monte um plano prático para a semana, em português do Brasil, direto e sem enrolação, para quem cuida da loja sozinho e usa o celular.\n` +
      `Regras:\n- Use SOMENTE os números dados; nunca invente vendas, seguidores, ROI ou preços.\n` +
      `- No TikTok: nada de "link na bio", site ou URL no vídeo nem na legenda (dá violação no TikTok Shop); a venda lá é pelo produto marcado no vídeo.\n` +
      `- O agente de mensagens nunca informa preço (variam por modelo e kits).\n` +
      `- Cite produtos pelo nome exato da lista.\n- Ações devem caber no que o Studio faz: vídeos de produto automáticos, posts e carrosséis agendados, ` +
      `automação de comentários "EU QUERO" com link no direct do Instagram, cupons na Nuvemshop, anúncios GMV Max no TikTok Shop, publicar no Mercado Livre.\n\n` +
      `${brandContext(settings)}`,
    `Objetivo: ${goal}\n\nDados:\n${data}\n\nMonte o plano.`,
    "medium");

  const picks = pickVideoProducts(snap.products, 50, [...plan.priorities.flatMap((p) => p.products), ...plan.tiktok_ads.products]);
  const summary = {
    period_days: snap.days,
    products: snap.products.length,
    products_without_sales: noSales.length,
    products_without_video: snap.products.filter((p) => !p.last_video).length,
    site: { orders: snap.site.orders, revenue: snap.site.revenue },
    mercadolivre: ml ? { orders: ml.orders } : null,
    top: snap.products.filter((p) => p.score > 0).slice(0, 15).map((p) => ({ name: p.name, site_qty: p.site_qty, ml_qty: p.ml_qty, url: p.url, image: p.images[0] ?? null })),
  };
  const videoPicks = picks.map((p) => ({ id: p.id, name: p.name, url: p.url, images: p.images, description: p.description, sold: p.site_qty + p.ml_qty, image: p.images[0] ?? null }));
  const { data: row, error } = await db.from("strategies").insert({
    user_id: userId,
    input: { tiktok: input.tiktok ?? null, goal },
    data: summary,
    plan,
    video_picks: videoPicks,
  }).select().single();
  if (error) throw error;
  return row;
}
