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
// force-ssl: apagar vídeo pelo Studio (botões "Apagar" e "Refazer")
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.force-ssl"];

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

/** Apaga o vídeo no YouTube (já apagado lá = ok). Canal conectado antes da permissão de apagar → pede reconexão. */
export async function ytDeleteVideo(token: string, id: string) {
  const res = await fetch(`${API}/videos?${new URLSearchParams({ id })}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (res.ok || res.status === 404) return;
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && /insufficient|scope|permission/i.test(JSON.stringify(data))) {
    throw new Error("Para apagar pelo Studio, conecte o canal de novo (YouTube → Conectar canal, mesma conta). É uma vez só.");
  }
  throw new Error(`YouTube: ${data.error?.message ?? res.status}`);
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
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token }).catch(async (e) => {
    // Acesso revogado pelo dono (myaccount.google.com/permissions): apaga o token e os dados do YouTube guardados
    if (/invalid_grant|revoked|expired/i.test((e as Error).message)) {
      await db.from("yt_tokens").delete().eq("channel_ref", channelRef);
      await db.from("yt_channels").update({ enabled: false, trends: null, trends_at: null, error: "Acesso ao canal revogado — conecte de novo" }).eq("id", channelRef);
    }
    throw e;
  });
  await db.from("yt_tokens").update({
    access_token: fresh.access_token, expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("channel_ref", channelRef);
  return fresh.access_token;
}

const seconds = (iso: string) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso ?? "") ?? [];
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
};

export type Trend = {
  id: string; title: string; channel: string; views: number; per_day: number; published_at: string; kind: "short" | "long";
  /** Quantas vezes o vídeo bateu a mediana dos últimos vídeos do próprio canal (null = canal com poucos vídeos) */
  lift?: number | null;
};

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0;
};

/**
 * Quanto cada vídeo bateu o próprio canal: views ÷ mediana dos últimos 15 vídeos do canal. Visualização bruta só mede o
 * tamanho do canal; o múltiplo mostra o TEMA que funcionou (um canal pequeno que fez 10x é o melhor sinal). Barato na
 * cota: canais e vídeos vão em lotes de 50 (1 unidade cada) e cada lista de uploads custa 1.
 */
async function channelLift(token: string, videos: { id: string; channel_id: string; views: number }[]) {
  const lift = new Map<string, number | null>();
  const chIds = [...new Set(videos.map((v) => v.channel_id))].slice(0, 40);
  const uploads = new Map<string, string>();
  for (let i = 0; i < chIds.length; i += 50) {
    const data = await yt(token, "channels", { part: "contentDetails", id: chIds.slice(i, i + 50).join(","), maxResults: "50" });
    // deno-lint-ignore no-explicit-any
    for (const c of (data.items ?? []) as any[]) if (c.contentDetails?.relatedPlaylists?.uploads) uploads.set(c.id, c.contentDetails.relatedPlaylists.uploads);
  }
  const recent = new Map<string, string[]>();
  await Promise.all([...uploads].map(async ([ch, pl]) => {
    const data = await yt(token, "playlistItems", { part: "contentDetails", playlistId: pl, maxResults: "15" }).catch(() => null);
    // deno-lint-ignore no-explicit-any
    recent.set(ch, ((data?.items ?? []) as any[]).map((it) => it.contentDetails?.videoId).filter(Boolean));
  }));
  const all = [...new Set([...recent.values()].flat())];
  const views = new Map<string, number>();
  for (let i = 0; i < all.length; i += 50) {
    const data = await yt(token, "videos", { part: "statistics", id: all.slice(i, i + 50).join(",") });
    // deno-lint-ignore no-explicit-any
    for (const v of (data.items ?? []) as any[]) views.set(v.id, Number(v.statistics?.viewCount ?? 0));
  }
  for (const v of videos) {
    const own = (recent.get(v.channel_id) ?? []).map((id) => views.get(id)).filter((n): n is number => n !== undefined);
    const med = median(own);
    // Com menos de 4 vídeos a mediana não diz nada
    lift.set(v.id, own.length >= 4 && med > 0 ? Math.round((v.views / med) * 10) / 10 : null);
  }
  return lift;
}

/**
 * O que está dando audiência no nicho nos últimos 90 dias. Ordena pelo quanto o vídeo bateu o próprio canal (lift) e,
 * no empate, por visualizações por dia; vídeo com menos de 1.000 views fica de fora (ruído).
 */
export async function ytResearch(token: string, niche: string, language = "pt", extra: string[] = []): Promise<Trend[]> {
  const en = language === "en";
  const after = new Date(Date.now() - 90 * 86400000).toISOString();
  const ids = new Set<string>();
  for (const q of [niche, `${niche} shorts`, ...extra]) {
    const data = await yt(token, "search", {
      part: "id", type: "video", q, order: "viewCount", publishedAfter: after, regionCode: en ? "US" : language === "es" ? "MX" : "BR",
      relevanceLanguage: ["en", "es"].includes(language) ? language : "pt", maxResults: "25",
    });
    // deno-lint-ignore no-explicit-any
    for (const it of data.items ?? []) if ((it as any).id?.videoId) ids.add((it as any).id.videoId);
  }
  if (!ids.size) return [];
  const data = await yt(token, "videos", { part: "snippet,statistics,contentDetails", id: [...ids].slice(0, 50).join(",") });
  // deno-lint-ignore no-explicit-any
  const out = (data.items ?? []).map((v: any) => {
    const views = Number(v.statistics?.viewCount ?? 0);
    const days = Math.max(1, (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 86400000);
    return {
      id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle, channel_id: v.snippet.channelId as string, views, per_day: Math.round(views / days),
      published_at: v.snippet.publishedAt, kind: seconds(v.contentDetails?.duration) <= 180 ? "short" : "long",
    };
  }).filter((t: { views: number }) => t.views >= 1000) as (Trend & { channel_id: string })[];
  // Sem o múltiplo (erro na cota, por exemplo) volta para visualizações por dia
  const lift = await channelLift(token, out).catch(() => new Map<string, number | null>());
  const ranked: Trend[] = out.map(({ channel_id: _, ...t }) => ({ ...t, lift: lift.get(t.id) ?? null }));
  const score = (t: Trend) => (t.lift ?? 1) * Math.log10(t.per_day + 10);
  return ranked.sort((a, b) => score(b) - score(a)).slice(0, 30);
}

// --------------------------------------------------------------------------------------------- temas e roteiros

/**
 * Fórmulas de gancho (primeira frase do vídeo). Ideia do projeto aberto chatgpt-youtube-agent-skill (MIT), reescrita para
 * os nossos canais. O gancho confirma o título, abre uma pergunta que a pessoa não consegue largar e mostra que a
 * resposta vem.
 */
const HOOKS = [
  ["numero", "Número surpreendente", "um número concreto que a pessoa não sabia, dito seco, e a consequência", "Você pisca cerca de 15 mil vezes por dia. E quase nunca percebe."],
  ["e_se", "E se...", "uma situação extrema e concreta, e a promessa de mostrar o que acontece", "O que acontece com seu corpo se você ficar 3 dias sem dormir?"],
  ["contrario", "Contrário", "derruba algo que quase todo mundo acredita", "Você não usa só 10% do cérebro. E isso nunca foi verdade."],
  ["segredo", "Detalhe escondido", "um detalhe que quase ninguém repara, em algo conhecido", "Tem um detalhe na história de Davi e Golias que quase ninguém percebe."],
  ["virada", "Virada", "começa normal e vira na segunda frase", "Elias venceu 450 profetas num dia. No dia seguinte, pediu para morrer."],
  ["pergunta", "Pergunta que coça", "uma pergunta simples que a pessoa nunca soube responder", "Por que o avião não cai quando o motor desliga?"],
  ["comparacao", "X vs Y", "dois lados com uma aposta clara", "Café ou energético: qual acorda mais de verdade?"],
  ["erro", "Erro comum", "algo que a pessoa provavelmente faz errado", "Você provavelmente lava as mãos do jeito errado."],
  ["consequencia", "Consequência", "começa pelo fim chocante e volta para explicar", "Esse erro de um soldado mudou o fim de um império inteiro."],
  ["tempo", "Contagem", "um prazo curto que cria pressa", "Em 60 segundos você vai entender como a internet chega na sua casa."],
  ["pessoa", "Personagem", "uma pessoa específica e o que aconteceu com ela", "Um pastor de ovelhas virou rei sem nunca ter pedido isso."],
  ["proibido", "Ninguém conta", "algo que fica de fora das versões comuns da história", "Tem uma parte da história de Jonas que quase nunca é contada na igreja."],
] as const;
const HOOK_IDS = HOOKS.map(([id]) => id) as unknown as [string, ...string[]];
const HOOK_GUIDE =
  `Fórmulas de gancho (a primeira frase do vídeo):\n` + HOOKS.map(([id, name, shape, ex]) => `- ${id} (${name}): ${shape}. Ex.: "${ex}"`).join("\n") +
  `\nRegras do gancho: confirma o título na primeira frase; uma ideia só; específico vence genérico (número, nome, lugar); ` +
  `nunca comece com "olá", "neste vídeo" ou o nome do canal; não entregue a resposta no gancho.`;

const Plan = z.object({
  items: z.array(z.object({
    kind: z.enum(["short", "long"]),
    topic: z.string().describe("Tema específico do vídeo, ex.: 'Por que Moisés não entrou na Terra Prometida'"),
    hook: z.enum(HOOK_IDS).describe("Fórmula de gancho que melhor combina com o tema (varie entre os vídeos)"),
    angle: z.string().describe("A primeira frase do vídeo, já escrita na fórmula escolhida"),
    inspired_by: z.array(z.string()).describe("ids dos vídeos de referência que mostram que esse tipo de tema dá audiência"),
  })),
});

const Scene = z.object({
  narration: z.string().describe("O que a voz fala nesta cena: 1 ou 2 frases curtas, faladas, em português"),
  image: z.string().describe(
    "Descrição da imagem da cena EM INGLÊS: personagens em AÇÃO (expressão forte, movimento, emoção), cenário, enquadramento cinematográfico " +
      "(close dramático, plano aberto épico, de cima, contra-luz). Cenas vizinhas bem diferentes entre si. Sem pedir texto na imagem",
  ),
  motion: z.enum(["zoom_in", "zoom_out", "pan_left", "pan_right"]),
  layout: z.enum(["photo", "sticker", "tv", "map"]).describe(
    "Só no estilo colagem (senão photo): photo = foto antiga recortada; sticker = personagem recortado como adesivo (imagem com 1 pessoa de corpo inteiro); " +
      "tv = cena dentro de uma TV antiga; map = mapa antigo com a rota (a imagem descreve o mapa da região)",
  ),
  label: z.string().describe(
    "Só no estilo colagem (senão string vazia): etiqueta de 1 a 3 palavras (lugar, nome, data ou versículo); no layout map, 'Origem → Destino'",
  ),
  chapter: z.string().nullable().describe("Só em vídeo longo: título do capítulo quando um novo capítulo começa nesta cena; senão null"),
});

const Script = z.object({
  title: z.string().describe("Título com curiosidade real e forte, até 70 caracteres, sem mentira nem exagero"),
  description: z.string().describe("Descrição de 2 a 4 parágrafos curtos com os versículos citados; termine com 3 a 5 hashtags"),
  tags: z.array(z.string()).describe("8 a 15 tags de busca em português"),
  thumbnail_text: z.string().describe("2 a 4 palavras em MAIÚSCULAS para a capa, que geram curiosidade"),
  thumbnail_image: z.string().describe("Descrição EM INGLÊS da imagem da capa: personagem expressivo em close, cena dramática, espaço livre à esquerda para o texto"),
  cast: z.string().describe(
    "Só no estilo cinemático (senão string vazia): aparência fixa EM INGLÊS do personagem principal (idade, rosto, cabelo, barba, roupa e cores), " +
      "1 frase. Nas imagens, escreva HERO onde ele aparece para o rosto sair igual em todas as cenas",
  ),
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

/** Estilo cinemático (filme bíblico realista): troca o 3D Pixar por cena de cinema e o roteiro vira uma história com virada. */
const CINEMATIC =
  `\n\nESTILO DESTE CANAL: cinemático realista, como cena de filme bíblico (não é animação 3D). Nas imagens, descreva como um frame de filme: ` +
  `pessoas reais, pele com textura, luz natural dourada, poeira no ar, closes no rosto com emoção forte (lágrimas, espanto, olhar para o céu), ` +
  `planos abertos de paisagem do antigo Israel. Preencha cast com a aparência fixa do protagonista e use a palavra HERO nas imagens em que ele aparece ` +
  `(ex.: "extreme close-up of HERO looking up, oil running down his forehead"). Outros personagens: descreva sempre do mesmo jeito.\n` +
  `Roteiro como HISTÓRIA contada (não lista de fatos): gancho com virada ("...e aí tudo piorou"), tensão crescente, momento emocional e a lição no fim, ` +
  `sempre fiel ao texto bíblico.`;

/** Estilo colagem (estilo Vox): gravuras antigas recortadas, adesivos, etiquetas, TV antiga e mapa com a rota. */
const COLLAGE =
  `\n\nESTILO DESTE CANAL: colagem de papel estilo documentário (Vox): cada cena é uma gravura antiga em preto e branco recortada sobre papel colorido. ` +
  `Nas imagens descreva UM assunto claro (pessoa, objeto, construção, multidão) como gravura do século XIX, sem cenário complicado. ` +
  `Varie o layout: use sticker quando a cena tem um personagem de corpo inteiro, map quando a história muda de lugar (1 ou 2 por vídeo, ` +
  `descrevendo o mapa antigo da região e label "Origem → Destino"), tv para um momento marcante e photo no resto. ` +
  `Toda cena tem label curta (lugar, nome, data ou versículo).`;

/** Canal em espanhol: mesmas regras, texto falado e publicado em espanhol neutro (América Latina). */
const RULES_ES =
  RULES_PT +
  `\n\nIMPORTANTE: este canal é EM ESPANHOL para a América Latina (México, Colômbia, Argentina, Peru e hispânicos dos EUA). ` +
  `Escreva narration, title, description, tags, thumbnail_text, topic, angle e label em espanhol latino-americano neutro e natural ` +
  `(cite os versículos no formato espanhol, ex.: Éxodo 14:21; use a Reina-Valera como referência).`;

// ------------------------------------------------------------------ bonequinhos (canal de explicações, estilo stickman)
// O vídeo é desenhado por código (video/stickman.py): o roteiro diz a pose do boneco e o que aparece no quadro.

const POSES = ["idle", "explain", "point", "think", "idea", "shock", "happy", "celebrate", "sad", "shrug", "facepalm", "scared", "angry", "walk", "run", "sleep"] as const;
const ICONS = [
  "money", "coin", "clock", "brain", "heart", "phone", "house", "car", "lightbulb", "question", "exclamation", "check", "cross", "fire",
  "water", "sun", "moon", "food", "coffee", "chart_up", "chart_down", "globe", "book", "gift", "warning", "battery_low", "battery_full",
  "person", "bank", "calendar", "target", "lock", "trophy", "arrow_up", "arrow_down", "plane", "pill", "dumbbell", "bed", "bomb", "star", "eye",
] as const;

const StickScene = z.object({
  narration: z.string().describe("O que a voz fala nesta cena: UMA frase curta e falada, no idioma do canal"),
  pose: z.enum(POSES).describe("Pose do boneco que combina com a frase (varie: não repita a mesma pose em cenas seguidas)"),
  board: z.enum(["icons", "text", "compare", "chart_up", "chart_down", "none"]).describe(
    "O que aparece no quadro: icons = 1 a 3 desenhos; text = número ou palavra-chave grande; compare = 2 ícones lado a lado com VS; " +
      "chart_up/chart_down = gráfico subindo/caindo (pode ter text junto); none = só o boneco (use pouco)",
  ),
  icons: z.array(z.enum(ICONS)).describe("Até 3 ícones da lista (compare usa exatamente 2; text pode ter 1 ícone junto); vazio se não usar"),
  text: z.string().describe("Texto do quadro: número ou palavra-chave curta, até 16 caracteres (ex.: '$1,825', '8 HOURS', '70%'); vazio se não usar"),
  friend: z.enum(["none", ...POSES]).describe("Amigo azul que reage ou pergunta: pose dele, ou none. Use em 2 a 4 cenas por vídeo, não seguidas"),
  chapter: z.string().nullable().describe("Só em vídeo longo: título do capítulo quando um novo capítulo começa nesta cena; senão null"),
});

const StickScript = z.object({
  title: z.string().describe("Título com curiosidade real e forte, até 70 caracteres, sem mentira nem exagero"),
  description: z.string().describe("Descrição de 2 a 4 parágrafos curtos; termine com 3 a 5 hashtags"),
  tags: z.array(z.string()).describe("8 a 15 tags de busca no idioma do canal"),
  thumbnail_text: z.string().describe("2 a 5 palavras em MAIÚSCULAS para a capa (pode ter número), que geram curiosidade"),
  thumbnail_pose: z.enum(POSES).describe("Pose do boneco na capa (shock, scared ou idea costumam funcionar)"),
  thumbnail_icons: z.array(z.enum(ICONS)).describe("1 ícone da lista que aparece na capa"),
  scenes: z.array(StickScene),
  references: z.array(z.string()).describe("Fontes conhecidas e verificáveis dos números citados (ex.: 'CDC', 'Harvard Health'); vazio se não citar números"),
});

const RULES_STICK =
  `Você é roteirista de um canal do YouTube de vídeos explicativos com bonequinhos de palito, sobre "${"{niche}"}". ` +
  `Escreve como um bom professor de YouTube: falado, simples, rápido, com exemplos do dia a dia e uma pitada de humor.\n` +
  `Regras de conteúdo:\n` +
  `- Só fatos verdadeiros e conhecidos; números arredondados e corretos. Nunca invente estudo, pesquisa ou estatística. ` +
  `Quando for estimativa, diga "cerca de" ou "estudos sugerem".\n` +
  `- Nada de conselho pessoal de saúde, investimento ou direito (explique como funciona, sem mandar a pessoa fazer); sem promessa de ganho.\n` +
  `- Conteúdo original: as referências mostram só que o TEMA dá audiência; nunca copie título, roteiro ou frases de outro canal.\n` +
  `- Cada vídeo entrega algo útil e concreto (YouTube não monetiza conteúdo repetitivo em massa).\n` +
  `Visual (desenhado por código): em cada cena escolha a pose do boneco, o que aparece no quadro (ícones da lista, um número ou ` +
  `palavra-chave, comparação ou gráfico) e, às vezes, o amigo azul reagindo. O quadro mostra o NÚMERO ou a IDEIA da frase, não repete a frase. ` +
  `Varie poses e quadros de uma cena para outra.`;

const LANG_STICK: Record<string, string> = {
  en: `\n\nIMPORTANTE: este canal é EM INGLÊS para o público dos Estados Unidos: narration, title, description, tags, thumbnail_text, text, topic e angle em inglês americano natural (valores em dólar).`,
  es: `\n\nIMPORTANTE: este canal é EM ESPANHOL para a América Latina: narration, title, description, tags, thumbnail_text, text, topic e angle em espanhol latino-americano neutro.`,
  pt: `\n\nEscreva tudo em português do Brasil (valores em reais quando fizer sentido).`,
};

export const STICK_TRENDS: Record<string, string[]> = {
  en: ["what happens if you", "explained stick figure animation", "why do we"],
  pt: ["o que acontece se você", "por que a gente", "como funciona explicado"],
  es: ["qué pasa si", "por qué los humanos", "cómo funciona explicado"],
};

export type StickScriptT = z.infer<typeof StickScript>;

const rules = (niche: string, language: string, style = "") =>
  style === "stickman" ? RULES_STICK.replace("{niche}", niche) + (LANG_STICK[language] ?? LANG_STICK.pt) :
  (language === "en" ? RULES_EN : language === "es" ? RULES_ES : RULES_PT).replace("{niche}", niche) +
  (style === "cinematic" ? CINEMATIC : style === "collage" ? COLLAGE : "");

export async function planTopics(niche: string, trends: Trend[], recent: string[], kinds: ("short" | "long")[], language = "pt", style = "") {
  const out = await generateJSON(Plan,
    rules(niche, language, style) +
      `\n\nAgora você é o editor do canal: escolha os temas dos próximos vídeos com base no que está dando audiência.\n\n${HOOK_GUIDE}`,
    `Vídeos do nicho que mais crescem (título · quantas vezes bateu a média do próprio canal · visualizações por dia · formato · id). ` +
      `O múltiplo é o sinal mais forte: um vídeo que fez 5x a média do canal mostra um TEMA que funciona, mesmo em canal pequeno.\n` +
      (trends.length ? trends.map((t) => `- ${t.title} · ${t.lift ? `${t.lift}x a média` : "média ?"} · ${t.per_day}/dia · ${t.kind} · ${t.id}`).join("\n") : "(sem dados agora; use temas clássicos que sempre dão audiência)") +
      `\n\nTemas que o canal já fez (não repita):\n${recent.length ? recent.map((r) => `- ${r}`).join("\n") : "(nenhum)"}` +
      `\n\nEscolha exatamente ${kinds.length} temas, nesta ordem de formato: ${kinds.join(", ")}. ` +
      `Shorts: um único fato surpreendente e rápido. Longo: tema com várias curiosidades para 6 a 8 minutos.` +
      (style === "stickman" ? ` Temas no formato "o que acontece se...", "por que...", "como funciona..." ou "X vs Y", fáceis de mostrar com desenhos simples.` : ""),
    "low");
  // A fórmula vai junto no ângulo (o roteirista segue a mesma)
  const name = (id: string) => HOOKS.find(([h]) => h === id)?.[1] ?? id;
  return out.items.slice(0, kinds.length).map(({ hook, ...it }, i) => ({ ...it, angle: `[${name(hook)}] ${it.angle}`, kind: kinds[i] }));
}

export async function writeScript(niche: string, video: { kind: string; topic: string; angle?: string | null; redo_note?: string | null }, language = "pt", style = "", tiktok = false): Promise<YtScript | StickScriptT> {
  const short = video.kind === "short";
  const en = language === "en";
  const stick = style === "stickman";
  const cta = stick
    ? (en ? `"follow for more"` : language === "es" ? `"sígueme para más"` : `"me segue para mais"`)
    : (en ? `"subscribe for more Bible secrets"` : language === "es" ? `"suscríbete para más secretos de la Biblia"` : `"se inscreve para mais curiosidades da Bíblia"`);
  // Canal que também posta no TikTok: o TikTok só paga vídeo com mais de 1 minuto
  const length = tiktok ? "65 a 85 segundos (180 a 230 palavras faladas no total), 20 a 26 cenas" : "45 a 55 segundos (130 a 150 palavras faladas no total), 14 a 18 cenas";
  const shape = short
    ? `Formato: vídeo curto vertical (YouTube Shorts${tiktok ? " e TikTok" : ""}) de ${length} de UMA frase curta cada ` +
      `(no máximo 12 palavras; a imagem troca a cada 2 a 4 segundos, ritmo rápido de vídeo viral). ` +
      `A primeira frase é o gancho (pergunta ou fato chocante) e prende nos 2 primeiros segundos. ` +
      `Termine com uma pergunta para comentarem e ${cta}. Sem capítulos (chapter = null). ` +
      `Inclua #shorts nas hashtags.`
    : `Formato: vídeo horizontal de 6 a 8 minutos (900 a 1150 palavras faladas), 55 a 75 cenas de UMA frase cada (a imagem troca a cada 5 a 8 segundos). ` +
      `Abertura com gancho forte nos primeiros 15 segundos e a promessa do vídeo; depois 5 a 7 capítulos (curiosidades), ` +
      `cada um começando numa cena com chapter preenchido (a primeira cena tem chapter "${en ? "Introduction" : language === "es" ? "Introducción" : "Introdução"}"); ` +
      `fechamento com uma lição e chamada para se inscrever e comentar.`;
  const script = await generateJSON(stick ? StickScript : Script,
    rules(niche, language, style) + `\n\n${HOOK_GUIDE}`,
    `${shape}\n\nTema: ${video.topic}\nGancho: ${video.angle ?? "(escolha a melhor fórmula)"}` +
      (video.redo_note ? `\n\nO dono pediu para refazer este vídeo assim: ${video.redo_note}` : ""),
    "medium");
  return await checkHook(script, language).catch(() => script);
}

const HookCheck = z.object({
  score: z.number().describe("Nota de 0 a 10 do gancho"),
  problems: z.array(z.string()).describe("O que enfraquece o gancho (vazio se nota 8 ou mais)"),
  better: z.string().describe("Primeira frase reescrita, mais forte, no mesmo idioma e com no máximo 14 palavras; vazio se nota 8 ou mais"),
});

/**
 * Dá nota ao gancho antes de gravar (como o hookscore do projeto de skills): abaixo de 7, troca só a fala da primeira
 * cena pela versão melhor. A imagem/pose da cena continua a mesma.
 */
async function checkHook<T extends { title: string; scenes: { narration: string }[] }>(script: T, language: string): Promise<T> {
  const first = script.scenes[0]?.narration;
  if (!first) return script;
  const r = await generateJSON(HookCheck,
    `Você avalia ganchos de vídeos curtos e longos do YouTube/TikTok. Seja duro: a maioria dos ganchos é fraca.\n\n${HOOK_GUIDE}\n\n` +
      `Critérios: confirma o título? abre uma pergunta que a pessoa não consegue largar? é específico (número, nome, lugar)? ` +
      `uma ideia só? sem enrolação no começo? não entrega a resposta?`,
    `Idioma do vídeo: ${language}\nTítulo: ${script.title}\nPrimeiras falas:\n1. ${first}\n2. ${script.scenes[1]?.narration ?? ""}\n\n` +
      `Dê a nota do gancho (fala 1, com a 2 de apoio). Se for menor que 8, reescreva a fala 1 sem mudar o fato nem inventar nada.`,
    "low");
  if (r.score >= 7 || !r.better.trim()) return script;
  const scenes = script.scenes.map((sc, i) => i === 0 ? { ...sc, narration: r.better.trim() } : sc);
  return { ...script, scenes };
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
      // Bonequinhos: além do nicho, o que está em alta nos vídeos explicativos em geral
      const extra = channel.style === "stickman" ? STICK_TRENDS[channel.language] ?? STICK_TRENDS.en : [];
      trends = await ytResearch(await ytToken(db, channel.id), channel.niche, channel.language, extra);
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
  const items = await planTopics(channel.niche, trends, (past ?? []).map((p) => p.topic).filter(Boolean), kinds, channel.language, channel.style ?? "");
  // Canal em inglês publica no fim da tarde/noite dos EUA
  // Horário de Brasília. EN: almoço e noite em Nova York. ES: 13h e 20h na Cidade do México (UTC-6) = 16h e 23h aqui
  const times = channel.language === "en" ? { short: ["14:00", "21:00", "11:00"], long: "21:30" }
    : channel.language === "es" ? { short: ["16:00", "23:00", "10:00"], long: "22:30" }
    : { short: SHORT_TIMES, long: "18:00" };
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
    const { data: channels } = await db.from("yt_channels").select("*").eq("enabled", true).eq("mode", "bible")
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
  const { data: next } = await db.from("yt_videos").select("*, yt_channels(niche, language, style, tiktok_account)").eq("status", "draft").order("publish_at").limit(1).maybeSingle();
  if (next) {
    const { data: claimed } = await db.from("yt_videos").update({ status: "scripting", updated_at: new Date().toISOString() })
      .eq("id", next.id).eq("status", "draft").select("id").maybeSingle();
    if (claimed) {
      try {
        const script = await writeScript(next.yt_channels?.niche ?? "Curiosidades da Bíblia", next, next.yt_channels?.language ?? "pt", next.yt_channels?.style ?? "", !!next.yt_channels?.tiktok_account);
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
