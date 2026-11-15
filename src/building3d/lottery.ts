// Sorteio de vagas do síndico (48 apartamentos, vagas do mapa; o sorteio é refeito a cada 3 meses).
// Tudo no navegador: gerador com semente (código do sorteio) a partir de números aleatórios do crypto,
// histórico salvo no aparelho do síndico e o resultado vai num link (?mapa=...) que abre a garagem 3D
// com o mapa novo. Só números de apartamento (sem nomes nem placas, LGPD).
import { APTO } from "./garage";

export const APTS = Array.from({ length: 6 }, (_, f) => Array.from({ length: 8 }, (_, u) => `${f + 1}0${u + 1}`)).flat();
/** vagas de carro do mapa (não existe a 14; a 01 é das motos) */
export const CAR_SPOTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];
const pad = (n: number) => String(n).padStart(2, "0");

export type Draw = { code: string; from: string; to: string; map: Record<number, string>; waiting: string[]; at: string; rules: string[] };
type AptState = "in" | "out" | "pcd";

const KEY = "b3_sorteios", STATE = "b3_aptos";
const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* sem armazenamento: segue só nesta tela */
    }
  },
};

/** Mapa do quadro de avisos (01/11/26 a 31/01/27). */
export const BOARD: Draw = { code: "quadro de avisos", from: "2026-11-01", to: "2027-01-31", map: { ...APTO }, waiting: [], at: "2026-11-01", rules: [] };
delete BOARD.map[1];

export const history = () => store.get<Draw[]>(KEY, []);
export const fmt = (d: string) => d.split("-").reverse().map((x, i) => (i === 2 ? x.slice(2) : x)).join("/");

function encode(d: Draw) {
  const q = new URLSearchParams();
  q.set("mapa", CAR_SPOTS.map((n) => d.map[n] ?? "000").join(""));
  if (d.waiting.length) q.set("espera", d.waiting.join(""));
  q.set("de", d.from);
  q.set("ate", d.to);
  q.set("cod", d.code);
  return q;
}
function decode(q: URLSearchParams): Draw | null {
  const m = q.get("mapa");
  if (!m || !/^\d{75}$/.test(m)) return null;
  const map: Record<number, string> = {};
  CAR_SPOTS.forEach((n, i) => {
    const a = m.slice(i * 3, i * 3 + 3);
    if (a !== "000") map[n] = a;
  });
  const w = q.get("espera") ?? "";
  const ok = (s: string | null) => (s && /^\d{4}-\d\d-\d\d$/.test(s) ? s : "");
  return { code: (q.get("cod") ?? "").slice(0, 20), from: ok(q.get("de")), to: ok(q.get("ate")), map, waiting: w.match(/\d{3}/g) ?? [], at: "", rules: [] };
}
export const linkFor = (d: Draw) => `${location.origin}${location.pathname}?${encode(d).toString()}`;

/** Mapa em uso: o do link, senão o último sorteio salvo marcado como em uso, senão o do quadro. */
export function currentDraw(): Draw {
  const fromUrl = decode(new URLSearchParams(location.search));
  if (fromUrl) return fromUrl;
  const used = store.get<string>("b3_em_uso", "");
  return history().find((d) => d.code === used) ?? BOARD;
}

// gerador com semente (xmur3 + sfc32): o mesmo código dá o mesmo sorteio
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  let a = next(), b = next(), c = next(), d = next();
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], r: () => number) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function newCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  const s = [...b].map((x) => abc[x % abc.length]).join("");
  return `SR-${s.slice(0, 4)}-${s.slice(4)}`;
}

function runDraw(opts: { code: string; from: string; to: string; states: Record<string, AptState>; pcdRule: boolean; priority: boolean; moto: boolean; prev: Draw }): Draw {
  const r = rng(opts.code);
  const spots = opts.moto ? [1, ...CAR_SPOTS] : [...CAR_SPOTS];
  const players = APTS.filter((a) => opts.states[a] !== "out");
  const map: Record<number, string> = {};
  const rules: string[] = [];
  let free = [...spots];
  let pool = [...players];
  if (opts.pcdRule) {
    const pcd = players.filter((a) => opts.states[a] === "pcd");
    if (pcd.length && free.includes(15)) {
      const win = shuffle(pcd, r)[0];
      map[15] = win;
      free = free.filter((n) => n !== 15);
      pool = pool.filter((a) => a !== win);
      rules.push("Vaga 15 (PcD) sorteada só entre apartamentos com morador PcD");
    }
  }
  let order: string[];
  if (opts.priority) {
    const had = new Set(Object.values(opts.prev.map));
    order = [...shuffle(pool.filter((a) => !had.has(a)), r), ...shuffle(pool.filter((a) => had.has(a)), r)];
    rules.push(`Prioridade para quem ficou sem vaga no período ${fmt(opts.prev.from)} a ${fmt(opts.prev.to)}`);
  } else order = shuffle(pool, r);
  const spotOrder = shuffle(free, r);
  spotOrder.forEach((n, i) => {
    if (order[i]) map[n] = order[i];
  });
  if (opts.moto) rules.push("Vaga 01 entrou no sorteio");
  return { code: opts.code, from: opts.from, to: opts.to, map, waiting: order.slice(spotOrder.length), at: new Date().toISOString(), rules };
}

function nextPeriod(prev: Draw) {
  const base = prev.to ? new Date(prev.to + "T12:00:00") : new Date();
  const start = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: iso(start), to: iso(end) };
}

export function shareText(d: Draw, link: string) {
  const rows = Object.keys(d.map).map(Number).sort((a, b) => a - b).map((n) => `Vaga ${pad(n)} → ${d.map[n]}`);
  return [
    "🅿️ *Sorteio de vagas · Residencial Serrano*",
    `Período: ${fmt(d.from)} a ${fmt(d.to)}`,
    d.code ? `Código do sorteio: ${d.code}` : "",
    "",
    ...rows,
    d.waiting.length ? `\nLista de espera: ${d.waiting.map((a, i) => `${i + 1}º ${a}`).join(", ")}` : "",
    `\nVer na garagem 3D: ${link}`,
  ].filter((l) => l !== "").join("\n");
}

/** Mapa no formato do quadro (para imprimir). */
function boardHtml(d: Draw) {
  const c = (n: number | string, extra = "") => {
    if (typeof n === "string") return `<td class="x">${n}</td>`;
    return `<td><b>${pad(n)}</b><span>${n === 1 && !d.map[1] ? "MOTOS" : d.map[n] ?? "—"}</span>${extra}</td>`;
  };
  return `<h2>MAPA DE VAGAS · ${fmt(d.from)} a ${fmt(d.to)}</h2>
  <table class="lt-board"><tr>${c("BICICLETÁRIO")}${[13, 12, 11, 10, 9, 8].map((n) => c(n)).join("")}${c("DEPÓSITO")}${c("ESCADA")}${[7, 6, 5, 4, 3, 2, 1].map((n) => c(n)).join("")}</tr>
  <tr class="aisle"><td colspan="16">corredor ← RAMPA</td></tr>
  <tr>${c(15, "<small>VAGA PCD</small>")}${[16, 17, 18, 19, 20, 21].map((n) => c(n)).join("")}${c("HALL")}${c("ELEVADOR")}${[22, 23, 24, 25, 26, 27].map((n) => c(n)).join("")}<td class="x"></td></tr></table>
  ${d.waiting.length ? `<p><b>Lista de espera:</b> ${d.waiting.map((a, i) => `${i + 1}º ${a}`).join(" · ")}</p>` : ""}
  <p class="lt-foot">Código do sorteio: ${d.code || "—"}${d.rules.length ? " · " + d.rules.join(" · ") : ""}</p>`;
}

/** Tela do sorteio dentro do Prédio 3D. `onUse` = mostrar esse mapa na garagem. */
export function renderLottery(el: HTMLElement, onUse: (d: Draw) => void) {
  const prev = history()[0] ?? BOARD;
  const per = nextPeriod(prev);
  const states = store.get<Record<string, AptState>>(STATE, {});
  let from = per.from, to = per.to, pcdRule = true, priority = false, moto = false;
  let result: Draw | null = null;
  let anim = 0;

  const draw = () => {
    const players = APTS.filter((a) => states[a] !== "out").length;
    const nSpots = CAR_SPOTS.length + (moto ? 1 : 0);
    const hist = history();
    el.innerHTML = `
    <div class="lt-wrap">
      <div class="lt-head"><div><small>Para o síndico</small><b>Sorteio de vagas</b></div><span>${APTS.length} aptos · ${nSpots} vagas</span></div>
      ${result ? resultHtml(result) : `
      <div class="lt-card">
        <div class="lt-t">1. Período do mapa</div>
        <div class="lt-dates"><label>De<input type="date" id="ltFrom" value="${from}"></label><label>Até<input type="date" id="ltTo" value="${to}"></label></div>
      </div>
      <div class="lt-card">
        <div class="lt-t">2. Quem participa <small>toque no apto: participa → sem carro → PcD</small></div>
        <div class="lt-grid">${APTS.map((a) => `<button data-a="${a}" class="s-${states[a] ?? "in"}">${a}${states[a] === "pcd" ? "<i>♿</i>" : ""}</button>`).join("")}</div>
        <p class="lt-note"><b>${players}</b> apartamentos concorrendo a <b>${nSpots}</b> vagas${players > nSpots ? ` · <b>${players - nSpots}</b> ficam na lista de espera` : ""}.</p>
      </div>
      <div class="lt-card">
        <div class="lt-t">3. Regras</div>
        <label class="lt-chk"><input type="checkbox" id="ltPcd" ${pcdRule ? "checked" : ""}> Vaga 15 (PcD) só entre aptos com morador PcD</label>
        <label class="lt-chk"><input type="checkbox" id="ltPrio" ${priority ? "checked" : ""}> Quem ficou sem vaga no último mapa (${fmt(prev.from)} a ${fmt(prev.to)}) entra primeiro</label>
        <label class="lt-chk"><input type="checkbox" id="ltMoto" ${moto ? "checked" : ""}> Vaga 01 também entra no sorteio (hoje é das motos)</label>
      </div>
      <button class="b3-big lt-go" id="ltGo">🎲 Sortear agora</button>
      <p class="lt-note">O sorteio usa um gerador aleatório do próprio aparelho e ganha um código; o resultado fica salvo aqui e vai num link para os moradores conferirem na garagem 3D.</p>
      ${hist.length ? `<div class="lt-card"><div class="lt-t">Sorteios anteriores</div>${hist.map((d, i) => `<button class="lt-hist" data-h="${i}"><b>${fmt(d.from)} a ${fmt(d.to)}</b><small>${d.code}</small></button>`).join("")}</div>` : ""}`}
    </div>`;
    if (result) return bindResult(result);
    el.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) => (b.onclick = () => {
      const a = b.dataset.a!;
      const s = states[a] ?? "in";
      states[a] = s === "in" ? "out" : s === "out" ? "pcd" : "in";
      store.set(STATE, states);
      draw();
    }));
    (el.querySelector("#ltFrom") as HTMLInputElement).onchange = (e) => (from = (e.target as HTMLInputElement).value);
    (el.querySelector("#ltTo") as HTMLInputElement).onchange = (e) => (to = (e.target as HTMLInputElement).value);
    (el.querySelector("#ltPcd") as HTMLInputElement).onchange = (e) => (pcdRule = (e.target as HTMLInputElement).checked);
    (el.querySelector("#ltPrio") as HTMLInputElement).onchange = (e) => (priority = (e.target as HTMLInputElement).checked);
    (el.querySelector("#ltMoto") as HTMLInputElement).onchange = (e) => {
      moto = (e.target as HTMLInputElement).checked;
      draw();
    };
    el.querySelectorAll<HTMLButtonElement>("[data-h]").forEach((b) => (b.onclick = () => {
      result = history()[Number(b.dataset.h)];
      draw();
    }));
    (el.querySelector("#ltGo") as HTMLButtonElement).onclick = () => {
      if (!from || !to || to < from) return alert("Confira o período (a data final vem depois da inicial).");
      const d = runDraw({ code: newCode(), from, to, states, pcdRule, priority, moto, prev });
      store.set(KEY, [d, ...history()].slice(0, 20));
      result = d;
      anim = performance.now();
      draw();
    };
  };

  const resultHtml = (d: Draw) => {
    const spots = Object.keys(d.map).map(Number).sort((a, b) => a - b);
    return `<div class="lt-card lt-res">
      <div class="lt-t">Resultado · ${fmt(d.from)} a ${fmt(d.to)}</div>
      <p class="lt-code">Código <b>${d.code}</b></p>
      <div class="lt-out">${spots.map((n, i) => `<div class="lt-cell" style="--i:${i}"><small>Vaga ${pad(n)}${n === 15 ? " ♿" : ""}</small><b data-final="${d.map[n]}">${d.map[n]}</b></div>`).join("")}</div>
      ${d.waiting.length ? `<p class="lt-wait"><b>Lista de espera</b> (se alguém liberar a vaga, chama nesta ordem): ${d.waiting.map((a, i) => `<span>${i + 1}º ${a}</span>`).join("")}</p>` : ""}
      ${d.rules.length ? `<p class="lt-note">${d.rules.join(" · ")}</p>` : ""}
    </div>
    <div class="lt-actions">
      <button class="b3-big" id="ltUse">🚗 Ver na garagem 3D</button>
      <button id="ltWa">📲 Mandar no WhatsApp</button>
      <button id="ltCopy">🔗 Copiar link</button>
      <button id="ltPrint">🖨️ Imprimir mapa</button>
      <button id="ltBack">↺ Novo sorteio</button>
    </div>
    <div class="lt-print" id="ltPrintArea">${boardHtml(d)}</div>`;
  };

  const bindResult = (d: Draw) => {
    const link = linkFor(d);
    // animação: os números giram e param um de cada vez
    const cells = [...el.querySelectorAll<HTMLElement>(".lt-cell b")];
    if (anim && performance.now() - anim < 500) {
      const t0 = performance.now();
      const tick = () => {
        const t = performance.now() - t0;
        let running = false;
        cells.forEach((c, i) => {
          if (t < 400 + i * 180) {
            running = true;
            c.textContent = APTS[Math.floor(Math.random() * APTS.length)];
            c.parentElement!.classList.add("spin");
          } else if (c.parentElement!.classList.contains("spin")) {
            c.textContent = c.dataset.final!;
            c.parentElement!.classList.remove("spin");
          }
        });
        if (running && el.isConnected) requestAnimationFrame(tick);
      };
      tick();
    }
    anim = 0;
    (el.querySelector("#ltUse") as HTMLButtonElement).onclick = () => {
      store.set("b3_em_uso", d.code);
      onUse(d);
    };
    (el.querySelector("#ltWa") as HTMLButtonElement).onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent(shareText(d, link))}`, "_blank");
    (el.querySelector("#ltCopy") as HTMLButtonElement).onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        (el.querySelector("#ltCopy") as HTMLButtonElement).textContent = "✓ Link copiado";
      } catch {
        prompt("Copie o link:", link);
      }
    };
    (el.querySelector("#ltPrint") as HTMLButtonElement).onclick = () => window.print();
    (el.querySelector("#ltBack") as HTMLButtonElement).onclick = () => {
      result = null;
      draw();
    };
  };
  draw();
}
