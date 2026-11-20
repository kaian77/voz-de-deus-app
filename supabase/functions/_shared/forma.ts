// App de treino FORMA (/treino): conta própria (e-mail + senha; NÃO é o login do Studio), nuvem dos treinos,
// desafios e ranking, lembrete no celular. Sem personal humano: o foco é treinar sozinho com o Tonhão.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, sha256Hex } from "./util.ts";
import { pushPublicKey, sendWebPush } from "./push.ts";

type Db = SupabaseClient;
type Obj = Record<string, unknown>;
export interface FUser { id: string; email: string; name: string; code: string; data: Obj; data_at: string }

const COLS = "id, email, name, code, data, data_at";
const TIMED = new Set(["plank"]);

// ---------------------------------------------------------------- senha e sessão
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iter: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}
async function hashPassword(p: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$100000$${b64(salt)}$${b64(await pbkdf2(p, salt, 100000))}`;
}
async function checkPassword(p: string, stored: string) {
  const [kind, iter, salt, hash] = stored.split("$");
  if (kind !== "pbkdf2" || !hash) return false;
  const got = b64(await pbkdf2(p, unb64(salt), Number(iter)));
  return got.length === hash.length && [...got].reduce((a, c, i) => a | (c.charCodeAt(0) ^ hash.charCodeAt(i)), 0) === 0;
}
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
function newCode(n = 6) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => abc[b % abc.length]).join("");
}

async function newSession(db: Db, userId: string) {
  const token = hex(24);
  await db.from("forma_auth").insert({ token_hash: await sha256Hex(token), user_id: userId, expires_at: new Date(Date.now() + 120 * 86400_000).toISOString() });
  return token;
}

export async function userBySession(db: Db, session: unknown): Promise<FUser> {
  const s = String(session ?? "");
  if (s.length < 20) throw new HttpError(401, "Entre na sua conta de novo.");
  const { data } = await db.from("forma_auth").select("user_id, expires_at").eq("token_hash", await sha256Hex(s)).maybeSingle();
  if (!data || new Date(data.expires_at) < new Date()) throw new HttpError(401, "Sua sessão expirou. Entre de novo.");
  const { data: u } = await db.from("forma_users").select(COLS).eq("id", data.user_id).single();
  return u as FUser;
}

const cleanEmail = (e: unknown) => String(e ?? "").trim().toLowerCase().slice(0, 160);
const cleanName = (n: unknown) => String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

export async function signup(db: Db, b: Obj) {
  const email = cleanEmail(b.email), pass = String(b.pass ?? ""), name = cleanName(b.name);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "E-mail inválido.");
  if (pass.length < 6) throw new HttpError(400, "A senha precisa de pelo menos 6 letras ou números.");
  if (!name) throw new HttpError(400, "Coloque seu nome.");
  const { data: exists } = await db.from("forma_users").select("id").eq("email", email).maybeSingle();
  if (exists) throw new HttpError(400, "Já existe conta com esse e-mail. Toque em Entrar.");
  let user: FUser | null = null;
  for (let i = 0; i < 5 && !user; i++) {
    const { data, error } = await db.from("forma_users").insert({ email, pass: await hashPassword(pass), name, code: newCode(), data: (b.data as Obj) ?? {} }).select(COLS).single();
    if (!error) user = data as FUser;
    else if (!String(error.message).includes("code")) throw new HttpError(400, "Não deu para criar a conta. Tente de novo.");
  }
  if (!user) throw new HttpError(500, "Tente de novo.");
  return { session: await newSession(db, user.id), ...(await me(db, user)) };
}

export async function login(db: Db, b: Obj) {
  const email = cleanEmail(b.email);
  const { data } = await db.from("forma_users").select(`${COLS}, pass`).eq("email", email).maybeSingle();
  // mesma espera com ou sem conta, para não revelar quem tem conta
  const ok = await checkPassword(String(b.pass ?? ""), data?.pass ?? "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$x");
  if (!data || !ok) throw new HttpError(400, "E-mail ou senha errados.");
  const { pass: _p, ...user } = data;
  return { session: await newSession(db, user.id), ...(await me(db, user as FUser)) };
}

export async function logout(db: Db, session: unknown) {
  await db.from("forma_auth").delete().eq("token_hash", await sha256Hex(String(session ?? "")));
  return { ok: true };
}

// ---------------------------------------------------------------- dados
function stats(w: Obj) {
  let reps = 0, perfect = 0;
  for (const e of (w.exercises as Obj[]) ?? []) {
    if (TIMED.has(String(e.ex))) continue;
    for (const s of (e.sets as Obj[]) ?? []) { reps += Number(s.reps) || 0; perfect += Number(s.good) || 0; }
  }
  return { reps, perfect };
}

export async function me(db: Db, u: FUser) {
  const { data: workouts } = await db.from("forma_workouts").select("data").eq("user_id", u.id).order("day", { ascending: false }).limit(500);
  return {
    user: { id: u.id, email: u.email, name: u.name },
    data: u.data,
    data_at: u.data_at,
    workouts: (workouts ?? []).map((w) => w.data),
  };
}

export async function saveData(db: Db, u: FUser, b: Obj) {
  const d = (b.data ?? {}) as Obj;
  if (JSON.stringify(d).length > 200_000) throw new HttpError(400, "Dados grandes demais.");
  const at = new Date().toISOString();
  await db.from("forma_users").update({ data: { ...u.data, ...d }, data_at: at }).eq("id", u.id);
  return { ok: true, data_at: at };
}

export async function saveProfile(db: Db, u: FUser, b: Obj) {
  const patch: Obj = {};
  if (b.name !== undefined) patch.name = cleanName(b.name) || u.name;
  await db.from("forma_users").update(patch).eq("id", u.id);
  return { ok: true };
}

export async function saveWorkouts(db: Db, u: FUser, b: Obj) {
  const list = ((b.workouts as Obj[]) ?? []).slice(0, 500);
  const rows = list.filter((w) => typeof w.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(w.date))).map((w) => ({
    id: String(w.id).slice(0, 40), user_id: u.id, day: String(w.date), data: w, ...stats(w),
  }));
  if (!rows.length) return { ok: true, saved: 0 };
  // placar antes e depois: quem ficou para trás recebe o aviso "passou de você"
  const wk = weekStartISO(), today = brNow().toISOString().slice(0, 10);
  const fresh = rows.some((r) => r.day >= wk);
  const before = fresh ? await weekTotals(db, wk) : null;
  const chBefore = fresh ? await myChallengeScores(db, u) : [];
  await db.from("forma_workouts").upsert(rows, { onConflict: "user_id,id" });
  if (fresh) {
    const after = await weekTotals(db, wk);
    await notifyPassed(db, u, before!, after, "semana", "");
    for (const c of chBefore) {
      if (c.ends < today || c.starts > today) continue;
      const now = await scores(db, c.members, c.starts, c.ends, c.ex);
      await notifyPassed(db, u, c.scores, now, `ch:${c.code}`, c.title);
    }
  }
  return { ok: true, saved: rows.length };
}

async function weekTotals(db: Db, wk: string) {
  const { data } = await db.from("forma_workouts").select("user_id, perfect").gte("day", wk).limit(20000);
  const m = new Map<string, number>();
  for (const w of data ?? []) m.set(w.user_id, (m.get(w.user_id) ?? 0) + w.perfect);
  return m;
}

async function myChallengeScores(db: Db, u: FUser) {
  const { data: mine } = await db.from("forma_challenge_members").select("challenge_id").eq("user_id", u.id).limit(20);
  const ids = (mine ?? []).map((m) => m.challenge_id);
  if (!ids.length) return [];
  const today = brNow().toISOString().slice(0, 10);
  const { data: list } = await db.from("forma_challenges").select("id, code, title, ex, starts, ends").in("id", ids).gte("ends", today).limit(10);
  const out = [];
  for (const c of list ?? []) {
    const { data: mem } = await db.from("forma_challenge_members").select("user_id").eq("challenge_id", c.id).limit(200);
    const members = (mem ?? []).map((m) => m.user_id);
    out.push({ ...c, members, scores: await scores(db, members, c.starts, c.ends, c.ex) });
  }
  return out;
}

/** Quem estava na frente (ou empatado) e ficou para trás ganha o aviso — 1 por dia por pessoa e lugar. */
async function notifyPassed(db: Db, u: FUser, before: Map<string, number>, after: Map<string, number>, scope: string, title: string) {
  const old = before.get(u.id) ?? 0, now = after.get(u.id) ?? 0;
  if (now <= old) return;
  const passed = [...before.entries()].filter(([id, v]) => id !== u.id && v > 0 && v >= old && v < now).map(([id]) => id).slice(0, 30);
  if (!passed.length) return;
  const day = brNow().toISOString().slice(0, 10);
  const name = firstName(u.name) || "Alguém";
  const { data: fresh } = await db.from("forma_passes")
    .upsert(passed.map((id) => ({ user_id: id, by_id: u.id, by_name: name, scope, title, day })), { onConflict: "user_id,by_id,scope,day", ignoreDuplicates: true })
    .select("user_id");
  const ids = (fresh ?? []).map((r) => r.user_id);
  if (!ids.length) return;
  const { data: subs } = await db.from("forma_push").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids).eq("passes", true);
  const where = scope === "semana" ? "no ranking da semana" : `no desafio "${title}"`;
  for (const s of subs ?? []) {
    const r = await sendWebPush(db, s, { title: `🔥 ${name} passou de você!`, body: `${name} acabou de passar de você ${where}. Bora treinar e pegar o lugar de volta? 💪`, url: "/treino?aba=ranking" });
    if (r === "gone") await db.from("forma_push").delete().eq("id", s.id);
  }
}

export async function passes(db: Db, u: FUser) {
  const { data } = await db.from("forma_passes").select("by_name, scope, title, created_at").eq("user_id", u.id).order("created_at", { ascending: false }).limit(10);
  return { passes: data ?? [] };
}

export async function deleteWorkout(db: Db, u: FUser, id: unknown) {
  await db.from("forma_workouts").delete().eq("user_id", u.id).eq("id", String(id));
  return { ok: true };
}

const weekStartISO = () => {
  const d = brNow();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- ranking e desafios
async function scores(db: Db, ids: string[], from: string, to: string, ex?: string) {
  if (!ids.length) return new Map<string, number>();
  const { data } = await db.from("forma_workouts").select("user_id, data, perfect").in("user_id", ids).gte("day", from).lte("day", to).limit(5000);
  const m = new Map<string, number>();
  for (const w of data ?? []) {
    let v = 0;
    if (!ex) v = w.perfect;
    else for (const e of ((w.data as Obj).exercises as Obj[]) ?? []) {
      if (e.ex !== ex) continue;
      for (const s of (e.sets as Obj[]) ?? []) v += TIMED.has(ex) ? Number(s.secs) || 0 : Number(s.good) || 0;
    }
    m.set(w.user_id, (m.get(w.user_id) ?? 0) + v);
  }
  return m;
}

const firstName = (n: string) => n.split(" ").slice(0, 2).join(" ");

export async function ranking(db: Db, u: FUser) {
  const wk = weekStartISO();
  const { data } = await db.from("forma_workouts").select("user_id, perfect").gte("day", wk).limit(10000);
  const tot = new Map<string, number>();
  for (const w of data ?? []) tot.set(w.user_id, (tot.get(w.user_id) ?? 0) + w.perfect);
  const top = [...tot.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const pos = top.findIndex(([id]) => id === u.id);
  const ids = top.slice(0, 50).map(([id]) => id);
  const { data: names } = ids.length ? await db.from("forma_users").select("id, name").in("id", ids) : { data: [] };
  const nm = new Map((names ?? []).map((n) => [n.id, firstName(n.name)]));
  return {
    week: wk,
    top: top.slice(0, 50).map(([id, v]) => ({ name: nm.get(id) ?? "Atleta", score: v, me: id === u.id })),
    me: pos >= 0 ? { pos: pos + 1, score: top[pos][1], total: top.length } : null,
  };
}

export async function challengeCreate(db: Db, u: FUser, b: Obj) {
  const title = String(b.title ?? "").trim().slice(0, 60) || "Desafio";
  const ex = String(b.ex ?? "pushup").slice(0, 20);
  const days = Math.min(60, Math.max(1, Number(b.days) || 7));
  const starts = brNow();
  const ends = new Date(starts.getTime() + (days - 1) * 86400_000);
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db.from("forma_challenges").insert({ code: newCode(5), title, ex, starts: starts.toISOString().slice(0, 10), ends: ends.toISOString().slice(0, 10), owner: u.id }).select("id, code").single();
    if (!error && data) {
      await db.from("forma_challenge_members").insert({ challenge_id: data.id, user_id: u.id });
      return { ok: true, code: data.code };
    }
  }
  throw new HttpError(500, "Tente de novo.");
}

export async function challengeJoin(db: Db, u: FUser, code: unknown) {
  const { data: c } = await db.from("forma_challenges").select("id, title").eq("code", String(code ?? "").trim().toUpperCase()).maybeSingle();
  if (!c) throw new HttpError(404, "Desafio não encontrado. Confira o código.");
  await db.from("forma_challenge_members").upsert({ challenge_id: c.id, user_id: u.id }, { onConflict: "challenge_id,user_id", ignoreDuplicates: true });
  return { ok: true, title: c.title };
}

export async function challengeLeave(db: Db, u: FUser, code: unknown) {
  const { data: c } = await db.from("forma_challenges").select("id").eq("code", String(code ?? "").toUpperCase()).maybeSingle();
  if (c) await db.from("forma_challenge_members").delete().eq("challenge_id", c.id).eq("user_id", u.id);
  return { ok: true };
}

export async function challenges(db: Db, u: FUser) {
  const { data: mine } = await db.from("forma_challenge_members").select("challenge_id").eq("user_id", u.id);
  const ids = (mine ?? []).map((m) => m.challenge_id);
  if (!ids.length) return { challenges: [] };
  const { data: list } = await db.from("forma_challenges").select("id, code, title, ex, starts, ends").in("id", ids).order("ends", { ascending: false }).limit(20);
  const out = [];
  for (const c of list ?? []) {
    const { data: mem } = await db.from("forma_challenge_members").select("user_id").eq("challenge_id", c.id).limit(200);
    const uids = (mem ?? []).map((m) => m.user_id);
    const { data: names } = await db.from("forma_users").select("id, name").in("id", uids);
    const sc = await scores(db, uids, c.starts, c.ends, c.ex);
    out.push({
      code: c.code, title: c.title, ex: c.ex, starts: c.starts, ends: c.ends,
      board: (names ?? []).map((n) => ({ name: firstName(n.name), score: sc.get(n.id) ?? 0, me: n.id === u.id })).sort((a, b) => b.score - a.score),
    });
  }
  return { challenges: out };
}

// ---------------------------------------------------------------- lembrete no celular
export async function pushKey(db: Db) {
  return { key: await pushPublicKey(db) };
}

export async function pushSubscribe(db: Db, u: FUser, b: Obj) {
  const sub = (b.sub ?? {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) throw new HttpError(400, "Inscrição inválida.");
  const at = /^\d{2}:\d{2}$/.test(String(b.at)) ? String(b.at) : "18:00";
  const days = (Array.isArray(b.days) ? b.days : [1, 2, 3, 4, 5]).map(Number).filter((d) => d >= 0 && d <= 6);
  await db.from("forma_push").upsert({ user_id: u.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, remind_at: at, days, remind: b.remind !== false, passes: b.passes !== false }, { onConflict: "endpoint" });
  return { ok: true };
}

export async function pushOff(db: Db, u: FUser, endpoint: unknown) {
  await db.from("forma_push").delete().eq("user_id", u.id).eq("endpoint", String(endpoint ?? ""));
  return { ok: true };
}

export async function pushTest(db: Db, u: FUser) {
  const { data } = await db.from("forma_push").select("*").eq("user_id", u.id);
  for (const s of data ?? []) await sendWebPush(db, s, { title: "💪 FORMA", body: "Avisos ligados! É assim que eles vão chegar.", url: "/treino" });
  return { ok: true, devices: data?.length ?? 0 };
}

/** Brasília (UTC-3) como Date "deslocada": use os getters UTC. */
function brNow() { return new Date(Date.now() - 3 * 3600_000); }

const DAY_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Cron (a cada minuto): avisa quem marcou o horário e ainda não treinou hoje. */
export async function runFormaReminders(db: Db) {
  const now = brNow();
  const hhmm = now.toISOString().slice(11, 16);
  const today = now.toISOString().slice(0, 10);
  const dow = now.getUTCDay();
  const { data } = await db.from("forma_push").select("id, user_id, endpoint, p256dh, auth, remind_at, days, last_sent").eq("remind", true).lte("remind_at", hhmm).limit(500);
  const due = (data ?? []).filter((s) => s.days.includes(dow) && s.last_sent !== today && minutesBetween(s.remind_at, hhmm) <= 30);
  let sent = 0;
  for (const s of due) {
    await db.from("forma_push").update({ last_sent: today }).eq("id", s.id);
    const { count } = await db.from("forma_workouts").select("id", { count: "exact", head: true }).eq("user_id", s.user_id).eq("day", today);
    if (count) continue;
    const { data: u } = await db.from("forma_users").select("name, data").eq("id", s.user_id).maybeSingle();
    const plan = ((u?.data as Obj)?.plan as ({ name: string } | null)[] | undefined)?.[dow];
    const first = String(u?.name ?? "").split(" ")[0];
    const body = plan?.name ? `Hoje é ${DAY_PT[dow]}: ${plan.name}. O Tonhão tá te esperando! 💪` : "Bora treinar? O Tonhão tá te esperando! 💪";
    const r = await sendWebPush(db, s, { title: `${first ? first + ", h" : "H"}ora do treino!`, body, url: "/treino" });
    if (r === "gone") await db.from("forma_push").delete().eq("id", s.id);
    else if (r === "ok") sent++;
  }
  return { due: due.length, sent };
}

function minutesBetween(a: string, b: string) {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return m(b) - m(a);
}
