// Block Pop: jogo de encaixar blocos (mesma mecânica dos jogos de blocos mais baixados; visual, nome e sons próprios).
// Grade 8×8, 3 peças por vez; linha ou coluna cheia explode; acabou quando nenhuma peça cabe.
// Tudo desenhado em canvas, sem imagens; som sintetizado no navegador. Recorde, partida e missão do dia ficam no navegador.
import { t } from "../i18n3d";

type Cell = [number, number];
type Piece = { cells: Cell[]; w: number; h: number; color: number };
type Fx = { r: number; c: number; color: number; t0: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; t0: number; color: string; size: number };
type Float = { text: string; x: number; y: number; t0: number; size: number; color: string };

const N = 8;
// cor base, luz e sombra de cada bloco
const COLORS: [string, string, string][] = [
  ["#f0475a", "#ff8593", "#b8243a"],
  ["#ff9a2e", "#ffc072", "#c9670d"],
  ["#ffcf33", "#ffe58a", "#c99a0a"],
  ["#36c96f", "#7ee6a4", "#1f8f4c"],
  ["#2ec4e6", "#82e2f5", "#1b8aa6"],
  ["#4a7dff", "#8fb0ff", "#2c4fc4"],
  ["#a25cff", "#c99cff", "#6f33c9"],
];

// ------------------------------------------------------------------------------------------------ peças
const BASE = [
  "X", "XX", "XXX", "XXXX", "XXXXX", "XX/XX", "XXX/XXX/XXX", "XXX/XXX",
  "X./XX", "X../X../XXX", "X./X./XX", "XXX/.X.", ".XX/XX.", "X./XX/.X",
];
function parse(s: string): Cell[] {
  const out: Cell[] = [];
  s.split("/").forEach((row, r) => [...row].forEach((ch, c) => ch === "X" && out.push([r, c])));
  return out;
}
function norm(cells: Cell[]): Cell[] {
  const r0 = Math.min(...cells.map((x) => x[0])), c0 = Math.min(...cells.map((x) => x[1]));
  return cells.map(([r, c]) => [r - r0, c - c0] as Cell).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const rot = (cells: Cell[]) => norm(cells.map(([r, c]) => [c, -r] as Cell));
const SHAPES: Cell[][] = (() => {
  const seen = new Set<string>();
  const out: Cell[][] = [];
  for (const s of BASE) {
    let cells = norm(parse(s));
    for (let i = 0; i < 4; i++) {
      const key = JSON.stringify(cells);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(cells);
      }
      cells = rot(cells);
    }
  }
  return out;
})();
const makePiece = (cells: Cell[]): Piece => ({
  cells, w: Math.max(...cells.map((x) => x[1])) + 1, h: Math.max(...cells.map((x) => x[0])) + 1, color: Math.floor(Math.random() * COLORS.length),
});

// ------------------------------------------------------------------------------------------------ estado
let board = new Int8Array(N * N).fill(-1);
let tray: (Piece | null)[] = [null, null, null];
let score = 0, shown = 0, streak = 0, idle = 0, continued = false, placedEver = false;
let best = Number(load("blockpop-best") ?? 0);
let over = false, overAt = 0, adUntil = 0;
const fx: Fx[] = [];
const parts: Particle[] = [];
const floats: Float[] = [];
let shake = 0;
let drag: { i: number; x: number; y: number; row: number; col: number; ok: boolean } | null = null;
let trayIn = 0; // hora em que as peças novas entraram (animação)

const today = () => new Date().toISOString().slice(0, 10);
type Mission = { date: string; lines: number; done: boolean; days: number; last: string };
const GOAL = 20;
let mission: Mission = (() => {
  const m = JSON.parse(load("blockpop-mission") ?? "null") as Mission | null;
  if (m && m.date === today()) return m;
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return { date: today(), lines: 0, done: false, days: m && m.last === y ? m.days : 0, last: m?.last ?? "" };
})();

function load(k: string) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function save(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ }
}
const persist = () => {
  save("blockpop-state", JSON.stringify({ board: [...board], tray, score, streak, idle, continued }));
  save("blockpop-mission", JSON.stringify(mission));
};

// ------------------------------------------------------------------------------------------------ regras
const at = (b: Int8Array, r: number, c: number) => b[r * N + c];
function fits(b: Int8Array, p: Piece, r0: number, c0: number) {
  for (const [r, c] of p.cells) {
    const rr = r + r0, cc = c + c0;
    if (rr < 0 || cc < 0 || rr >= N || cc >= N || at(b, rr, cc) >= 0) return false;
  }
  return true;
}
function anyFit(b: Int8Array, p: Piece) {
  for (let r = 0; r <= N - p.h; r++) for (let c = 0; c <= N - p.w; c++) if (fits(b, p, r, c)) return [r, c] as Cell;
  return null;
}
/** Linhas e colunas que ficam cheias se a peça entrar em (r0, c0). */
function fullLines(b: Int8Array, p: Piece | null, r0 = 0, c0 = 0) {
  const tmp = b.slice();
  if (p) for (const [r, c] of p.cells) tmp[(r + r0) * N + c + c0] = p.color;
  const rows: number[] = [], cols: number[] = [];
  for (let i = 0; i < N; i++) {
    let rf = true, cf = true;
    for (let j = 0; j < N; j++) {
      if (tmp[i * N + j] < 0) rf = false;
      if (tmp[j * N + i] < 0) cf = false;
    }
    if (rf) rows.push(i);
    if (cf) cols.push(i);
  }
  return { rows, cols, tmp };
}
function applyClear(b: Int8Array, rows: number[], cols: number[]) {
  for (const r of rows) for (let c = 0; c < N; c++) b[r * N + c] = -1;
  for (const c of cols) for (let r = 0; r < N; r++) b[r * N + c] = -1;
}

/** Simula: dá para colocar as 3 peças em alguma ordem? (jogada gulosa que prefere limpar linha) */
function solvable(b: Int8Array, set: Piece[]) {
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  return orders.some((o) => {
    let cur = b.slice();
    for (const i of o) {
      const p = set[i];
      let bestPos: Cell | null = null, bestLines = -1;
      for (let r = 0; r <= N - p.h; r++) for (let c = 0; c <= N - p.w; c++) {
        if (!fits(cur, p, r, c)) continue;
        const { rows, cols } = fullLines(cur, p, r, c);
        if (rows.length + cols.length > bestLines) [bestLines, bestPos] = [rows.length + cols.length, [r, c]];
      }
      if (!bestPos) return false;
      const { rows, cols, tmp } = fullLines(cur, p, bestPos[0], bestPos[1]);
      applyClear(tmp, rows, cols);
      cur = tmp;
    }
    return true;
  });
}

/** Peças novas: quase sempre dá para usar as 3 (a pessoa perde achando que errou, não por azar), mais difíceis com o placar. */
function newTray() {
  const filled = board.filter((x) => x >= 0).length / (N * N);
  const hard = Math.min(1, score / 4000);
  const weight = (s: Cell[]) => {
    const n = s.length;
    if (n <= 2) return 0.6 + filled * 1.5;
    if (n >= 9) return 0.25 + hard * 0.5 - filled * 0.4;
    if (n >= 6) return 0.6 + hard * 0.6 - filled * 0.6;
    return 1;
  };
  const pick = () => {
    const ws = SHAPES.map((s) => Math.max(0.05, weight(s)));
    let x = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < SHAPES.length; i++) if ((x -= ws[i]) <= 0) return makePiece(SHAPES[i]);
    return makePiece(SHAPES[0]);
  };
  // Às vezes uma das peças fecha uma linha (sensação de "veio a peça certa")
  const helper = () => {
    const opts: Cell[][] = SHAPES.filter((s) => {
      const p = makePiece(s);
      for (let r = 0; r <= N - p.h; r++) for (let c = 0; c <= N - p.w; c++) {
        if (!fits(board, p, r, c)) continue;
        const { rows, cols } = fullLines(board, p, r, c);
        if (rows.length + cols.length) return true;
      }
      return false;
    });
    return opts.length ? makePiece(opts[Math.floor(Math.random() * opts.length)]) : pick();
  };
  let set: Piece[] = [];
  for (let a = 0; a < 40; a++) {
    set = [Math.random() < 0.4 ? helper() : pick(), pick(), pick()];
    if (solvable(board, set)) break;
    if (a === 39) set = [makePiece([[0, 0]]), makePiece(parse("XX")), makePiece([[0, 0]])];
  }
  // cores diferentes nas 3
  const used = new Set<number>();
  for (const p of set) {
    while (used.has(p.color)) p.color = (p.color + 1) % COLORS.length;
    used.add(p.color);
  }
  tray = set;
  trayIn = now();
}

function checkOver() {
  const left = tray.filter((p): p is Piece => !!p);
  if (left.length && !left.some((p) => anyFit(board, p))) {
    over = true;
    overAt = now();
    sfx("over");
    if (score > best) {
      best = score;
      save("blockpop-best", String(best));
    }
  }
}

function place(i: number, r0: number, c0: number) {
  const p = tray[i]!;
  for (const [r, c] of p.cells) board[(r + r0) * N + c + c0] = p.color;
  tray[i] = null;
  placedEver = true;
  score += p.cells.length;
  const { rows, cols } = fullLines(board, null);
  const lines = rows.length + cols.length;
  const cx = L.bx + (c0 + p.w / 2) * L.c, cy = L.by + (r0 + p.h / 2) * L.c;
  if (lines) {
    streak++;
    idle = 0;
    const tm = now();
    const seen = new Set<number>();
    for (const r of rows) for (let c = 0; c < N; c++) seen.add(r * N + c);
    for (const c of cols) for (let r = 0; r < N; r++) seen.add(r * N + c);
    for (const k of seen) {
      const r = Math.floor(k / N), c = k % N;
      // efeito em onda a partir de onde a peça entrou
      fx.push({ r, c, color: board[k], t0: tm + (Math.abs(r - r0) + Math.abs(c - c0)) * 18 });
    }
    applyClear(board, rows, cols);
    const base = [0, 10, 30, 60, 100, 150, 210][Math.min(lines, 6)];
    const pts = Math.round(base * (1 + (streak - 1) * 0.5));
    score += pts;
    const clean = board.every((x) => x < 0);
    if (clean) score += 300;
    floats.push({ text: `+${pts}`, x: cx, y: cy, t0: tm, size: L.c * 0.7, color: "#fff" });
    const praise = [t("Bom!", "Good!", "¡Bien!"), t("Ótimo!", "Great!", "¡Genial!"), t("Incrível!", "Amazing!", "¡Increíble!"),
      t("Fantástico!", "Fantastic!", "¡Fantástico!"), t("Lendário!", "Legendary!", "¡Legendario!")];
    const lvl = lines + streak - 2;
    if (clean) floats.push({ text: t("Tabuleiro limpo! +300", "Board clear! +300", "¡Tablero limpio! +300"), x: L.W / 2, y: L.by + L.c * 4, t0: tm + 150, size: L.c * 0.62, color: "#ffd23f" });
    else if (lvl >= 0) floats.push({ text: praise[Math.min(lvl, 4)], x: L.W / 2, y: L.by + L.c * 3.6, t0: tm + 120, size: L.c * (0.8 + Math.min(lvl, 4) * 0.08), color: COLORS[p.color][1] });
    if (streak >= 2) floats.push({ text: `Combo ${streak}`, x: L.W / 2, y: L.by + L.c * 4.6, t0: tm + 220, size: L.c * 0.5, color: "#fff" });
    shake = Math.min(14, 4 + lines * 3 + streak);
    sfx("clear", lines + streak);
    vibrate(lines > 1 ? [20, 30, 40] : 25);
    // missão do dia
    if (!mission.done) {
      mission.lines += lines;
      if (mission.lines >= GOAL) {
        mission.done = true;
        mission.days = mission.last === today() ? mission.days : mission.days + 1;
        mission.last = today();
        floats.push({ text: t("Missão do dia cumprida! 🔥", "Daily mission done! 🔥", "¡Misión del día cumplida! 🔥"), x: L.W / 2, y: L.by + L.c * 5.6, t0: tm + 400, size: L.c * 0.48, color: "#7ee6a4" });
        confetti();
      }
    }
  } else {
    idle++;
    if (idle >= 3) streak = 0; // combo aguenta 2 jogadas sem limpar
    sfx("place");
    vibrate(10);
  }
  if (tray.every((x) => !x)) newTray();
  checkOver();
  persist();
}

function restart() {
  board = new Int8Array(N * N).fill(-1);
  score = 0;
  shown = 0;
  streak = 0;
  idle = 0;
  continued = false;
  over = false;
  fx.length = 0;
  floats.length = 0;
  newTray();
  persist();
}

/** "Continuar": aqui entra o vídeo de anúncio (SDK do CrazyGames). Abre espaço no meio e dá peças pequenas. */
function continueGame() {
  continued = true;
  adUntil = now() + 2200;
  setTimeout(() => {
    const tm = now();
    for (let r = 2; r < 6; r++) for (let c = 0; c < N; c++) {
      if (board[r * N + c] >= 0) fx.push({ r, c, color: board[r * N + c], t0: tm + c * 25 });
      board[r * N + c] = -1;
    }
    over = false;
    newTray();
    sfx("clear", 3);
    persist();
  }, 2200);
}

// ------------------------------------------------------------------------------------------------ layout e desenho
const cv = document.getElementById("game") as HTMLCanvasElement;
const ctx = cv.getContext("2d")!;
const L = { W: 0, H: 0, dpr: 1, c: 40, bx: 0, by: 0, ty: 0, tc: 20 };
function layout() {
  L.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  L.W = window.innerWidth;
  L.H = window.innerHeight;
  cv.width = Math.round(L.W * L.dpr);
  cv.height = Math.round(L.H * L.dpr);
  const top = Math.max(118, L.H * 0.17);
  L.c = Math.floor(Math.min((L.W - 28) / N, (L.H - top - 70) / 11.2, 64));
  L.bx = Math.round((L.W - L.c * N) / 2);
  L.by = Math.round(top);
  // bandeja no meio do espaço que sobra embaixo da grade, peças maiores quando cabe
  const below = L.H - (L.by + L.c * N + 8) - 20;
  L.tc = Math.round(Math.min(L.c * 0.62, below / 5.5, (L.W / 3 - 16) / 5));
  L.ty = L.by + L.c * N + 8 + below / 2;
  sprites.clear();
}
const now = () => performance.now();

const sprites = new Map<string, HTMLCanvasElement>();
/** Bloco com relevo (gradiente, brilho no alto e sombra embaixo), guardado pronto para cada cor e tamanho. */
function sprite(color: number, s: number) {
  const key = `${color}:${s}`;
  let sp = sprites.get(key);
  if (sp) return sp;
  sp = document.createElement("canvas");
  const px = Math.ceil(s * L.dpr);
  sp.width = sp.height = px;
  const g = sp.getContext("2d")!;
  g.scale(L.dpr, L.dpr);
  const [base, light, dark] = COLORS[color];
  const pad = Math.max(1, s * 0.04), rad = s * 0.16;
  rr(g, pad, pad, s - pad * 2, s - pad * 2, rad);
  g.fillStyle = dark;
  g.fill();
  const inner = s * 0.1;
  const gr = g.createLinearGradient(0, pad, 0, s - pad);
  gr.addColorStop(0, light);
  gr.addColorStop(0.45, base);
  gr.addColorStop(1, base);
  rr(g, pad + inner * 0.5, pad + inner * 0.35, s - pad * 2 - inner, s - pad * 2 - inner * 1.1, rad * 0.8);
  g.fillStyle = gr;
  g.fill();
  g.globalAlpha = 0.45;
  rr(g, pad + inner, pad + inner * 0.6, s - pad * 2 - inner * 2, s * 0.16, s * 0.08);
  g.fillStyle = "#fff";
  g.fill();
  sprites.set(key, sp);
  return sp;
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
const block = (color: number, x: number, y: number, s: number, alpha = 1) => {
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite(color, s), x, y, s, s);
  ctx.globalAlpha = 1;
};
const font = (size: number, w = 700) => `${w} ${Math.round(size)}px Fredoka, system-ui, sans-serif`;
function text(s: string, x: number, y: number, size: number, color = "#fff", align: CanvasTextAlign = "center", w = 700) {
  ctx.font = font(size, w);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const back = (x: number) => { const c1 = 1.7, c3 = c1 + 1; x = Math.min(1, Math.max(0, x)); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

/** Onde fica a peça arrastada: acima do dedo (para o dedo não cobrir) e a casa da grade mais próxima. */
function dragPos(p: Piece, x: number, y: number) {
  const px = x - (p.w * L.c) / 2, py = y - L.c * 1.1 - p.h * L.c;
  return { px, py, col: Math.round((px - L.bx) / L.c), row: Math.round((py - L.by) / L.c) };
}
const slotX = (i: number) => (L.W * (1 + i * 2)) / 6;

let sound = load("blockpop-sound") !== "off";
const soundBtn = () => ({ x: L.W - 52, y: 20, w: 36, h: 36 });
const overButtons = () => {
  const w = Math.min(300, L.W - 60), x = (L.W - w) / 2, y = L.H / 2 + 40;
  return { cont: { x, y, w, h: 56 }, again: { x, y: y + (continued ? 0 : 70), w, h: 56 } };
};

function draw() {
  const tm = now();
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  // fundo
  const bg = ctx.createLinearGradient(0, 0, 0, L.H);
  bg.addColorStop(0, "#232c57");
  bg.addColorStop(1, "#141a35");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, L.W, L.H);

  shown += (score - shown) * 0.18;
  if (Math.abs(score - shown) < 0.5) shown = score;
  // topo: recorde, placar, som e missão
  text(`👑 ${best.toLocaleString()}`, 18, 38, 20, "#ffd23f", "left", 600);
  const sb = soundBtn();
  text(sound ? "🔊" : "🔇", sb.x + sb.w / 2, sb.y + sb.h / 2, 22);
  const pulse = 1 + Math.max(0, 1 - (tm - lastScoreBump) / 250) * 0.12;
  text(Math.round(shown).toLocaleString(), L.W / 2, L.by * 0.42, Math.min(56, L.by * 0.36) * pulse);
  const chipY = L.by * 0.78;
  const mtxt = mission.done
    ? t(`🔥 Missão cumprida · ${mission.days} dia(s) seguidos`, `🔥 Mission done · ${mission.days} day streak`, `🔥 Misión cumplida · ${mission.days} día(s) seguidos`)
    : t(`🎯 Missão de hoje: ${Math.min(mission.lines, GOAL)}/${GOAL} linhas`, `🎯 Today: clear ${Math.min(mission.lines, GOAL)}/${GOAL} lines`, `🎯 Misión de hoy: ${Math.min(mission.lines, GOAL)}/${GOAL} líneas`);
  ctx.font = font(14, 600);
  const mw = ctx.measureText(mtxt).width + 28;
  rr(ctx, (L.W - mw) / 2, chipY - 15, mw, 30, 15);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  if (!mission.done && mission.lines > 0) {
    rr(ctx, (L.W - mw) / 2, chipY - 15, Math.max(30, mw * Math.min(1, mission.lines / GOAL)), 30, 15);
    ctx.fillStyle = "rgba(126,230,164,0.22)";
    ctx.fill();
  }
  text(mtxt, L.W / 2, chipY + 1, 14, "#e6ebff", "center", 600);

  // tremida da tela nos combos
  const sx = shake > 0.3 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
  shake *= 0.86;
  ctx.save();
  ctx.translate(sx, sy);

  // grade
  const B = L.c * N;
  rr(ctx, L.bx - 8, L.by - 8, B + 16, B + 16, 16);
  ctx.fillStyle = "#10152d";
  ctx.fill();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    rr(ctx, L.bx + c * L.c + 2, L.by + r * L.c + 2, L.c - 4, L.c - 4, L.c * 0.14);
    ctx.fillStyle = (r + c) % 2 ? "#1c2448" : "#1f284f";
    ctx.fill();
  }

  // prévia da jogada: onde entra e quais linhas vão explodir
  let hl: Set<number> | null = null, hlColor = 0;
  if (drag && drag.ok) {
    const p = tray[drag.i]!;
    const { rows, cols } = fullLines(board, p, drag.row, drag.col);
    hl = new Set();
    for (const r of rows) for (let c = 0; c < N; c++) hl.add(r * N + c);
    for (const c of cols) for (let r = 0; r < N; r++) hl.add(r * N + c);
    hlColor = p.color;
  }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const v = board[r * N + c];
    const k = r * N + c;
    if (v >= 0) block(hl?.has(k) ? hlColor : v, L.bx + c * L.c, L.by + r * L.c, L.c);
  }
  if (drag && drag.ok) {
    const p = tray[drag.i]!;
    for (const [r, c] of p.cells) block(p.color, L.bx + (c + drag.col) * L.c, L.by + (r + drag.row) * L.c, L.c, 0.38);
    if (hl) {
      ctx.globalAlpha = 0.25 + Math.sin(tm / 90) * 0.12;
      for (const k of hl) {
        rr(ctx, L.bx + (k % N) * L.c + 2, L.by + Math.floor(k / N) * L.c + 2, L.c - 4, L.c - 4, L.c * 0.14);
        ctx.fillStyle = "#fff";
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  // blocos explodindo
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    const k = (tm - f.t0) / 320;
    if (k < 0) {
      block(f.color, L.bx + f.c * L.c, L.by + f.r * L.c, L.c);
      continue;
    }
    if (k >= 1) {
      fx.splice(i, 1);
      continue;
    }
    if (k < 0.08 && !(f as Fx & { burst?: boolean }).burst) {
      (f as Fx & { burst?: boolean }).burst = true;
      burst(L.bx + (f.c + 0.5) * L.c, L.by + (f.r + 0.5) * L.c, COLORS[f.color][0], 4);
    }
    const s = L.c * (1 - ease(k)) * (1 + Math.sin(k * Math.PI) * 0.25);
    block(f.color, L.bx + (f.c + 0.5) * L.c - s / 2, L.by + (f.r + 0.5) * L.c - s / 2, s, 1 - k);
  }
  ctx.restore();

  // bandeja com as 3 peças
  for (let i = 0; i < 3; i++) {
    const p = tray[i];
    if (!p || drag?.i === i) continue;
    const k = back((tm - trayIn - i * 70) / 380);
    const fitsNow = !!anyFit(board, p);
    const s = L.tc;
    const x0 = slotX(i) - (p.w * s) / 2 + (1 - k) * L.W * 0.6, y0 = L.ty - (p.h * s) / 2;
    for (const [r, c] of p.cells) block(fitsNow ? p.color : 0, x0 + c * s, y0 + r * s, s, fitsNow ? 1 : 0.25);
    if (!fitsNow) {
      // peça que não cabe fica apagada
      for (const [r, c] of p.cells) {
        rr(ctx, x0 + c * s + 1, y0 + r * s + 1, s - 2, s - 2, s * 0.16);
        ctx.fillStyle = "rgba(90,100,140,0.55)";
        ctx.fill();
      }
    }
  }
  // peça arrastada (tamanho da grade, acima do dedo)
  if (drag) {
    const p = tray[drag.i]!;
    const { px, py } = dragPos(p, drag.x, drag.y);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    for (const [r, c] of p.cells) block(p.color, px + c * L.c, py + r * L.c, L.c);
    ctx.restore();
  }

  // partículas e textos
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    const k = (tm - q.t0) / q.life;
    if (k >= 1) {
      parts.splice(i, 1);
      continue;
    }
    q.x += q.vx;
    q.y += q.vy;
    q.vy += 0.35;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    const k = (tm - f.t0) / 1100;
    if (k < 0) continue;
    if (k >= 1) {
      floats.splice(i, 1);
      continue;
    }
    const sc = back(k * 3.5);
    ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
    ctx.save();
    ctx.translate(f.x, f.y - k * 40);
    ctx.scale(sc, sc);
    ctx.lineWidth = Math.max(3, f.size * 0.14);
    ctx.strokeStyle = "rgba(10,14,35,0.85)";
    ctx.font = font(f.size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // dica no começo: mão mostrando o arraste
  if (!placedEver && !drag && tray[1]) {
    const k = ((tm / 1600) % 1);
    const hx = slotX(1), hy = L.ty + 10 - ease(k) * (L.ty - L.by - L.c * 4);
    ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    text("👆", hx, hy, 38);
    ctx.globalAlpha = 1;
    text(t("Arraste as peças para a grade", "Drag the pieces onto the grid", "Arrastra las piezas a la cuadrícula"), L.W / 2, L.H - 26, 15, "#aab4e8", "center", 600);
  }

  // fim de jogo
  if (over && tm - overAt > 700) {
    const k = ease((tm - overAt - 700) / 400);
    ctx.fillStyle = `rgba(10,13,30,${0.82 * k})`;
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.globalAlpha = k;
    text(t("Sem espaço!", "Out of space!", "¡Sin espacio!"), L.W / 2, L.H / 2 - 120, 40);
    text(score.toLocaleString(), L.W / 2, L.H / 2 - 62, 56, "#ffd23f");
    text(score >= best && score > 0 ? t("Novo recorde! 👑", "New best! 👑", "¡Nuevo récord! 👑") : `👑 ${best.toLocaleString()}`, L.W / 2, L.H / 2 - 18, 18, "#e6ebff", "center", 600);
    const b = overButtons();
    if (!continued) button(b.cont, t("▶  Continuar (ver vídeo)", "▶  Continue (watch video)", "▶  Continuar (ver video)"), "#36c96f");
    button(b.again, t("Jogar de novo", "Play again", "Jugar de nuevo"), "#4a7dff");
    ctx.globalAlpha = 1;
  }
  // tela do anúncio (por enquanto simulada; no CrazyGames entra o vídeo de verdade)
  if (tm < adUntil) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, L.W, L.H);
    text(t("Anúncio", "Ad", "Anuncio"), L.W / 2, L.H / 2 - 20, 26);
    text(t("(aqui entra o vídeo do anúncio)", "(the video ad plays here)", "(aquí va el video del anuncio)"), L.W / 2, L.H / 2 + 16, 15, "#9aa3c7", "center", 500);
    text(String(Math.ceil((adUntil - tm) / 1000)), L.W / 2, L.H / 2 + 60, 30, "#ffd23f");
  }
  requestAnimationFrame(draw);
}
let lastScoreBump = 0;
let lastScore = 0;
setInterval(() => {
  if (score !== lastScore) {
    lastScore = score;
    lastScoreBump = now();
  }
}, 50);

function button(b: { x: number; y: number; w: number; h: number }, label: string, color: string) {
  rr(ctx, b.x, b.y + 4, b.w, b.h, b.h / 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  rr(ctx, b.x, b.y, b.w, b.h, b.h / 2);
  ctx.fillStyle = color;
  ctx.fill();
  text(label, b.x + b.w / 2, b.y + b.h / 2 + 1, 20);
}
const inside = (x: number, y: number, b: { x: number; y: number; w: number; h: number }) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

function burst(x: number, y: number, color: string, n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 500 + Math.random() * 400, t0: now(), color, size: 3 + Math.random() * 5 });
  }
}
function confetti() {
  for (let i = 0; i < 90; i++) {
    const c = COLORS[i % COLORS.length][0];
    parts.push({ x: Math.random() * L.W, y: -10 - Math.random() * 80, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, life: 1800 + Math.random() * 900, t0: now() + i * 6, color: c, size: 5 + Math.random() * 5 });
  }
}

// ------------------------------------------------------------------------------------------------ som (sintetizado)
let ac: AudioContext | null = null;
function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 0) {
  if (!ac || !sound) return;
  const o = ac.createOscillator(), g = ac.createGain();
  const t0 = ac.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
function sfx(kind: "pick" | "place" | "clear" | "over", level = 1) {
  if (kind === "pick") tone(660, 0.06, "triangle", 0.12);
  if (kind === "place") {
    tone(180, 0.12, "sine", 0.35, 0, 0.6);
    tone(420, 0.05, "triangle", 0.1);
  }
  if (kind === "clear") {
    // acorde subindo: quanto maior o combo, mais notas e mais agudo
    const root = 523 * Math.pow(2, Math.min(level - 1, 6) / 12);
    [1, 1.26, 1.5, 2, 2.52].slice(0, Math.min(5, 2 + level)).forEach((m, i) => tone(root * m, 0.28, "triangle", 0.16, i * 0.055));
    tone(90, 0.25, "sine", 0.4, 0, 0.5);
  }
  if (kind === "over") [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "triangle", 0.15, i * 0.14));
}
function vibrate(p: number | number[]) {
  try { if (sound) navigator.vibrate?.(p); } catch { /* sem vibração */ }
}

// ------------------------------------------------------------------------------------------------ toque / mouse
cv.addEventListener("pointerdown", (e) => {
  if (!ac) {
    try { ac = new AudioContext(); } catch { /* sem áudio */ }
  }
  ac?.resume();
  const x = e.clientX, y = e.clientY;
  if (inside(x, y, soundBtn())) {
    sound = !sound;
    save("blockpop-sound", sound ? "on" : "off");
    return;
  }
  if (now() < adUntil) return;
  if (over) {
    if (now() - overAt < 900) return;
    const b = overButtons();
    if (!continued && inside(x, y, b.cont)) continueGame();
    else if (inside(x, y, b.again)) restart();
    return;
  }
  if (y < L.by + L.c * N + 8) return;
  const i = Math.min(2, Math.max(0, Math.floor(x / (L.W / 3))));
  if (!tray[i]) return;
  drag = { i, x, y, row: -9, col: -9, ok: false };
  cv.setPointerCapture(e.pointerId);
  sfx("pick");
  move(x, y);
});
function move(x: number, y: number) {
  if (!drag) return;
  drag.x = x;
  drag.y = y;
  const p = tray[drag.i]!;
  const { row, col } = dragPos(p, x, y);
  drag.row = row;
  drag.col = col;
  drag.ok = fits(board, p, row, col);
}
cv.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
const end = () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.ok) place(d.i, d.row, d.col);
};
cv.addEventListener("pointerup", end);
cv.addEventListener("pointercancel", () => (drag = null));
window.addEventListener("resize", layout);

// ------------------------------------------------------------------------------------------------ início
layout();
try {
  const s = JSON.parse(load("blockpop-state") ?? "null");
  if (s && Array.isArray(s.board) && s.board.length === N * N) {
    board = Int8Array.from(s.board);
    tray = s.tray;
    score = shown = lastScore = s.score ?? 0;
    streak = s.streak ?? 0;
    idle = s.idle ?? 0;
    continued = !!s.continued;
    placedEver = score > 0;
    if (tray.every((x) => !x)) newTray();
    checkOver();
    if (over) overAt = now() - 700;
  } else newTray();
} catch {
  newTray();
}
document.fonts?.ready.then(() => sprites.clear());
requestAnimationFrame(draw);
