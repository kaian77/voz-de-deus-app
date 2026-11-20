// Conta e nuvem do FORMA (função `forma` do Supabase). Conta própria, separada do login do Studio.
// O aparelho continua sendo a fonte do dia a dia (funciona sem internet); a nuvem guarda e sincroniza.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../studio/lib/config";
import { onSave, store, type Session, type WeekPlan } from "./data";

const KEY = "forma_session";
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* */ } },
};

export interface Me {
  user: { id: string; email: string; name: string; role: "aluno" | "personal"; code: string };
  personal: { id: string; name: string; code: string } | null;
  data: Record<string, unknown>;
  workouts: Session[];
}

export const cloud = {
  me: null as Me | null,
  get session() { return ls.get(KEY); },
  get on() { return !!SUPABASE_URL; },
};

export async function api<T = Record<string, unknown>>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  if (!SUPABASE_URL) throw new Error("Sem conexão com o servidor.");
  const r = await fetch(`${SUPABASE_URL}/functions/v1/forma`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ action, session: cloud.session, ...data }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && cloud.session) { ls.set(KEY, null); cloud.me = null; }
  if (!r.ok) throw new Error(j.error || "Não deu certo. Confira a internet e tente de novo.");
  return j as T;
}

function localData() {
  return { plan: store.plan(), goals: store.goals(), weights: store.weights(), prefs: { name: store.prefs().name } };
}

/** Junta o que veio da nuvem com o que está no aparelho. */
function merge(m: Me, firstLogin: boolean) {
  cloud.me = m;
  const d = m.data as { plan?: WeekPlan; goals?: never; weights?: never; planBy?: string };
  const cloudEmpty = !d.plan && !d.goals;
  if (cloudEmpty || (firstLogin && !d.plan)) {
    api("save_data", { data: localData() }).catch(() => {});
  } else {
    store.replace({ plan: d.plan, goals: d.goals, weights: d.weights, prefs: { name: m.user.name } });
  }
  // treinos: junta os dois lados pelo id
  const local = store.history();
  const ids = new Set(m.workouts.map((w) => w.id));
  const missing = local.filter((w) => !ids.has(w.id));
  if (missing.length) api("save_workouts", { workouts: missing }).catch(() => {});
  const all = [...m.workouts, ...missing].sort((a, b) => b.started - a.started);
  store.replace({ history: all });
}

export async function signup(email: string, pass: string, name: string, role: "aluno" | "personal") {
  const r = await api<Me & { session: string }>("signup", { email, pass, name, role, data: localData() });
  ls.set(KEY, r.session);
  merge(r, true);
}

export async function login(email: string, pass: string) {
  const r = await api<Me & { session: string }>("login", { email, pass });
  ls.set(KEY, r.session);
  merge(r, true);
}

export async function logout() {
  await api("logout").catch(() => {});
  ls.set(KEY, null);
  cloud.me = null;
}

/** Ao abrir o app: puxa da nuvem (treino que o personal mudou, treinos de outro aparelho). */
export async function refresh() {
  if (!cloud.session) return null;
  try {
    merge(await api<Me>("me"), false);
    return cloud.me;
  } catch {
    return null;
  }
}

let timer = 0;
onSave.fn = (key) => {
  if (!cloud.session) return;
  if (key === "forma_hist") return; // treinos vão por saveWorkout
  clearTimeout(timer);
  timer = window.setTimeout(() => api("save_data", { data: localData() }).catch(() => {}), 1200);
};

export function saveWorkout(s: Session) {
  if (cloud.session) api("save_workouts", { workouts: [s] }).catch(() => {});
}
export function deleteWorkout(id: string) {
  if (cloud.session) api("delete_workout", { id }).catch(() => {});
}

/** Manda o vídeo do treino para o personal (link assinado do storage). */
export async function sendVideo(blob: Blob, title: string, secs: number) {
  const up = await api<{ id: string; url: string }>("video_upload", { title, secs, size: blob.size, type: blob.type });
  const r = await fetch(up.url, { method: "PUT", headers: { "Content-Type": blob.type || "video/mp4", "x-upsert": "true" }, body: blob });
  if (!r.ok) throw new Error("O envio do vídeo falhou. Tente de novo no Wi-Fi.");
  await api("video_done", { id: up.id });
}

// ---------- lembrete no celular ----------
function b64ToBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function reminderOn(at: string, days: number[]) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Este navegador não tem aviso. No iPhone, primeiro adicione o FORMA à tela inicial e abra por lá.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Você não liberou os avisos. Libere nas configurações do navegador.");
  const reg = await navigator.serviceWorker.register("/treino/sw.js", { scope: "/treino/" });
  await navigator.serviceWorker.ready.catch(() => {});
  const { key } = await api<{ key: string }>("push_key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api("push_subscribe", { sub: sub.toJSON(), at, days });
  ls.set("forma_remind", JSON.stringify({ at, days }));
  await api("push_test");
}

export async function reminderOff() {
  const reg = await navigator.serviceWorker?.getRegistration("/treino/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await api("push_off", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  ls.set("forma_remind", null);
}

export function reminderSaved(): { at: string; days: number[] } | null {
  try { return JSON.parse(ls.get("forma_remind") || "null"); } catch { return null; }
}
