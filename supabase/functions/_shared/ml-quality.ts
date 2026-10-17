/**
 * "Melhorar vitrine do ML": lê a Qualidade (/item/{id}/performance) e a Experiência de compra de cada anúncio
 * ativo, corrige sozinho o que dá (fotos, título, ficha, descrição, estoque — refazendo o anúncio pela
 * sincronização) e lista o que depende do lojista (Premium, Envios Flex, vídeo curto...).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ml, mlSellerItems, mlTokenFor } from "./mercadolivre.ts";
import { requeueProducts, storeIdsByListing, type MlSync } from "./ml-sync.ts";

type Rule = { key: string; title: string };
type ItemQuality = { id: string; title: string; score: number | null; level: string | null; pending: Rule[]; experience?: { color: string; text: string } };

/** Regras que o Studio corrige sozinho refazendo o anúncio, e o que ele faz em cada uma. */
const AUTO: [RegExp, string][] = [
  [/PICTURE/, "Fotos: o Studio gera um close e uma foto de lado do pin (fundo branco) para o anúncio ter pelo menos 3"],
  [/TITLE/, "Título refeito com o nome do pin"],
  [/TECHNICAL_SPEC|^UP_TS_/, "Ficha técnica preenchida de novo"],
  [/GTIN/, "Código universal informado como produto próprio (sem código de barras)"],
  [/STOCK/, "Estoque em 200 e sem prazo de disponibilidade"],
  [/DESCRIPTION/, "Descrição no padrão da Brax Pins Mania"],
];

/** Regras que dependem do lojista, com o que fazer. */
const OWNER: [RegExp, string][] = [
  [/LISTING_TYPE_PREMIUM|FINANCING/, "Parcelamento sem juros só existe no anúncio Premium (tarifa maior que o Clássico). Se quiser, use \"Ativar Premium\"."],
  [/FLEX/, "Envios Flex (entrega no mesmo dia): precisa aderir no Mercado Livre em Vendas → Preferências de envio → Envios Flex."],
  [/SHORTS|CLIP|VIDEO/, "Vídeo curto (até 1 min, vertical): suba pelo app do Mercado Livre no anúncio. Os vídeos de produto do Studio servem."],
  [/FREE_SHIPPING/, "Frete grátis: decisão de preço sua (o ML desconta o frete da venda)."],
];

const autoFix = (key: string) => AUTO.find(([re]) => re.test(key))?.[1] ?? null;
const ownerFix = (key: string) => OWNER.find(([re]) => re.test(key))?.[1] ?? null;

/** Regras pendentes da resposta de qualidade do ML (buckets → variables → rules). */
// deno-lint-ignore no-explicit-any
function pendingRules(perf: any): Rule[] {
  const out: Rule[] = [];
  for (const b of perf?.buckets ?? []) {
    for (const v of b.variables ?? []) {
      if (v.status !== "PENDING") continue;
      const rules = (v.rules ?? []).filter((r: { status?: string }) => r.status === "PENDING");
      if (!rules.length) out.push({ key: v.key, title: v.title ?? v.key });
      for (const r of rules) out.push({ key: r.key ?? v.key, title: v.title ?? r.wordings?.title ?? r.key });
    }
  }
  return out;
}

/** Resumo da experiência de compra: o motivo mais comum e o que fazer. */
function experienceSummary(results: ItemQuality[]) {
  const bad = results.filter((r) => r.experience);
  if (!bad.length) return null;
  const delays = bad.filter((r) => /atras/i.test(r.experience!.text)).length;
  const claims = bad.filter((r) => /reclama/i.test(r.experience!.text)).length;
  const parts = [`${bad.length} anúncios com experiência de compra ${bad[0].experience!.color === "red" ? "ruim" : "regular"}.`];
  if (delays) parts.push(`Motivo em ${delays}: atraso no envio acima da média. Despache no mesmo dia da venda (antes do horário de coleta/postagem) e mantenha o prazo de envio do ML.`);
  if (claims) parts.push(`${claims} com reclamações: responda rápido e resolva pelo ML antes da mediação.`);
  return parts.join(" ");
}

/** Roda fn em todos os itens, n de cada vez. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

async function mlAccount(db: SupabaseClient, userId: string) {
  const { data } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", "mercadolivre").order("connected_at").limit(1).maybeSingle();
  return data;
}

/**
 * Analisa todos os anúncios ativos e, com fix, põe na fila da sincronização os que têm algo que o Studio corrige.
 * O relatório fica em social_accounts.meta.ml_quality (o app mostra).
 */
export async function improveMlShowcase(db: SupabaseClient, userId: string, opts: { fix?: boolean } = {}) {
  const acc = await mlAccount(db, userId);
  if (!acc) throw new Error("Conecte o Mercado Livre em Contas");
  const token = await mlTokenFor(db, acc.id);
  const items = await mlSellerItems(token, acc.external_id, 1000, "active", ["id", "title", "sold_quantity", "listing_type_id"]);

  const results: ItemQuality[] = await pool(items, 8, async (it) => {
    // deno-lint-ignore no-explicit-any
    const perf = await ml<any>(token, `/item/${it.id}/performance`).catch(() => null);
    const q: ItemQuality = { id: it.id, title: it.title, score: perf?.score ?? null, level: perf?.level_wording ?? null, pending: pendingRules(perf) };
    if ((it.sold_quantity ?? 0) > 0) {
      // deno-lint-ignore no-explicit-any
      const exp = await ml<any>(token, `/reputation/items/${it.id}/purchase_experience/integrators?locale=pt_BR`).catch(() => null);
      const color = exp?.reputation?.color;
      if (color && color !== "gray") {
        // deno-lint-ignore no-explicit-any
        const text = [exp.title?.text, exp.reasoning?.title?.text, ...(exp.reasoning?.subtitles ?? []).map((s: any) => s.text), exp.recommendations?.title?.text]
          .filter(Boolean).join(" · ");
        q.experience = { color, text };
      }
    }
    return q;
  });

  const scored = results.filter((r) => r.score !== null);
  const levels: Record<string, number> = {};
  for (const r of scored) levels[r.level ?? "?"] = (levels[r.level ?? "?"] ?? 0) + 1;
  const rules = new Map<string, { key: string; title: string; count: number; auto: string | null; owner: string | null }>();
  for (const r of results) {
    for (const p of r.pending) {
      const cur = rules.get(p.key) ?? { key: p.key, title: p.title, count: 0, auto: autoFix(p.key), owner: ownerFix(p.key) };
      cur.count++;
      rules.set(p.key, cur);
    }
  }
  const list = [...rules.values()].sort((a, b) => b.count - a.count);

  let queued = 0;
  if (opts.fix) {
    const toFix = results.filter((r) => r.pending.some((p) => autoFix(p.key))).map((r) => r.id);
    const byListing = storeIdsByListing(acc.meta?.ml_sync as MlSync | undefined);
    const ids = [...new Set(toFix.map((id) => byListing.get(id)).filter((x): x is number => x !== undefined))];
    queued = await requeueProducts(db, acc.id, ids);
  }

  const report = {
    at: new Date().toISOString(),
    listings: items.length,
    score: scored.length ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length) : null,
    levels,
    auto: list.filter((r) => r.auto).map((r) => ({ title: r.title, count: r.count, fix: r.auto })),
    owner: list.filter((r) => !r.auto).map((r) => ({ title: r.title, count: r.count, todo: r.owner ?? "O Mercado Livre sugere isso; o Studio ainda não faz sozinho." })),
    experience: results.filter((r) => r.experience).map((r) => ({ id: r.id, title: r.title, ...r.experience! })),
    experience_summary: experienceSummary(results),
    worst: [...scored].sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 10).map((r) => ({ id: r.id, title: r.title, score: r.score, level: r.level })),
    queued,
    minutes: Math.ceil(queued / 3),
    premium: items.filter((i) => i.listing_type_id === "gold_pro").length,
  };
  const { data } = await db.from("social_accounts").select("meta").eq("id", acc.id).single();
  await db.from("social_accounts").update({ meta: { ...(data?.meta ?? {}), ml_quality: report } }).eq("id", acc.id);
  return report;
}

/**
 * Passa os anúncios ativos para Premium (parcelamento sem juros, tarifa maior). Só quando o lojista pede.
 */
export async function setMlPremium(db: SupabaseClient, userId: string) {
  const acc = await mlAccount(db, userId);
  if (!acc) throw new Error("Conecte o Mercado Livre em Contas");
  const token = await mlTokenFor(db, acc.id);
  const items = (await mlSellerItems(token, acc.external_id, 1000, "active", ["id", "listing_type_id"])).filter((i) => i.listing_type_id !== "gold_pro");
  const errors: string[] = [];
  let changed = 0;
  await pool(items, 4, async (it) => {
    try {
      await ml(token, `/items/${it.id}/listing_type`, { method: "POST", body: { id: "gold_pro" } });
      changed++;
    } catch (e) {
      if (errors.length < 5) errors.push(`${it.id}: ${e instanceof Error ? e.message : e}`);
    }
  });
  return { changed, total: items.length, errors };
}
