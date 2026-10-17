// Canal automático no YouTube (Renda extra). Login do Google (OAuth), pesquisa do que mais dá audiência no nicho,
// escolha dos temas do dia e roteiro pela IA. Quem narra, anima, legenda, faz a capa e envia é o workflow
// "Vídeos do YouTube" (video/youtube.py), disparado aqui.
//
// Secrets (GitHub → Supabase): GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (app OAuth do Google Cloud com a
// YouTube Data API v3 ativada; não precisa de cartão). O workflow usa os mesmos dois para renovar o token.
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { aiEnabled, generateJSON } from "./claude.ts";
import { dispatchRender } from "./product-video.ts";
import { HttpError } from "./util.ts";

const API = "https://www.googleapis.com/youtube/v3";
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

function creds() {
  const id = Deno.env.get("GOOGLE_CLIENT_ID"), secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!id || !secret) throw new HttpError(400, "Cadastre GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nos secrets do GitHub");
  return { id, secret };
}

export function ytAuthorizeUrl(redirectUri: string, state: string) {
  const q = new URLSearchParams({
    client_id: creds().id, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(body: Record<string, string>) {
  const { id, secret } = creds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google: ${data.error_description ?? data.error ?? res.status}`);
  return data as { access_token: string; refresh_token?: string; expires_in: number };
}

export const ytExchangeCode = (code: string, redirectUri: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });

// deno-lint-ignore no-explicit-any
async function yt<T = any>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`YouTube: ${data.error?.message ?? res.status}`);
  return data;
}

export async function ytMyChannel(token: string) {
  const data = await yt(token, "channels", { part: "snippet", mine: "true" });
  const ch = data.items?.[0];
  if (!ch) throw new Error("Essa conta do Google não tem canal no YouTube. Crie o canal e conecte de novo.");
  return { id: ch.id as string, title: ch.snippet?.title as string, thumbnail: ch.snippet?.thumbnails?.default?.url as string | undefined };
}

/** Token válido do canal (renova pelo refresh token quando falta pouco para vencer). */
export async function ytToken(db: SupabaseClient, channelRef: string): Promise<string> {
  const { data } = await db.from("yt_tokens").select("*").eq("channel_ref", channelRef).maybeSingle();
  if (!data) throw new Error("Canal do YouTube sem token — conecte de novo");
  if (data.access_token && new Date(data.expires_at ?? 0).getTime() - Date.now() > 5 * 60 * 1000) return data.access_token;
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await db.from("yt_tokens").update({
    access_token: fresh.access_token, expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("channel_ref", channelRef);
  return fresh.access_token;
}

const seconds = (iso: string) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso ?? "") ?? [];
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
};

export type Trend = { id: string; title: string; channel: string; views: number; per_day: number; published_at: string; kind: "short" | "long" };

/** Os vídeos que mais deram audiência no nicho nos últimos 90 dias (em português), ordenados por visualizações por dia. */
export async function ytResearch(token: string, niche: string, language = "pt"): Promise<Trend[]> {
  const en = language === "en";
  const after = new Date(Date.now() - 90 * 86400000).toISOString();
  const ids = new Set<string>();
  for (const q of [niche, `${niche} shorts`]) {
    const data = await yt(token, "search", {
      part: "id", type: "video", q, order: "viewCount", publishedAfter: after, regionCode: en ? "US" : "BR", relevanceLanguage: en ? "en" : "pt", maxResults: "25",
    });
    // deno-lint-ignore no-explicit-any
    for (const it of data.items ?? []) if ((it as any).id?.videoId) ids.add((it as any).id.videoId);
  }
  if (!ids.size) return [];
  const data = await yt(token, "videos", { part: "snippet,statistics,contentDetails", id: [...ids].slice(0, 50).join(",") });
  // deno-lint-ignore no-explicit-any
  const out: Trend[] = (data.items ?? []).map((v: any) => {
    const views = Number(v.statistics?.viewCount ?? 0);
    const days = Math.max(1, (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 86400000);
    return {
      id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle, views, per_day: Math.round(views / days),
      published_at: v.snippet.publishedAt, kind: seconds(v.contentDetails?.duration) <= 180 ? "short" : "long",
    };
  });
  return out.sort((a, b) => b.per_day - a.per_day).slice(0, 30);
}

// --------------------------------------------------------------------------------------------- temas e roteiros

const Plan = z.object({
  items: z.array(z.object({
    kind: z.enum(["short", "long"]),
    topic: z.string().describe("Tema específico do vídeo, ex.: 'Por que Moisés não entrou na Terra Prometida'"),
    angle: z.string().describe("O gancho/ângulo que prende (pergunta ou fato surpreendente), em 1 frase"),
    inspired_by: z.array(z.string()).describe("ids dos vídeos de referência que mostram que esse tipo de tema dá audiência"),
  })),
});

const Scene = z.object({
  narration: z.string().describe("O que a voz fala nesta cena: 1 ou 2 frases curtas, faladas, em português"),
  image: z.string().describe("Descrição da imagem da cena EM INGLÊS: personagens, ação, cenário, enquadramento (sem pedir texto na imagem)"),
  motion: z.enum(["zoom_in", "zoom_out", "pan_left", "pan_right"]),
  chapter: z.string().nullable().describe("Só em vídeo longo: título do capítulo quando um novo capítulo começa nesta cena; senão null"),
});

const Script = z.object({
  title: z.string().describe("Título com curiosidade real e forte, até 70 caracteres, sem mentira nem exagero"),
  description: z.string().describe("Descrição de 2 a 4 parágrafos curtos com os versículos citados; termine com 3 a 5 hashtags"),
  tags: z.array(z.string()).describe("8 a 15 tags de busca em português"),
  thumbnail_text: z.string().describe("2 a 4 palavras em MAIÚSCULAS para a capa, que geram curiosidade"),
  thumbnail_image: z.string().describe("Descrição EM INGLÊS da imagem da capa: personagem expressivo em close, cena dramática, espaço livre à esquerda para o texto"),
  scenes: z.array(Scene),
  references: z.array(z.string()).describe("Referências bíblicas usadas (ex.: Números 20:12)"),
});
export type YtScript = z.infer<typeof Script>;

const RULES_PT =
  `Você é roteirista de um canal brasileiro de "${"{niche}"}" no YouTube, com animação 3D estilo Pixar de personagens bíblicos. ` +
  `Escreve em português do Brasil, falado, simples e envolvente, como um bom contador de histórias.\n` +
  `Regras de conteúdo:\n` +
  `- Tudo fiel à Bíblia: cite livro, capítulo e versículo. O que vier da tradição ou de historiadores (e não do texto bíblico) diga "segundo a tradição" ou "historiadores contam". Nunca invente.\n` +
  `- Respeito a todas as denominações cristãs; sem polêmica, sem atacar religiões, sem promessas ("faça isso e receba...").\n` +
  `- Conteúdo original: as referências mostram só que o TEMA dá audiência; nunca copie título, roteiro ou frases de outro canal.\n` +
  `- Cada vídeo precisa entregar algo real e diferente (YouTube não monetiza conteúdo repetitivo em massa): fatos concretos, contexto histórico, uma lição.\n` +
  `Imagens (campo image, em inglês): descreva a cena para um gerador de imagens; personagens bíblicos em 3D estilo animação, expressivos, ` +
  `roupas da época, cenário do antigo Oriente Médio. Deus nunca aparece com rosto: use luz divina, nuvens ou fogo. Jesus com aparência serena e gentil. ` +
  `Varie enquadramentos (close, plano aberto, de cima) e cenários; nada de texto na imagem.`;

/** Canal em inglês: mesmas regras, mas todo o texto falado e publicado sai em inglês (público dos EUA). */
const RULES_EN =
  RULES_PT +
  `\n\nIMPORTANTE: este canal é EM INGLÊS para o público dos Estados Unidos. Escreva narration, title, description, tags e thumbnail_text ` +
  `em inglês americano natural (cite os versículos no formato inglês, ex.: Numbers 20:12; use a NIV/KJV como referência). ` +
  `Os campos topic e angle também em inglês.`;

const rules = (niche: string, language: string) => (language === "en" ? RULES_EN : RULES_PT).replace("{niche}", niche);

export async function planTopics(niche: string, trends: Trend[], recent: string[], kinds: ("short" | "long")[], language = "pt") {
  const out = await generateJSON(Plan,
    rules(niche, language) +
      `\n\nAgora você é o editor do canal: escolha os temas dos próximos vídeos com base no que está dando audiência.`,
    `Vídeos do nicho que mais crescem (título · visualizações por dia · formato · id):\n` +
      (trends.length ? trends.map((t) => `- ${t.title} · ${t.per_day}/dia · ${t.kind} · ${t.id}`).join("\n") : "(sem dados agora; use temas clássicos que sempre dão audiência)") +
      `\n\nTemas que o canal já fez (não repita):\n${recent.length ? recent.map((r) => `- ${r}`).join("\n") : "(nenhum)"}` +
      `\n\nEscolha exatamente ${kinds.length} temas, nesta ordem de formato: ${kinds.join(", ")}. ` +
      `Shorts: um único fato surpreendente e rápido. Longo: tema com várias curiosidades para 6 a 8 minutos.`,
    "low");
  return out.items.slice(0, kinds.length).map((it, i) => ({ ...it, kind: kinds[i] }));
}

export async function writeScript(niche: string, video: { kind: string; topic: string; angle?: string | null }, language = "pt"): Promise<YtScript> {
  const short = video.kind === "short";
  const en = language === "en";
  const shape = short
    ? `Formato: YouTube Shorts vertical de 45 a 55 segundos (130 a 150 palavras faladas no total), 8 a 10 cenas. ` +
      `A primeira frase é o gancho (pergunta ou fato chocante) e prende nos 2 primeiros segundos. ` +
      `Termine com uma pergunta para comentarem e ${en ? `"subscribe for more Bible secrets"` : `"se inscreve para mais curiosidades da Bíblia"`}. Sem capítulos (chapter = null). ` +
      `Inclua #shorts nas hashtags.`
    : `Formato: vídeo horizontal de 6 a 8 minutos (900 a 1150 palavras faladas), 32 a 45 cenas de 1 ou 2 frases. ` +
      `Abertura com gancho forte nos primeiros 15 segundos e a promessa do vídeo; depois 5 a 7 capítulos (curiosidades), ` +
      `cada um começando numa cena com chapter preenchido (a primeira cena tem chapter "${en ? "Introduction" : "Introdução"}"); ` +
      `fechamento com uma lição e chamada para se inscrever e comentar.`;
  return await generateJSON(Script,
    rules(niche, language),
    `${shape}\n\nTema: ${video.topic}\nGancho: ${video.angle ?? "(escolha o melhor)"}`,
    "medium");
}

// --------------------------------------------------------------------------------------------- piloto diário

const BRT = (d = new Date()) => new Date(d.getTime() - 3 * 3600000);
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Horário de Brasília -> ISO (UTC). */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-03:00`).toISOString();

/** Dias da semana (0 = domingo) com vídeo longo, espalhados. */
function longDays(perWeek: number) {
  const n = Math.max(0, Math.min(7, perWeek));
  return new Set(Array.from({ length: n }, (_, i) => Math.round(2 + (i * 7) / n) % 7));
}

const SHORT_TIMES = ["12:00", "19:00", "08:00"];

/** Cria os vídeos (temas) de um dia. Devolve quantos foram criados. */
// deno-lint-ignore no-explicit-any
export async function planDay(db: SupabaseClient, channel: any, date: string, only?: "short" | "long") {
  let trends: Trend[] = channel.trends ?? [];
  if (!channel.trends_at || Date.now() - new Date(channel.trends_at).getTime() > 20 * 3600000) {
    try {
      trends = await ytResearch(await ytToken(db, channel.id), channel.niche, channel.language);
      await db.from("yt_channels").update({ trends, trends_at: new Date().toISOString(), error: null }).eq("id", channel.id);
    } catch (e) {
      await db.from("yt_channels").update({ error: `Pesquisa: ${(e as Error).message}` }).eq("id", channel.id);
    }
  }
  const weekday = new Date(`${date}T12:00:00-03:00`).getUTCDay();
  const kinds: ("short" | "long")[] = only
    ? [only]
    : [...Array(Math.max(0, Math.min(3, channel.shorts_per_day))).fill("short"), ...(longDays(channel.long_per_week).has(weekday) ? ["long" as const] : [])];
  if (!kinds.length) return 0;
  const { data: past } = await db.from("yt_videos").select("topic").eq("channel_ref", channel.id).order("created_at", { ascending: false }).limit(80);
  const items = await planTopics(channel.niche, trends, (past ?? []).map((p) => p.topic).filter(Boolean), kinds, channel.language);
  // Canal em inglês publica no fim da tarde/noite dos EUA
  const times = channel.language === "en" ? { short: ["14:00", "21:00", "11:00"], long: "21:30" } : { short: SHORT_TIMES, long: "18:00" };
  const now = Date.now();
  let s = 0;
  const rows = items.map((it) => {
    // Pedido manual: publica em ~3h (tempo de roteiro + vídeo); no plano do dia, nos horários fixos
    const when = only ? new Date(now + 3 * 3600000).toISOString() : at(date, it.kind === "long" ? times.long : times.short[s++ % times.short.length]);
    const inspiration = trends.filter((t) => it.inspired_by.includes(t.id)).map((t) => ({ id: t.id, title: t.title, views: t.views }));
    return { user_id: channel.user_id, channel_ref: channel.id, kind: it.kind, status: "draft", topic: it.topic, angle: it.angle, inspiration, publish_at: when };
  });
  await db.from("yt_videos").insert(rows);
  return rows.length;
}

/**
 * Roda no cron (publish-scheduled). Uma vez por dia, depois das 15h de Brasília, planeja os vídeos do dia seguinte
 * (horários fixos: shorts 12h e 19h, longo 18h). A cada rodada escreve UM roteiro pendente e dispara o workflow.
 */
export async function ytAutopilot(db: SupabaseClient) {
  if (!aiEnabled()) return { skipped: "sem IA" };
  const now = BRT();
  const tomorrow = day(new Date(now.getTime() + 86400000));
  const result: Record<string, unknown> = {};

  if (now.getUTCHours() >= 15) {
    const { data: channels } = await db.from("yt_channels").select("*").eq("enabled", true)
      .or(`planned_on.is.null,planned_on.lt.${tomorrow}`).limit(1); // um canal por rodada (cada um no seu minuto)
    for (const ch of channels ?? []) {
      // Marca antes (a próxima rodada do cron não planeja de novo enquanto esta trabalha)
      await db.from("yt_channels").update({ planned_on: tomorrow }).eq("id", ch.id);
      result.planned = await planDay(db, ch, tomorrow).catch(async (e) => {
        await db.from("yt_channels").update({ planned_on: ch.planned_on, error: `Planejamento: ${(e as Error).message}` }).eq("id", ch.id);
        return 0;
      });
    }
  }

  // Roteiro travado (função caiu no meio) volta para a fila depois de 10 min
  await db.from("yt_videos").update({ status: "draft" }).eq("status", "scripting").lt("updated_at", new Date(Date.now() - 10 * 60000).toISOString());
  const { data: next } = await db.from("yt_videos").select("*, yt_channels(niche, language)").eq("status", "draft").order("publish_at").limit(1).maybeSingle();
  if (next) {
    const { data: claimed } = await db.from("yt_videos").update({ status: "scripting", updated_at: new Date().toISOString() })
      .eq("id", next.id).eq("status", "draft").select("id").maybeSingle();
    if (claimed) {
      try {
        const script = await writeScript(next.yt_channels?.niche ?? "Curiosidades da Bíblia", next, next.yt_channels?.language ?? "pt");
        await db.from("yt_videos").update({ status: "queued", script, title: script.title, error: null, updated_at: new Date().toISOString() }).eq("id", next.id);
        result.scripted = next.id;
        result.dispatched = await dispatchRender("youtube.yml");
      } catch (e) {
        const attempts = (next.attempts ?? 0) + 1;
        await db.from("yt_videos").update({
          status: attempts >= 3 ? "failed" : "draft", attempts, error: `Roteiro: ${(e as Error).message}`, updated_at: new Date().toISOString(),
        }).eq("id", next.id);
      }
    }
  }
  return result;
}
