// Piloto automático de conteúdo: olha as datas comemorativas que vêm aí, os produtos da loja e o que o público
// do Instagram curte, e combina campanhas com conteúdo perene de identificação, uso e coleção. Tudo fica em
// Aprovações; dali o usuário aprova, agenda em massa ou publica na hora.
import { isBrax } from "./brand.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { aiEnabled, brandContext, generateJSON } from "./claude.ts";
import { igMediaInsights, igRecentMedia, igTokenFor } from "./instagram.ts";
import { nsProducts, storeFor } from "./nuvemshop.ts";
import { dispatchRender } from "./product-video.ts";
import { freeSlot } from "./products.ts";

// ---------------------------------------------------------------------------
// Datas comemorativas (Brasil)
// ---------------------------------------------------------------------------

const MONTHS: Record<number, string> = {
  1: "Janeiro Branco (saúde mental)",
  2: "Fevereiro Roxo e Laranja (lúpus, Alzheimer, leucemia)",
  3: "Março Lilás (câncer do colo do útero)",
  4: "Abril Azul (autismo)",
  5: "Maio Amarelo (segurança no trânsito)",
  6: "Junho Vermelho (doação de sangue)",
  7: "Julho Amarelo (hepatites virais)",
  8: "Agosto Dourado (aleitamento materno)",
  9: "Setembro Amarelo (prevenção do suicídio)",
  10: "Outubro Rosa (câncer de mama)",
  11: "Novembro Azul (saúde do homem e câncer de próstata)",
  12: "Dezembro Vermelho (HIV/aids) e Dezembro Laranja (câncer de pele)",
};

const FIXED: [string, string][] = [
  ["01-20", "Dia do Farmacêutico"],
  ["03-08", "Dia Internacional da Mulher"],
  ["03-15", "Dia do Consumidor"],
  ["04-02", "Dia Mundial de Conscientização do Autismo"],
  ["04-07", "Dia Mundial da Saúde"],
  ["05-12", "Dia da Enfermagem e do Enfermeiro"],
  ["05-20", "Dia do Técnico e Auxiliar de Enfermagem"],
  ["05-25", "Dia do Orgulho Nerd"],
  ["06-12", "Dia dos Namorados"],
  ["07-02", "Dia do Bombeiro"],
  ["07-13", "Dia Mundial do Rock"],
  ["07-20", "Dia do Amigo"],
  ["07-26", "Dia dos Avós"],
  ["07-27", "Dia do Pediatra"],
  ["08-11", "Dia do Estudante e do Advogado"],
  ["08-27", "Dia do Psicólogo"],
  ["08-31", "Dia do Nutricionista"],
  ["09-01", "Dia do Profissional de Educação Física"],
  ["09-09", "Dia do Médico Veterinário"],
  ["09-15", "Dia do Cliente"],
  ["10-12", "Dia das Crianças"],
  ["10-13", "Dia do Fisioterapeuta e do Terapeuta Ocupacional"],
  ["10-15", "Dia do Professor"],
  ["10-17", "Dia Nacional da Vacinação"],
  ["10-18", "Dia do Médico"],
  ["10-25", "Dia do Cirurgião-Dentista"],
  ["10-31", "Halloween"],
  ["11-08", "Dia do Radiologista"],
  ["11-20", "Dia do Biomédico"],
  ["12-09", "Dia do Fonoaudiólogo"],
  ["12-11", "Dia do Engenheiro"],
  ["12-25", "Natal"],
  ["12-31", "Réveillon"],
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** N-ésimo dia da semana do mês (weekday 0 = domingo). */
function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const d = utc(year, month, 1);
  d.setUTCDate(1 + ((weekday - d.getUTCDay() + 7) % 7) + (n - 1) * 7);
  return d;
}

/** Domingo de Páscoa (algoritmo de Meeus). */
function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

function movable(year: number): [Date, string][] {
  const e = easter(year);
  const shift = (days: number) => new Date(e.getTime() + days * 86400_000);
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  return [
    [shift(-47), "Carnaval"],
    [e, "Páscoa"],
    [nthWeekday(year, 5, 0, 2), "Dia das Mães"],
    [nthWeekday(year, 8, 0, 2), "Dia dos Pais"],
    [new Date(thanksgiving.getTime() + 86400_000), "Black Friday"],
  ];
}

/** Datas e campanhas dos próximos `days` dias. */
export function upcomingDates(from: Date, days: number) {
  const end = new Date(from.getTime() + days * 86400_000);
  const out: { date: string; name: string }[] = [];
  for (const year of [from.getUTCFullYear(), from.getUTCFullYear() + 1]) {
    for (const [md, name] of FIXED) out.push({ date: `${year}-${md}`, name });
    for (const [d, name] of movable(year)) out.push({ date: iso(d), name });
  }
  const dates = out.filter((x) => x.date >= iso(from) && x.date <= iso(end)).sort((a, b) => a.date.localeCompare(b.date));
  const campaigns = [...new Set([from.getUTCMonth() + 1, end.getUTCMonth() + 1])].map((m) => MONTHS[m]);
  return { dates, campaigns };
}

// ---------------------------------------------------------------------------
// Ideias
// ---------------------------------------------------------------------------

/** Cores da marca (site da Brax Pins Mania): vermelho, preto, dourado e branco. */
export const BRAND_PALETTE = { primary: "#E3262E", secondary: "#111111", accent: "#FFC72C" };

const Hex = z.string().describe("cor em hexadecimal, ex.: #E75A8D");

const Idea = z.object({
  key: z.string().describe("identificador único do tema + ano, minúsculo com hífens, ex.: 'outubro-rosa-2026' ou 'dia-do-medico-2026'"),
  theme: z.string().describe("nome do tema, ex.: 'Outubro Rosa'"),
  date: z.string().describe("dia da publicação AAAA-MM-DD: no dia da data ou de 1 a 5 dias antes (para dar tempo de comprar)"),
  format: z.enum(["carousel", "video"]).describe("video só quando há um produto que é a cara do tema; senão carousel"),
  why: z.string().describe("1 frase: por que este post agora e para quem (ligado ao público)"),
  product_ids: z.array(z.number()).describe("1 a 4 ids de produtos da lista que combinam com o tema; vazio se nenhum combina"),
  caption: z.string().describe("legenda: gancho na 1ª linha, 2 a 5 linhas curtas, CTA; até 3 emojis; sem hashtags aqui"),
  hashtags: z.array(z.string()).describe("5 a 10 hashtags sem #"),
  palette: z.object({
    primary: Hex.describe("cor principal: a vermelha da marca, ou a do tema quando a campanha tem cor própria (ex.: rosa no Outubro Rosa)"),
    secondary: Hex.describe("tom escuro, contrasta com texto branco (o preto da marca, ou um tom escuro do tema)"),
    accent: Hex.describe("cor de destaque (o dourado da marca combina com quase tudo)"),
  }).describe(`por padrão as cores da marca: ${BRAND_PALETTE.primary}, ${BRAND_PALETTE.secondary} e ${BRAND_PALETTE.accent}`),
  slides: z.array(z.object({
    title: z.string().describe("até 8 palavras; destaque 1 ou 2 palavras com *asteriscos*"),
    body: z.string().describe("até 25 palavras; pode ser vazio"),
    product_id: z.number().nullable().describe("id do produto a mostrar neste slide, ou null"),
  })).describe("só no carousel: 4 a 7 slides (capa com gancho, conteúdo do tema, produtos, CTA); vazio no video"),
  video: z.object({
    hook: z.string().describe("abertura de até 7 palavras; destaque 1 ou 2 palavras com *asteriscos*"),
    hook_sub: z.string(),
    badge: z.string().describe("selo curto em maiúsculas, ex.: 'OUTUBRO ROSA'"),
    subtitle: z.string().describe("o que é o produto, até 5 palavras"),
    detail_title: z.string().describe("até 3 palavras"),
    detail_sub: z.string().describe("até 7 palavras"),
    features: z.array(z.string()).describe("3 frases de até 6 palavras ligando o produto ao tema"),
    cta: z.string().describe("até 3 palavras"),
    urgency: z.string().describe("frase curta com um fato real (ex.: a data) ou vazia"),
  }).nullable().describe("só no video; null no carousel"),
});

const Ideas = z.object({ ideas: z.array(Idea) });

type Product = Awaited<ReturnType<typeof nsProducts>>[number];

/** "2026-10-18" + "13:00" no fuso da marca -> ISO em UTC. */
function zoned(date: string, time: string, timeZone: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(guess).map((p) => [p.type, p.value]),
  );
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess.getTime() - (asLocal - guess.getTime())).toISOString();
}

/** Horário nobre livre no dia pedido (13h, depois 19h); se o dia já passou ou está cheio, o próximo livre. */
async function slotOn(db: SupabaseClient, userId: string, date: string, timeZone: string, taken: Set<string>) {
  for (const time of ["13:00", "19:00"]) {
    const at = zoned(date, time, timeZone);
    if (new Date(at).getTime() < Date.now() + 2 * 3600_000 || taken.has(at)) continue;
    const { count } = await db.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId)
      .eq("scheduled_at", at).in("status", ["pending_approval", "scheduled"]);
    if (!count) return at;
  }
  let at = await freeSlot(db, userId, timeZone);
  for (let i = 0; i < 10 && taken.has(at); i++) at = new Date(new Date(at).getTime() + 6 * 3600_000).toISOString();
  return at;
}

/** Copia a foto do produto para o storage do Studio (o navegador desenha o carrossel e precisa de CORS liberado). */
async function copyImage(db: SupabaseClient, userId: string, product: Product, cache: Map<number, string | null>) {
  if (cache.has(product.id)) return cache.get(product.id)!;
  let url: string | null = null;
  try {
    if (product.image) {
      const res = await fetch(product.image.startsWith("//") ? `https:${product.image}` : product.image);
      if (res.ok) {
        const type = res.headers.get("content-type") ?? "image/jpeg";
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
        const path = `${userId}/ideas/${product.id}.${ext}`;
        const { error } = await db.storage.from("media").upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: type, upsert: true });
        if (!error) url = db.storage.from("media").getPublicUrl(path).data.publicUrl;
      }
    }
  } catch (e) {
    console.error("foto do produto", product.id, e);
  }
  cache.set(product.id, url);
  return url;
}

/** Temas já usados (posts e vídeos), para não repetir. */
async function usedKeys(db: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 200 * 86400_000).toISOString();
  const [{ data: posts }, { data: videos }] = await Promise.all([
    db.from("posts").select("options").eq("user_id", userId).gte("created_at", since),
    db.from("product_videos").select("brief").eq("user_id", userId).gte("created_at", since),
  ]);
  const keys = new Set<string>();
  for (const p of posts ?? []) if (p.options?.idea?.key) keys.add(p.options.idea.key);
  for (const v of videos ?? []) if (v.brief?.idea_key) keys.add(v.brief.idea_key);
  return keys;
}

/** Cria `count` ideias de conteúdo (carrosséis em Aprovações e vídeos na fila de renderização). */
export async function generateIdeas(db: SupabaseClient, userId: string, opts: { count?: number; days?: number; focus?: string } = {}) {
  if (!aiEnabled()) throw new Error("Configure ANTHROPIC_API_KEY para o Studio criar conteúdo sozinho.");
  const count = Math.min(Math.max(opts.count ?? 4, 1), 8);
  const days = opts.days ?? 21;
  const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
  const timeZone = settings?.timezone ?? "America/Sao_Paulo";
  // Piloto automático da loja: contas da PáginasPro ficam de fora
  const { data: allAccounts } = await db.from("social_accounts").select("*").eq("user_id", userId).in("platform", ["instagram", "tiktok"]).order("connected_at");
  const accounts = (allAccounts ?? []).filter((a) => isBrax(a.meta));
  const platforms = [...new Set((accounts ?? []).map((a) => a.platform as string))];
  if (!platforms.length) throw new Error("Conecte o Instagram ou o TikTok em Contas.");
  const ig = accounts?.find((a) => a.platform === "instagram");
  const isBraxPins = /brax\s*pins\s*mania/i.test(String(settings?.brand_name ?? "")) || /braxpinsmania/i.test(String(ig?.username ?? ""));

  // Público: os posts que mais engajaram
  let audience = isBraxPins
    ? `Referência dos Insights de @braxpinsmania enviados pelo usuário em 23/10/2026 (últimos 90 dias): ` +
      `o post da gotinha médica com gato teve ` +
      `44.071 visualizações, 78,8% de não seguidores, 626 compartilhamentos, 328 salvamentos e 217 seguidores; ` +
      `o broche no contexto da Justiça teve 14.021 visualizações, 64,6% de não seguidores, 133 compartilhamentos, ` +
      `99 salvamentos e 86 seguidores. Esses exemplos indicam que produto contextualizado com identidade profissional ` +
      `pode converter melhor. Um Reel semelhante teve 59.370 visualizações e 44 seguidores, com dados que podem ` +
      `incluir anúncio; não use visualizações isoladas como sinal de sucesso.`
    : "";
  if (ig) {
    try {
      const token = await igTokenFor(db, ig.id);
      const media = await igRecentMedia(token, ig.external_id, 30);
      const readMetric = (items: { name: string; values?: { value?: number }[]; value?: number }[] | undefined, name: string): number | undefined => {
        const item = items?.find((x) => x.name === name);
        const value = item?.values?.[0]?.value ?? item?.value;
        return value == null ? undefined : Number(value);
      };
      const measured: { text: string; type: string; views?: number; reach?: number; likes: number; comments: number; shares?: number; saves?: number; follows?: number; score: number }[] = [];
      // Insights são consultados em lotes pequenos para evitar rajadas na API. Se uma mídia
      // não tiver insights disponíveis, ela ainda pode entrar pelo engajamento público.
      for (let i = 0; i < media.length; i += 4) {
        const batch = await Promise.all(media.slice(i, i + 4).map(async (m) => {
          const type = String(m.media_product_type ?? m.media_type ?? "post");
          let metrics: { name: string; values?: { value?: number }[]; value?: number }[] = [];
          try {
            metrics = (await igMediaInsights(token, String(m.id))).data ?? [];
          } catch (e) {
            console.warn("insights da mídia", m.id, e);
          }
          const get = (name: string, fallback?: number) => readMetric(metrics, name) ?? fallback;
          const reach = get("reach");
          const likes = get("likes", Number(m.like_count ?? 0)) ?? 0;
          const comments = get("comments", Number(m.comments_count ?? 0)) ?? 0;
          const shares = get("shares");
          const saves = get("saved");
          const follows = get("follows");
          // Com alcance disponível, compara taxas por mil contas alcançadas. Curtidas e
          // comentários continuam como fallback quando a API não entrega Insights.
          const score = reach && reach > 0
            ? (((shares ?? 0) * 5 + (saves ?? 0) * 4 + (follows ?? 0) * 10 + likes + comments * 3) / reach) * 1000
            : likes + 3 * comments;
          return {
            text: String(m.caption ?? "").replace(/\s+/g, " ").slice(0, 120),
            type,
            views: get("views"),
            reach,
            likes,
            comments,
            shares,
            saves,
            follows,
            score,
          };
        }));
        measured.push(...batch);
      }
      const top = measured.sort((a, b) => b.score - a.score).slice(0, 8);
      const n = (value: number) => value.toLocaleString("pt-BR");
      const metricLabel = (value?: number) => value == null ? "n/d" : n(value);
      audience = `Perfil @${ig.username}${ig.followers_count ? ` com ${ig.followers_count} seguidores` : ""}. ` +
        `Posts recentes ranqueados por compartilhamentos, salvamentos e seguidores gerados por mil contas alcançadas ` +
        `(na falta de Insights, usa curtidas + 3x comentários):\n` +
        top.map((m) => `- [${m.type}] nota ${m.score.toFixed(1)}; alcance ${metricLabel(m.reach)}, views ${metricLabel(m.views)}, ` +
          `compartilhamentos ${metricLabel(m.shares)}, salvamentos ${metricLabel(m.saves)}, novos seguidores ${metricLabel(m.follows)}, ` +
          `curtidas ${n(m.likes)}, comentários ${n(m.comments)}: ${m.text}`).join("\n") +
        (isBraxPins ? `\n\n${audience}` : "");
    } catch (e) {
      console.error("posts do instagram", e);
    }
  }

  // Produtos da loja
  let products: Product[] = [];
  const store = await storeFor(db, userId);
  if (store) products = await nsProducts(store.token, store.storeId, { limit: 200 }).catch(() => []);
  const byId = new Map(products.map((p) => [p.id, p]));

  const used = await usedKeys(db, userId);
  const { dates, campaigns } = upcomingDates(new Date(), days);
  const today = new Date().toLocaleDateString("pt-BR", { timeZone, weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const braxStrategy = isBraxPins
    ? `Para a Brax Pins Mania, trate saúde/SUS e profissões como séries próprias; futebol/estaduais e fandom/cultura pop ` +
      `também devem ficar em séries próprias. Cada publicação deve falar com um público por vez, sem misturar categorias ` +
      `distantes no mesmo post. Os Insights recentes apontam saúde/SUS e identidade profissional como melhores temas ` +
      `para descoberta e novos seguidores: priorize esses eixos, mostrando o broche em um contexto visual ligado à ` +
      `profissão ou à rotina de quem o usaria. Dê uma razão concreta para acompanhar a série, sem pedir marcações ` +
      `vazias. Para uma semana de 4 ideias, crie pelo menos 2 ideias perenes de identificação, curiosidade ou escolha ` +
      `dentro dos eixos mais fortes; 1 ideia de produto em uso, coleção ou bastidor, variando entre carrossel e vídeo ` +
      `quando o produto permitir; e até 1 ideia sazonal/oferta quando houver um gancho real. Se não houver uma data ` +
      `realmente relevante, use outra ideia perene. Não conclua que Reel é melhor só por alcançar mais visualizações: ` +
      `otimize novos seguidores, compartilhamentos e salvamentos em relação ao alcance. Ajuste as proporções quando ` +
      `a quantidade semanal for diferente.\n\n`
    : "";

  const { ideas } = await generateJSON(Ideas,
    `Você é estrategista de conteúdo de uma loja brasileira e planeja posts para Instagram e TikTok que ajudam novas pessoas ` +
      `a descobrir a marca, se identificar com os produtos e querer acompanhar o perfil. Combine conteúdo perene com datas ` +
      `comemorativas e campanhas do mês; não dependa de uma data para cada ideia. Escreva em português do Brasil. ` +
      `Só use produtos da lista (pelo id) ` +
      `e não invente características, preços ou promoções. Nas campanhas de saúde (Outubro Rosa etc.), traga informação ` +
      `correta e respeitosa, sem promessas médicas. Favoreça ganchos claros e conteúdo que alguém queira salvar ou compartilhar ` +
      `por identificação, utilidade ou humor; não use clickbait, urgência inventada, pedidos vazios para marcar pessoas ou ` +
      `promessas de viralização. A legenda deve começar com um gancho e terminar com uma chamada natural.\n\n` +
      `${braxStrategy}` +
      `Identidade visual: vermelho ${BRAND_PALETTE.primary}, preto ${BRAND_PALETTE.secondary}, dourado ${BRAND_PALETTE.accent} e branco, ` +
      `letras grossas e chamativas. Use as cores da marca por padrão; quando a campanha tem cor própria (Outubro Rosa, Novembro Azul, ` +
      `Setembro Amarelo...), use a cor do tema como principal com o preto ou o dourado da marca.\n\n${brandContext(settings)}`,
    `Hoje é ${today}.\n\nCampanhas do período: ${campaigns.join("; ")}.\n` +
      `Datas dos próximos ${days} dias:\n${dates.map((d) => `- ${d.date}: ${d.name}`).join("\n") || "- (nenhuma)"}\n\n` +
      `${audience ? `${audience}\n\n` : ""}` +
      `${opts.focus ? `Pedido do usuário: ${opts.focus}\n\n` : ""}` +
      `Temas já usados (não repita): ${[...used].join(", ") || "nenhum"}.\n\n` +
      `Produtos da loja (id | nome${products.some((p) => p.description) ? " | descrição" : ""}):\n` +
      (products.length ? products.map((p) => `${p.id} | ${p.name}${p.description ? ` | ${p.description.slice(0, 80)}` : ""}`).join("\n") : "(loja não conectada)") +
      `\n\nCrie ${count} ideias para os próximos ${days} dias, distribuindo os temas pela mistura acima. ` +
      `Inclua datas/campanhas somente quando combinarem de verdade com o público e com os produtos. Prefira carrosséis ` +
      `com uma ideia útil, curiosa ou identificável mesmo quando não houver um produto adequado; não force uma venda em ` +
      `toda publicação. Use "video" em cerca de 1 a cada 3 ideias, só quando um produto é a cara do tema e as fotos ` +
      `disponíveis dão suporte ao conceito. Cada ideia num dia diferente, até ${days} dias a partir de hoje.`,
    "medium");

  const cache = new Map<number, string | null>();
  const taken = new Set<string>();
  const handle = ig?.username ? `@${ig.username}` : "";
  const created: { key: string; theme: string; format: string; id: string; scheduled_at?: string }[] = [];

  for (const idea of ideas.slice(0, count)) {
    if (used.has(idea.key)) continue;
    used.add(idea.key);
    try {
      const chosen = idea.product_ids.map((id) => byId.get(id)).filter((p): p is Product => !!p);
      const caption = `${idea.caption.trim()}\n\n${idea.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`;
      const at = await slotOn(db, userId, /^\d{4}-\d{2}-\d{2}$/.test(idea.date) ? idea.date : iso(new Date()), timeZone, taken);
      taken.add(at);
      const meta = { key: idea.key, theme: idea.theme, why: idea.why };

      if (idea.format === "video" && idea.video && chosen.length) {
        const images = (await Promise.all(chosen.slice(0, 2).map((p) => copyImage(db, userId, p, cache)))).filter((u): u is string => !!u);
        if (images.length) {
          const { data, error } = await db.from("product_videos").insert({
            user_id: userId,
            name: chosen[0].name,
            product_url: chosen[0].url ?? null,
            images,
            brief: {
              ...idea.video,
              title: chosen[0].name,
              brand: settings?.brand_name ?? "",
              handle,
              colors: { primary: idea.palette.primary, secondary: idea.palette.secondary, accent: idea.palette.accent },
              idea_key: idea.key,
              theme: idea.theme,
              why: idea.why,
              post_at: at,
              approval: true,
            },
            caption,
            status: "queued",
            autopost: true,
          }).select("id").single();
          if (error) throw error;
          created.push({ key: idea.key, theme: idea.theme, format: "video", id: data.id, scheduled_at: at });
          continue;
        }
      }

      // Carrossel (também quando o vídeo não tem foto de produto)
      const slides = [];
      for (const s of idea.slides.length ? idea.slides : [{ title: idea.theme, body: idea.why, product_id: chosen[0]?.id ?? null }]) {
        const product = s.product_id != null ? byId.get(s.product_id) : undefined;
        const image = product ? await copyImage(db, userId, product, cache) : null;
        slides.push({ title: s.title, ...(s.body ? { body: s.body } : {}), ...(image ? { product_image: image } : {}) });
      }
      const { data, error } = await db.from("posts").insert({
        user_id: userId,
        title: idea.theme,
        kind: "carousel",
        platforms,
        caption,
        media: [],
        slides: slides.slice(0, 10),
        design: { theme: "marca", handle, palette: idea.palette },
        scheduled_at: at,
        status: "pending_approval",
        created_by: "agent",
        notes: idea.why,
        options: { idea: meta },
      }).select("id").single();
      if (error) throw error;
      created.push({ key: idea.key, theme: idea.theme, format: "carousel", id: data.id, scheduled_at: at });
    } catch (e) {
      console.error("ideia", idea.key, e);
    }
  }
  if (created.some((c) => c.format === "video")) await dispatchRender();
  return { created, dates: dates.length };
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Chamado pelo cron: uma vez por semana por usuário com o piloto automático ligado (roda em segundo plano). */
export async function runAutopilot(db: SupabaseClient) {
  if (!aiEnabled()) return null;
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: due } = await db.from("brand_settings").select("user_id,autopilot_per_week,autopilot_last_run")
    .eq("autopilot_enabled", true).or(`autopilot_last_run.is.null,autopilot_last_run.lt."${weekAgo}"`).limit(1);
  const row = due?.[0];
  if (!row) return null;
  // Trava: só uma execução do cron pega este usuário. A data fica "provisória" (nova tentativa em 2 horas) até
  // a rodada terminar — assim uma rodada interrompida (deploy, limite de tempo) não espera uma semana.
  const provisional = new Date(Date.now() - 7 * 86400_000 + 2 * 3600_000).toISOString();
  let claim = db.from("brand_settings").update({ autopilot_last_run: provisional }).eq("user_id", row.user_id);
  claim = row.autopilot_last_run ? claim.eq("autopilot_last_run", row.autopilot_last_run) : claim.is("autopilot_last_run", null);
  const { data: claimed } = await claim.select("user_id").maybeSingle();
  if (!claimed) return null;
  const job = generateIdeas(db, row.user_id, { count: row.autopilot_per_week ?? 4 })
    .then(async (r) => {
      console.log("piloto automático", row.user_id, JSON.stringify(r));
      await db.from("brand_settings").update({ autopilot_last_run: new Date().toISOString(), autopilot_error: null }).eq("user_id", row.user_id);
    })
    .catch(async (e) => {
      console.error("piloto automático", row.user_id, e);
      // Tenta de novo em 1 hora (em vez de esperar a próxima semana) e mostra o erro em Aprovações
      await db.from("brand_settings").update({
        autopilot_last_run: new Date(Date.now() - 7 * 86400_000 + 3600_000).toISOString(),
        autopilot_error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
      }).eq("user_id", row.user_id);
    });
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
  else await job;
  return { user_id: row.user_id };
}
