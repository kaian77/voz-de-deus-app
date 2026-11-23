// Telas que usam a nuvem: Perfil (conta, lembrete) e Ranking (semana, desafios).
// Os dados vêm da função `forma` (cloud.ts) e ficam guardados aqui para a tela não piscar.
import { api, cloud, login, logout, refresh, reminderOff, reminderOn, reminderSaved, signup } from "./cloud";
import { DAY_SHORT, EXERCISES, type ExId } from "./data";
import { CREDIT } from "./exart";
import { goTab, render } from "./main";

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const first = (n: string) => esc(n.split(" ")[0]);
const LINK = () => `${location.origin}/treino`;

// ---------- estado ----------
interface Board { name: string; score: number; me: boolean }
interface Ranking { week: string; top: Board[]; me: { pos: number; score: number; total: number } | null }
interface Challenge { code: string; title: string; ex: ExId; starts: string; ends: string; board: Board[] }
let rank: Ranking | null = null;
let chs: Challenge[] | null = null;
let passed: { by_name: string; scope: string; title: string; created_at: string }[] | null = null;
let authMode: "entrar" | "criar" = "criar";
let msg = "";
let busy = false;

/** Ao abrir a aba Ranking: busca de novo (o placar muda a cada treino). */
export function resetSocial() { rank = null; chs = null; passed = null; }

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
  const dc = q.get("desafio");
  try { if (dc) sessionStorage.setItem("forma_pending_desafio", dc.toUpperCase()); } catch { /* */ }
  if (dc) { if (!cloud.session) msg = "Crie sua conta para entrar no desafio."; goTab(cloud.session ? "ranking" : "perfil"); }
  if (cloud.session) { await refresh(); await pending(); render(); }
}

async function pending() {
  let dc: string | null = null;
  try { dc = sessionStorage.getItem("forma_pending_desafio"); } catch { /* */ }
  if (dc) {
    try { const r = await api<{ title: string }>("challenge_join", { code: dc }); msg = `✓ Você entrou no desafio "${r.title}"!`; chs = null; } catch (e) { msg = `⚠️ ${(e as Error).message}`; }
  }
  try { sessionStorage.removeItem("forma_pending_desafio"); } catch { /* */ }
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
      <button class="btn" data-auth ${busy ? "disabled" : ""}>${busy ? "Aguarde…" : authMode === "criar" ? "Criar conta" : "Entrar"}</button>
      <button class="link" data-authmode>${authMode === "criar" ? "Já tenho conta: entrar" : "Não tenho conta: criar"}</button>
    </section>`;
}

// ---------- Perfil ----------
export function perfil() {
  const me = cloud.me;
  if (!cloud.session || !me) {
    return `<h1 class="title">Perfil</h1>${authCard("Guarde seus treinos na nuvem, entre no ranking e em desafios com os amigos.")}${localCards()}`;
  }
  const u = me.user;
  const rem = reminderSaved();
  const days = rem?.days ?? [1, 2, 3, 4, 5];
  return `
    <h1 class="title">Olá, ${first(u.name)}!</h1>
    ${msg ? `<p class="msg">${esc(msg)}</p>` : ""}
    <section class="card">
      <div class="row between"><div><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div><button class="btn ghost small" data-logout>Sair</button></div>
    </section>
    <section class="card">
      <h2>🔔 Avisos no celular</h2>
      <label class="switch"><input type="checkbox" id="r-passes" ${rem?.passes === false ? "" : "checked"}><span>Quando alguém passar de mim no ranking ou num desafio</span></label>
      <label class="switch"><input type="checkbox" id="r-remind" ${rem?.remind === false ? "" : "checked"}><span>Lembrete de treino (só nos dias em que eu ainda não treinei)</span></label>
      <div class="nums"><label>Horário<input type="time" id="r-at" value="${rem?.at ?? "18:00"}"></label></div>
      <div class="days small">${DAY_SHORT.map((x, i) => `<button data-rday="${i}" class="${days.includes(i) ? "on" : ""}">${x}</button>`).join("")}</div>
      <button class="btn" data-remind>${rem ? "Salvar avisos" : "🔔 Ligar avisos"}</button>
      ${rem ? `<button class="link" data-remind-off>Desligar todos os avisos</button>` : ""}
    </section>
    ${localCards()}`;
}

function localCards() {
  return `
    <section class="card">
      <h2>🎬 Meus vídeos</h2>
      <p class="muted">Os treinos gravados com o esqueleto ficam no celular.</p>
      <button class="btn ghost" data-tab="videos">Abrir meus vídeos</button>
    </section>
    <p class="credit">${CREDIT}</p>`;
}

const fmtDay = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}${y === String(new Date().getFullYear()) ? "" : `/${y}`}`; };

// ---------- Ranking ----------
export function social() {
  if (!cloud.session || !cloud.me) return `<h1 class="title">Ranking</h1>${authCard("Entre para ver o ranking da semana e desafiar seus amigos.")}`;
  if (!rank) loadRank();
  if (!chs) loadChallenges();
  if (!passed) loadPasses();
  const board = (b: Board[], unit = "") => b.length ? `<ol class="board">${b.map((r, i) => `<li class="${r.me ? "me" : ""}"><span class="pos">${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span><span class="nm">${esc(r.name)}${r.me ? " (você)" : ""}</span><b>${r.score}${unit}</b></li>`).join("")}</ol>` : `<p class="muted">Ninguém pontuou ainda. Seja o primeiro!</p>`;
  return `
    <h1 class="title">Ranking</h1>
    ${msg ? `<p class="msg">${esc(msg)}</p>` : ""}
    ${passed?.length ? `<section class="card passes">
      <h2>🔥 Passaram de você</h2>
      <ul class="mini-list">${passed.slice(0, 5).map((x) => `<li><b>${esc(x.by_name)}</b> passou de você ${x.scope === "semana" ? "no ranking da semana" : `no desafio "${esc(x.title)}"`} <small style="display:inline">· ${ago(x.created_at)}</small></li>`).join("")}</ul>
      <button class="btn" data-tab="hoje">💪 Treinar agora e pegar o lugar de volta</button>
    </section>` : ""}
    <section class="card">
      <h2>🏆 Repetições perfeitas na semana</h2>
      <p class="muted">Só conta repetição que o Tonhão aprovou.</p>
      ${rank ? `${rank.me ? `<p>Você está em <b>${rank.me.pos}º</b> de ${rank.me.total} com <b>${rank.me.score}</b>.</p>` : `<p class="muted">Treine esta semana para entrar no ranking.</p>`}${board(rank.top)}` : `<p class="muted">Carregando…</p>`}
    </section>
    <section class="card">
      <h2>⚔️ Desafios</h2>
      <p class="muted">Crie um desafio e mande o link para os amigos. Ganha quem fizer mais repetições perfeitas do exercício no período.</p>
      <label class="field">Nome<input id="c-title" placeholder="Ex.: Quem faz mais barra"></label>
      <div class="nums">
        <label>Exercício<select id="c-ex">${Object.values(EXERCISES).filter((e) => e.coach).map((e) => `<option value="${e.id}">${e.name}</option>`).join("")}</select></label>
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
  try { rank = await api<Ranking>("ranking"); } catch { rank = { week: "", top: [], me: null }; }
  render();
}
async function loadPasses() {
  try { passed = (await api<{ passes: typeof passed }>("passes")).passes; } catch { passed = []; }
  render();
}

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `há ${Math.max(1, m)} min`;
  if (m < 1440) return `há ${Math.round(m / 60)} h`;
  return `há ${Math.round(m / 1440)} dia${m >= 2880 ? "s" : ""}`;
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
    run(async () => {
      if (authMode === "criar") await signup(email, pass, val("a-name")); else await login(email, pass);
      rank = null; chs = null; passed = null;
      await pending();
    });
    return true;
  }
  if (d.logout !== undefined) { if (confirm("Sair da conta? Seus treinos continuam neste celular.")) run(logout); return true; }
  if (d.rday) { el.classList.toggle("on"); return true; }
  if (d.remind !== undefined) {
    const days = [...document.querySelectorAll<HTMLElement>("[data-rday].on")].map((b) => Number(b.dataset.rday));
    const chk = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.checked ?? true;
    run(() => reminderOn(val("r-at") || "18:00", days, chk("r-remind"), chk("r-passes")), "✓ Avisos ligados! Mandei um aviso de teste.");
    return true;
  }
  if (d.remindOff !== undefined) { run(reminderOff, "Avisos desligados."); return true; }
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

export { note };
