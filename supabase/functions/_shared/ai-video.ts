// Vídeos gerados por IA (seção "Vídeos IA" do Studio): Kling (API oficial) e Higgsfield.
// 1) startAiVideo manda o pedido ao provedor e guarda a tarefa (ai_videos, "processing").
// 2) O cron (pollAiVideos) e a tela consultam o provedor; quando o vídeo fica pronto, o MP4 é copiado
//    para o storage do Studio (os links dos provedores expiram) e a linha vira "done".
// Chaves (secrets do GitHub): KLING_ACCESS_KEY + KLING_SECRET_KEY (KLING_API_BASE opcional) e
// HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertPublicHttpsUrl, HttpError } from "./util.ts";
import { freeSlot } from "./products.ts";

export type Provider = "kling" | "higgsfield";

const KLING_BASE = () => (Deno.env.get("KLING_API_BASE") || "https://api-singapore.klingai.com").replace(/\/$/, "");
const HF_BASE = "https://api.higgsfield.ai";
const MAX_WAIT = 3 * 3600_000; // depois disso a tarefa é dada como perdida

export function aiVideoProviders(): Record<Provider, boolean> {
  return {
    kling: !!(Deno.env.get("KLING_ACCESS_KEY") && Deno.env.get("KLING_SECRET_KEY")),
    higgsfield: !!(Deno.env.get("HIGGSFIELD_API_KEY") && (Deno.env.get("HIGGSFIELD_API_SECRET") || Deno.env.get("HIGGSFIELD_API_KEY")!.includes(":"))),
  };
}

const b64url = (data: Uint8Array | string) =>
  btoa(typeof data === "string" ? data : String.fromCharCode(...data)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Token JWT (HS256) que a API do Kling pede, assinado com a secret key. */
async function klingToken() {
  const ak = Deno.env.get("KLING_ACCESS_KEY"), sk = Deno.env.get("KLING_SECRET_KEY");
  if (!ak || !sk) throw new HttpError(400, "Cadastre KLING_ACCESS_KEY e KLING_SECRET_KEY nos secrets do GitHub");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 }))}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sk), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${b64url(sig)}`;
}

function hfAuth() {
  const key = Deno.env.get("HIGGSFIELD_API_KEY"), secret = Deno.env.get("HIGGSFIELD_API_SECRET");
  if (!key) throw new HttpError(400, "Cadastre HIGGSFIELD_API_KEY e HIGGSFIELD_API_SECRET nos secrets do GitHub");
  return `Key ${secret ? `${key}:${secret}` : key}`;
}

async function call(provider: Provider, method: "GET" | "POST", url: string, body?: unknown) {
  const auth = provider === "kling" ? `Bearer ${await klingToken()}` : hfAuth();
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch { /* resposta não-JSON */ }
  const label = provider === "kling" ? "Kling" : "Higgsfield";
  if (!res.ok) {
    const detail = data?.message ?? data?.detail ?? data?.error ?? text;
    throw new HttpError(res.status === 401 || res.status === 403 ? 400 : 502, `${label} (${res.status}): ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 400));
  }
  if (provider === "kling" && data?.code !== undefined && data.code !== 0) throw new HttpError(502, `Kling: ${data.message ?? `código ${data.code}`}`);
  return data;
}

/** Endpoint do Kling: com foto é imagem → vídeo; sem foto, texto → vídeo. */
const klingKind = (imageUrl?: string | null) => (imageUrl ? "image2video" : "text2video");

export type AiVideoInput = {
  provider: Provider;
  model: string;
  prompt?: string;
  image_url?: string | null;
  duration?: number;
  aspect_ratio?: string;
  mode?: "std" | "pro";
  negative_prompt?: string;
  /** Parâmetros extras enviados como estão ao provedor (null apaga um parâmetro padrão). */
  extra?: Record<string, unknown>;
};

function withExtra(body: Record<string, unknown>, extra?: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...body };
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === "") delete out[k];
  return out;
}

export async function startAiVideo(db: SupabaseClient, userId: string, input: AiVideoInput) {
  const provider = input.provider;
  if (provider !== "kling" && provider !== "higgsfield") throw new HttpError(400, "Escolha Kling ou Higgsfield");
  if (!aiVideoProviders()[provider]) throw new HttpError(400, `A chave do ${provider === "kling" ? "Kling" : "Higgsfield"} ainda não foi cadastrada`);
  const model = String(input.model ?? "").trim().replace(/^\/+/, "");
  if (!model || !/^[\w.\-/]+$/.test(model)) throw new HttpError(400, "Modelo inválido");
  const prompt = String(input.prompt ?? "").trim().slice(0, 2500);
  const image = input.image_url ? assertPublicHttpsUrl(String(input.image_url)).toString() : null;
  if (!prompt && !image) throw new HttpError(400, "Escreva o que quer ver no vídeo ou envie uma foto");
  const extra = input.extra && typeof input.extra === "object" && !Array.isArray(input.extra) ? input.extra : undefined;
  const duration = Number(input.duration) || 5;

  let body: Record<string, unknown>;
  let taskId: string | undefined;
  let statusUrl: string | null = null;
  if (provider === "kling") {
    body = withExtra({
      model_name: model,
      prompt,
      negative_prompt: input.negative_prompt,
      duration: String(duration),
      mode: input.mode ?? "pro",
      ...(image ? { image } : { aspect_ratio: input.aspect_ratio ?? "9:16" }),
    }, extra);
    const data = await call("kling", "POST", `${KLING_BASE()}/v1/videos/${klingKind(image)}`, body);
    taskId = data?.data?.task_id;
  } else {
    body = withExtra({
      prompt,
      negative_prompt: input.negative_prompt,
      duration,
      ...(image ? { image_url: image } : { aspect_ratio: input.aspect_ratio ?? "9:16" }),
    }, extra);
    const data = await call("higgsfield", "POST", `${HF_BASE}/${model}`, body);
    taskId = data?.request_id;
    statusUrl = typeof data?.status_url === "string" ? data.status_url : null;
  }
  if (!taskId) throw new HttpError(502, "O provedor não devolveu o número da tarefa");

  const { data, error } = await db.from("ai_videos").insert({
    user_id: userId, provider, model, prompt, image_url: image, params: body, status: "processing", task_id: taskId, status_url: statusUrl,
  }).select().single();
  if (error) throw error;
  return data;
}

/** Procura o primeiro link de vídeo na resposta (os formatos variam por modelo). */
// deno-lint-ignore no-explicit-any
function findVideoUrl(o: any, depth = 0): string | null {
  if (!o || depth > 5) return null;
  if (typeof o === "string") return /^https:\/\//.test(o) && /\.(mp4|mov|webm)(\?|$)/i.test(o) ? o : null;
  if (Array.isArray(o)) {
    for (const x of o) {
      const u = findVideoUrl(x, depth + 1);
      if (u) return u;
    }
    return null;
  }
  if (typeof o === "object") {
    if (o.video?.url) return o.video.url;
    if (Array.isArray(o.videos) && o.videos[0]?.url) return o.videos[0].url;
    for (const v of Object.values(o)) {
      const u = findVideoUrl(v, depth + 1);
      if (u) return u;
    }
  }
  return null;
}

/** Consulta o provedor. Devolve o link do vídeo pronto, "pending" ou lança com o motivo da falha. */
// deno-lint-ignore no-explicit-any
async function providerStatus(v: any): Promise<{ state: "pending" } | { state: "done"; url: string } | { state: "failed"; error: string }> {
  if (v.provider === "kling") {
    const data = await call("kling", "GET", `${KLING_BASE()}/v1/videos/${klingKind(v.image_url)}/${encodeURIComponent(v.task_id)}`);
    const d = data?.data ?? {};
    if (d.task_status === "failed") return { state: "failed", error: d.task_status_msg || "O Kling não conseguiu gerar o vídeo" };
    if (d.task_status === "succeed") {
      const url = d.task_result?.videos?.[0]?.url;
      return url ? { state: "done", url } : { state: "failed", error: "O Kling terminou sem devolver o vídeo" };
    }
    return { state: "pending" };
  }
  const data = await call("higgsfield", "GET", `${HF_BASE}/requests/${encodeURIComponent(v.task_id)}/status`);
  const status = String(data?.status ?? "").toLowerCase();
  if (status === "completed") {
    const url = findVideoUrl(data);
    return url ? { state: "done", url } : { state: "failed", error: "O Higgsfield terminou sem devolver o vídeo" };
  }
  if (status === "nsfw") return { state: "failed", error: "O Higgsfield bloqueou o conteúdo (NSFW). Os créditos são devolvidos." };
  if (status === "failed" || status === "cancelled" || status === "canceled") return { state: "failed", error: data?.error || `Higgsfield: ${status}` };
  return { state: "pending" };
}

/** Confere uma tarefa e, se pronta, guarda o MP4 no storage. */
// deno-lint-ignore no-explicit-any
export async function checkAiVideo(db: SupabaseClient, v: any) {
  if (v.status !== "processing") return v;
  let st;
  try {
    st = await providerStatus(v);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const lost = Date.now() - new Date(v.created_at).getTime() > MAX_WAIT;
    const { data } = await db.from("ai_videos").update(lost ? { status: "failed", error: message } : { error: message }).eq("id", v.id).select().single();
    return data ?? v;
  }
  if (st.state === "pending") {
    if (Date.now() - new Date(v.created_at).getTime() > MAX_WAIT) {
      const { data } = await db.from("ai_videos").update({ status: "failed", error: "O provedor demorou demais para entregar o vídeo" }).eq("id", v.id).select().single();
      return data ?? v;
    }
    return v;
  }
  if (st.state === "failed") {
    const { data } = await db.from("ai_videos").update({ status: "failed", error: st.error.slice(0, 500) }).eq("id", v.id).select().single();
    return data ?? v;
  }
  // Trava: só uma execução (cron ou tela) baixa o vídeo
  const { data: claimed } = await db.from("ai_videos").update({ attempts: v.attempts + 1 }).eq("id", v.id)
    .eq("status", "processing").eq("attempts", v.attempts).select("id").maybeSingle();
  if (!claimed) return v;
  try {
    const res = await fetch(st.url);
    if (!res.ok) throw new Error(`download do vídeo: HTTP ${res.status}`);
    const path = `${v.user_id}/ia/${v.id}.mp4`;
    const { error } = await db.storage.from("media").upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: "video/mp4", upsert: true });
    if (error) throw error;
    const url = db.storage.from("media").getPublicUrl(path).data.publicUrl;
    const { data } = await db.from("ai_videos").update({ status: "done", video_url: url, error: null }).eq("id", v.id).select().single();
    return data ?? v;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Depois de algumas tentativas, guarda o link do provedor mesmo (expira em alguns dias)
    const patch = v.attempts + 1 >= 3 ? { status: "done", video_url: st.url, error: `Não deu para copiar para o Studio: ${message}` } : { error: message };
    const { data } = await db.from("ai_videos").update(patch).eq("id", v.id).select().single();
    return data ?? v;
  }
}

/** Cron e tela: confere as tarefas em andamento (de um usuário ou de todos). */
export async function pollAiVideos(db: SupabaseClient, userId?: string, max = 8) {
  let q = db.from("ai_videos").select("*").eq("status", "processing").order("updated_at").limit(max);
  if (userId) q = q.eq("user_id", userId);
  const { data: rows } = await q;
  const report = [];
  for (const v of rows ?? []) {
    const r = await checkAiVideo(db, v);
    if (r.status !== "processing") report.push({ id: v.id, status: r.status });
  }
  return report;
}

/** Vira post (Reels + TikTok) para aprovação, no próximo horário nobre livre. */
export async function aiVideoPost(db: SupabaseClient, userId: string, id: string, caption?: string) {
  const { data: v } = await db.from("ai_videos").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!v || v.status !== "done" || !v.video_url) throw new HttpError(400, "O vídeo ainda não está pronto");
  if (v.post_id) {
    const { data: existing } = await db.from("posts").select("id,status").eq("id", v.post_id).maybeSingle();
    if (existing) return existing;
  }
  const { data: settings } = await db.from("brand_settings").select("timezone").eq("user_id", userId).maybeSingle();
  const { data: accounts } = await db.from("social_accounts").select("platform").eq("user_id", userId).in("platform", ["instagram", "tiktok"]);
  const platforms = [...new Set((accounts ?? []).map((a) => a.platform as string))];
  if (!platforms.length) throw new HttpError(400, "Conecte o Instagram ou o TikTok em Contas para postar");
  const { data: post, error } = await db.from("posts").insert({
    user_id: userId,
    title: `Vídeo IA: ${(v.prompt || v.model).slice(0, 60)}`,
    kind: "reel",
    platforms,
    caption: (caption ?? "").slice(0, 2200),
    media: [{ url: v.video_url, type: "video" }],
    scheduled_at: await freeSlot(db, userId, settings?.timezone ?? "America/Sao_Paulo"),
    status: "pending_approval",
    created_by: "user",
    notes: `Vídeo gerado no ${v.provider === "kling" ? "Kling" : "Higgsfield"} (${v.model}).`,
  }).select("id,status").single();
  if (error) throw error;
  await db.from("ai_videos").update({ post_id: post.id }).eq("id", v.id);
  return post;
}
