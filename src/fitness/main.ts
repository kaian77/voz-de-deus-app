// FORMA — app de treino com personal por câmera. Telas: Hoje, Treinos, Agenda, Metas, Vídeos.
import "./style.css";
import {
  DAY_NAMES, DAY_SHORT, EXERCISES, formScore, parseDay, records, store, streak, suggestion, today, totalReps, uid, weekStart,
  type DayPlan, type ExId, type PlanItem, type Session,
} from "./data";
import { shareVideo, startWorkout } from "./workout";
import { recordings } from "./rec";
import { drawTonhao, TONHAO } from "./tonhao";

type Tab = "hoje" | "treinos" | "agenda" | "metas" | "videos";
const app = document.getElementById("app")!;
let tab: Tab = (new URLSearchParams(location.search).get("aba") as Tab) || "hoje";
let agendaMonth = new Date();
let selDay = today();
let editDay = new Date().getDay();

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function itemLine(it: PlanItem) {
  const e = EXERCISES[it.ex];
  return `${it.sets}× ${it.reps}${e.timed ? "s" : ""}${it.kg ? ` · ${it.kg} kg` : ""}`;
}

function render() {
  app.innerHTML = `
    <main class="page">${({ hoje, treinos, agenda, metas, videos } as Record<Tab, () => string>)[tab]()}</main>
    <nav class="tabs">
      ${([["hoje", "🏠", "Hoje"], ["treinos", "📋", "Treinos"], ["agenda", "📅", "Agenda"], ["metas", "🎯", "Metas"], ["videos", "🎬", "Vídeos"]] as const)
        .map(([k, i, n]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}"><span>${i}</span>${n}</button>`).join("")}
    </nav>`;
  if (tab === "videos") loadVideos();
  if (tab === "metas") drawWeight();
}

// ---------------- Hoje ----------------
function hoje() {
  const plan = store.plan();
  const d = new Date().getDay();
  const day = plan[d];
  const hist = store.history();
  const prefs = store.prefs();
  const goals = store.goals();
  const ws = weekStart();
  const weekDone = new Set(hist.filter((s) => parseDay(s.date) >= ws).map((s) => s.date)).size;
  const doneToday = hist.some((s) => s.date === today());
  const hr = new Date().getHours();
  const hi = hr < 12 ? "Bom dia" : hr < 18 ? "Boa tarde" : "Boa noite";
  return `
    <header class="hero">
      <div class="brand">FORMA<span>personal com IA</span></div>
      <h1>${hi}${prefs.name ? `, ${esc(prefs.name)}` : ""}! 👊</h1>
      <div class="chips">
        <div class="chip"><b>🔥 ${streak(hist)}</b><span>dias seguidos</span></div>
        <div class="chip"><b>${weekDone}/${goals.perWeek}</b><span>treinos na semana</span></div>
        <div class="chip"><b>${hist.length}</b><span>treinos no total</span></div>
      </div>
    </header>
    <section class="card today">
      <div class="row between"><h2>${DAY_NAMES[d]}${day ? ` · ${esc(day.name)}` : ""}</h2>${doneToday ? `<span class="tag ok">✓ Feito</span>` : ""}</div>
      ${day && day.items.length ? `
        <ul class="exlist">${day.items.map((it) => {
          const sug = suggestion(hist, it);
          return `<li><span class="exi">${EXERCISES[it.ex].emoji}</span><div><b>${EXERCISES[it.ex].name}</b><small>${itemLine(it)} · descanso ${it.rest}s</small>${sug ? `<small class="sug">📈 ${sug}</small>` : ""}</div></li>`;
        }).join("")}</ul>
        <button class="btn big" data-go="today">▶ Começar treino</button>
        <p class="hint">🎧 Coloque o fone, apoie o celular a 2–3 m e deixe o corpo inteiro aparecer na tela.</p>`
      : `<p class="muted">Hoje é dia de descanso. 😴 Quer treinar mesmo assim? Escolha um exercício abaixo ou monte o dia em Treinos.</p>`}
    </section>
    <section class="card">
      <h2>Treino livre</h2>
      <p class="muted">Escolha um exercício, as séries e as repetições.</p>
      <div class="free">
        <select id="f-ex">${Object.values(EXERCISES).map((e) => `<option value="${e.id}">${e.emoji} ${e.name}</option>`).join("")}</select>
        <label>Séries<input id="f-sets" type="number" min="1" max="20" value="3" inputmode="numeric"></label>
        <label><span id="f-unit">Repetições</span><input id="f-reps" type="number" min="1" max="300" value="10" inputmode="numeric"></label>
        <label>Descanso (s)<input id="f-rest" type="number" min="0" max="600" value="60" inputmode="numeric"></label>
      </div>
      <button class="btn" data-go="free">▶ Começar</button>
    </section>
    <section class="card">
      <h2>O ${TONHAO} mostra e corrige</h2>
      <p class="muted">Antes de cada exercício ele mostra como faz. Se você errar, ele aparece no canto da tela fazendo certo e fala a correção no fone.</p>
      <div class="grid2">${Object.values(EXERCISES).map((e) => `<div class="mini"><canvas class="tz" data-ex="${e.id}"></canvas><b>${e.name}</b><small>celular de ${e.view} · ${e.tips[0]}</small></div>`).join("")}</div>
    </section>`;
}

// ---------------- Treinos (montar a semana) ----------------
function treinos() {
  const plan = store.plan();
  const day = plan[editDay];
  return `
    <h1 class="title">Seus treinos</h1>
    <p class="muted">Monte o treino de cada dia: séries, repetições, carga e descanso.</p>
    <div class="days">${DAY_NAMES.map((n, i) => `<button data-day="${i}" class="${i === editDay ? "on" : ""} ${plan[i] ? "has" : ""}">${DAY_SHORT[i]}<small>${plan[i] ? esc(plan[i]!.name).slice(0, 8) : "folga"}</small></button>`).join("")}</div>
    <section class="card">
      <div class="row between">
        <h2>${DAY_NAMES[editDay]}</h2>
        <label class="switch"><input type="checkbox" id="d-on" ${day ? "checked" : ""}><span>Dia de treino</span></label>
      </div>
      ${day ? `
        <label class="field">Nome do treino<input id="d-name" value="${esc(day.name)}" placeholder="Ex.: Pernas"></label>
        <div class="items">${day.items.map((it, i) => `
          <div class="item">
            <div class="row between"><b>${EXERCISES[it.ex].emoji} ${EXERCISES[it.ex].name}</b>
              <span class="row"><button class="ic" data-mv="${i}:-1">↑</button><button class="ic" data-mv="${i}:1">↓</button><button class="ic del" data-rm="${i}">🗑</button></span></div>
            <div class="nums">
              <label>Séries<input type="number" min="1" max="20" data-f="${i}:sets" value="${it.sets}" inputmode="numeric"></label>
              <label>${EXERCISES[it.ex].timed ? "Segundos" : "Reps"}<input type="number" min="1" max="300" data-f="${i}:reps" value="${it.reps}" inputmode="numeric"></label>
              <label>Carga kg<input type="number" min="0" max="500" step="0.5" data-f="${i}:kg" value="${it.kg ?? ""}" placeholder="—" inputmode="decimal"></label>
              <label>Descanso<input type="number" min="0" max="600" data-f="${i}:rest" value="${it.rest}" inputmode="numeric"></label>
            </div>
          </div>`).join("")}</div>
        <div class="add">
          <select id="add-ex">${Object.values(EXERCISES).map((e) => `<option value="${e.id}">${e.emoji} ${e.name}</option>`).join("")}</select>
          <button class="btn" data-add>+ Adicionar</button>
        </div>
        ${day.items.length ? `<button class="btn ghost" data-go="day:${editDay}">▶ Fazer este treino agora</button>` : ""}
      ` : `<p class="muted">Dia de folga. Ligue "Dia de treino" para montar.</p>`}
    </section>
    <section class="card">
      <h2>Modelos prontos</h2>
      <p class="muted">Troca a semana inteira (dá para editar depois).</p>
      <div class="presets">
        <button class="btn ghost" data-preset="abc">ABC (3 dias)</button>
        <button class="btn ghost" data-preset="casa">Em casa, sem aparelho</button>
        <button class="btn ghost" data-preset="calis">Calistenia (barra)</button>
      </div>
    </section>`;
}

const PRESETS: Record<string, (DayPlan | null)[]> = {
  abc: [null,
    { name: "A · Peito e ombro", items: [{ ex: "pushup", sets: 4, reps: 12, rest: 60 }, { ex: "press", sets: 4, reps: 10, rest: 60 }, { ex: "lateral", sets: 3, reps: 12, rest: 45 }] },
    null,
    { name: "B · Costas e bíceps", items: [{ ex: "pullup", sets: 4, reps: 6, rest: 90 }, { ex: "curl", sets: 4, reps: 10, rest: 60 }] },
    null,
    { name: "C · Pernas", items: [{ ex: "squat", sets: 4, reps: 12, rest: 60 }, { ex: "lunge", sets: 3, reps: 10, rest: 60 }, { ex: "bridge", sets: 3, reps: 15, rest: 45 }, { ex: "plank", sets: 3, reps: 40, rest: 30 }] },
    null],
  casa: [null,
    { name: "Corpo todo", items: [{ ex: "jack", sets: 2, reps: 30, rest: 30 }, { ex: "squat", sets: 3, reps: 15, rest: 45 }, { ex: "pushup", sets: 3, reps: 10, rest: 45 }, { ex: "plank", sets: 3, reps: 30, rest: 30 }] },
    null,
    { name: "Pernas e glúteo", items: [{ ex: "squat", sets: 4, reps: 15, rest: 45 }, { ex: "lunge", sets: 3, reps: 12, rest: 45 }, { ex: "bridge", sets: 4, reps: 15, rest: 30 }] },
    null,
    { name: "Superiores e abdômen", items: [{ ex: "pushup", sets: 4, reps: 12, rest: 45 }, { ex: "plank", sets: 3, reps: 45, rest: 30 }, { ex: "jack", sets: 3, reps: 40, rest: 30 }] },
    null],
  calis: [null,
    { name: "Puxar", items: [{ ex: "pullup", sets: 5, reps: 5, rest: 120 }, { ex: "plank", sets: 3, reps: 45, rest: 45 }] },
    { name: "Empurrar", items: [{ ex: "pushup", sets: 5, reps: 15, rest: 60 }, { ex: "press", sets: 3, reps: 12, rest: 60 }] },
    null,
    { name: "Pernas", items: [{ ex: "squat", sets: 5, reps: 20, rest: 60 }, { ex: "lunge", sets: 3, reps: 12, rest: 60 }] },
    { name: "Barra e flexão", items: [{ ex: "pullup", sets: 4, reps: 6, rest: 90 }, { ex: "pushup", sets: 4, reps: 12, rest: 60 }] },
    null],
};

// ---------------- Agenda (calendário com check-in) ----------------
function agenda() {
  const plan = store.plan();
  const hist = store.history();
  const byDay = new Map<string, Session[]>();
  for (const s of hist) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const y = agendaMonth.getFullYear(), m = agendaMonth.getMonth();
  const first = new Date(y, m, 1);
  const pad = first.getDay();
  const n = new Date(y, m + 1, 0).getDate();
  const t = today();
  let done = 0, missed = 0;
  const cells: string[] = [];
  for (let i = 0; i < pad; i++) cells.push(`<span></span>`);
  for (let d = 1; d <= n; d++) {
    const date = new Date(y, m, d);
    const key = today(date);
    const has = byDay.has(key);
    const planned = !!plan[date.getDay()];
    const past = key < t;
    let cls = "";
    if (has) { cls = "done"; done++; } else if (planned && past) { cls = "miss"; missed++; } else if (planned) cls = "plan";
    cells.push(`<button data-sel="${key}" class="cal-d ${cls} ${key === t ? "now" : ""} ${key === selDay ? "sel" : ""}">${d}${has ? "<i>✓</i>" : ""}</button>`);
  }
  const sel = byDay.get(selDay) ?? [];
  const selDate = parseDay(selDay);
  const selPlan = plan[selDate.getDay()];
  return `
    <h1 class="title">Agenda</h1>
    <section class="card">
      <div class="row between cal-head">
        <button class="ic" data-month="-1">‹</button>
        <b>${first.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</b>
        <button class="ic" data-month="1">›</button>
      </div>
      <div class="cal">${["D", "S", "T", "Q", "Q", "S", "S"].map((x) => `<span class="cal-w">${x}</span>`).join("")}${cells.join("")}</div>
      <div class="legend"><span><i class="lg done"></i>feito (${done})</span><span><i class="lg plan"></i>marcado</span><span><i class="lg miss"></i>faltou (${missed})</span></div>
    </section>
    <section class="card">
      <h2>${selDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</h2>
      ${sel.length ? sel.map((s) => `
        <div class="sess">
          <div class="row between"><b>✅ ${esc(s.name)}</b><span class="tag">${formScore(s)}% forma</span></div>
          <small class="muted">${new Date(s.started).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · ${Math.max(1, Math.round((s.ended - s.started) / 60000))} min · ${totalReps(s)} repetições</small>
          <ul class="mini-list">${s.exercises.map((e) => `<li>${EXERCISES[e.ex].emoji} ${EXERCISES[e.ex].name}: ${e.sets.map((x) => (EXERCISES[e.ex].timed ? `${x.secs}s` : `${x.reps}`)).join(" · ")}${e.kg ? ` (${e.kg} kg)` : ""}</li>`).join("")}</ul>
          <button class="link" data-del="${s.id}">Apagar registro</button>
        </div>`).join("")
      : `<p class="muted">${selPlan ? `Treino marcado: <b>${esc(selPlan.name)}</b>.` : "Dia de folga."} Nada registrado.</p>`}
      ${selDay <= t ? `<button class="btn ghost" data-checkin>✓ Fazer check-in (treinei sem o app)</button>` : ""}
      ${selDay === t && selPlan ? `<button class="btn" data-go="today">▶ Começar o treino de hoje</button>` : ""}
    </section>`;
}

// ---------------- Metas ----------------
function metas() {
  const g = store.goals();
  const hist = store.history();
  const prefs = store.prefs();
  const ws = weekStart();
  const weekDone = new Set(hist.filter((s) => parseDay(s.date) >= ws).map((s) => s.date)).size;
  const now = new Date();
  const monthReps = hist.filter((s) => parseDay(s.date).getMonth() === now.getMonth() && parseDay(s.date).getFullYear() === now.getFullYear()).reduce((a, s) => a + totalReps(s), 0);
  const rec = records(hist);
  const w = store.weights();
  const lastW = w[w.length - 1];
  const pct = (a: number, b: number) => Math.min(100, Math.round((a / Math.max(1, b)) * 100));
  const avgForm = hist.length ? Math.round(hist.slice(0, 10).reduce((a, s) => a + formScore(s), 0) / Math.min(10, hist.length)) : 0;
  return `
    <h1 class="title">Metas</h1>
    <section class="card">
      <h2>Esta semana</h2>
      <div class="bar"><i style="width:${pct(weekDone, g.perWeek)}%"></i></div>
      <p><b>${weekDone}</b> de <b>${g.perWeek}</b> treinos ${weekDone >= g.perWeek ? "· 🏆 meta batida!" : ""}</p>
      <h2>Repetições no mês</h2>
      <div class="bar"><i style="width:${pct(monthReps, g.monthlyReps)}%"></i></div>
      <p><b>${monthReps}</b> de <b>${g.monthlyReps}</b></p>
      <p class="muted">Forma certa nos últimos treinos: <b>${avgForm}%</b></p>
      <div class="nums">
        <label>Treinos por semana<input type="number" min="1" max="14" id="g-week" value="${g.perWeek}" inputmode="numeric"></label>
        <label>Repetições no mês<input type="number" min="10" max="100000" step="10" id="g-reps" value="${g.monthlyReps}" inputmode="numeric"></label>
      </div>
    </section>
    <section class="card">
      <h2>Peso</h2>
      ${lastW ? `<p>Atual: <b>${lastW.kg} kg</b>${g.targetKg ? ` · meta <b>${g.targetKg} kg</b> · faltam <b>${Math.abs(+(lastW.kg - g.targetKg).toFixed(1))} kg</b>` : ""}</p>` : `<p class="muted">Anote seu peso para acompanhar.</p>`}
      <canvas id="wchart" height="140"></canvas>
      <div class="nums">
        <label>Peso de hoje (kg)<input type="number" step="0.1" min="20" max="400" id="w-kg" inputmode="decimal" placeholder="${lastW?.kg ?? "75"}"></label>
        <label>Meta (kg)<input type="number" step="0.1" min="20" max="400" id="g-kg" value="${g.targetKg ?? ""}" inputmode="decimal"></label>
      </div>
      <button class="btn ghost" data-weight>Salvar peso</button>
    </section>
    <section class="card">
      <h2>🏅 Recordes (numa série)</h2>
      ${Object.keys(rec).length ? `<ul class="mini-list">${(Object.entries(rec) as [ExId, number][]).map(([k, v]) => `<li>${EXERCISES[k].emoji} ${EXERCISES[k].name}: <b>${v}${EXERCISES[k].timed ? " s" : " perfeitas"}</b></li>`).join("")}</ul>` : `<p class="muted">Faça o primeiro treino para ver os recordes.</p>`}
    </section>
    <section class="card">
      <h2>⚙️ Ajustes</h2>
      <label class="field">Seu nome<input id="p-name" value="${esc(prefs.name)}" placeholder="Como o personal te chama"></label>
      <label class="switch"><input type="checkbox" id="p-voice" ${prefs.voice ? "checked" : ""}><span>Personal falando no fone</span></label>
      <label class="switch"><input type="checkbox" id="p-record" ${prefs.record ? "checked" : ""}><span>Gravar o treino com o esqueleto</span></label>
      <label class="switch"><input type="checkbox" id="p-strict" ${prefs.strictPullup ? "checked" : ""}><span>Barra rigorosa (queixo inteiro acima da barra)</span></label>
      <label class="field">Contagem antes de começar (s)<input type="number" id="p-count" min="3" max="30" value="${prefs.countdown}" inputmode="numeric"></label>
      <button class="btn ghost" data-prefs>Salvar ajustes</button>
    </section>`;
}

function drawWeight() {
  const c = document.getElementById("wchart") as HTMLCanvasElement | null;
  const w = store.weights().slice(-30);
  if (!c) return;
  if (w.length < 2) { c.style.display = "none"; return; }
  const W = (c.width = c.clientWidth * 2), H = (c.height = 280);
  const g = c.getContext("2d")!;
  const tgt = store.goals().targetKg;
  const vals = w.map((x) => x.kg).concat(tgt ? [tgt] : []);
  const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1;
  const X = (i: number) => 30 + (i / (w.length - 1)) * (W - 60);
  const Y = (v: number) => 20 + (1 - (v - lo) / (hi - lo)) * (H - 50);
  if (tgt) { g.strokeStyle = "rgba(212,255,63,.6)"; g.setLineDash([10, 8]); g.lineWidth = 3; g.beginPath(); g.moveTo(20, Y(tgt)); g.lineTo(W - 20, Y(tgt)); g.stroke(); g.setLineDash([]); }
  g.strokeStyle = "#3dff8a"; g.lineWidth = 5; g.beginPath();
  w.forEach((x, i) => (i ? g.lineTo(X(i), Y(x.kg)) : g.moveTo(X(i), Y(x.kg)))); g.stroke();
  g.fillStyle = "#fff"; g.font = "600 22px system-ui";
  w.forEach((x, i) => { g.beginPath(); g.arc(X(i), Y(x.kg), 6, 0, 7); g.fill(); });
  g.fillText(`${w[0].kg}`, X(0) - 10, H - 4);
  g.textAlign = "right"; g.fillText(`${w[w.length - 1].kg} kg`, W - 20, H - 4);
}

// ---------------- Vídeos ----------------
function videos() {
  return `
    <h1 class="title">Vídeos dos treinos</h1>
    <p class="muted">Cada treino gravado sai com o esqueleto, o contador e as correções na tela. Ficam só neste celular.</p>
    <div id="vids"><p class="muted">Carregando…</p></div>`;
}

async function loadVideos() {
  const box = document.getElementById("vids");
  if (!box) return;
  let list: Awaited<ReturnType<typeof recordings.all>> = [];
  try { list = await recordings.all(); } catch { /* sem IndexedDB */ }
  if (!list.length) { box.innerHTML = `<p class="muted">Nenhum vídeo ainda. Ligue "Gravar o treino" em Metas → Ajustes (já vem ligado) e treine.</p>`; return; }
  box.innerHTML = list.map((r) => `
    <div class="card vid">
      <video src="${URL.createObjectURL(r.blob)}" controls playsinline preload="metadata"></video>
      <div class="row between"><b>${esc(r.title)}</b><small class="muted">${Math.floor(r.secs / 60)}:${String(r.secs % 60).padStart(2, "0")} · ${(r.blob.size / 1e6).toFixed(1)} MB</small></div>
      <div class="row"><button class="btn" data-share="${r.id}">📤 Salvar / compartilhar</button><button class="btn ghost" data-vdel="${r.id}">🗑</button></div>
    </div>`).join("");
  box.querySelectorAll<HTMLButtonElement>("[data-share]").forEach((b) => b.addEventListener("click", () => {
    const r = list.find((x) => x.id === b.dataset.share)!;
    shareVideo(r.blob, r.title.split(" · ")[0]);
  }));
  box.querySelectorAll<HTMLButtonElement>("[data-vdel]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Apagar este vídeo?")) return;
    await recordings.del(b.dataset.vdel!);
    loadVideos();
  }));
}

// ---------------- eventos ----------------
function go(name: string, items: PlanItem[]) {
  startWorkout({ name, items, onClose: render });
}

app.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("button, [data-sel]");
  if (!el) return;
  const d = el.dataset;
  if (d.tab) { tab = d.tab as Tab; history.replaceState(null, "", `?aba=${tab}`); render(); scrollTo(0, 0); return; }
  if (d.go) {
    const plan = store.plan();
    if (d.go === "today") { const day = plan[new Date().getDay()]; if (day?.items.length) go(day.name, day.items); }
    else if (d.go.startsWith("day:")) { const day = plan[+d.go.slice(4)]; if (day?.items.length) go(day.name, day.items); }
    else if (d.go === "free") {
      const ex = (document.getElementById("f-ex") as HTMLSelectElement).value as ExId;
      const num = (id: string, def: number) => Math.max(1, +(document.getElementById(id) as HTMLInputElement).value || def);
      go(EXERCISES[ex].name, [{ ex, sets: num("f-sets", 3), reps: num("f-reps", 10), rest: Math.max(0, +(document.getElementById("f-rest") as HTMLInputElement).value || 0) }]);
    }
    return;
  }
  // treinos
  const plan = store.plan();
  if (d.day) { editDay = +d.day; render(); return; }
  if (d.add !== undefined) {
    const ex = (document.getElementById("add-ex") as HTMLSelectElement).value as ExId;
    plan[editDay]!.items.push({ ex, sets: 3, reps: EXERCISES[ex].timed ? 30 : 10, rest: 60 });
    store.setPlan(plan); render(); return;
  }
  if (d.rm) { plan[editDay]!.items.splice(+d.rm, 1); store.setPlan(plan); render(); return; }
  if (d.mv) {
    const [i, dir] = d.mv.split(":").map(Number);
    const items = plan[editDay]!.items;
    const j = i + dir;
    if (j >= 0 && j < items.length) { [items[i], items[j]] = [items[j], items[i]]; store.setPlan(plan); render(); }
    return;
  }
  if (d.preset) { if (confirm("Trocar a semana inteira por este modelo?")) { store.setPlan(structuredClone(PRESETS[d.preset])); render(); } return; }
  // agenda
  if (d.month) { agendaMonth = new Date(agendaMonth.getFullYear(), agendaMonth.getMonth() + +d.month, 1); render(); return; }
  if (d.sel) { selDay = d.sel; render(); return; }
  if (d.checkin !== undefined) {
    const p = plan[parseDay(selDay).getDay()];
    const name = prompt("Qual treino você fez?", p?.name ?? "Treino") ?? "";
    if (!name) return;
    const at = parseDay(selDay).getTime() + 12 * 3600e3;
    store.addSession({ id: uid(), date: selDay, started: at, ended: at + 45 * 60e3, name, exercises: [] });
    render(); return;
  }
  if (d.del) { if (confirm("Apagar este registro?")) { store.removeSession(d.del); render(); } return; }
  // metas
  if (d.weight !== undefined) {
    const kg = +(document.getElementById("w-kg") as HTMLInputElement).value;
    const tgt = +(document.getElementById("g-kg") as HTMLInputElement).value;
    if (kg) store.addWeight({ date: today(), kg });
    store.setGoals({ ...store.goals(), targetKg: tgt || undefined });
    render(); return;
  }
  if (d.prefs !== undefined) {
    const v = (id: string) => document.getElementById(id) as HTMLInputElement;
    store.setPrefs({ name: v("p-name").value.trim(), voice: v("p-voice").checked, record: v("p-record").checked, strictPullup: v("p-strict").checked, countdown: Math.max(3, +v("p-count").value || 5) });
    el.textContent = "✓ Salvo";
    return;
  }
});

app.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  const plan = store.plan();
  if (t.id === "d-on") {
    plan[editDay] = t.checked ? { name: "Treino", items: [] } : null;
    store.setPlan(plan); render(); return;
  }
  if (t.id === "d-name" && plan[editDay]) { plan[editDay]!.name = t.value.trim() || "Treino"; store.setPlan(plan); return; }
  if (t.dataset.f && plan[editDay]) {
    const [i, k] = t.dataset.f.split(":");
    const it = plan[editDay]!.items[+i] as unknown as Record<string, number | undefined>;
    it[k] = t.value === "" ? (k === "kg" ? undefined : 1) : +t.value;
    store.setPlan(plan); return;
  }
  if (t.id === "f-ex") {
    const timed = EXERCISES[t.value as ExId].timed;
    document.getElementById("f-unit")!.textContent = timed ? "Segundos" : "Repetições";
    (document.getElementById("f-reps") as HTMLInputElement).value = timed ? "30" : "10";
  }
  if (t.id === "g-week" || t.id === "g-reps") {
    store.setGoals({ ...store.goals(), perWeek: +(document.getElementById("g-week") as HTMLInputElement).value || 4, monthlyReps: +(document.getElementById("g-reps") as HTMLInputElement).value || 1500 });
    render();
  }
});

render();

// Tonhão animado nos cartões dos exercícios
function animate() {
  requestAnimationFrame(animate);
  const t = performance.now() / 1000;
  document.querySelectorAll<HTMLCanvasElement>("canvas.tz").forEach((c) => {
    const r = c.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const px = Math.round(r.width * Math.min(2, devicePixelRatio || 1));
    if (c.width !== px) { c.width = px; c.height = px; }
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, px, px);
    drawTonhao(g, c.dataset.ex as ExId, { time: t + (c.dataset.ex!.length % 3) * 0.3, x: 0, y: 0, size: px });
  });
}
requestAnimationFrame(animate);
