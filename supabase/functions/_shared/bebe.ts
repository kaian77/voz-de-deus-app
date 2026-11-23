// App Cantinho do bebê (/bebe/): conta própria (e-mail + senha; não é o login do Studio nem do FORMA), família na
// nuvem (os dados do app num JSON com versão: quem salva manda a versão que tinha; se outro celular salvou antes,
// recebe a versão nova, junta no aparelho e manda de novo) e avisos no celular (cron, horário de Brasília).
// Avisos nunca mostram dado de saúde na tela bloqueada: remédio e consulta saem como "lembrete que você marcou".
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, sha256Hex } from "./util.ts";
import { pushPublicKey, sendWebPush } from "./push.ts";

type Db = SupabaseClient;
type Obj = Record<string, unknown>;
export interface BUser { id: string; email: string; name: string }
type Role = "dono" | "edita" | "ve";

// ---------------------------------------------------------------- senha e sessão (mesmo esquema do FORMA)
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
function newCode(n = 8) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => abc[b % abc.length]).join("");
}
async function newSession(db: Db, userId: string) {
  const token = hex(24);
  await db.from("bebe_auth").insert({ token_hash: await sha256Hex(token), user_id: userId, expires_at: new Date(Date.now() + 180 * 86400_000).toISOString() });
  return token;
}
export async function userBySession(db: Db, session: unknown): Promise<BUser> {
  const s = String(session ?? "");
  if (s.length < 20) throw new HttpError(401, "Entre na sua conta de novo.");
  const { data } = await db.from("bebe_auth").select("user_id, expires_at").eq("token_hash", await sha256Hex(s)).maybeSingle();
  if (!data || new Date(data.expires_at) < new Date()) throw new HttpError(401, "Sua sessão expirou. Entre de novo.");
  const { data: u } = await db.from("bebe_users").select("id, email, name").eq("id", data.user_id).single();
  return u as BUser;
}
const cleanEmail = (e: unknown) => String(e ?? "").trim().toLowerCase().slice(0, 160);
const cleanName = (n: unknown, max = 40) => String(n ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function signup(db: Db, b: Obj) {
  const email = cleanEmail(b.email), pass = String(b.pass ?? ""), name = cleanName(b.name);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "E-mail inválido.");
  if (pass.length < 6) throw new HttpError(400, "A senha precisa de pelo menos 6 letras ou números.");
  if (!name) throw new HttpError(400, "Coloque seu nome.");
  const { data: exists } = await db.from("bebe_users").select("id").eq("email", email).maybeSingle();
  if (exists) throw new HttpError(400, "Já existe conta com esse e-mail. Toque em Entrar.");
  const { data, error } = await db.from("bebe_users").insert({ email, pass: await hashPassword(pass), name }).select("id, email, name").single();
  if (error || !data) throw new HttpError(400, "Não deu para criar a conta. Tente de novo.");
  return { session: await newSession(db, data.id), ...(await me(db, data as BUser)) };
}
export async function login(db: Db, b: Obj) {
  const { data } = await db.from("bebe_users").select("id, email, name, pass").eq("email", cleanEmail(b.email)).maybeSingle();
  const ok = await checkPassword(String(b.pass ?? ""), data?.pass ?? "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$x");
  if (!data || !ok) throw new HttpError(400, "E-mail ou senha errados.");
  const { pass: _p, ...u } = data;
  return { session: await newSession(db, u.id), ...(await me(db, u as BUser)) };
}
export async function logout(db: Db, session: unknown) {
  await db.from("bebe_auth").delete().eq("token_hash", await sha256Hex(String(session ?? "")));
  return { ok: true };
}

// ---------------------------------------------------------------- família
async function roleIn(db: Db, u: BUser, family: unknown): Promise<Role> {
  const { data } = await db.from("bebe_members").select("role").eq("family_id", String(family ?? "")).eq("user_id", u.id).maybeSingle();
  if (!data) throw new HttpError(403, "Você não faz parte dessa família.");
  return data.role as Role;
}
export async function me(db: Db, u: BUser) {
  const { data: mem } = await db.from("bebe_members").select("family_id, role").eq("user_id", u.id);
  const ids = (mem ?? []).map((m) => m.family_id);
  const { data: fams } = ids.length ? await db.from("bebe_families").select("id, name, version, updated_at").in("id", ids) : { data: [] };
  return {
    user: u,
    families: (fams ?? []).map((f) => ({ ...f, role: mem!.find((m) => m.family_id === f.id)!.role })),
  };
}
const MAX = 1_500_000;
function checkData(d: unknown) {
  if (!d || typeof d !== "object" || (d as Obj).v !== 1) throw new HttpError(400, "Dados inválidos.");
  if (JSON.stringify(d).length > MAX) throw new HttpError(400, "Dados grandes demais para a nuvem.");
  return d as Obj;
}
export async function familyCreate(db: Db, u: BUser, b: Obj) {
  const data = checkData(b.data);
  for (let i = 0; i < 5; i++) {
    const { data: f, error } = await db.from("bebe_families").insert({ name: cleanName(b.name, 50) || "Família", invite: newCode(), owner: u.id, data, updated_by: u.id }).select("id, name, version").single();
    if (error) continue;
    await db.from("bebe_members").insert({ family_id: f.id, user_id: u.id, role: "dono" });
    return { family: { ...f, role: "dono" } };
  }
  throw new HttpError(500, "Tente de novo.");
}
export async function familyGet(db: Db, u: BUser, b: Obj) {
  const role = await roleIn(db, u, b.family);
  const { data: f } = await db.from("bebe_families").select("id, name, data, version, updated_at").eq("id", String(b.family)).single();
  return { ...f, role };
}
/** Salva só se ninguém salvou depois da versão que o celular tinha (senão devolve a atual para juntar). */
export async function familySave(db: Db, u: BUser, b: Obj) {
  const role = await roleIn(db, u, b.family);
  if (role === "ve") throw new HttpError(403, "Seu acesso é só para ver.");
  const data = checkData(b.data);
  const base = Number(b.base);
  const { data: rows } = await db.from("bebe_families").update({ data, version: base + 1, updated_at: new Date().toISOString(), updated_by: u.id }).eq("id", String(b.family)).eq("version", base).select("version");
  if (rows?.length) return { ok: true, version: rows[0].version };
  const { data: cur } = await db.from("bebe_families").select("data, version").eq("id", String(b.family)).single();
  return { ok: false, conflict: true, data: cur?.data, version: cur?.version };
}
export async function familyRename(db: Db, u: BUser, b: Obj) {
  if ((await roleIn(db, u, b.family)) !== "dono") throw new HttpError(403, "Só quem criou a família pode mudar o nome.");
  await db.from("bebe_families").update({ name: cleanName(b.name, 50) || "Família" }).eq("id", String(b.family));
  return { ok: true };
}
export async function members(db: Db, u: BUser, b: Obj) {
  const role = await roleIn(db, u, b.family);
  const { data: mem } = await db.from("bebe_members").select("user_id, role").eq("family_id", String(b.family));
  const { data: users } = await db.from("bebe_users").select("id, name, email").in("id", (mem ?? []).map((m) => m.user_id));
  const { data: f } = await db.from("bebe_families").select("invite").eq("id", String(b.family)).single();
  return {
    role,
    invite: role === "dono" ? f?.invite : undefined,
    members: (mem ?? []).map((m) => {
      const x = users?.find((y) => y.id === m.user_id);
      return { id: m.user_id, name: x?.name ?? "", email: role === "dono" ? x?.email : undefined, role: m.role, me: m.user_id === u.id };
    }),
  };
}
export async function newInvite(db: Db, u: BUser, b: Obj) {
  if ((await roleIn(db, u, b.family)) !== "dono") throw new HttpError(403, "Só quem criou a família pode convidar.");
  const invite = newCode();
  await db.from("bebe_families").update({ invite }).eq("id", String(b.family));
  return { invite };
}
export async function join(db: Db, u: BUser, b: Obj) {
  const { data: f } = await db.from("bebe_families").select("id, name, version").eq("invite", String(b.code ?? "").trim().toUpperCase()).maybeSingle();
  if (!f) throw new HttpError(404, "Convite não encontrado. Peça um link novo.");
  const { data: had } = await db.from("bebe_members").select("role").eq("family_id", f.id).eq("user_id", u.id).maybeSingle();
  if (!had) await db.from("bebe_members").insert({ family_id: f.id, user_id: u.id, role: "edita" });
  return { family: { ...f, role: had?.role ?? "edita" } };
}
export async function setRole(db: Db, u: BUser, b: Obj) {
  if ((await roleIn(db, u, b.family)) !== "dono") throw new HttpError(403, "Só quem criou a família pode mudar acessos.");
  const r = String(b.role);
  if (String(b.user) === u.id) throw new HttpError(400, "Você é o dono da família.");
  if (r === "sair") await db.from("bebe_members").delete().eq("family_id", String(b.family)).eq("user_id", String(b.user));
  else if (r === "edita" || r === "ve") await db.from("bebe_members").update({ role: r }).eq("family_id", String(b.family)).eq("user_id", String(b.user));
  else throw new HttpError(400, "Acesso inválido.");
  if (r === "sair") await db.from("bebe_push").delete().eq("family_id", String(b.family)).eq("user_id", String(b.user));
  return { ok: true };
}
export async function leave(db: Db, u: BUser, b: Obj) {
  const role = await roleIn(db, u, b.family);
  await db.from("bebe_members").delete().eq("family_id", String(b.family)).eq("user_id", u.id);
  await db.from("bebe_push").delete().eq("family_id", String(b.family)).eq("user_id", u.id);
  const { count } = await db.from("bebe_members").select("user_id", { count: "exact", head: true }).eq("family_id", String(b.family));
  if (!count) {
    // ninguém mais: apaga os dados e as fotos
    const { data: files } = await db.storage.from("bebe").list(String(b.family), { limit: 1000 });
    if (files?.length) await db.storage.from("bebe").remove(files.map((x) => `${b.family}/${x.name}`));
    await db.from("bebe_families").delete().eq("id", String(b.family));
  }
  else if (role === "dono") {
    // passa o comando para quem entrou primeiro
    const { data: next } = await db.from("bebe_members").select("user_id").eq("family_id", String(b.family)).order("joined_at").limit(1);
    if (next?.[0]) await db.from("bebe_members").update({ role: "dono" }).eq("family_id", String(b.family)).eq("user_id", next[0].user_id);
  }
  return { ok: true };
}
/** LGPD: apaga a conta; famílias em que ficou sozinho são apagadas junto. */
export async function deleteAccount(db: Db, u: BUser) {
  const { data: mem } = await db.from("bebe_members").select("family_id").eq("user_id", u.id);
  for (const m of mem ?? []) await leave(db, u, { family: m.family_id });
  await db.from("bebe_users").delete().eq("id", u.id);
  return { ok: true };
}

// ---------------------------------------------------------------- avisos no celular
export async function pushKey(db: Db) {
  return { key: await pushPublicKey(db) };
}
export async function pushSubscribe(db: Db, u: BUser, b: Obj) {
  await roleIn(db, u, b.family);
  const sub = (b.sub ?? {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) throw new HttpError(400, "Inscrição inválida.");
  const p = (b.prefs ?? {}) as Obj;
  const prefs = {
    mv: p.mv !== false, fraldas: p.fraldas !== false, roupas: p.roupas !== false, agenda: p.agenda !== false, remedios: p.remedios !== false, sono: p.sono === true,
    quiet: /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(String(p.quiet)) ? String(p.quiet) : "22:00-07:00",
  };
  await db.from("bebe_push").upsert({ user_id: u.id, family_id: String(b.family), endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, prefs }, { onConflict: "endpoint" });
  return { ok: true, prefs };
}
export async function pushOff(db: Db, u: BUser, endpoint: unknown) {
  await db.from("bebe_push").delete().eq("user_id", u.id).eq("endpoint", String(endpoint ?? ""));
  return { ok: true };
}
export async function pushTest(db: Db, u: BUser) {
  const { data } = await db.from("bebe_push").select("*").eq("user_id", u.id);
  for (const s of data ?? []) await sendWebPush(db, s, { title: "💗 Cantinho do bebê", body: "Avisos ligados! É assim que eles vão chegar.", url: "/bebe/" });
  return { ok: true, devices: data?.length ?? 0 };
}

/** Brasília (UTC-3) "deslocada": use os getters UTC. */
const brNow = () => new Date(Date.now() - 3 * 3600_000);
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
function inQuiet(quiet: string, hm: string) {
  const [a, z] = quiet.split("-").map(mins), t = mins(hm);
  return a <= z ? t >= a && t < z : t >= a || t < z;
}
type Baby = { id: string; name: string; nick?: string; birth: string };
type FamilyData = {
  babies?: Baby[]; items?: { babyId: string; cat: string; qty: number; size: string; state: string }[];
  diapers?: { babyId: string; date: string; qty: number }[]; events?: { id: string; babyId: string; date: string; time: string }[];
  meds?: { id: string; babyId: string; times: string[]; until: string }[]; measures?: { babyId: string; date: string; weight?: number }[];
  sleeps?: { babyId: string; start: string; end?: string }[];
};
function monthsOld(birth: string, todayIso: string) {
  const [by, bm, bd] = birth.split("-").map(Number), [ty, tm, td] = todayIso.split("-").map(Number);
  return (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
}
function daysLeft(d: FamilyData, babyId: string, nowMs: number) {
  const stock = (d.items ?? []).filter((i) => i.babyId === babyId && i.cat === "fralda").reduce((s, i) => s + (i.qty || 0), 0);
  const used = (d.diapers ?? []).filter((x) => x.babyId === babyId && nowMs - new Date(x.date).getTime() < 7 * 864e5);
  if (!used.length) return null;
  const days = Math.max(1, Math.min(7, Math.ceil((nowMs - Math.min(...used.map((u) => new Date(u.date).getTime()))) / 864e5)));
  const per = used.reduce((s, u) => s + u.qty, 0) / days;
  return per ? Math.floor(stock / per) : null;
}
const SIZE_MONTHS: Record<string, number> = { RN: 1, P: 3, M: 6, G: 9, GG: 12 };

/** O que avisar agora para essa família (cada aviso tem uma chave para não repetir no dia). */
function due(d: FamilyData, hm: string, todayIso: string, dow: number) {
  const out: { key: string; pref: string; title: string; body: string }[] = [];
  const name = (b: Baby) => b.nick || b.name;
  for (const b of d.babies ?? []) {
    if (hm === "09:00" && b.birth && b.birth.slice(8) === todayIso.slice(8) && b.birth < todayIso) {
      const m = monthsOld(b.birth, todayIso);
      out.push({ key: `mv:${b.id}`, pref: "mv", title: "👶 Mêsversário!", body: m % 12 === 0 ? `${name(b)} completou ${m / 12} ${m === 12 ? "ano" : "anos"}! 🎂` : `${name(b)} completou ${m} ${m === 1 ? "mês" : "meses"}! 💗` });
    }
    if (hm === "10:00") {
      const left = daysLeft(d, b.id, Date.now());
      if (left !== null && left <= 3) out.push({ key: `fr:${b.id}`, pref: "fraldas", title: "🧷 Fraldas acabando", body: left <= 0 ? "Seu estoque de fraldas acabou." : `Seu estoque de fraldas dá para ~${left} ${left === 1 ? "dia" : "dias"}.` });
    }
    if (hm === "10:30" && dow === 0) {
      const m = monthsOld(b.birth, todayIso);
      const n = (d.items ?? []).filter((i) => i.babyId === b.id && i.cat === "roupa" && i.state === "uso" && SIZE_MONTHS[i.size?.toUpperCase()] !== undefined && m >= SIZE_MONTHS[i.size.toUpperCase()]).length;
      if (n) out.push({ key: `rp:${b.id}`, pref: "roupas", title: "👕 Hora de conferir as roupinhas!", body: `${name(b)} está crescendo! ${n} ${n === 1 ? "peça pode" : "peças podem"} estar ficando pequena${n === 1 ? "" : "s"}.` });
    }
    if (hm === "21:00") {
      const any = (d.sleeps ?? []).some((s) => s.babyId === b.id && s.start.slice(0, 10) === todayIso);
      if (!any) out.push({ key: `so:${b.id}`, pref: "sono", title: "🌙 Soninho", body: "Não esqueça de registrar as sonecas de hoje." });
    }
  }
  // compromissos: na véspera às 19h e 1 h antes (sem dizer o que é)
  const tomorrow = new Date(Date.parse(todayIso + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
  for (const e of d.events ?? []) {
    if (hm === "19:00" && e.date === tomorrow) out.push({ key: `ev1:${e.id}`, pref: "agenda", title: "📅 Compromisso amanhã", body: `Você tem um compromisso amanhã${e.time ? ` às ${e.time}` : ""}. Abra o app para ver.` });
    if (e.date === todayIso && e.time && /^\d{2}:\d{2}$/.test(e.time) && mins(e.time) - 60 === mins(hm)) out.push({ key: `ev2:${e.id}`, pref: "agenda", title: "📅 Daqui a 1 hora", body: `Compromisso às ${e.time}. Abra o app para ver.` });
  }
  // remédios: nos horários que a família marcou (sem o nome do remédio)
  for (const m of d.meds ?? []) {
    if (m.until && m.until < todayIso) continue;
    if ((m.times ?? []).includes(hm)) out.push({ key: `rm:${m.id}:${hm}`, pref: "remedios", title: "💊 Lembrete", body: "Hora do lembrete que você marcou." });
  }
  return out;
}

/** Cron (a cada minuto): manda os avisos de cada celular inscrito. */
export async function runBebeReminders(db: Db) {
  const now = brNow();
  const hm = now.toISOString().slice(11, 16), todayIso = now.toISOString().slice(0, 10), dow = now.getUTCDay();
  // só nos minutos em que pode ter aviso (horários fixos, compromisso ou remédio): o resto sai barato
  const { data: subs } = await db.from("bebe_push").select("id, family_id, endpoint, p256dh, auth, prefs, sent").limit(2000);
  if (!subs?.length) return { subs: 0, sent: 0 };
  const cache = new Map<string, FamilyData>();
  let sent = 0;
  for (const s of subs) {
    if (!cache.has(s.family_id)) {
      const { data: f } = await db.from("bebe_families").select("data").eq("id", s.family_id).maybeSingle();
      cache.set(s.family_id, (f?.data ?? {}) as FamilyData);
    }
    const prefs = s.prefs as Record<string, unknown>;
    const list = due(cache.get(s.family_id)!, hm, todayIso, dow).filter((x) => prefs[x.pref] !== false && (x.pref === "remedios" || !inQuiet(String(prefs.quiet ?? "22:00-07:00"), hm)));
    if (!list.length) continue;
    const old = (s.sent ?? {}) as Record<string, string>;
    const fresh: Record<string, string> = Object.fromEntries(Object.entries(old).filter(([, v]) => v === todayIso));
    let gone = false;
    for (const x of list) {
      if (fresh[x.key] === todayIso) continue;
      fresh[x.key] = todayIso;
      const r = await sendWebPush(db, s, { title: x.title, body: x.body, url: "/bebe/" });
      if (r === "gone") gone = true;
      else if (r === "ok") sent++;
    }
    if (gone) await db.from("bebe_push").delete().eq("id", s.id);
    else await db.from("bebe_push").update({ sent: fresh }).eq("id", s.id);
  }
  return { subs: subs.length, sent };
}

// ---------------------------------------------------------------- esqueci a senha (link por e-mail)
const escH = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Remetente: BEBE_EMAIL_FROM; se o domínio não estiver verificado no Resend, tenta os outros já usados pelo projeto. */
async function sendMail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new HttpError(503, "O envio de e-mail não está configurado. Fale com o suporte.");
  const addr = (s?: string) => (s ? (s.match(/<([^>]+)>/)?.[1] ?? s).trim() : "");
  const froms = [...new Set([addr(Deno.env.get("BEBE_EMAIL_FROM")), addr(Deno.env.get("AGENDA_EMAIL_FROM")) || "agenda@paginaspro.app.br", addr(Deno.env.get("REVIEW_EMAIL_FROM"))].filter(Boolean))];
  let last = "";
  for (const f of froms) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Cantinho do bebê <${f}>`, to: [to], subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return void (await res.body?.cancel());
    last = `${res.status} ${(await res.text()).slice(0, 160)}`;
    if (res.status !== 403 && res.status !== 422) break; // só troca de remetente quando o domínio é recusado
  }
  console.error("bebe: e-mail não saiu", last);
  throw new HttpError(502, "Não consegui mandar o e-mail agora. Tente de novo em alguns minutos.");
}
export async function resetRequest(db: Db, b: Obj) {
  const email = cleanEmail(b.email);
  const { data: u } = await db.from("bebe_users").select("id, name").eq("email", email).maybeSingle();
  // mesma resposta com ou sem conta (não revela quem é cliente); no máximo 3 pedidos por hora
  if (!u) return { ok: true };
  const { count } = await db.from("bebe_resets").select("token_hash", { count: "exact", head: true }).eq("user_id", u.id).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 3) return { ok: true };
  const token = hex(24);
  await db.from("bebe_resets").insert({ token_hash: await sha256Hex(token), user_id: u.id, expires_at: new Date(Date.now() + 3600_000).toISOString() });
  const base = /^https:\/\/[a-z0-9.-]+$/i.test(String(b.origin)) ? String(b.origin) : "https://paginaspro.app.br";
  const link = `${base}/bebe/#nova-senha/${token}`;
  const html = `<!doctype html><html><body style="margin:0;background:#fffcf8;font-family:Arial,Helvetica,sans-serif;color:#343434">
<table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:18px;border:1px solid #eee4da">
<tr><td style="background:#f4d8dc;padding:18px 24px;font-size:20px;font-weight:700;border-radius:18px 18px 0 0">🧸 Cantinho do bebê</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.55"><p>Oi, ${escH(String(u.name).split(" ")[0])}!</p><p>Recebemos um pedido para criar uma senha nova. Toque no botão (vale por 1 hora):</p>
<p><a href="${escH(link)}" style="display:inline-block;background:#c98f9b;color:#ffffff;padding:13px 24px;border-radius:999px;font-weight:700;text-decoration:none">Criar senha nova</a></p>
<p style="font-size:13px;color:#8a7f75">Se não foi você, é só ignorar este e-mail: sua senha continua a mesma.</p></td></tr></table></td></tr></table></body></html>`;
  await sendMail(email, "Criar senha nova · Cantinho do bebê", html);
  return { ok: true };
}
export async function resetConfirm(db: Db, b: Obj) {
  const pass = String(b.pass ?? "");
  if (pass.length < 6) throw new HttpError(400, "A senha precisa de pelo menos 6 letras ou números.");
  const h = await sha256Hex(String(b.token ?? ""));
  const { data: r } = await db.from("bebe_resets").select("user_id, expires_at").eq("token_hash", h).maybeSingle();
  if (!r || new Date(r.expires_at) < new Date()) throw new HttpError(400, "Esse link venceu ou já foi usado. Peça outro.");
  await db.from("bebe_resets").delete().eq("user_id", r.user_id);
  await db.from("bebe_users").update({ pass: await hashPassword(pass) }).eq("id", r.user_id);
  await db.from("bebe_auth").delete().eq("user_id", r.user_id); // sai dos outros aparelhos
  const { data: u } = await db.from("bebe_users").select("id, email, name").eq("id", r.user_id).single();
  return { session: await newSession(db, r.user_id), ...(await me(db, u as BUser)) };
}

// ---------------------------------------------------------------- fotos das peças (bucket privado `bebe`, pasta = família)
const photoPath = (family: string, id: unknown) => {
  const s = String(id ?? "");
  if (!/^[a-z0-9]{6,24}$/.test(s)) throw new HttpError(400, "Foto inválida.");
  return `${family}/${s}.jpg`;
};
/** Links para subir fotos novas (o celular manda direto para o storage). */
export async function photoUpload(db: Db, u: BUser, b: Obj) {
  const role = await roleIn(db, u, b.family);
  if (role === "ve") throw new HttpError(403, "Seu acesso é só para ver.");
  const ids = ((b.ids as unknown[]) ?? []).slice(0, 20);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const { data } = await db.storage.from("bebe").createSignedUploadUrl(photoPath(String(b.family), id), { upsert: true });
    if (data?.signedUrl) out[String(id)] = data.signedUrl;
  }
  return { urls: out };
}
/** Links (1 dia) para baixar as fotos que este celular ainda não tem. */
export async function photoGet(db: Db, u: BUser, b: Obj) {
  await roleIn(db, u, b.family);
  const ids = ((b.ids as unknown[]) ?? []).slice(0, 60).map(String);
  if (!ids.length) return { urls: {} };
  const { data } = await db.storage.from("bebe").createSignedUrls(ids.map((id) => photoPath(String(b.family), id)), 86400);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.signedUrl && r.path) out[r.path.split("/").pop()!.replace(".jpg", "")] = r.signedUrl;
  return { urls: out };
}
/** Fotos que nenhum item usa mais saem do storage (chamado pelo celular depois de sincronizar). */
export async function photoClean(db: Db, u: BUser, b: Obj) {
  const role = await roleIn(db, u, b.family);
  if (role === "ve") return { removed: 0 };
  const { data: f } = await db.from("bebe_families").select("data").eq("id", String(b.family)).single();
  const used = new Set(((f?.data as Obj)?.items as { photo?: string }[] ?? []).map((i) => i.photo).filter(Boolean));
  const { data: files } = await db.storage.from("bebe").list(String(b.family), { limit: 1000 });
  const old = (files ?? []).filter((x) => !used.has(x.name.replace(".jpg", "")) && Date.now() - new Date(x.created_at ?? 0).getTime() > 86400_000);
  if (old.length) await db.storage.from("bebe").remove(old.map((x) => `${b.family}/${x.name}`));
  return { removed: old.length };
}
