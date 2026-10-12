// HeyGen (API v3): vídeos curtos com o avatar e a voz da marca.
// Usa o Video Agent (POST /v3/video-agents): roteiro + avatar + voz + fotos do produto -> vídeo pronto.
// A chave fica no secret HEYGEN_API_KEY (GitHub -> Supabase), nunca no banco nem no navegador.

const BASE = "https://api.heygen.com";

export function heygenEnabled() {
  return Boolean(Deno.env.get("HEYGEN_API_KEY"));
}

// deno-lint-ignore no-explicit-any
type Json = any;

async function hg<T = Json>(path: string, init: { method?: string; body?: unknown; params?: Record<string, string | number | undefined> } = {}): Promise<T> {
  const key = Deno.env.get("HEYGEN_API_KEY");
  if (!key) throw new Error("Configure a chave da HeyGen (secret HEYGEN_API_KEY no GitHub) e rode o deploy.");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(init.params ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { "x-api-key": key, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text.slice(0, 300) };
  }
  const err = data?.error;
  if (!res.ok || (err && typeof err === "object" && (err.message || err.code))) {
    const msg = (typeof err === "object" ? err?.message ?? err?.code : err) ?? data?.message ?? `HTTP ${res.status}`;
    throw new Error(`HeyGen: ${msg}${typeof err === "object" && err?.param ? ` (${err.param})` : ""}`);
  }
  return (data?.data ?? data) as T;
}

const list = (d: Json): Json[] => (Array.isArray(d) ? d : d?.data ?? d?.items ?? d?.looks ?? d?.voices ?? []);

export type HeygenLook = { id: string; name: string; group?: string; image?: string; voice_id?: string; private: boolean };
export type HeygenVoice = { id: string; name: string; language?: string; gender?: string; preview?: string; private: boolean };

async function paged(path: string, params: Record<string, string | number | undefined>, max = 4) {
  const out: Json[] = [];
  let token: string | undefined;
  for (let i = 0; i < max; i++) {
    const key = Deno.env.get("HEYGEN_API_KEY")!;
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries({ ...params, token })) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const res = await fetch(url, { headers: { "x-api-key": key, accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HeyGen: ${body?.error?.message ?? body?.message ?? `HTTP ${res.status}`}`);
    out.push(...list(body?.data ?? body));
    token = body?.next_token ?? body?.data?.next_token;
    if (!(body?.has_more ?? body?.data?.has_more) || !token) break;
  }
  return out;
}

/** Avatares (looks) da conta. Os próprios (como a Katia) vêm primeiro. */
export async function hgLooks(): Promise<HeygenLook[]> {
  if (!heygenEnabled()) throw new Error("Configure a chave da HeyGen (secret HEYGEN_API_KEY no GitHub) e rode o deploy.");
  const map = (x: Json, own: boolean): HeygenLook => ({
    id: String(x.id ?? x.look_id ?? x.avatar_id),
    name: String(x.name ?? x.look_name ?? x.avatar_name ?? "Avatar"),
    group: x.group_name ?? x.avatar_group_name ?? undefined,
    image: x.preview_image_url ?? x.image_url ?? x.thumbnail_url ?? undefined,
    voice_id: x.default_voice_id ?? undefined,
    private: own,
  });
  const own = (await paged("/v3/avatars/looks", { ownership: "private", limit: 50 })).map((x) => map(x, true));
  if (own.length) return own;
  return (await paged("/v3/avatars/looks", { limit: 50 }, 2)).map((x) => map(x, false));
}

/** Vozes da conta (as clonadas/privadas primeiro). */
export async function hgVoices(): Promise<HeygenVoice[]> {
  if (!heygenEnabled()) throw new Error("Configure a chave da HeyGen (secret HEYGEN_API_KEY no GitHub) e rode o deploy.");
  const map = (x: Json): HeygenVoice => ({
    id: String(x.voice_id ?? x.id),
    name: String(x.name ?? x.display_name ?? "Voz"),
    language: x.language ?? x.locale ?? undefined,
    gender: x.gender ?? undefined,
    preview: x.preview_audio_url ?? x.preview_audio ?? x.preview_url ?? undefined,
    private: x.type === "private" || x.is_private === true || x.ownership === "private",
  });
  const own = (await paged("/v3/voices", { type: "private", limit: 50 }, 2).catch(() => [])).map((x) => ({ ...map(x), private: true }));
  const pt = (await paged("/v3/voices", { language: "Portuguese", limit: 50 }, 2).catch(() => [])).map(map);
  const seen = new Set<string>();
  return [...own, ...pt].filter((v) => !seen.has(v.id) && seen.add(v.id));
}

/** Cria a sessão do Video Agent. Devolve o id da sessão (o vídeo sai alguns minutos depois). */
export async function hgCreateAgentVideo(input: { prompt: string; avatarId?: string | null; voiceId?: string | null; images: string[] }) {
  const body = (files: Json[] | undefined) => ({
    prompt: input.prompt,
    mode: "generate",
    orientation: "portrait",
    ...(input.avatarId ? { avatar_id: input.avatarId } : {}),
    ...(input.voiceId ? { voice_id: input.voiceId } : {}),
    ...(files?.length ? { files } : {}),
  });
  const images = input.images.slice(0, 10);
  let r: Json;
  try {
    r = await hg("/v3/video-agents", { method: "POST", body: body(images.map((url) => ({ type: "url", url }))) });
  } catch (e) {
    // O formato do anexo varia entre versões da API: tenta só com a URL
    if (!/files|type/i.test(String(e))) throw e;
    r = await hg("/v3/video-agents", { method: "POST", body: body(images.map((url) => ({ url }))) });
  }
  const sessionId = r?.session_id ?? r?.id;
  if (!sessionId) throw new Error("HeyGen não devolveu a sessão do vídeo");
  return { sessionId: String(sessionId), videoId: r?.video_id ? String(r.video_id) : null };
}

/** Estado da sessão: o video_id aparece quando a renderização começa. */
export async function hgAgentSession(sessionId: string) {
  const r = await hg(`/v3/video-agents/${encodeURIComponent(sessionId)}`);
  return {
    status: String(r?.status ?? ""),
    videoId: r?.video_id ? String(r.video_id) : (r?.videos?.[0]?.video_id ?? r?.videos?.[0]?.id ?? null) as string | null,
    error: r?.failure_message ?? r?.error?.message ?? r?.message ?? null,
  };
}

export async function hgVideo(videoId: string) {
  const r = await hg(`/v3/videos/${encodeURIComponent(videoId)}`);
  return {
    status: String(r?.status ?? ""),
    url: (r?.video_url ?? null) as string | null,
    thumbnail: (r?.thumbnail_url ?? null) as string | null,
    duration: (r?.duration ?? null) as number | null,
    error: (r?.failure_message ?? r?.msg ?? r?.error?.message ?? null) as string | null,
  };
}
