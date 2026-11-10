// Agenda online da PáginasPro (adicional de R$ 29/mês por cliente).
// - Paciente: /agendar/<slug> (sem login) escolhe serviço, dia e horário livre e deixa nome + WhatsApp.
// - Profissional: aba Agenda no painel /r/<report_token>, com e-mail + senha (a senha é criada no 1º acesso pelo
//   link do painel; esqueceu = o Bruno zera no Studio). Também entra por paginaspro.app.br/entrar.
// - Lembrete: na véspera, o botão 🔔 Lembrar do painel abre o WhatsApp da clínica com a mensagem pronta. O envio
//   automático sai pelo WhatsApp da PRÓPRIA clínica (conectado por QR Code), nunca pelo número da PáginasPro: próxima etapa.
// - Cobrança: assinatura do Mercado Pago (preapproval, external_reference "ag:<landing_id>") com o e-mail do profissional.
// Horários sempre no fuso de Brasília (UTC-3, sem horário de verão).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, sha256Hex } from "./util.ts";
import { notify } from "./push.ts";
import { mpEnabled } from "./mercadopago.ts";

const TZ = -3 * 3600_000;
const SITE = "https://paginaspro.app.br";
export const AGENDA_PRICE = 29;
/** Link fixo da assinatura (Mercado Pago do Bruno); "Preços e links" no Studio pode trocar (agendaLink). Pago por ele,
 * a agenda não liga sozinha (o link não diz de quem é): o Bruno marca "Pagou" no Studio. */
export const AGENDA_LINK = "https://mpago.la/1oq3nf6";

export type Service = { name: string; minutes: number };
export type Hours = Record<string, [string, string][]>;
/** Profissional da clínica, com os próprios horários (clínica com mais de um profissional) */
export type Pro = { id: string; name: string; role: string; hours: Hours };
export type Settings = {
  style: "simple" | "modern";
  services: Service[];
  /** dia da semana (0 = domingo) -> intervalos ["08:00", "12:00"] (agenda única, sem profissionais) */
  hours: Hours;
  /** profissionais (vazio = agenda única com "hours") */
  pros: Pro[];
  /** antecedência mínima em horas */
  notice: number;
  /** quantos dias à frente o paciente pode marcar */
  days: number;
  /** intervalo entre os horários oferecidos (minutos) */
  step: number;
  /** atende particular */
  particular: boolean;
  /** convênios aceitos (vazio = só particular) */
  plans: string[];
  /** lembrete 1 dia antes: manual = botão 🔔 Lembrar no painel (abre o WhatsApp da clínica com a mensagem pronta);
   * auto = a IA manda sozinha pelo WhatsApp da própria clínica (conectado por QR Code; próxima etapa) */
  remind: "auto" | "manual";
};

const WEEK: [string, string][] = [["08:00", "12:00"], ["14:00", "18:00"]];
export const DEFAULT_SETTINGS: Settings = {
  style: "simple",
  services: [{ name: "Consulta", minutes: 60 }],
  hours: { "1": WEEK, "2": WEEK, "3": WEEK, "4": WEEK, "5": WEEK },
  notice: 2,
  days: 21,
  step: 30,
  pros: [],
  particular: true,
  plans: [],
  remind: "manual",
};

const hm = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? "").trim());
  return m ? Math.min(24 * 60, Number(m[1]) * 60 + Number(m[2])) : -1;
};

function cleanHours(src: unknown): Hours {
  const out: Hours = {};
  const h = (src && typeof src === "object" ? src : {}) as Record<string, unknown>;
  for (let d = 0; d < 7; d++) {
    const list = (Array.isArray(h[String(d)]) ? (h[String(d)] as unknown[][]) : [])
      .map((iv) => [String(iv?.[0] ?? ""), String(iv?.[1] ?? "")] as [string, string])
      .filter(([a, b]) => hm(a) >= 0 && hm(b) > hm(a))
      .slice(0, 4);
    if (list.length) out[String(d)] = list;
  }
  return out;
}

/** Profissional escolhido (com profissionais cadastrados, o 1º quando não vem nenhum válido). */
function proOf(settings: Settings, id: unknown) {
  if (!settings.pros.length) return null;
  return settings.pros.find((p) => p.id === String(id ?? "")) ?? null;
}

/** Configuração salva, limpa e com os padrões no que faltar. */
export function cleanSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Settings>;
  const services = (Array.isArray(r.services) ? r.services : [])
    .map((s) => ({ name: String(s?.name ?? "").trim().slice(0, 60), minutes: Math.min(480, Math.max(10, Math.round(Number(s?.minutes) || 0))) }))
    .filter((s) => s.name && s.minutes)
    .slice(0, 12);
  const pros = (Array.isArray(r.pros) ? r.pros : []).map((p, i) => ({
    id: String(p?.id ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 12) || `p${i + 1}`,
    name: String(p?.name ?? "").trim().slice(0, 60),
    role: String(p?.role ?? "").trim().slice(0, 60),
    hours: cleanHours(p?.hours),
  })).filter((p) => p.name).slice(0, 20);
  for (const [i, p] of pros.entries()) if (pros.findIndex((x) => x.id === p.id) !== i) p.id = `${p.id}${i}`; // ids únicos
  return {
    style: r.style === "modern" ? "modern" : "simple",
    services: services.length ? services : DEFAULT_SETTINGS.services,
    hours: r.hours ? cleanHours(r.hours) : DEFAULT_SETTINGS.hours,
    pros,
    notice: Math.min(72, Math.max(0, Number(r.notice ?? DEFAULT_SETTINGS.notice) || 0)),
    days: Math.min(90, Math.max(1, Number(r.days ?? DEFAULT_SETTINGS.days) || DEFAULT_SETTINGS.days)),
    step: [10, 15, 20, 30, 45, 60].includes(Number(r.step)) ? Number(r.step) : DEFAULT_SETTINGS.step,
    particular: r.particular !== false,
    plans: [...new Set((Array.isArray(r.plans) ? r.plans : []).map((p) => String(p ?? "").trim().slice(0, 50)).filter(Boolean))].slice(0, 30),
    remind: r.remind === "auto" ? "auto" : "manual",
  };
}

// deno-lint-ignore no-explicit-any
type Page = Record<string, any>;

/** Palavras da agenda pelo ramo do site: clínica fala "paciente" e tem convênio; salão, advocacia etc. falam "cliente". */
export function terms(niche: unknown) {
  const n = String(niche ?? "").toLowerCase();
  const health = /nutri|m[eé]dic|odont|dent|psic|fisio|derma|pediat|cl[ií]nic|sa[uú]de|fono|terap|cardio|gineco|ortop|oftalm|endocrin/.test(n);
  const salon = /sal[aã]o|cabel|barb|manicure|unha|beleza|est[eé]tic|make|maqui|sobrancel|c[ií]lio|depila|spa|massag/.test(n);
  const law = /advoc|jur[ií]d|direito|contab|consultoria/.test(n);
  return {
    health,
    client: health ? "paciente" : "cliente",
    clients: health ? "pacientes" : "clientes",
    place: health ? "o consultório" : salon ? "o salão" : law ? "o escritório" : "a empresa",
    all: health ? "Clínica toda" : salon ? "Salão todo" : law ? "Escritório todo" : "Todos",
    service: health ? "Consulta" : salon ? "Atendimento" : law ? "Consulta" : "Atendimento",
  };
}

/** Serviço padrão quando o cliente ainda não cadastrou nenhum (pelo ramo). */
function withDefaults(settings: Settings, page: Page) {
  const raw = (page.agenda ?? {}) as Partial<Settings>;
  if (!Array.isArray(raw.services) || !raw.services.length) settings.services = [{ name: terms(page.niche).service, minutes: 60 }];
  return settings;
}

/** A agenda aceita marcação? (teste dentro do prazo ou assinatura ativa) */
export function agendaOpen(p: Page) {
  if (p.agenda_status === "active") return true;
  return p.agenda_status === "trial" && (!p.agenda_until || new Date(p.agenda_until).getTime() > Date.now());
}

/** "2026-11-12" + minutos do dia (Brasília) -> instante UTC */
const at = (date: string, minutes: number) => new Date(Date.parse(`${date}T00:00:00Z`) + minutes * 60_000 - TZ);
const brDate = (t: number) => new Date(t + TZ).toISOString().slice(0, 10);
const brMinutes = (t: number) => {
  const d = new Date(t + TZ);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

type Busy = { starts_at: string; ends_at: string };

/** Horários livres de cada dia para um serviço: [{ date, slots: ["08:00", ...] }] */
export function freeDays(settings: Settings, service: Service, busy: Busy[], now = Date.now(), hours: Hours = settings.hours) {
  const out: { date: string; weekday: number; slots: string[] }[] = [];
  const ranges = busy.map((b) => [Date.parse(b.starts_at), Date.parse(b.ends_at)]);
  const earliest = now + settings.notice * 3600_000;
  for (let i = 0; i < settings.days; i++) {
    const date = brDate(now + i * 86400_000);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const slots: string[] = [];
    for (const [a, b] of hours[String(weekday)] ?? []) {
      for (let m = hm(a); m + service.minutes <= hm(b); m += settings.step) {
        const s = at(date, m).getTime();
        const e = s + service.minutes * 60_000;
        if (s < earliest) continue;
        if (ranges.some(([x, y]) => s < y && e > x)) continue;
        slots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
      }
    }
    out.push({ date, weekday, slots });
  }
  return out;
}

/** Horários ocupados; com profissional, só os dele + bloqueios da clínica toda (sem profissional). */
async function busyOf(db: SupabaseClient, pageId: string, ignore?: string, pro?: string | null) {
  let q = db.from("agenda_appointments").select("id, starts_at, ends_at").eq("page_id", pageId)
    .not("status", "in", "(cancelled)").gt("ends_at", new Date().toISOString()).limit(2000);
  if (ignore) q = q.neq("id", ignore);
  if (pro) q = q.or(`pro.eq.${pro},pro.is.null`);
  const { data } = await q;
  return (data ?? []) as Busy[];
}

export async function pageBySlug(db: SupabaseClient, slug: string) {
  const s = String(slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  if (!s) throw new HttpError(404, "Agenda não encontrada");
  const { data } = await db.from("landing_pages").select("*").eq("slug", s).in("status", ["preview", "published"]).maybeSingle();
  if (!data) throw new HttpError(404, "Agenda não encontrada");
  return data as Page;
}

/** Dados públicos da página de agendamento. */
export function publicInfo(page: Page) {
  const settings = withDefaults(cleanSettings(page.agenda), page);
  const open = agendaOpen(page);
  return {
    open, name: page.name, style: settings.style, services: settings.services, particular: settings.particular, plans: settings.plans,
    pros: settings.pros.map((p) => ({ id: p.id, name: p.name, role: p.role })), terms: terms(page.niche),
    whatsapp: page.whatsapp ?? null,
  };
}

export async function publicDays(db: SupabaseClient, page: Page, serviceIdx: number, proId?: unknown) {
  if (!agendaOpen(page)) throw new HttpError(403, "A agenda online está fechada no momento");
  const settings = withDefaults(cleanSettings(page.agenda), page);
  const service = settings.services[serviceIdx] ?? settings.services[0];
  const pro = proOf(settings, proId) ?? settings.pros[0] ?? null;
  return freeDays(settings, service, await busyOf(db, page.id, undefined, pro?.id), Date.now(), pro?.hours ?? settings.hours);
}

export const cleanPhone = (raw: unknown) => {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : "";
};

/** Paciente marca um horário pela página. */
export async function book(db: SupabaseClient, page: Page, input: Record<string, unknown>) {
  if (!agendaOpen(page)) throw new HttpError(403, "A agenda online está fechada no momento");
  const settings = withDefaults(cleanSettings(page.agenda), page);
  const service = settings.services[Number(input.service) || 0] ?? settings.services[0];
  const date = String(input.date ?? "");
  const time = String(input.time ?? "");
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const phone = cleanPhone(input.phone);
  if (name.length < 2) throw new HttpError(400, "Escreva o seu nome");
  if (!phone) throw new HttpError(400, "Confira o número do WhatsApp com DDD");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || hm(time) < 0) throw new HttpError(400, "Escolha o dia e o horário");
  // Particular ou convênio: obrigatório quando a agenda tem convênios
  const plan = String(input.plan ?? "").trim();
  const choices = [...(settings.particular ? ["Particular"] : []), ...settings.plans];
  if (settings.plans.length && !choices.includes(plan)) throw new HttpError(400, "Escolha particular ou o seu convênio/plano");
  const pro = proOf(settings, input.pro);
  if (settings.pros.length && !pro) throw new HttpError(400, "Escolha o profissional");
  const free = freeDays(settings, service, await busyOf(db, page.id, undefined, pro?.id), Date.now(), pro?.hours ?? settings.hours).find((d) => d.date === date);
  if (!free?.slots.includes(time)) throw new HttpError(409, "Esse horário acabou de ser ocupado. Escolha outro.");
  // Trava contra robô/brincadeira: no máximo 3 horários futuros por telefone
  const { count } = await db.from("agenda_appointments").select("id", { count: "exact", head: true }).eq("page_id", page.id).eq("phone", phone)
    .in("status", ["booked", "confirmed"]).gt("starts_at", new Date().toISOString());
  if ((count ?? 0) >= 3) throw new HttpError(429, `Você já tem horários marcados. Para mudar, fale com ${terms(page.niche).place}.`);
  const starts = at(date, hm(time));
  const { data, error } = await db.from("agenda_appointments").insert({
    user_id: page.user_id, page_id: page.id, service: service.name, name, phone, note: String(input.note ?? "").slice(0, 300) || null,
    plan: settings.plans.length ? plan : null, pro: pro?.id ?? null,
    starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + service.minutes * 60_000).toISOString(), source: "site",
  }).select("id, starts_at, service").single();
  if (error) throw new HttpError(500, error.message);
  return data;
}

// ------------------------------------------------------------------ login do profissional

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iter: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$100000$${b64(salt)}$${b64(await pbkdf2(password, salt, 100000))}`;
}

async function checkPassword(password: string, stored: string | null) {
  const [kind, iter, salt, hash] = String(stored ?? "").split("$");
  if (kind !== "pbkdf2" || !hash) return false;
  const got = b64(await pbkdf2(password, unb64(salt), Number(iter)));
  return got.length === hash.length && [...got].reduce((a, c, i) => a | (c.charCodeAt(0) ^ hash.charCodeAt(i)), 0) === 0;
}

async function newSession(db: SupabaseClient, pageId: string) {
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await db.from("agenda_sessions").insert({ token_hash: await sha256Hex(token), page_id: pageId, expires_at: new Date(Date.now() + 60 * 86400_000).toISOString() });
  return token;
}

/** 1º acesso pelo link do painel: cria a senha (só quando ainda não existe). */
export async function setup(db: SupabaseClient, input: Record<string, unknown>) {
  const token = String(input.token ?? "").replace(/[^a-zA-Z0-9]/g, "");
  const { data: page } = token ? await db.from("landing_pages").select("*").eq("report_token", token).maybeSingle() : { data: null };
  if (!page || page.agenda_status === "off") throw new HttpError(404, "Agenda não encontrada");
  if (page.agenda_pass) throw new HttpError(409, "A senha já foi criada. Entre com o seu e-mail e senha.");
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Confira o e-mail");
  if (password.length < 6) throw new HttpError(400, "A senha precisa ter pelo menos 6 letras ou números");
  await db.from("landing_pages").update({ agenda_email: email, agenda_pass: await hashPassword(password) }).eq("id", page.id);
  return { session: await newSession(db, page.id), token };
}

/** Entrar com e-mail e senha (no painel ou em /entrar). */
export async function login(db: SupabaseClient, input: Record<string, unknown>) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  const token = String(input.token ?? "").replace(/[^a-zA-Z0-9]/g, "");
  let q = db.from("landing_pages").select("id, report_token, agenda_pass").ilike("agenda_email", email).neq("agenda_status", "off");
  if (token) q = q.eq("report_token", token);
  const { data } = email ? await q.limit(10) : { data: [] };
  for (const p of data ?? []) {
    if (await checkPassword(password, p.agenda_pass)) return { session: await newSession(db, p.id), token: p.report_token };
  }
  await new Promise((r) => setTimeout(r, 600)); // freia tentativa de adivinhar senha
  throw new HttpError(401, "E-mail ou senha não conferem");
}

export async function pageBySession(db: SupabaseClient, session: unknown) {
  const s = String(session ?? "");
  if (s.length < 20) throw new HttpError(401, "Entre de novo");
  const { data } = await db.from("agenda_sessions").select("page_id, expires_at").eq("token_hash", await sha256Hex(s)).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) throw new HttpError(401, "Sua sessão expirou. Entre de novo.");
  const { data: page } = await db.from("landing_pages").select("*").eq("id", data.page_id).maybeSingle();
  if (!page || page.agenda_status === "off") throw new HttpError(401, "Agenda desligada");
  return page as Page;
}

export async function logout(db: SupabaseClient, session: unknown) {
  await db.from("agenda_sessions").delete().eq("token_hash", await sha256Hex(String(session ?? "")));
  return { ok: true };
}

// ------------------------------------------------------------------ painel do profissional

export async function panel(db: SupabaseClient, page: Page) {
  const { data: bs } = await db.from("brand_settings").select("landing_offer").eq("user_id", page.user_id).maybeSingle();
  const offer = (bs?.landing_offer ?? {}) as Record<string, unknown>;
  const price = Number(offer.agendaMonthly) > 0 ? Number(offer.agendaMonthly) : AGENDA_PRICE;
  const link = typeof offer.agendaLink === "string" && /^https:\/\//.test(offer.agendaLink) ? offer.agendaLink : AGENDA_LINK;
  const from = new Date(Date.now() - 2 * 86400_000).toISOString();
  const { data } = await db.from("agenda_appointments").select("id, service, starts_at, ends_at, name, phone, note, plan, pro, status, source, reminder_sent_at, answered_at")
    .eq("page_id", page.id).gt("starts_at", from).order("starts_at").limit(1500);
  return {
    name: page.name, status: page.agenda_status, until: page.agenda_until, open: agendaOpen(page), email: page.agenda_email,
    settings: withDefaults(cleanSettings(page.agenda), page), terms: terms(page.niche), appointments: data ?? [], price, canSubscribe: mpEnabled(), payLink: link,
    booking: `${SITE}/agendar/${page.slug}`, slug: page.slug,
  };
}

export async function saveSettings(db: SupabaseClient, page: Page, raw: unknown) {
  const settings = cleanSettings(raw);
  await db.from("landing_pages").update({ agenda: settings }).eq("id", page.id);
  return { settings };
}

const STATUSES = ["booked", "confirmed", "reschedule", "cancelled", "done", "noshow", "block"];

/** Cria (sem id) ou muda um horário: status, remarcar (date + time), nome, telefone, serviço. */
export async function saveAppointment(db: SupabaseClient, page: Page, input: Record<string, unknown>) {
  const settings = withDefaults(cleanSettings(page.agenda), page);
  const id = input.id ? String(input.id) : "";
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) {
    if (!STATUSES.includes(String(input.status))) throw new HttpError(400, "Status inválido");
    patch.status = input.status;
  }
  if (input.name !== undefined) patch.name = String(input.name).trim().slice(0, 80);
  if (input.phone !== undefined) patch.phone = cleanPhone(input.phone) || String(input.phone).replace(/\D/g, "").slice(0, 15);
  if (input.note !== undefined) patch.note = String(input.note).slice(0, 300) || null;
  if (input.plan !== undefined) patch.plan = String(input.plan).trim().slice(0, 50) || null;
  if (input.pro !== undefined) patch.pro = proOf(settings, input.pro)?.id ?? null;
  let minutes = 0;
  if (input.service !== undefined) {
    const sv = settings.services.find((s) => s.name === input.service) ?? settings.services[Number(input.service)] ?? null;
    patch.service = sv?.name ?? String(input.service).slice(0, 60);
    minutes = sv?.minutes ?? 0;
  }
  if (input.date !== undefined || input.time !== undefined) {
    const date = String(input.date ?? "");
    const time = String(input.time ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || hm(time) < 0) throw new HttpError(400, "Escolha o dia e o horário");
    if (!minutes) {
      const { data: old } = id ? await db.from("agenda_appointments").select("starts_at, ends_at, pro").eq("id", id).eq("page_id", page.id).maybeSingle() : { data: null };
      minutes = Number(input.minutes) || (old ? (Date.parse(old.ends_at) - Date.parse(old.starts_at)) / 60_000 : settings.services[0].minutes);
      if (patch.pro === undefined && old) patch.pro = old.pro;
    }
    const starts = at(date, hm(time));
    const ends = new Date(starts.getTime() + minutes * 60_000);
    // Sem profissional (bloqueio da clínica toda) confere contra todos; com profissional, só a agenda dele
    const clash = (await busyOf(db, page.id, id || undefined, (patch.pro as string | null | undefined) ?? null)).some((b) => starts.getTime() < Date.parse(b.ends_at) && ends.getTime() > Date.parse(b.starts_at));
    if (clash && !input.force) throw new HttpError(409, "Já tem alguém nesse horário");
    Object.assign(patch, { starts_at: starts.toISOString(), ends_at: ends.toISOString(), reminder_sent_at: null, answered_at: null });
    if (id && input.status === undefined) patch.status = "booked";
  }
  if (id) {
    const { data, error } = await db.from("agenda_appointments").update(patch).eq("id", id).eq("page_id", page.id).select().single();
    if (error || !data) throw new HttpError(404, "Horário não encontrado");
    return data;
  }
  if (!patch.starts_at) throw new HttpError(400, "Escolha o dia e o horário");
  const { data, error } = await db.from("agenda_appointments").insert({
    user_id: page.user_id, page_id: page.id, source: "manual", service: patch.service ?? settings.services[0].name, ...patch,
    status: patch.status ?? "booked", name: patch.name || (patch.status === "block" ? "Bloqueado" : ""),
  }).select().single();
  if (error) throw new HttpError(500, error.message);
  return data;
}

// ------------------------------------------------------------------ assinatura (Mercado Pago)

/** Link da assinatura mensal no cartão, no e-mail do profissional. */
export async function subscribeLink(page: Page, reportUrl: string) {
  if (!mpEnabled()) throw new HttpError(400, "Assinatura online indisponível: fale com o suporte para ativar");
  if (!page.agenda_email) throw new HttpError(400, "Crie o seu acesso primeiro");
  const res = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")}`, "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      reason: `Agenda online — ${page.name}`.slice(0, 120),
      external_reference: `ag:${page.id}`,
      payer_email: page.agenda_email,
      back_url: reportUrl,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: AGENDA_PRICE, currency_id: "BRL" },
      status: "pending",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.init_point) throw new HttpError(502, `Mercado Pago: ${String(data?.message ?? res.status).slice(0, 160)}`);
  return { url: data.init_point as string };
}

/** Aviso de assinatura da agenda (chamado pelo handleMpNotification com a assinatura já lida da API). */
// deno-lint-ignore no-explicit-any
export async function onAgendaSubscription(db: SupabaseClient, sub: any) {
  const m = String(sub.external_reference ?? "").match(/^ag:([0-9a-f-]{36})$/);
  if (!m) return null;
  const { data: page } = await db.from("landing_pages").select("id, user_id, name, agenda_status, agenda_sub_id").eq("id", m[1]).maybeSingle();
  if (!page) return { ignored: "landing não existe" };
  if (sub.status === "authorized") {
    if (page.agenda_status === "active" && page.agenda_sub_id === String(sub.id)) return { already: true };
    await db.from("landing_pages").update({ agenda_status: "active", agenda_sub_id: String(sub.id), agenda_until: null }).eq("id", page.id);
    await notify(db, page.user_id, `📅 Agenda assinada: ${page.name}`, `R$ ${AGENDA_PRICE}/mês no cartão.`, "/studio/landing");
    return { agenda: "active" };
  }
  if (["paused", "cancelled"].includes(sub.status) && page.agenda_sub_id === String(sub.id) && page.agenda_status === "active") {
    await db.from("landing_pages").update({ agenda_status: "paused" }).eq("id", page.id);
    await notify(db, page.user_id, `⚠️ Agenda pausada: ${page.name}`, `A assinatura ficou "${sub.status}" no Mercado Pago.`, "/studio/landing");
    return { agenda: "paused" };
  }
  return { status: sub.status };
}
