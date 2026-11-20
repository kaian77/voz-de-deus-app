// Telas que usam a nuvem: Perfil (conta, personal, lembrete), Ranking (semana, turma, desafios) e a ficha do aluno
// (modo personal). Os dados vêm da função `forma` (cloud.ts) e ficam guardados aqui para a tela não piscar.
import { api, cloud, login, logout, refresh, reminderOff, reminderOn, reminderSaved, signup } from "./cloud";
import { DAY_SHORT, EXERCISES, formScore, store, totalReps, type ExId, type Session, type WeekPlan } from "./data";
import { goTab, render } from "./main";

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const first = (n: string) => esc(n.split(" ")[0]);
const LINK = () => `${location.origin}/treino`;

// ---------- estado ----------
interface Board { name: string; score: number; me: boolean }
interface Ranking { week: string; top: Board[]; me: { pos: number; score: number; total: number } | null; group: Board[] }
interface Challenge { code: string; title: string; ex: ExId; starts: string; ends: string; board: Board[] }
interface StudentRow { id: string; name: string; week: number; perWeek: number; last: string | null; form: number | null; newVideos: number }
interface StudentFull { student: { id: string; name: string }; data: { plan?: WeekPlan; goals?: { perWeek?: number }; weights?: { date: string; kg: number }[] }; workouts: Session[]; videos: { id: string; title: string; secs: number; seen_at: string | null; created_at: string }[] }

let rank: Ranking | null = null;
let chs: Challenge[] | null = null;
let studs: StudentRow[] | null = null;
let cur: StudentFull | null = null;
let authMode: "entrar" | "criar" = "criar";
let msg = "";
let busy = false;

/** Treino que o editor está mexendo: o meu ou o de um aluno (modo personal). */
export const editing: { v: { id: string; name: string; plan: WeekPlan } | null } = { v: null };
let planTimer = 0;
export function getPlan(): WeekPlan { return editing.v ? editing.v.plan : store.plan(); }
export function setPlan(p: WeekPlan) {
  if (!editing.v) return store.setPlan(p);
  editing.v.plan = p;
  const v = editing.v;
  clearTimeout(planTimer);
  planTimer = window.setTimeout(() => api("student_plan", { id: v.id, plan: v.plan }).catch((e) => alert(e.message)), 800);
}

function note(t: string) { msg = t; render(); }

async function run(fn: () => Promise<unknown>, ok?: string) {
  if (busy) return;
  busy = true; msg = "";
  render();
  try { await fn(); if (ok) msg = ok; } catch (e) { msg = `⚠️ ${(e as Error).message}`; }
  busy = false;
  render();
}

// ---------- ao abrir ----------
export async function boot() {
  const q = new URLSearchParams(location.search);
  const pc = q.get("personal"), dc = q.get("desafio");
  try {
    if (pc) sessionStorage.setItem("forma_pending_personal", pc.toUpperCase());
    if (dc) sessionStorage.setItem("forma_pending_desafio", dc.toUpperCase());
  } catch { /* */ }
  if (pc || dc) { if (!cloud.session) msg = pc ? "Crie sua conta para treinar com seu personal." : "Crie sua conta para entrar no desafio."; goTab(cloud.session ? (pc ? "perfil" : "ranking") : "perfil"); }
  if (cloud.session) { await refresh(); await pending(); render(); }
}

async function pending() {
  let pc: string | null = null, dc: string | null = null;
  try { pc = sessionStorage.getItem("forma_pending_personal"); dc = sessionStorage.getItem("forma_pending_desafio"); } catch { /* */ }
  if (pc && cloud.me?.user.role === "aluno" && !cloud.me.personal) {
    try { const r = await api<{ personal: { id: string; name: string; code: string } }>("link_personal", { code: pc }); cloud.me.personal = r.personal; msg = `✓ Agora você treina com ${r.personal.name}!`; } catch (e) { msg = `⚠️ ${(e as Error).message}`; }
  }
  if (dc) {
    try { const r = await api<{ title: string }>("challenge_join", { code: dc }); msg = `✓ Você entrou no desafio "${r.title}"!`; chs = null; } catch (e) { msg = `⚠️ ${(e as Error).message}`; }
  }
  try { sessionStorage.removeItem("forma_pending_personal"); sessionStorage.removeItem("forma_pending_desafio"); } catch { /* */ }
}

// ---------- conta ----------
function authCard(why: string) {
  return `
    <section class="card">
      <h2>${authMode === "criar" ? "Criar conta grátis" : "Entrar"}</h2>
      <p class="muted">${why}</p>
      ${msg ? `<p class="msg">${esc(msg)}</p>` : ""}
      ${authMode === "criar" ? `<label class="field">Seu nome<input id="a-name" autocomplete="name" placeholder="Como te chamam"></label>` : ""}
      <label class="field">E-mail<input id="a-email" type="email" autocomplete="email" inputmode="email"></label>
      <label class="field">Senha<input id="a-pass" type="password" autocomplete="${authMode === "criar" ? "new-password" : "current-password"}" placeholder="mínimo 6"></label>
      ${authMode === "criar" ? `<div class="seg"><label><input type="radio" name="a-role" value="aluno" checked><span>💪 Vou treinar</span></label><label><input type="radio" name="a-role" value="personal"><span>🧢 Sou personal</span></label></div>` : ""}
      <button class="btn" data-auth ${busy ? "disabled" : ""}>${busy ? "Aguarde…" : authMode === "criar" ? "Criar conta" : "Entrar"}</button>
      <button class="link" data-authmode>${authMode === "criar" ? "Já tenho conta: entrar" : "Não tenho conta: criar"}</button>
    </section>`;
}

// ---------- Perfil ----------
export function perfil() {
  const me = cloud.me;
  if (!cloud.session || !me) {
    return `<h1 class="title">Perfil</h1>${authCard("Guarde seus treinos na nuvem, treine com seu personal, entre no ranking e em desafios com os amigos.")}${localCards()}`;
  }
  const u = me.user;
  const rem = reminderSaved();
  const days = rem?.days ?? [1, 2, 3, 4, 5];
  return `
    <h1 class="title">Olá, ${first(u.name)}!</h1>
    ${msg ? `<p class="msg">${esc(msg)}</p>` : ""}
    <section class="card">
      <div class="row between"><div><b>${esc(u.name)}</b><small>${esc(u.email)} · ${u.role === "personal" ? "🧢 Personal" : "💪 Aluno"}</small></div><button class="btn ghost small" data-logout>Sair</button></div>
    </section>
    ${u.role === "personal" ? `
      <section class="card">
        <h2>🧢 Seus alunos</h2>
        <p class="muted">Mande o link para o aluno criar a conta já ligado a você:</p>
        <div class="code">${esc(u.code)}</div>
        <button class="btn" data-share-personal>📤 Mandar convite para aluno</button>
        <div id="studs">${studentsList()}</div>
      </section>` : `
      <section class="card">
        <h2>🧢 Seu personal</h2>
        ${me.personal ? `
          <p>Você treina com <b>${esc(me.personal.name)}</b>. Ele vê seus treinos, monta seu treino e recebe seus vídeos.</p>
          <label class="switch"><input type="checkbox" id="p-send" ${store.prefs().sendVideos ? "checked" : ""}><span>Mandar o vídeo de cada treino para ele sozinho</span></label>
          <button class="link" data-unlink>Desligar do personal</button>` : `
          <p class="muted">Tem personal? Coloque o código dele (ele vê no Perfil do app).</p>
          <div class="add"><input id="p-code" placeholder="Código, ex.: K7M2QX" autocapitalize="characters"><button class="btn" data-link>Ligar</button></div>`}
      </section>`}
    <section class="card">
      <h2>⏰ Lembrete de treino</h2>
      <p class="muted">O celular avisa na hora marcada, só nos dias em que você ainda não treinou.</p>
      <div class="nums"><label>Horário<input type="time" id="r-at" value="${rem?.at ?? "18:00"}"></label></div>
      <div class="days small">${DAY_SHORT.map((x, i) => `<button data-rday="${i}" class="${days.includes(i) ? "on" : ""}">${x}</button>`).join("")}</div>
      <button class="btn" data-remind>${rem ? "Salvar lembrete" : "🔔 Ligar lembrete"}</button>
      ${rem ? `<button class="link" data-remind-off>Desligar lembrete</button>` : ""}
    </section>
    ${localCards()}`;
}

function localCards() {
  return `
    <section class="card">
      <h2>🎬 Meus vídeos</h2>
      <p class="muted">Os treinos gravados com o esqueleto ficam no celular.</p>
      <button class="btn ghost" data-tab="videos">Abrir meus vídeos</button>
    </section>`;
}

function studentsList() {
  if (!studs) { loadStudents(); return `<p class="muted">Carregando alunos…</p>`; }
  if (!studs.length) return `<p class="muted">Nenhum aluno ainda. Mande o convite acima.</p>`;
  return `<ul class="studs">${studs.map((s) => `
    <li data-stud="${s.id}">
      <div><b>${esc(s.name)}</b><small>${s.last ? `último treino ${fmtDay(s.last)}` : "ainda não treinou"}${s.form !== null ? ` · ${s.form}% forma` : ""}</small></div>
      <div class="right"><span class="tag ${s.perWeek && s.week >= s.perWeek ? "ok" : ""}">${s.week}${s.perWeek ? `/${s.perWeek}` : ""} na semana</span>${s.newVideos ? `<span class="tag red">🎬 ${s.newVideos}</span>` : ""}</div>
    </li>`).join("")}</ul>`;
}

async function loadStudents() {
  try { studs = (await api<{ students: StudentRow[] }>("students")).students; } catch (e) { studs = []; msg = `⚠️ ${(e as Error).message}`; }
  render();
}

const fmtDay = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}${y === String(new Date().getFullYear()) ? "" : `/${y}`}`; };

// ---------- ficha do aluno (personal) ----------
export function studentView() {
  if (!cur) return `<button class="link back" data-tab="perfil">‹ Alunos</button><p class="muted">Abra um aluno na lista.</p>`;
  const s = cur;
  const ws = s.workouts;
  const since = Date.now() - 30 * 86400_000;
  const month = ws.filter((w) => w.started >= since);
  const reps = month.reduce((a, w) => a + totalReps(w), 0);
  const form = month.length ? Math.round(month.reduce((a, w) => a + formScore(w), 0) / month.length) : 0;
  const issues = new Map<string, number>();
  for (const w of month) for (const e of w.exercises) for (const x of e.sets) for (const i of x.issues) issues.set(i, (issues.get(i) ?? 0) + 1);
  const topIssues = [...issues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const w = s.data.weights ?? [];
  return `
    <button class="link back" data-tab="perfil">‹ Alunos</button>
    <h1 class="title">${esc(s.student.name)}</h1>
    <div class="chips">
      <div class="chip"><b>${month.length}</b><span>treinos em 30 dias</span></div>
      <div class="chip"><b>${reps}</b><span>repetições</span></div>
      <div class="chip"><b>${form}%</b><span>forma certa</span></div>
    </div>
    ${w.length ? `<p class="muted">Peso: <b>${w[w.length - 1].kg} kg</b>${w.length > 1 ? ` (era ${w[0].kg} kg em ${fmtDay(w[0].date)})` : ""}</p>` : ""}
    <section class="card">
      <h2>📋 Treino do aluno</h2>
      <p class="muted">${(s.data.plan ?? []).map((d, i) => (d ? `${DAY_SHORT[i]}: ${esc(d.name)}` : "")).filter(Boolean).join(" · ") || "Sem treino montado."}</p>
      <button class="btn" data-edit-plan>✏️ Montar / mudar o treino</button>
    </section>
    ${topIssues.length ? `<section class="card"><h2>⚠️ Erros que mais aparecem</h2><ul class="mini-list">${topIssues.map(([t, n]) => `<li>${esc(t)} <small style="display:inline">(${n}×)</small></li>`).join("")}</ul></section>` : ""}
    <section class="card">
      <h2>🎬 Vídeos</h2>
      ${s.videos.length ? s.videos.map((v) => `<div class="vrow"><div><b>${esc(v.title || "Treino")}</b><small>${new Date(v.created_at).toLocaleDateString("pt-BR")} · ${Math.floor(v.secs / 60)}:${String(v.secs % 60).padStart(2, "0")}${v.seen_at ? "" : " · novo"}</small></div><button class="btn small" data-vid="${v.id}">▶ Ver</button></div><div id="v-${v.id}"></div>`).join("") : `<p class="muted">O aluno ainda não mandou vídeo. Os vídeos ficam 14 dias.</p>`}
    </section>
    <section class="card">
      <h2>📅 Últimos treinos</h2>
      ${ws.length ? ws.slice(0, 15).map((x) => `<div class="sess"><div class="row between"><b>${esc(x.name)}</b><span class="tag">${formScore(x)}%</span></div><small class="muted">${fmtDay(x.date)} · ${x.exercises.map((e) => `${EXERCISES[e.ex]?.name ?? e.ex} ${e.sets.map((y) => (EXERCISES[e.ex]?.timed ? `${y.secs}s` : `${y.good}/${y.reps}`)).join(" ")}`).join(" · ") || "check-in"}</small></div>`).join("") : `<p class="muted">Nenhum treino ainda.</p>`}
    </section>`;
}

// ---------- Ranking ----------
export function social() {
  if (!cloud.session || !cloud.me) return `<h1 class="title">Ranking</h1>${authCard("Entre para ver o ranking da semana e desafiar seus amigos.")}`;
  if (!rank) loadRank();
  if (!chs) loadChallenges();
  const board = (b: Board[], unit = "") => b.length ? `<ol class="board">${b.map((r, i) => `<li class="${r.me ? "me" : ""}"><span class="pos">${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span><span class="nm">${esc(r.name)}${r.me ? " (você)" : ""}</span><b>${r.score}${unit}</b></li>`).join("")}</ol>` : `<p class="muted">Ninguém pontuou ainda. Seja o primeiro!</p>`;
  return `
    <h1 class="title">Ranking</h1>
    ${msg ? `<p class="msg">${esc(msg)}</p>` : ""}
    <section class="card">
      <h2>🏆 Repetições perfeitas na semana</h2>
      <p class="muted">Só conta repetição que o Tonhão aprovou.</p>
      ${rank ? `${rank.me ? `<p>Você está em <b>${rank.me.pos}º</b> de ${rank.me.total} com <b>${rank.me.score}</b>.</p>` : `<p class="muted">Treine esta semana para entrar no ranking.</p>`}${board(rank.top)}` : `<p class="muted">Carregando…</p>`}
    </section>
    ${rank?.group.length ? `<section class="card"><h2>🧢 Sua turma</h2>${board(rank.group)}</section>` : ""}
    <section class="card">
      <h2>⚔️ Desafios</h2>
      <p class="muted">Crie um desafio e mande o link para os amigos. Ganha quem fizer mais repetições perfeitas do exercício no período.</p>
      <label class="field">Nome<input id="c-title" placeholder="Ex.: Quem faz mais barra"></label>
      <div class="nums">
        <label>Exercício<select id="c-ex">${Object.values(EXERCISES).map((e) => `<option value="${e.id}">${e.name}</option>`).join("")}</select></label>
        <label>Dura<select id="c-days"><option value="1">1 dia</option><option value="7" selected>7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option></select></label>
      </div>
      <button class="btn" data-ch-new>Criar desafio</button>
      <div class="add" style="margin-top:12px"><input id="c-code" placeholder="Tem um código? Ex.: 4KZ9P" autocapitalize="characters"><button class="btn ghost" data-ch-join>Entrar</button></div>
    </section>
    ${chs ? chs.map((c) => {
      const ended = c.ends < new Date().toISOString().slice(0, 10);
      return `<section class="card">
        <div class="row between"><h2>${EXERCISES[c.ex]?.emoji ?? "⚔️"} ${esc(c.title)}</h2><span class="tag ${ended ? "" : "ok"}">${ended ? "Acabou" : `até ${fmtDay(c.ends)}`}</span></div>
        <small class="muted">${EXERCISES[c.ex]?.name ?? c.ex} · código <b>${c.code}</b></small>
        ${board(c.board, EXERCISES[c.ex]?.timed ? "s" : "")}
        <div class="row"><button class="btn" data-ch-share="${c.code}">📤 Chamar amigos</button><button class="btn ghost small" data-ch-leave="${c.code}">Sair</button></div>
      </section>`;
    }).join("") : ""}`;
}

async function loadRank() {
  try { rank = await api<Ranking>("ranking"); } catch { rank = { week: "", top: [], me: null, group: [] }; }
  render();
}
async function loadChallenges() {
  try { chs = (await api<{ challenges: Challenge[] }>("challenges")).challenges; } catch { chs = []; }
  render();
}

async function share(text: string, url: string) {
  try { await navigator.share({ title: "FORMA", text, url }); return; } catch { /* sem share ou cancelou */ }
  try { await navigator.clipboard.writeText(`${text} ${url}`); alert("Link copiado! Cole no WhatsApp."); } catch { prompt("Copie o link:", url); }
}

// ---------- cliques ----------
export function socialClick(el: HTMLElement): boolean {
  const d = el.dataset;
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? "";
  if (d.authmode !== undefined) { authMode = authMode === "criar" ? "entrar" : "criar"; msg = ""; render(); return true; }
  if (d.auth !== undefined) {
    const email = val("a-email"), pass = val("a-pass");
    const role = ((document.querySelector('input[name="a-role"]:checked') as HTMLInputElement | null)?.value ?? "aluno") as "aluno" | "personal";
    run(async () => {
      if (authMode === "criar") await signup(email, pass, val("a-name"), role); else await login(email, pass);
      rank = null; chs = null; studs = null;
      await pending();
    });
    return true;
  }
  if (d.logout !== undefined) { if (confirm("Sair da conta? Seus treinos continuam neste celular.")) run(logout); return true; }
  if (d.link !== undefined) {
    run(async () => { const r = await api<{ personal: { id: string; name: string; code: string } }>("link_personal", { code: val("p-code") }); cloud.me!.personal = r.personal; rank = null; }, "✓ Ligado ao personal!");
    return true;
  }
  if (d.unlink !== undefined) {
    if (confirm("Desligar do personal? Ele não vai mais ver seus treinos.")) run(async () => { await api("link_personal", { code: "" }); cloud.me!.personal = null; rank = null; });
    return true;
  }
  if (d.sharePersonal !== undefined) {
    const me = cloud.me!.user;
    share(`Vamos treinar juntos no FORMA, o app que corrige o exercício pela câmera! Crie sua conta pelo link (meu código: ${me.code})`, `${LINK()}?personal=${me.code}`);
    return true;
  }
  if (d.stud) {
    run(async () => { cur = await api<StudentFull>("student", { id: d.stud }); goTab("aluno"); });
    return true;
  }
  if (d.editPlan !== undefined && cur) {
    const empty: WeekPlan = [null, null, null, null, null, null, null];
    editing.v = { id: cur.student.id, name: cur.student.name.split(" ")[0], plan: structuredClone(cur.data.plan ?? empty) };
    // goTab limpa o editing fora de "treinos"; aqui vamos para lá
    const v = editing.v;
    goTab("treinos");
    editing.v = v;
    render();
    return true;
  }
  if (d.vid) {
    const box = document.getElementById(`v-${d.vid}`);
    if (box) box.innerHTML = `<p class="muted">Carregando…</p>`;
    api<{ url: string }>("video_url", { id: d.vid })
      .then((r) => { if (box) box.innerHTML = `<video src="${r.url}" controls autoplay playsinline class="pv"></video>`; })
      .catch((e) => { if (box) box.innerHTML = `<p class="msg">⚠️ ${esc(e.message)}</p>`; });
    return true;
  }
  if (d.rday) { el.classList.toggle("on"); return true; }
  if (d.remind !== undefined) {
    const days = [...document.querySelectorAll<HTMLElement>("[data-rday].on")].map((b) => Number(b.dataset.rday));
    run(() => reminderOn(val("r-at") || "18:00", days), "✓ Lembrete ligado! Mandei um aviso de teste.");
    return true;
  }
  if (d.remindOff !== undefined) { run(reminderOff, "Lembrete desligado."); return true; }
  if (d.chNew !== undefined) {
    run(async () => {
      const r = await api<{ code: string }>("challenge_create", { title: val("c-title") || "Desafio", ex: val("c-ex"), days: Number(val("c-days")) });
      chs = null; rank = null;
      await share(`Te desafio no FORMA! Quem fizer mais ${EXERCISES[val("c-ex") as ExId]?.name.toLowerCase() ?? ""} perfeito ganha. Entra pelo link:`, `${LINK()}?desafio=${r.code}`);
    }, "✓ Desafio criado! Mande o link para os amigos.");
    return true;
  }
  if (d.chJoin !== undefined) { run(async () => { const r = await api<{ title: string }>("challenge_join", { code: val("c-code") }); chs = null; msg = `✓ Você entrou no desafio "${r.title}"!`; }); return true; }
  if (d.chShare) { const c = chs?.find((x) => x.code === d.chShare); share(`Entra no desafio "${c?.title ?? ""}" comigo no FORMA!`, `${LINK()}?desafio=${d.chShare}`); return true; }
  if (d.chLeave) { if (confirm("Sair do desafio?")) run(async () => { await api("challenge_leave", { code: d.chLeave }); chs = null; }); return true; }
  return false;
}

export function socialChange(t: HTMLInputElement): boolean {
  if (t.id === "p-send") { store.setPrefs({ ...store.prefs(), sendVideos: t.checked }); return true; }
  return false;
}

export { note };
