// Conta, família e nuvem do Cantinho do bebê (função `bebe` do Supabase). O celular continua sendo a base do dia a dia
// (abre e salva sem internet); com conta + família, cada mudança sobe para a nuvem e as dos outros celulares descem.
// Fotos ficam só no aparelho por enquanto.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../studio/lib/config";
import { db, merge, onChange, replaceAll, sameData, type Data } from "./store";

export type Role = "dono" | "edita" | "ve";
export type Family = { id: string; name: string; role: Role; version?: number };
type Auth = { session: string; user: { id: string; email: string; name: string }; family?: Family; version?: number; syncedAt?: number };

const KEY = "cb_auth";
let auth: Auth | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as Auth | null;
  } catch {
    return null;
  }
})();
const keep = () => {
  try {
    if (auth) localStorage.setItem(KEY, JSON.stringify(auth));
    else localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento */
  }
};
export const account = () => auth;
export const cloudOn = () => !!SUPABASE_URL;
const listeners = new Set<(s: SyncState) => void>();
export type SyncState = "off" | "ok" | "busy" | "offline" | "erro";
let state: SyncState = auth?.family ? "ok" : "off";
const setState = (s: SyncState) => {
  state = s;
  listeners.forEach((f) => f(s));
};
export const syncState = () => state;
export const onSync = (f: (s: SyncState) => void) => (listeners.add(f), () => listeners.delete(f));

export async function api<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!SUPABASE_URL) throw new Error("Sem servidor configurado.");
  const r = await fetch(`${SUPABASE_URL}/functions/v1/bebe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ action, session: auth?.session, ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && auth) {
    auth = null;
    keep();
    setState("off");
  }
  if (!r.ok) throw new Error(j.error || "Não deu certo. Confira a internet e tente de novo.");
  return j as T;
}

type MeRes = { session?: string; user: Auth["user"]; families: Family[] };
export async function signup(name: string, email: string, pass: string) {
  const r = await api<MeRes>("signup", { name, email, pass });
  auth = { session: r.session!, user: r.user };
  keep();
  return r;
}
export async function login(email: string, pass: string) {
  const r = await api<MeRes>("login", { email, pass });
  auth = { session: r.session!, user: r.user };
  keep();
  return r;
}
export const me = () => api<MeRes>("me");
export async function logout() {
  await api("logout").catch(() => {});
  auth = null;
  keep();
  setState("off");
}

/** Cria a família com os dados deste celular. */
export async function createFamily(name: string) {
  const r = await api<{ family: Family }>("family_create", { name, data: db() });
  auth!.family = r.family;
  auth!.version = r.family.version ?? 1;
  keep();
  setState("ok");
  return r.family;
}
/** Usa uma família: "juntar" mantém o que já está neste celular; "trocar" fica só com os da família. */
export async function enterFamily(f: Family, mode: "juntar" | "trocar") {
  const r = await api<{ data: Data; version: number; role: Role; name: string }>("family_get", { family: f.id });
  auth!.family = { id: f.id, name: r.name, role: r.role };
  auth!.version = r.version;
  keep();
  const remote = { ...(r.data as Data) };
  replaceAll(mode === "juntar" ? merge(db(), remote) : merge(remote, { ...remote, current: db().current }));
  setState("ok");
  await sync();
}
export async function joinByCode(code: string) {
  const r = await api<{ family: Family }>("join", { code });
  return r.family;
}
export function forgetFamily() {
  if (!auth) return;
  delete auth.family;
  delete auth.version;
  keep();
  setState("off");
}

// ---------- sincronizar: baixa, junta e sobe (se outro celular salvou no meio, repete)
let running: Promise<void> | null = null;
let again = false;
export function sync(): Promise<void> {
  if (!auth?.family) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    setState("busy");
    try {
      for (let i = 0; i < 4; i++) {
        const fam = auth!.family!;
        const r = await api<{ data: Data; version: number; role: Role; name: string }>("family_get", { family: fam.id });
        fam.role = r.role;
        fam.name = r.name;
        const remote = r.data as Data;
        const mine = db();
        const joined = merge(mine, remote);
        if (!sameData(joined, mine)) replaceAll(joined);
        auth!.version = r.version;
        if (r.role === "ve" || sameData(joined, remote)) break; // nada novo para subir
        const s = await api<{ ok: boolean; version: number; conflict?: boolean }>("family_save", { family: fam.id, base: r.version, data: { ...joined, current: "" } });
        if (s.ok) {
          auth!.version = s.version;
          break;
        }
      }
      auth!.syncedAt = Date.now();
      keep();
      setState("ok");
    } catch (e) {
      setState(navigator.onLine ? "erro" : "offline");
      if (String((e as Error).message).includes("não faz parte")) forgetFamily();
    } finally {
      running = null;
      if (again) {
        again = false;
        void sync();
      }
    }
  })();
  return running;
}

// mudança no celular → sobe em 2,5 s; abrir o app, voltar a ter internet e a cada 1 min → confere a nuvem
let timer = 0;
onChange(() => {
  if (!auth?.family || running) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => void sync(), 2500);
});
export function startSync() {
  addEventListener("online", () => void sync());
  document.addEventListener("visibilitychange", () => !document.hidden && void sync());
  setInterval(() => !document.hidden && void sync(), 60_000);
  void sync();
}
// ---------- avisos no celular
export type Prefs = { mv: boolean; fraldas: boolean; roupas: boolean; agenda: boolean; remedios: boolean; sono: boolean; quiet: string };
export const defaultPrefs: Prefs = { mv: true, fraldas: true, roupas: true, agenda: true, remedios: true, sono: false, quiet: "22:00-07:00" };
const b64ToBytes = (b: string) => {
  const p = "=".repeat((4 - (b.length % 4)) % 4);
  return Uint8Array.from(atob((b + p).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
};
export async function pushOn(prefs: Prefs) {
  if (!auth?.family) throw new Error("Entre na conta e crie ou entre numa família primeiro.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Este celular não recebe avisos pelo navegador. No iPhone, adicione o app à tela inicial primeiro.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Os avisos foram bloqueados. Libere nas configurações do navegador.");
  const reg = await navigator.serviceWorker.register("/bebe/sw.js", { scope: "/bebe/" });
  await navigator.serviceWorker.ready;
  const { key } = await api<{ key: string }>("push_key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api("push_subscribe", { family: auth.family.id, sub: sub.toJSON(), prefs });
  localStorage.setItem("cb_push", JSON.stringify(prefs));
}
export async function pushOffHere() {
  const reg = await navigator.serviceWorker?.getRegistration("/bebe/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api("push_off", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  localStorage.removeItem("cb_push");
}
export const pushPrefs = (): Prefs | null => {
  try {
    return JSON.parse(localStorage.getItem("cb_push") ?? "null") as Prefs | null;
  } catch {
    return null;
  }
};
