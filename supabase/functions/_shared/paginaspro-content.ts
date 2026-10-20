// Piloto automático do Instagram da PáginasPro (@paginasproo), separado do da loja: carrosséis educativos e de
// venda de sites para negócios locais, nas cores da PáginasPro (tema "paginaspro" do carrossel). Só posta na conta
// marcada como PáginasPro e tudo cai em Aprovações.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { isPaginasPro } from "./brand.ts";
import { aiEnabled, generateJSON } from "./claude.ts";
import { upcomingDates } from "./content-ideas.ts";

const Idea = z.object({
  key: z.string().describe("identificador único do tema, minúsculo com hífens, ex.: 'cliente-nao-acha-no-google'"),
  theme: z.string().describe("tema em poucas palavras"),
  format: z.enum(["carousel", "reel"]).describe("reel = vídeo vertical curto feito dos slides (4 a 6 slides, títulos curtos e fortes); carousel = carrossel"),
  pillar: z.enum(["educa", "mostra", "prova", "oferta"]).describe(
    "educa = por que ter site / dicas; mostra = como funciona, prévia, animações do Premium; prova = bastidores e processo real; oferta = planos e chamada"),
  why: z.string().describe("1 frase: por que este post e para quem"),
  caption: z.string().describe("legenda: gancho na 1ª linha, 3 a 6 linhas curtas, termina com chamada para o direct ou o link da bio; no máximo 2 emojis; sem hashtags aqui"),
  hashtags: z.array(z.string()).describe("5 a 8 hashtags sem #, em português, ligadas a negócio local e site"),
  slides: z.array(z.object({
    title: z.string().describe("até 9 palavras; destaque 1 ou 2 palavras com *asteriscos*"),
    body: z.string().describe("até 28 palavras; pode ser vazio na capa"),
  })).describe("5 a 7 slides: capa com gancho, conteúdo em passos ou lista, último slide com chamada"),
});

const Ideas = z.object({ ideas: z.array(Idea) });

const PLANS = (o: Record<string, unknown> | null) => {
  const n = (k: string, d: number) => Number(o?.[k] ?? d);
  return `site avulso R$ ${n("oneTime", 397)} (pagamento único) ou R$ ${n("monthly", 59)}/mês com painel e alterações; ` +
    `Premium animado R$ ${n("premiumOneTime", 997)} ou R$ ${n("premiumMonthly", 129)}/mês`;
};

/** "2026-10-18" + "12:10" em Brasília -> ISO UTC (Brasília é UTC-3 o ano todo). */
const brt = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`).toISOString();

/** Próximos horários livres da conta da PáginasPro (12h10 e 18h40, um post por dia no máximo). */
async function slots(db: SupabaseClient, userId: string, accountId: string, count: number) {
  const { data } = await db.from("posts").select("scheduled_at,options").eq("user_id", userId)
    .in("status", ["pending_approval", "scheduled"]).gte("scheduled_at", new Date().toISOString());
  const busyDays = new Set((data ?? []).filter((p) => p.options?.account_ids?.instagram === accountId)
    .map((p) => new Date(new Date(p.scheduled_at).getTime() - 3 * 3600_000).toISOString().slice(0, 10)));
  const out: string[] = [];
  for (let d = 1; out.length < count && d < 60; d++) {
    const day = new Date(Date.now() - 3 * 3600_000 + d * 86400_000).toISOString().slice(0, 10);
    // Dias alternados para não encher o feed; com poucos posts por semana sobram dias livres
    if (busyDays.has(day) || (count <= 4 && d % 2 === 0)) continue;
    out.push(brt(day, out.length % 2 ? "18:40" : "12:10"));
    busyDays.add(day);
  }
  return out;
}

async function usedKeys(db: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 200 * 86400_000).toISOString();
  const { data } = await db.from("posts").select("options").eq("user_id", userId).gte("created_at", since);
  return new Set((data ?? []).filter((p) => p.options?.brand === "paginaspro").map((p) => String(p.options?.idea?.key ?? "")).filter(Boolean));
}

/** Cria `count` carrosséis da PáginasPro em Aprovações. */
export async function generatePaginasproIdeas(db: SupabaseClient, userId: string, opts: { count?: number; focus?: string } = {}) {
  if (!aiEnabled()) throw new Error("Configure ANTHROPIC_API_KEY para o Studio criar conteúdo sozinho.");
  const count = Math.min(Math.max(opts.count ?? 3, 1), 7);
  const { data: accounts } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", "instagram");
  const ig = (accounts ?? []).find((a) => isPaginasPro(a.meta));
  if (!ig) throw new Error("Conecte o Instagram da PáginasPro em Contas (marca PáginasPro).");
  const { data: settings } = await db.from("brand_settings").select("landing_offer").eq("user_id", userId).maybeSingle();
  const { count: sites } = await db.from("landing_pages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "published");
  const used = await usedKeys(db, userId);
  const { dates } = upcomingDates(new Date(), 21);
  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const { ideas } = await generateJSON(Ideas,
    "Você planeja o Instagram da PáginasPro, o serviço do Bruno Braga que faz sites (landing pages) para pequenos negócios " +
      "locais: salões, maquiadoras, barbearias, clínicas, nutricionistas, dentistas, advogados, pet shops, prestadores de serviço. " +
      "Escreva em português do Brasil, falando como o Bruno ('eu faço', 'te mando'): direto, próximo e honesto. " +
      "Regras: nada de promessa de resultado ('vai dobrar seus clientes'), números ou estatísticas inventadas, depoimentos " +
      "ou clientes inventados, 'fique rico' ou clichê de IA. Pode explicar o que é verdade sobre o serviço: o cliente manda " +
      "o @ do Instagram, fotos, endereço, horário e serviços; eu monto uma prévia grátis em 24 h; o site abre no celular, " +
      "tem botão de WhatsApp e de 'como chegar', aparece no Google com o tempo e pode ter domínio próprio; plano mensal tem " +
      "painel com visitas e cliques no WhatsApp e alterações inclusas; o Premium tem animações do ramo (ex.: dente em " +
      "camadas para dentista, make em etapas para maquiadora, prato para nutri). " +
      `Planos atuais: ${PLANS(settings?.landing_offer ?? null)}. Site: paginaspro.app.br. Contato pelo direct ou WhatsApp.`,
    `Hoje é ${today}.\nDatas dos próximos dias (use só se combinar com negócio local, ex.: Dia do Cliente, Black Friday, Natal, ` +
      `ou dia de uma profissão para falar com aquele ramo):\n${dates.map((d) => `- ${d.date}: ${d.name}`).join("\n") || "- (nenhuma)"}\n\n` +
      `Sites publicados até agora: ${sites ?? 0}${sites ? "" : " (ainda não há clientes para mostrar: não fale de clientes ou resultados)"}.\n` +
      `${opts.focus ? `Pedido do Bruno: ${opts.focus}\n` : ""}` +
      `Temas já usados (não repita): ${[...used].join(", ") || "nenhum"}.\n\n` +
      `Crie ${count} posts variados (cerca de 1 em cada 3 como "reel", o resto "carousel") (misture os pilares educa, mostra, prova e oferta; no máximo 1 de oferta). ` +
      `Cada carrossel fala com um tipo de negócio ou com qualquer negócio local.`,
    "medium");

  const at = await slots(db, userId, ig.id, count);
  const created: { key: string; theme: string; id: string; scheduled_at: string }[] = [];
  for (const [i, idea] of ideas.slice(0, count).entries()) {
    if (used.has(idea.key) || !at[i]) continue;
    used.add(idea.key);
    const caption = `${idea.caption.trim()}\n\n${idea.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`;
    const { data, error } = await db.from("posts").insert({
      user_id: userId,
      title: `PáginasPro: ${idea.theme}`,
      kind: idea.format === "reel" ? "reel" : "carousel",
      platforms: ["instagram"],
      caption,
      media: [],
      slides: idea.slides.slice(0, idea.format === "reel" ? 6 : 8).map((s) => ({ title: s.title, ...(s.body ? { body: s.body } : {}) })),
      design: { theme: "paginaspro", handle: `@${ig.username}` },
      scheduled_at: at[i],
      status: "pending_approval",
      created_by: "agent",
      notes: idea.why,
      options: { brand: "paginaspro", account_ids: { instagram: ig.id }, idea: { key: idea.key, theme: idea.theme, why: idea.why, pillar: idea.pillar } },
    }).select("id").single();
    if (error) {
      console.error("ideia paginaspro", idea.key, error);
      continue;
    }
    created.push({ key: idea.key, theme: idea.theme, id: data.id, scheduled_at: at[i] });
  }
  return { created };
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Cron: uma vez por semana por usuário com o piloto da PáginasPro ligado e o Instagram da PáginasPro conectado. */
export async function runPaginasproAutopilot(db: SupabaseClient) {
  if (!aiEnabled()) return null;
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: due } = await db.from("brand_settings").select("user_id,pp_autopilot_per_week,pp_autopilot_last_run")
    .eq("pp_autopilot_enabled", true).or(`pp_autopilot_last_run.is.null,pp_autopilot_last_run.lt."${weekAgo}"`).limit(5);
  for (const row of due ?? []) {
    const { data: accounts } = await db.from("social_accounts").select("meta").eq("user_id", row.user_id).eq("platform", "instagram");
    if (!(accounts ?? []).some((a) => isPaginasPro(a.meta))) continue;
    // Mesma trava do piloto da loja: data provisória (nova tentativa em 2 h) até a rodada terminar
    const provisional = new Date(Date.now() - 7 * 86400_000 + 2 * 3600_000).toISOString();
    let claim = db.from("brand_settings").update({ pp_autopilot_last_run: provisional }).eq("user_id", row.user_id);
    claim = row.pp_autopilot_last_run ? claim.eq("pp_autopilot_last_run", row.pp_autopilot_last_run) : claim.is("pp_autopilot_last_run", null);
    const { data: claimed } = await claim.select("user_id").maybeSingle();
    if (!claimed) continue;
    const job = generatePaginasproIdeas(db, row.user_id, { count: row.pp_autopilot_per_week ?? 3 })
      .then(() => db.from("brand_settings").update({ pp_autopilot_last_run: new Date().toISOString(), pp_autopilot_error: null }).eq("user_id", row.user_id))
      .catch((e) => {
        console.error("piloto paginaspro", row.user_id, e);
        return db.from("brand_settings").update({
          pp_autopilot_last_run: new Date(Date.now() - 7 * 86400_000 + 3600_000).toISOString(),
          pp_autopilot_error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
        }).eq("user_id", row.user_id);
      });
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
    else await job;
    return { user_id: row.user_id };
  }
  return null;
}
