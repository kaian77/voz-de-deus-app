// Motor de estratégia: junta as vendas do site (Nuvemshop) e do Mercado Livre, os números do TikTok que o dono
// colar, os vídeos já feitos e as datas que vêm aí, e a IA monta um plano para vender mais no TikTok e no site
// e ganhar seguidores. Também escolhe os produtos que mais merecem vídeo novo (um vídeo por produto).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { brandContext, generateJSON, researchWeb } from "./claude.ts";
import { ns, storeFor, txt } from "./nuvemshop.ts";
import { ml, mlTokenFor } from "./mercadolivre.ts";
import { shopee, shopeeTokenFor } from "./shopee.ts";
import { upcomingDates } from "./content-ideas.ts";

const DAYS = 90;

export type StoreProduct = { id: number; name: string; url: string | null; images: string[]; price: number | null; description: string };
export type ProductStat = StoreProduct & { site_qty: number; site_revenue: number; ml_qty: number; shopee_qty: number; last_video: string | null; score: number };

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

export async function storeProducts(token: string, storeId: string): Promise<StoreProduct[]> {
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

async function shopeeOrders(db: SupabaseClient, userId: string, since: Date) {
  const { data: acc } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", "shopee").order("connected_at").limit(1).maybeSingle();
  if (!acc) return null;
  const token = await shopeeTokenFor(db, acc.id, acc.external_id);
  const sns: string[] = [];
  // A Shopee só aceita janelas de até 15 dias
  for (let end = Date.now(); end > since.getTime() && sns.length < 300; end -= 15 * 86400_000) {
    const from = Math.max(since.getTime(), end - 15 * 86400_000);
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const r = await shopee<{ order_list?: { order_sn: string; order_status: string }[]; more?: boolean; next_cursor?: string }>(token, acc.external_id, "/api/v2/order/get_order_list", {
        params: { time_range_field: "create_time", time_from: Math.floor(from / 1000), time_to: Math.floor(end / 1000), page_size: 100, cursor, response_optional_fields: "order_status" },
      });
      sns.push(...(r.order_list ?? []).filter((o) => !["UNPAID", "CANCELLED", "IN_CANCEL"].includes(o.order_status)).map((o) => o.order_sn));
      if (!r.more || !r.next_cursor) break;
      cursor = r.next_cursor;
    }
  }
  const items: { title: string; qty: number; total: number }[] = [];
  for (let i = 0; i < sns.length; i += 50) {
    const d = await shopee<{ order_list?: any[] }>(token, acc.external_id, "/api/v2/order/get_order_detail", {
      params: { order_sn_list: sns.slice(i, i + 50).join(","), response_optional_fields: "item_list" },
    });
    for (const o of d.order_list ?? []) {
      for (const it of o.item_list ?? []) {
        const qty = Number(it.model_quantity_purchased ?? 1);
        items.push({ title: it.item_name ?? "", qty, total: qty * Number(it.model_discounted_price ?? it.model_original_price ?? 0) });
      }
    }
  }
  return { orders: sns.length, items };
}

/** Dados de vendas e conteúdo dos últimos 90 dias, por produto. */
export async function salesSnapshot(db: SupabaseClient, userId: string) {
  const store = await storeFor(db, userId);
  if (!store) throw new Error("Conecte a Nuvemshop em Contas");
  const since = new Date(Date.now() - DAYS * 86400_000);
  const [products, orders, mlData, shopeeData, videos] = await Promise.all([
    storeProducts(store.token, store.storeId),
    siteOrders(store.token, store.storeId, since),
    mlOrders(db, userId, since).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
    shopeeOrders(db, userId, since).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
    db.from("product_videos").select("name, created_at, status").eq("user_id", userId).neq("status", "failed").order("created_at", { ascending: false }).limit(1000),
  ]);

  const stats = new Map<number, ProductStat>(products.map((p) => [p.id, { ...p, site_qty: 0, site_revenue: 0, ml_qty: 0, shopee_qty: 0, last_video: null, score: 0 }]));
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

  // Vendas do ML e da Shopee casadas com os produtos da loja pelo nome
  const keyed = [...stats.values()].map((s) => ({ s, w: words(s.name) }));
  const matchInto = (items: { title: string; qty: number }[], field: "ml_qty" | "shopee_qty") => {
    const unmatched = new Map<string, number>();
    for (const it of items) {
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
      if (best >= 0 && bestScore >= 0.6) keyed[best].s[field] += it.qty;
      else unmatched.set(it.title, (unmatched.get(it.title) ?? 0) + it.qty);
    }
    return [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 20);
  };
  const mlUnmatched = matchInto(mlData && "items" in mlData ? mlData.items : [], "ml_qty");
  const shopeeUnmatched = matchInto(shopeeData && "items" in shopeeData ? shopeeData.items : [], "shopee_qty");

  // Último vídeo de cada produto
  for (const v of videos.data ?? []) {
    const w = words(v.name);
    for (const k of keyed) {
      if (!k.s.last_video && similarity(w, k.w) >= 0.8) k.s.last_video = v.created_at;
    }
  }

  for (const s of stats.values()) s.score = s.site_qty * 2 + s.ml_qty + s.shopee_qty;
  const ranked = [...stats.values()].sort((a, b) => b.score - a.score || (b.price ?? 0) - (a.price ?? 0));
  return {
    days: DAYS,
    products: ranked,
    site: { orders: orders.length, revenue: Math.round(siteRevenue * 100) / 100, unmatched: [...byName].slice(0, 20) },
    mercadolivre: mlData && "items" in mlData ? { orders: mlData.orders, unmatched: mlUnmatched } : mlData,
    shopee: shopeeData && "items" in shopeeData ? { orders: shopeeData.orders, unmatched: shopeeUnmatched } : shopeeData,
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

const Channel = z.enum(["tiktok", "shopee", "mercadolivre", "site", "instagram", "geral"]);

const Plan = z.object({
  summary: z.string().describe("Resumo em 2-3 frases da situação e da principal oportunidade"),
  diagnosis: z.array(z.object({ title: z.string(), detail: z.string() })).describe("3 a 5 pontos do que os números mostram"),
  market: z.object({
    trends: z.array(z.string()).describe("Tendências e temas em alta para o nicho, vindos da pesquisa"),
    competitors: z.array(z.object({ name: z.string(), channel: z.string(), insight: z.string() })).describe("Concorrentes e o que fazem bem ou mal"),
    prices: z.string().describe("Faixa de preço praticada no mercado (só se a pesquisa trouxe) e como a marca se posiciona"),
    opportunities: z.array(z.string()).describe("Brechas que a marca pode aproveitar"),
  }).describe("Pesquisa de mercado resumida (use só o que veio da pesquisa; sem pesquisa, diga isso)"),
  priorities: z.array(z.object({
    title: z.string(),
    why: z.string(),
    channel: Channel,
    actions: z.array(z.string()).describe("Passos concretos, curtos, que o dono consegue fazer esta semana"),
    products: z.array(z.string()).describe("Nomes exatos de produtos da lista, se a prioridade for sobre produtos"),
  })).describe("4 a 6 prioridades, da mais importante para a menos"),
  channels: z.array(z.object({
    channel: Channel,
    goal: z.string().describe("Meta do canal para as próximas semanas"),
    actions: z.array(z.string()).describe("3 a 6 melhores práticas aplicadas à marca (título/SEO, fotos, frete, avaliações, anúncios, conteúdo)"),
  })).describe("Plano por canal: TikTok Shop, Shopee, Mercado Livre, site e Instagram"),
  followers: z.object({
    strategy: z.string(),
    rhythm: z.string().describe("Frequência e horários de postagem sugeridos"),
    actions: z.array(z.string()).describe("Táticas para ganhar seguidores que viram compradores (séries, trends, colabs, lives, UGC, sorteios)"),
  }),
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

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const GOAL = "Vender mais no TikTok Shop, na Shopee, no Mercado Livre e no site; ganhar seguidores e transformar seguidores em compradores.";

/**
 * Etapa 1: lê as vendas e cria a estratégia (status "research"). `tiktok` é o texto que o dono colou com os
 * números do TikTok/GMV Max. Guarda os candidatos a vídeo e o resumo dos dados para as próximas etapas.
 */
export async function startStrategy(db: SupabaseClient, userId: string, input: { tiktok?: string; goal?: string }) {
  const snap = await salesSnapshot(db, userId);
  const { data: accounts } = await db.from("social_accounts").select("platform, username, followers_count").eq("user_id", userId);
  const goal = input.goal?.trim() || GOAL;
  const top = snap.products.filter((p) => p.score > 0).slice(0, 40).map((p) =>
    `- ${p.name} | site: ${p.site_qty} un (${brl(p.site_revenue)}) | ML: ${p.ml_qty} un | Shopee: ${p.shopee_qty} un | preço ${p.price != null ? brl(p.price) : "?"} | vídeo: ${p.last_video ? p.last_video.slice(0, 10) : "nunca"}`);
  const noSales = snap.products.filter((p) => p.score === 0);
  const ml = snap.mercadolivre && "orders" in snap.mercadolivre ? snap.mercadolivre : null;
  const sp = snap.shopee && "orders" in snap.shopee ? snap.shopee : null;
  const channelLine = (name: string, c: any, ok: { orders: number } | null) =>
    ok ? `${name}: ${ok.orders} pedidos pagos.\n` : c ? `${name}: não consegui ler (${c.error}).\n` : `${name}: não conectado.\n`;
  const prices = snap.products.map((p) => p.price).filter((n): n is number => n != null).sort((a, b) => a - b);

  const prompt =
    `Período: últimos ${snap.days} dias.\n` +
    `Contas: ${(accounts ?? []).map((a) => `${a.platform}${a.username ? ` (${a.username}${a.followers_count ? `, ${a.followers_count} seguidores` : ""})` : ""}`).join(", ")}\n` +
    `Catálogo: ${snap.products.length} produtos publicados (preços de ${prices.length ? brl(prices[0]) : "?"} a ${prices.length ? brl(prices[prices.length - 1]) : "?"}); ` +
    `${noSales.length} sem nenhuma venda no período; ${snap.products.filter((p) => !p.last_video).length} nunca tiveram vídeo.\n` +
    `Site (Nuvemshop): ${snap.site.orders} pedidos pagos, ${brl(snap.site.revenue)}.\n` +
    channelLine("Mercado Livre", snap.mercadolivre, ml) + channelLine("Shopee", snap.shopee, sp) +
    `\nMais vendidos (site + ML + Shopee):\n${top.join("\n") || "(nenhuma venda registrada)"}\n` +
    (ml?.unmatched.length ? `\nVendas do ML sem produto correspondente na loja: ${ml.unmatched.slice(0, 10).map(([t, q]) => `${t} (${q})`).join("; ")}\n` : "") +
    (sp?.unmatched.length ? `\nVendas da Shopee sem produto correspondente na loja: ${sp.unmatched.slice(0, 10).map(([t, q]) => `${t} (${q})`).join("; ")}\n` : "") +
    `\nAlguns produtos sem venda: ${noSales.slice(0, 40).map((p) => p.name).join("; ")}\n` +
    `\nDatas e campanhas que vêm aí: ${snap.dates.dates.map((d) => `${d.date} ${d.name}`).join("; ")}; campanhas do mês: ${snap.dates.campaigns.join(", ")}\n` +
    (input.tiktok?.trim() ? `\nNúmeros do TikTok/TikTok Shop informados pelo dono:\n${input.tiktok.trim().slice(0, 3000)}\n` : "\nTikTok: o dono não informou números desta vez.\n");

  const summary = {
    period_days: snap.days,
    products: snap.products.length,
    products_without_sales: noSales.length,
    products_without_video: snap.products.filter((p) => !p.last_video).length,
    site: { orders: snap.site.orders, revenue: snap.site.revenue },
    mercadolivre: ml ? { orders: ml.orders } : null,
    shopee: sp ? { orders: sp.orders } : null,
    top: snap.products.filter((p) => p.score > 0).slice(0, 15).map((p) => ({ name: p.name, site_qty: p.site_qty, ml_qty: p.ml_qty, shopee_qty: p.shopee_qty, url: p.url, image: p.images[0] ?? null })),
    top_themes: top.slice(0, 15).map((l) => l.split(" | ")[0].slice(2)),
    prompt,
  };
  // Candidatos a vídeo (mais do que 50): a etapa final reordena pelos produtos que o plano destacar
  const candidates = pickVideoProducts(snap.products, 150).map((p) => ({
    id: p.id, name: p.name, url: p.url, images: p.images, description: p.description, sold: p.site_qty + p.ml_qty + p.shopee_qty, image: p.images[0] ?? null,
  }));
  const { data: row, error } = await db.from("strategies").insert({
    user_id: userId, input: { tiktok: input.tiktok ?? null, goal }, data: summary, plan: {}, video_picks: candidates, status: "research",
  }).select("id, status").single();
  if (error) throw error;
  return row;
}

/** Etapa 2: pesquisa de mercado na web (reaproveita a da semana se já houver). */
export async function researchStrategy(db: SupabaseClient, userId: string, id: string, fresh = false) {
  const { data: st } = await db.from("strategies").select("id, data").eq("id", id).eq("user_id", userId).single();
  if (!st) throw new Error("Estratégia não encontrada");
  let research: { text: string; sources: string[]; at: string } | null = null;
  if (!fresh) {
    const { data: prev } = await db.from("strategies").select("research").eq("user_id", userId).not("research", "is", null)
      .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    research = prev?.research ?? null;
  }
  if (!research) {
    const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
    const themes = (st.data?.top_themes ?? []).slice(0, 10).join("; ");
    const r = await researchWeb(
      `Você é analista de mercado de e-commerce e social commerce no Brasil. Pesquise na web e responda em português do Brasil, ` +
        `em tópicos curtos, com números e nomes concretos quando encontrar, e diga quando não encontrar algo. Não invente dados.\n\n${brandContext(settings)}`,
      `Faça uma pesquisa de mercado para esta loja de pins (bottons/broches de metal esmaltado) no Brasil.` +
        (themes ? ` Produtos que mais vendem hoje: ${themes}.` : "") + `\nQuero saber:\n` +
        `1. Demanda e tendências atuais para pins/bottons no Brasil (temas em alta: profissões, saúde/SUS, times, personagens, datas).\n` +
        `2. Concorrentes que vendem pins na Shopee, no Mercado Livre, no TikTok Shop e em lojas próprias/Instagram: quem são, faixa de preço, kits, o que fazem bem.\n` +
        `3. O que ranqueia e vende mais em cada canal hoje: Shopee (título, frete grátis, avaliações, Shopee Ads, vídeos), Mercado Livre (anúncio premium, Full, reputação, Product Ads), ` +
        `TikTok Shop (vídeos curtos, afiliados/criadores, lives, GMV Max) e loja própria (cupom, frete, prova social).\n` +
        `4. Formatos de conteúdo que mais fazem perfis de pins/acessórios e lojas pequenas ganharem seguidores no TikTok e no Instagram.\n` +
        `5. Oportunidades e brechas para uma marca pequena se destacar.`,
      6,
    );
    research = { ...r, at: new Date().toISOString() };
  }
  await db.from("strategies").update({ research, status: "plan" }).eq("id", st.id);
  return { id: st.id, status: "plan", sources: research.sources.length };
}

/** Etapa 3: a IA monta o plano com as vendas + a pesquisa e escolhe os 50 produtos para vídeo. */
export async function finishStrategy(db: SupabaseClient, userId: string, id: string) {
  const { data: st } = await db.from("strategies").select("*").eq("id", id).eq("user_id", userId).single();
  if (!st) throw new Error("Estratégia não encontrada");
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
  const research = st.research?.text ? `\n\nPesquisa de mercado (web, ${String(st.research.at).slice(0, 10)}):\n${String(st.research.text).slice(0, 12000)}` : "\n\nPesquisa de mercado: não disponível desta vez.";

  const plan = await generateJSON(Plan,
    `Você é estrategista sênior de e-commerce e social commerce no Brasil (TikTok Shop, Shopee, Mercado Livre, loja própria Nuvemshop e Instagram). ` +
      `Monte as MELHORES estratégias para vender mais e ganhar seguidores, apoiadas nos dados da loja e na pesquisa de mercado, ` +
      `em português do Brasil, direto e prático, para quem cuida da loja sozinho e usa o celular.\n` +
      `Regras:\n- Números da loja: use SOMENTE os dados dados; nunca invente vendas, seguidores, ROI ou preços. Dados de mercado: só o que veio da pesquisa.\n` +
      `- No TikTok: nada de "link na bio", site ou URL no vídeo nem na legenda (dá violação no TikTok Shop); a venda lá é pelo produto marcado no vídeo.\n` +
      `- O agente de mensagens nunca informa preço (variam por modelo e kits).\n` +
      `- Cite produtos pelo nome exato da lista.\n- Prefira ações que o Studio já faz: vídeos de produto automáticos, posts e carrosséis agendados, ` +
      `automação de comentários "EU QUERO" com link no direct do Instagram, cupons na Nuvemshop, anúncios GMV Max no TikTok Shop, publicar no Mercado Livre, ` +
      `aviso de venda no WhatsApp. Ações fora do Studio (ex.: Shopee Ads, afiliados do TikTok) podem entrar, explicadas passo a passo.\n\n${brandContext(settings)}`,
    `Objetivo: ${st.input?.goal ?? GOAL}\n\nDados da loja:\n${st.data?.prompt ?? ""}${research}\n\nMonte a estratégia.`,
    "medium");

  // Os 50 vídeos: primeiro os produtos que o plano destacou, depois os candidatos na ordem das vendas
  const wanted = [...plan.priorities.flatMap((p) => p.products), ...plan.tiktok_ads.products, ...plan.kits.flatMap((k) => k.products)].map(words);
  const cands = (st.video_picks ?? []) as { name: string }[];
  const boosted = cands.filter((c) => wanted.some((w) => similarity(w, words(c.name)) >= 0.6));
  const picks = [...boosted, ...cands.filter((c) => !boosted.includes(c))].slice(0, 50);
  const { prompt: _prompt, ...data } = st.data ?? {};
  const { data: row, error } = await db.from("strategies").update({ plan, video_picks: picks, data, status: "done" }).eq("id", st.id).select().single();
  if (error) throw error;
  return row;
}
