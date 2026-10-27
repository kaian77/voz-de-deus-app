// Castle Rescue: estoura grupos de blocos iguais para abrir caminho; pedras e água caem com física de verdade
// (areia/água em grade fina) até o dragão ou o fogo. Cada toque gasta uma jogada e os espinhos chegam perto do rei.
// Tudo em canvas, sem imagens; som sintetizado. Fase e progresso ficam no navegador.
import { t } from "../i18n3d";
import { ART, ready } from "./art";
import { LEVELS, type Level } from "./levels";

const TILE = 30; // tamanho do bloco (unidades lógicas)
const SUB = 10; // grãos por bloco em cada direção
const FINE = TILE / SUB;
const COLORS = 4;
// ícone de cada cor: coroa, folha, rubi, gota
const TILE_COL = ["#ffc62e", "#3cc35c", "#e8384b", "#3b8cff"];

type Tile = { color: number; rocket?: "h" | "v"; pop?: number };
type Part = { x: number; y: number; vx: number; vy: number; life: number; t0: number; color: string; size: number };
type Float = { text: string; x: number; y: number; t0: number; color: string; size: number };

// ------------------------------------------------------------------------------------------------ estado da fase
let lvlIndex = Number(load("rescue-level") ?? 0) || 0;
let L!: Level;
let cols = 12, rows = 16;
let tiles: (Tile | null)[] = [];
let wall: Uint8Array; // 1 = parede/quarto do rei (grade grossa)
let goal: Uint8Array; // 1 = onde o dragão/fogo está
let king = { x: 0, y: 0, w: 0, h: 0 };
// física (grade fina)
let FW = 0, FH = 0;
let grid: Uint8Array; // 0 vazio, 1 pedra, 2 água
let shade: Uint8Array;
let solid: Uint8Array;
let stamp: Uint32Array;
let frame = 0;
let total = 0, need = 0, got = 0;
let moves = 0, movesMax = 0, continued = false;
let state: "play" | "won" | "lost" = "play";
let endAt = 0, still = 0, lastHit = 0, hitFlash = 0;
let lastTap = performance.now();
// fala do rei (balão) e reação quando é tocado
let speech = { text: "", t0: 0, dur: 0 };
let poked = 0;
const say = (text: string, dur = 2200) => (speech = { text, t0: performance.now(), dur });
let roarAt = 0;
const parts: Part[] = [];
const floats: Float[] = [];
const pops: { x: number; y: number; color: number; t0: number }[] = [];
const sweeps: { r: number; c: number; dir: "h" | "v"; t0: number }[] = [];

function load(k: string) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function save(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ }
}

/** Gerador com semente: a mesma fase sai sempre com as mesmas cores. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function startLevel(i: number) {
  lvlIndex = i;
  save("rescue-level", String(i));
  const base = LEVELS[i % LEVELS.length];
  const loop = Math.floor(i / LEVELS.length);
  L = { ...base, moves: Math.max(4, base.moves - loop), need: Math.min(0.97, base.need + loop * 0.02) };
  rows = L.map.length;
  cols = L.map[0].length;
  tiles = Array(rows * cols).fill(null);
  wall = new Uint8Array(rows * cols);
  goal = new Uint8Array(rows * cols);
  FW = cols * SUB;
  FH = rows * SUB;
  grid = new Uint8Array(FW * FH);
  shade = new Uint8Array(FW * FH);
  solid = new Uint8Array(FW * FH);
  stamp = new Uint32Array(FW * FH);
  const rand = rng(1000 + i * 7919);
  let kx0 = 99, ky0 = 99, kx1 = -1, ky1 = -1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = L.map[r][c];
    const k = r * cols + c;
    if (ch === "#" || ch === "K") wall[k] = 1;
    if (ch === "K") [kx0, ky0, kx1, ky1] = [Math.min(kx0, c), Math.min(ky0, r), Math.max(kx1, c), Math.max(ky1, r)];
    if (ch === "G") goal[k] = 1;
    if (ch === "R") {
      // cores em manchas (vizinho de cima/esquerda repete às vezes): dá grupos bons para estourar
      const left = c > 0 ? tiles[k - 1] : null, up = r > 0 ? tiles[k - cols] : null;
      const x = rand();
      const color = left && x < 0.3 ? left.color : up && x < 0.55 ? up.color : Math.floor(rand() * COLORS);
      tiles[k] = { color };
    }
    if (ch === "s" || ch === "w") {
      for (let y = 0; y < SUB; y++) for (let x = 0; x < SUB; x++) {
        const f = (r * SUB + y) * FW + c * SUB + x;
        grid[f] = ch === "s" ? 1 : 2;
        shade[f] = Math.floor(rand() * 4);
      }
    }
  }
  king = { x: kx0 * TILE, y: ky0 * TILE, w: (kx1 - kx0 + 1) * TILE, h: (ky1 - ky0 + 1) * TILE };
  rebuildSolid();
  total = grid.reduce((a, v) => a + (v ? 1 : 0), 0);
  need = Math.round(total * L.need);
  got = 0;
  moves = movesMax = L.moves;
  continued = false;
  state = "play";
  still = 0;
  parts.length = 0;
  floats.length = 0;
  pops.length = 0;
  sweeps.length = 0;
  lastTap = performance.now();
  roarAt = performance.now() + 4000;
  say(L.kind === "water"
    ? t("Socorro! Apaga o fogo com a água!", "Help! Put out the fire with water!", "¡Auxilio! ¡Apaga el fuego con agua!")
    : t("Socorro! Joga as pedras no dragão!", "Help! Drop the rocks on the dragon!", "¡Auxilio! ¡Tira las rocas al dragón!"), 3200);
  layout();
}

function rebuildSolid() {
  solid.fill(0);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = r * cols + c;
    if (!wall[k] && !tiles[k]) continue;
    for (let y = 0; y < SUB; y++) solid.fill(1, (r * SUB + y) * FW + c * SUB, (r * SUB + y) * FW + c * SUB + SUB);
  }
}
function clearSolid(r: number, c: number) {
  for (let y = 0; y < SUB; y++) solid.fill(0, (r * SUB + y) * FW + c * SUB, (r * SUB + y) * FW + c * SUB + SUB);
}

// ------------------------------------------------------------------------------------------------ física
const isGoalFine = (f: number) => goal[Math.floor(Math.floor(f / FW) / SUB) * cols + Math.floor((f % FW) / SUB)] === 1;
function moveTo(from: number, to: number) {
  if (isGoalFine(to)) {
    // chegou no dragão / fogo: o grão some e conta
    grid[from] = 0;
    got++;
    if (performance.now() - lastHit > 90) {
      lastHit = performance.now();
      hitFlash = 1;
      const x = (to % FW) * FINE, y = Math.floor(to / FW) * FINE;
      burst(x, y, L.kind === "water" ? "#cfe9ff" : "#9aa0ad", 3, L.kind === "water" ? -3 : -1.5);
      sfx(L.kind === "water" ? "hiss" : "thud");
      if (performance.now() - speech.t0 > 4000 && Math.random() < 0.08) {
        const lines = L.kind === "water"
          ? [t("Isso, apaga!", "Yes, put it out!", "¡Eso, apágalo!"), t("Mais água!", "More water!", "¡Más agua!")]
          : [t("Toma, dragão!", "Take that, dragon!", "¡Toma, dragón!"), t("Mais pedra!", "More rocks!", "¡Más rocas!")];
        say(lines[Math.floor(Math.random() * lines.length)], 1400);
      }
    }
    return true;
  }
  grid[to] = grid[from];
  shade[to] = shade[from];
  grid[from] = 0;
  stamp[to] = frame;
  return true;
}
const free = (f: number) => !solid[f] && !grid[f];
function step() {
  frame++;
  let moved = 0;
  const flip = frame & 1;
  for (let y = FH - 2; y >= 0; y--) {
    const row = y * FW;
    for (let i = 0; i < FW; i++) {
      const x = flip ? i : FW - 1 - i;
      const f = row + x;
      const v = grid[f];
      if (!v || stamp[f] === frame) continue;
      const d = f + FW;
      if (free(d)) { moveTo(f, d); moved++; continue; }
      const dir = Math.random() < 0.5 ? -1 : 1;
      if (x + dir >= 0 && x + dir < FW && free(d + dir)) { moveTo(f, d + dir); moved++; continue; }
      if (x - dir >= 0 && x - dir < FW && free(d - dir)) { moveTo(f, d - dir); moved++; continue; }
      if (v === 2) {
        // água escorre para os lados
        for (const s of [dir, -dir]) {
          let n = f, ok = false;
          for (let k = 1; k <= 3; k++) {
            const xx = x + s * k;
            if (xx < 0 || xx >= FW || !free(row + xx)) break;
            n = row + xx;
            ok = true;
            if (free(n + FW)) break;
          }
          // andar de lado não conta como movimento (a água parada fica balançando)
          if (ok) { moveTo(f, n); break; }
        }
      }
    }
  }
  return moved;
}

// ------------------------------------------------------------------------------------------------ jogadas
function group(r0: number, c0: number) {
  const start = tiles[r0 * cols + c0];
  if (!start || start.rocket) return [];
  const seen = new Set<number>([r0 * cols + c0]);
  const stack = [r0 * cols + c0];
  while (stack.length) {
    const k = stack.pop()!;
    const r = Math.floor(k / cols), c = k % cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const n = rr * cols + cc;
      const tl = tiles[n];
      if (!seen.has(n) && tl && !tl.rocket && tl.color === start.color) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return [...seen];
}
function removeTile(k: number, delay = 0) {
  const tl = tiles[k];
  if (!tl) return;
  tiles[k] = null;
  const r = Math.floor(k / cols), c = k % cols;
  clearSolid(r, c);
  pops.push({ x: c * TILE, y: r * TILE, color: tl.color, t0: performance.now() + delay });
  // foguete atingido por outro estouro também dispara
  if (tl.rocket) fireRocket(r, c, tl.rocket, delay + 60);
}
function fireRocket(r: number, c: number, dir: "h" | "v", delay = 0) {
  sweeps.push({ r, c, dir, t0: performance.now() + delay });
  sfx("rocket");
  const list: number[] = [];
  if (dir === "h") for (let x = 0; x < cols; x++) list.push(r * cols + x);
  else for (let y = 0; y < rows; y++) list.push(y * cols + c);
  for (const k of list) if (tiles[k]) removeTile(k, delay + Math.abs((dir === "h" ? k % cols - c : Math.floor(k / cols) - r)) * 35);
}
function tap(x: number, y: number) {
  lastTap = performance.now();
  if (state !== "play" || moves <= 0) return;
  const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
  if (r < 0 || c < 0 || r >= rows || c >= cols) return;
  const k = r * cols + c;
  const tl = tiles[k];
  if (!tl) return;
  if (tl.rocket) {
    tiles[k] = null;
    clearSolid(r, c);
    fireRocket(r, c, tl.rocket);
    moves--;
    vibrate(30);
    return;
  }
  const g = group(r, c);
  if (g.length < 2) {
    tl.pop = performance.now(); // balança: sozinho não estoura
    sfx("nope");
    return;
  }
  moves--;
  for (const n of g) removeTile(n, Math.abs(Math.floor(n / cols) - r) * 30 + Math.abs((n % cols) - c) * 30);
  // grupo grande vira foguete no lugar do toque
  if (g.length >= 5) {
    tiles[k] = { color: tl.color, rocket: g.length % 2 ? "h" : "v", pop: performance.now() };
    for (let yy = 0; yy < SUB; yy++) solid.fill(1, (r * SUB + yy) * FW + c * SUB, (r * SUB + yy) * FW + c * SUB + SUB);
    floats.push({ text: t("Foguete!", "Rocket!", "¡Cohete!"), x: (c + 0.5) * TILE, y: r * TILE, t0: performance.now(), color: "#ffcf3f", size: 18 });
  }
  sfx("pop", g.length);
  vibrate(g.length >= 5 ? [20, 20, 30] : 15);
  if (moves === 3) say(t("Rápido! Os espinhos!", "Hurry! The spikes!", "¡Rápido! ¡Los pinchos!"));
  else if (g.length >= 5) say(t("Isso! Que jogada!", "Yes! Great move!", "¡Eso! ¡Qué jugada!"), 1500);
  ensurePlayable();
}
/** Sem nenhum par e sem foguete: embaralha as cores que sobraram. */
function ensurePlayable() {
  const left = tiles.map((tl, k) => (tl ? k : -1)).filter((k) => k >= 0);
  if (!left.length || left.some((k) => tiles[k]!.rocket)) return;
  const hasPair = left.some((k) => group(Math.floor(k / cols), k % cols).length >= 2);
  if (hasPair) return;
  const rand = rng(frame + 17);
  for (const k of left) tiles[k]!.color = Math.floor(rand() * 2); // só 2 cores: com certeza forma par
  floats.push({ text: t("Embaralhando...", "Shuffling...", "Mezclando..."), x: cols * TILE / 2, y: rows * TILE / 2, t0: performance.now(), color: "#fff", size: 20 });
}

// ------------------------------------------------------------------------------------------------ tela
const cv = document.getElementById("game") as HTMLCanvasElement;
const ctx = cv.getContext("2d")!;
const V = { W: 0, H: 0, dpr: 1, s: 1, ox: 0, oy: 0, hud: 92 };
function layout() {
  V.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  V.W = window.innerWidth;
  V.H = window.innerHeight;
  cv.width = Math.round(V.W * V.dpr);
  cv.height = Math.round(V.H * V.dpr);
  const bw = cols * TILE, bh = rows * TILE;
  V.s = Math.min((V.W - 16) / bw, (V.H - V.hud - 24) / bh);
  V.ox = (V.W - bw * V.s) / 2;
  V.oy = V.hud + 8 + Math.max(0, (V.H - V.hud - 40 - bh * V.s) * 0.3);
  bgCache = null;
}
window.addEventListener("resize", layout);

function rr(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function text(s: string, x: number, y: number, size: number, color = "#fff", align: CanvasTextAlign = "center", stroke = true) {
  ctx.font = `${Math.round(size)}px "Lilita One", Fredoka, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  if (stroke) {
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(30,20,50,0.9)";
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const back = (x: number) => { const a = 1.7; x = Math.min(1, Math.max(0, x)); return 1 + (a + 1) * Math.pow(x - 1, 3) + a * Math.pow(x - 1, 2); };

/** Fundo da fase (tijolos, paredes de pedra com borda dourada): desenhado uma vez. */
let bgCache: HTMLCanvasElement | null = null;
function background() {
  if (bgCache) return bgCache;
  const c = document.createElement("canvas");
  const bw = cols * TILE, bh = rows * TILE, sc = V.s * V.dpr;
  c.width = Math.ceil(bw * sc);
  c.height = Math.ceil(bh * sc);
  const g = c.getContext("2d")!;
  g.scale(sc, sc);
  // tijolos claros ao fundo
  g.fillStyle = "#d8d2c6";
  g.fillRect(0, 0, bw, bh);
  g.strokeStyle = "#c2baab";
  g.lineWidth = 1;
  for (let y = 0; y < bh; y += 12) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(bw, y);
    g.stroke();
    for (let x = (y / 12) % 2 ? 0 : 12; x < bw; x += 24) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 12);
      g.stroke();
    }
  }
  // paredes de pedra
  for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
    const k = r * cols + cc;
    if (!wall[k] || L.map[r][cc] === "K") continue;
    const x = cc * TILE, y = r * TILE;
    g.fillStyle = "#5d5a6e";
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = "#6c697e";
    g.fillRect(x + 2, y + 2, TILE / 2 - 3, TILE / 2 - 3);
    g.fillRect(x + TILE / 2 + 1, y + TILE / 2 + 1, TILE / 2 - 3, TILE / 2 - 3);
    g.fillStyle = "#4e4b5e";
    g.fillRect(x + TILE / 2 + 1, y + 2, TILE / 2 - 3, TILE / 2 - 3);
    g.fillRect(x + 2, y + TILE / 2 + 1, TILE / 2 - 3, TILE / 2 - 3);
  }
  // borda dourada onde a parede encontra o espaço livre
  g.strokeStyle = "#f2b233";
  g.lineWidth = 3;
  g.lineCap = "round";
  const isW = (r: number, cc: number) => r < 0 || cc < 0 || r >= rows || cc >= cols || (wall[r * cols + cc] === 1 && L.map[r][cc] !== "K");
  for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
    if (!isW(r, cc)) continue;
    const x = cc * TILE, y = r * TILE;
    const seg = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    if (!isW(r - 1, cc)) seg(x, y + 1.5, x + TILE, y + 1.5);
    if (!isW(r + 1, cc)) seg(x, y + TILE - 1.5, x + TILE, y + TILE - 1.5);
    if (!isW(r, cc - 1)) seg(x + 1.5, y, x + 1.5, y + TILE);
    if (!isW(r, cc + 1)) seg(x + TILE - 1.5, y, x + TILE - 1.5, y + TILE);
  }
  // quarto do rei
  g.fillStyle = "#3b3352";
  g.fillRect(king.x, king.y, king.w, king.h);
  g.strokeStyle = "#f2b233";
  g.lineWidth = 3;
  g.strokeRect(king.x + 1.5, king.y + 1.5, king.w - 3, king.h - 3);
  bgCache = c;
  return c;
}

const tileCache = new Map<string, HTMLCanvasElement>();
function tileSprite(color: number, rocket?: "h" | "v") {
  const key = `${color}${rocket ?? ""}:${V.s}`;
  let sp = tileCache.get(key);
  if (sp) return sp;
  sp = document.createElement("canvas");
  const sc = V.s * V.dpr;
  sp.width = sp.height = Math.ceil(TILE * sc);
  const g = sp.getContext("2d")!;
  g.scale(sc, sc);
  const p = 1.2;
  // azulejo creme
  g.fillStyle = "#e9dcc0";
  roundRect(g, p, p + 1, TILE - p * 2, TILE - p * 2, 5);
  g.fill();
  g.fillStyle = "#fff6e2";
  roundRect(g, p, p, TILE - p * 2, TILE - p * 2 - 1.5, 5);
  g.fill();
  const cx = TILE / 2, cy = TILE / 2;
  const col = TILE_COL[color];
  const art = rocket ? ART.rocket : ART.icons[color];
  if (ready(art)) {
    g.save();
    g.translate(cx, cy);
    if (rocket === "v") g.rotate(Math.PI / 2);
    g.drawImage(art, -12.5, -13, 25, 25);
    g.restore();
    tileCache.set(key, sp);
    return sp;
  }
  g.save();
  g.translate(cx, cy);
  if (rocket) {
    g.fillStyle = "#ff7a1a";
    g.rotate(rocket === "v" ? Math.PI / 2 : 0);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 11, 0);
      g.lineTo(s * 4, -6);
      g.lineTo(s * 4, 6);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#ffd23f";
    roundRect(g, -5, -4, 10, 8, 3);
    g.fill();
  } else if (color === 0) {
    // coroa
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(-9, 7);
    g.lineTo(-10, -5);
    g.lineTo(-5, 0);
    g.lineTo(0, -8);
    g.lineTo(5, 0);
    g.lineTo(10, -5);
    g.lineTo(9, 7);
    g.closePath();
    g.fill();
    g.fillStyle = "#e0a000";
    g.fillRect(-9, 4, 18, 3);
  } else if (color === 1) {
    // folha
    g.rotate(-0.6);
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(0, 0, 10, 6.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#1f8a3a";
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-8, 0);
    g.lineTo(8, 0);
    g.stroke();
  } else if (color === 2) {
    // rubi
    g.fillStyle = col;
    roundRect(g, -8, -8, 16, 16, 4);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.45)";
    roundRect(g, -6, -6, 12, 4, 2);
    g.fill();
  } else {
    // gota
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, -10);
    g.bezierCurveTo(7, -2, 8, 3, 8, 4);
    g.arc(0, 4, 8, 0, Math.PI);
    g.bezierCurveTo(-8, 3, -7, -2, 0, -10);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.beginPath();
    g.ellipse(-3, 2, 2, 3.5, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  tileCache.set(key, sp);
  return sp;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const ROCK = ["#8d92a3", "#a7acbb", "#737889", "#bcc0cc"];
const ROCK_HI = ["#b3b8c6", "#c9cdd8", "#959aab", "#d8dbe3"];
const WATER = ["#3d9cff", "#59adff", "#2d86ea", "#73bcff"];

function drawKing(tm: number) {
  const danger = 1 - moves / movesMax;
  const { x, y, w, h } = king;
  // espinhos vindo da parede de fora
  const outerRight = x + w / 2 > (cols * TILE) / 2;
  const spikeTravel = (w - 34) * (state === "won" ? 0 : Math.min(1, danger));
  const sx = outerRight ? x + w - 4 - spikeTravel : x + 4 + spikeTravel;
  ctx.fillStyle = "#7a7f8f";
  ctx.fillRect(outerRight ? sx : x + 2, y + 4, outerRight ? x + w - sx - 2 : sx - x - 2, h - 8);
  ctx.fillStyle = "#d9dde6";
  const n = Math.max(3, Math.floor((h - 8) / 9));
  for (let i = 0; i < n; i++) {
    const yy = y + 4 + (i + 0.5) * ((h - 8) / n);
    ctx.beginPath();
    ctx.moveTo(sx, yy - 4);
    ctx.lineTo(sx + (outerRight ? -10 : 10), yy);
    ctx.lineTo(sx, yy + 4);
    ctx.closePath();
    ctx.fill();
  }
  // o rei, encostado do lado de dentro
  const kx = outerRight ? x + 16 : x + w - 16, ky = y + h - 4;
  const sc = Math.min(1.45, h / 62);
  const scared = state === "lost" || (state !== "won" && danger > 0.6);
  const poke = Math.max(0, 1 - (tm - poked) / 400);
  const jump = state === "won" ? Math.abs(Math.sin(tm / 160)) * 10 : poke ? Math.sin(poke * Math.PI) * 10 : scared ? Math.sin(tm / 40) * 1.2 : 0;
  // perdeu: os espinhos encostam e o rei fica amassado (desenho animado), com estrelinhas
  const squash = state === "lost" ? ease((tm - endAt) / 300) : 0;
  const kImg = state === "won" ? ART.king.happy : scared ? ART.king.scared : ART.king.idle;
  if (ready(kImg)) {
    // rei desenhado (SVG): ocupa quase a altura do quarto, de frente; respira devagar
    const kh = Math.min(h * 0.92, 92), kw = kh * 0.75;
    const breathe = 1 + Math.sin(tm / 500) * 0.015;
    const kxc = outerRight ? x + kw / 2 + 6 : x + w - kw / 2 - 6;
    ctx.save();
    ctx.translate(kxc + (scared && state === "play" ? Math.sin(tm / 30) * 0.8 : 0), y + h - 3 - jump);
    ctx.scale((1 - squash * 0.45) * breathe, (1 + squash * 0.1) / breathe);
    ctx.drawImage(kImg, -kw / 2, -kh, kw, kh);
    ctx.restore();
    kingHit = { x: kxc - kw / 2, y: y + h - kh, w: kw, h: kh };
    drawSpeech(tm, kxc, y + h - kh + 6, x, y, h);
    if (squash) for (let i = 0; i < 3; i++) {
      const a = tm / 300 + (i * Math.PI * 2) / 3;
      text("★", kxc + Math.cos(a) * 16, y + h - kh + Math.sin(a) * 5, 11, "#ffd23f", "center", false);
    }
    return;
  }
  ctx.save();
  ctx.translate(kx, ky - jump);
  ctx.scale(sc * (outerRight ? 1 : -1) * (1 - squash * 0.45), sc * (1 + squash * 0.12));
  // capa e corpo
  ctx.fillStyle = "#7b3fd1";
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(-9, -26);
  ctx.lineTo(9, -26);
  ctx.lineTo(12, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f1c232";
  ctx.fillRect(-9, -14, 18, 3);
  // cabeça
  ctx.fillStyle = "#f6c9a0";
  ctx.beginPath();
  ctx.arc(0, -34, 9, 0, Math.PI * 2);
  ctx.fill();
  // barba
  ctx.fillStyle = "#f4f1ea";
  ctx.beginPath();
  ctx.moveTo(-8, -33);
  ctx.quadraticCurveTo(0, -18, 8, -33);
  ctx.quadraticCurveTo(0, -27, -8, -33);
  ctx.fill();
  // olhos e boca
  ctx.fillStyle = "#2a1d10";
  const ey = scared ? -37 : -36;
  ctx.beginPath();
  ctx.arc(-3, ey, scared ? 1.8 : 1.3, 0, Math.PI * 2);
  ctx.arc(3, ey, scared ? 1.8 : 1.3, 0, Math.PI * 2);
  ctx.fill();
  if (scared) {
    ctx.beginPath();
    ctx.ellipse(0, -30, 2.2, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // coroa
  ctx.fillStyle = "#ffcc1f";
  ctx.beginPath();
  ctx.moveTo(-8, -41);
  ctx.lineTo(-9, -50);
  ctx.lineTo(-4, -45);
  ctx.lineTo(0, -52);
  ctx.lineTo(4, -45);
  ctx.lineTo(9, -50);
  ctx.lineTo(8, -41);
  ctx.closePath();
  ctx.fill();
  // braços: empurrando os espinhos (com medo) ou comemorando
  ctx.strokeStyle = "#7b3fd1";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (state === "won") {
    ctx.moveTo(-8, -22); ctx.lineTo(-14, -40);
    ctx.moveTo(8, -22); ctx.lineTo(14, -40);
  } else {
    ctx.moveTo(8, -22); ctx.lineTo(18, -24);
    ctx.moveTo(-8, -22); ctx.lineTo(-12, -12);
  }
  ctx.stroke();
  ctx.restore();
  kingHit = { x: kx - 20 * sc, y: ky - 56 * sc, w: 40 * sc, h: 56 * sc };
  if (squash) for (let i = 0; i < 3; i++) {
    const a = tm / 300 + (i * Math.PI * 2) / 3;
    text("★", kx + Math.cos(a) * 14, ky - 58 * sc + Math.sin(a) * 4, 10, "#ffd23f", "center", false);
  }
  else if (scared && Math.floor(tm / 400) % 2) text("!", kx + (outerRight ? 14 : -14), ky - 60 * sc, 18, "#ff4d4d");
  drawSpeech(tm, kx, ky - 60 * sc, x, y, h);
}

/** Balão de fala do rei (fica dentro do tabuleiro): em cima da cabeça ou, sem espaço, embaixo do quarto. */
function drawSpeech(tm: number, kx: number, headY: number, _x: number, y: number, h: number) {
  const age = tm - speech.t0;
  if (speech.text && age < speech.dur) {
    const k = back(age / 220), fade = age > speech.dur - 250 ? (speech.dur - age) / 250 : 1;
    ctx.font = `13px "Lilita One", Fredoka, system-ui, sans-serif`;
    const words = speech.text.split(" ");
    const linesTxt: string[] = [];
    let cur = "";
    for (const w2 of words) {
      if (ctx.measureText(cur + " " + w2).width > 120 && cur) { linesTxt.push(cur); cur = w2; } else cur = cur ? cur + " " + w2 : w2;
    }
    linesTxt.push(cur);
    const bw = Math.max(...linesTxt.map((l) => ctx.measureText(l).width)) + 18, bh = linesTxt.length * 16 + 12;
    let bx = kx - bw / 2;
    bx = Math.max(4, Math.min(cols * TILE - bw - 4, bx));
    // em cima do rei; sem espaço (quarto no topo), embaixo do quarto com a ponta para cima
    let by = headY - bh - 10;
    const below = by < 4;
    if (below) by = y + h + 10;
    const tipX = Math.max(bx + 12, Math.min(bx + bw - 12, kx));
    const tipY = below ? by : by + bh;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(tipX, tipY);
    ctx.scale(k, k);
    ctx.translate(-tipX, -tipY);
    rr(bx, by, bw, bh, 9);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2a1d40";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX - 6, tipY + (below ? 1 : -1));
    ctx.lineTo(tipX, tipY + (below ? -8 : 8));
    ctx.lineTo(tipX + 6, tipY + (below ? 1 : -1));
    ctx.fillStyle = "#fff";
    ctx.fill();
    linesTxt.forEach((l, i) => text(l, bx + bw / 2, by + 14 + i * 16, 13, "#2a1d40", "center", false));
    ctx.restore();
  }
}
let kingHit = { x: -99, y: -99, w: 0, h: 0 };

function drawGoal(tm: number) {
  // área do objetivo (pode ter várias casas); o desenho ocupa o retângulo todo
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (goal[r * cols + c]) {
    x0 = Math.min(x0, c * TILE); y0 = Math.min(y0, r * TILE); x1 = Math.max(x1, (c + 1) * TILE); y1 = Math.max(y1, (r + 1) * TILE);
  }
  const prog = Math.min(1, got / need);
  const w = x1 - x0, h = y1 - y0;
  let dragonDraw: (() => void) | null = null;
  ctx.save();
  rr(x0, y0, w, h, 6);
  ctx.clip();
  if (L.kind === "water") {
    ctx.fillStyle = "#3a1c14";
    ctx.fillRect(x0, y0, w, h);
    // fogo: chamas diminuem com a água
    const amp = (1 - prog) * 0.9 + 0.1;
    for (let i = 0; i < 9; i++) {
      const fx = x0 + ((i + 0.5) / 9) * w;
      const fh = h * (0.6 + 0.4 * Math.sin(tm / 120 + i * 1.7)) * amp * 1.5;
      for (const [col, k] of [["#ff5a1f", 1], ["#ffb21f", 0.65], ["#fff07a", 0.32]] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(fx - 12 * k, y1);
        ctx.quadraticCurveTo(fx - 8 * k, y1 - fh * k * 0.6, fx + Math.sin(tm / 90 + i) * 3, y1 - fh * k);
        ctx.quadraticCurveTo(fx + 8 * k, y1 - fh * k * 0.6, fx + 12 * k, y1);
        ctx.fill();
      }
    }
    if (state === "won") {
      ctx.fillStyle = "rgba(220,230,240,0.6)";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x0 + ((i + 0.5) / 5) * w, y1 - ((tm / 20 + i * 30) % (h + 20)), 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.fillStyle = "#2c1a2e";
    ctx.fillRect(x0, y0, w, h);
    // dragão: cabeça que aparece embaixo, foge quando vence
    const leave = state === "won" ? ease((tm - endAt) / 900) : 0;
    const cx = x0 + w / 2 + Math.sin(tm / 600) * w * 0.12, cy = y1 + 6 + leave * h * 1.4;
    const hs = Math.min(w * 0.22, h * 0.9);
    const dImg = hitFlash > 0.2 ? ART.dragon.hurt : ART.dragon.idle;
    if (ready(dImg)) {
      // desenhado depois de soltar o recorte: a cabeça sai para fora do buraco
      const dw = Math.min(w * 0.5, 110), dh = dw * 0.76;
      const shake = hitFlash > 0.2 ? Math.sin(tm / 20) * 2 : 0;
      dragonDraw = () => ctx.drawImage(dImg, cx - dw / 2 + shake, y1 - dh * 0.98 + leave * (dh + 10) + Math.sin(tm / 350) * 2, dw, dh);
    } else {
    ctx.save();
    ctx.translate(cx, cy);
    const flash = hitFlash > 0.2;
    ctx.fillStyle = flash ? "#b8f5a0" : "#3fae49";
    ctx.beginPath();
    ctx.ellipse(0, -hs * 0.55, hs * 1.15, hs * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    // chifres
    ctx.fillStyle = "#f3e2b3";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * hs * 0.5, -hs * 1.1);
      ctx.lineTo(s * hs * 0.85, -hs * 1.75);
      ctx.lineTo(s * hs * 0.85, -hs * 1.0);
      ctx.fill();
    }
    // olhos (fechados quando apanha)
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(s * hs * 0.42, -hs * 0.8, hs * 0.22, hs * (flash ? 0.05 : 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
      if (!flash) {
        ctx.fillStyle = "#c21b1b";
        ctx.beginPath();
        ctx.arc(s * hs * 0.42, -hs * 0.78, hs * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // dentes
    ctx.fillStyle = "#fff";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * hs * 0.22 - hs * 0.08, -hs * 0.25);
      ctx.lineTo(i * hs * 0.22, -hs * 0.08);
      ctx.lineTo(i * hs * 0.22 + hs * 0.08, -hs * 0.25);
      ctx.fill();
    }
    ctx.restore();
    }
    if (state === "play" && tm > roarAt) {
      roarAt = tm + 6000 + Math.random() * 4000;
      floats.push({ text: "GRRR!", x: cx, y: y0 + 6, t0: tm, color: "#ff6b3d", size: 18 });
      sfx("roar");
      if (tm - speech.t0 > 2500) say(t("Ai, ele vai me pegar!", "Eek, he's coming for me!", "¡Ay, me va a atrapar!"), 1600);
    }
  }
  ctx.restore();
  if (dragonDraw && state === "won") {
    // foge para dentro do buraco: recorta de novo só no fim
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - 40, y0 - 200, w + 80, h + 200);
    ctx.clip();
    dragonDraw();
    ctx.restore();
  } else dragonDraw?.();
  hitFlash *= 0.85;
}

function draw() {
  const tm = performance.now();
  // física: dois passos por quadro deixam a queda mais rápida
  const moved = step() + step();
  still = moved ? 0 : still + 1;
  if (state === "play") {
    if (got >= need) {
      state = "won";
      endAt = tm;
      sfx("win");
      say(t("Você me salvou! Valeu!", "You saved me! Thanks!", "¡Me salvaste! ¡Gracias!"), 3000);
      confetti();
      save("rescue-level", String(lvlIndex + 1));
    } else if (still > 50 && (moves <= 0 || !tiles.some((x) => x)) && sweeps.every((s) => tm - s.t0 > 600)) {
      state = "lost";
      endAt = tm;
      sfx("lose");
      say(t("Aaai!", "Ouch!", "¡Ay!"), 2000);
    }
  }

  ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, V.H);
  bg.addColorStop(0, "#3a2f5c");
  bg.addColorStop(1, "#211a35");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, V.W, V.H);

  // topo: fase, jogadas e objetivo
  text(t(`Nível ${lvlIndex + 1}`, `Level ${lvlIndex + 1}`, `Nivel ${lvlIndex + 1}`), 16, 30, 22, "#fff", "left");
  const mx = V.W - 44;
  ctx.fillStyle = moves <= 3 && state === "play" ? "#e8384b" : "#5b4a8c";
  ctx.beginPath();
  ctx.arc(mx, 34, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#f2b233";
  ctx.stroke();
  text(String(moves), mx, 31, 24);
  text(t("jogadas", "moves", "jugadas"), mx, 52, 10, "#fff", "center", false);
  const goalTxt = L.kind === "water" ? t("Apague o fogo", "Put out the fire", "Apaga el fuego") : t("Pedras no dragão", "Rocks on the dragon", "Rocas al dragón");
  text(goalTxt, 16, 60, 15, "#ffd98a", "left");
  const bw = Math.max(80, V.W - 16 - 90 - 16);
  rr(16, 74, bw, 10, 5);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  rr(16, 74, Math.max(10, bw * Math.min(1, got / need)), 10, 5);
  ctx.fillStyle = L.kind === "water" ? "#4aa8ff" : "#7fd35a";
  ctx.fill();

  // tabuleiro
  ctx.save();
  ctx.translate(V.ox, V.oy);
  ctx.scale(V.s, V.s);
  const B = background();
  ctx.drawImage(B, 0, 0, cols * TILE, rows * TILE);
  drawGoal(tm);
  drawKing(tm);
  // grãos
  for (let y = 0; y < FH; y++) {
    const row = y * FW;
    for (let x = 0; x < FW; x++) {
      const v = grid[row + x];
      if (!v) continue;
      const s = shade[row + x];
      if (v === 1) {
        ctx.fillStyle = ROCK[s];
        ctx.fillRect(x * FINE + 0.25, y * FINE + 0.25, FINE - 0.5, FINE - 0.5);
        ctx.fillStyle = ROCK_HI[s];
        ctx.fillRect(x * FINE + 0.5, y * FINE + 0.4, FINE - 1.6, 0.9);
      } else {
        ctx.fillStyle = WATER[s];
        ctx.fillRect(x * FINE, y * FINE, FINE + 0.2, FINE + 0.2);
      }
    }
  }
  // blocos
  let hint: number[] = [];
  if (state === "play" && tm - lastTap > 5000) hint = bestGroup();
  const hintSet = new Set(hint);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tl = tiles[r * cols + c];
    if (!tl) continue;
    let ox = 0, sc = 1;
    if (tl.pop && tm - tl.pop < 300) ox = Math.sin((tm - tl.pop) / 25) * 2.5 * (1 - (tm - tl.pop) / 300);
    if (tl.rocket && tl.pop && tm - tl.pop < 350) sc = back((tm - tl.pop) / 350);
    if (hintSet.has(r * cols + c)) sc *= 1 + Math.sin(tm / 120) * 0.06;
    const sp = tileSprite(tl.color, tl.rocket);
    const x = c * TILE + ox + (TILE * (1 - sc)) / 2, y = r * TILE + (TILE * (1 - sc)) / 2;
    ctx.drawImage(sp, x, y, TILE * sc, TILE * sc);
  }
  // blocos estourando
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    const k = (tm - p.t0) / 260;
    if (k < 0) {
      ctx.drawImage(tileSprite(p.color), p.x, p.y, TILE, TILE);
      continue;
    }
    if (k >= 1) {
      pops.splice(i, 1);
      continue;
    }
    if (!(p as { burst?: boolean }).burst) {
      (p as { burst?: boolean }).burst = true;
      burst(p.x + TILE / 2, p.y + TILE / 2, TILE_COL[p.color], 5, -2);
    }
    const s = TILE * (1 + k * 0.3);
    ctx.globalAlpha = 1 - k;
    ctx.drawImage(tileSprite(p.color), p.x + (TILE - s) / 2, p.y + (TILE - s) / 2, s, s);
    ctx.globalAlpha = 1;
  }
  // rastro do foguete
  for (let i = sweeps.length - 1; i >= 0; i--) {
    const s = sweeps[i];
    const k = (tm - s.t0) / 450;
    if (k < 0) continue;
    if (k >= 1) {
      sweeps.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = "#ffe07a";
    if (s.dir === "h") ctx.fillRect(0, s.r * TILE + TILE * 0.35, cols * TILE, TILE * 0.3);
    else ctx.fillRect(s.c * TILE + TILE * 0.35, 0, TILE * 0.3, rows * TILE);
    ctx.globalAlpha = 1;
  }
  // partículas e textos (coordenadas do tabuleiro)
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    const k = (tm - q.t0) / q.life;
    if (k < 0) continue;
    if (k >= 1) {
      parts.splice(i, 1);
      continue;
    }
    q.x += q.vx;
    q.y += q.vy;
    q.vy += 0.25;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    const k = (tm - f.t0) / 1000;
    if (k >= 1) {
      floats.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    text(f.text, f.x, f.y - k * 24, f.size * back(k * 4), f.color);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // dica do primeiro nível
  if (lvlIndex === 0 && state === "play" && moves === movesMax) {
    text(t("Toque em 2 ou mais blocos iguais juntos", "Tap 2 or more matching blocks", "Toca 2 o más bloques iguales juntos"), V.W / 2, V.H - 18, 14, "#fff");
    const g = bestGroup();
    if (g.length) {
      const k = g[0];
      const hx = V.ox + ((k % cols) + 0.7) * TILE * V.s, hy = V.oy + (Math.floor(k / cols) + 0.9) * TILE * V.s + Math.sin(tm / 200) * 6;
      text("👆", hx, hy, 34, "#fff", "center", false);
    }
  }

  // fim da fase
  if (state !== "play" && tm - endAt > (state === "won" ? 1400 : 700)) {
    const k = ease((tm - endAt - (state === "won" ? 1400 : 700)) / 350);
    ctx.fillStyle = `rgba(20,14,35,${0.75 * k})`;
    ctx.fillRect(0, 0, V.W, V.H);
    ctx.globalAlpha = k;
    if (state === "won") {
      text(t("Rei salvo! 👑", "King saved! 👑", "¡Rey salvado! 👑"), V.W / 2, V.H / 2 - 70, 38, "#ffd23f");
      text(t(`${movesMax - moves} jogadas`, `${movesMax - moves} moves`, `${movesMax - moves} jugadas`), V.W / 2, V.H / 2 - 26, 18, "#fff");
      button(buttons().next, t("Próximo nível ▶", "Next level ▶", "Siguiente nivel ▶"), "#3cc35c");
    } else {
      text(t("Ah, não!", "Oh no!", "¡Oh, no!"), V.W / 2, V.H / 2 - 90, 40, "#ff6b6b");
      text(L.kind === "water" ? t("O fogo não apagou", "The fire is still burning", "El fuego no se apagó") : t("O dragão escapou", "The dragon got away", "El dragón escapó"), V.W / 2, V.H / 2 - 48, 18, "#fff");
      const b = buttons();
      if (!continued) button(b.more, t("▶  +5 jogadas (ver vídeo)", "▶  +5 moves (watch video)", "▶  +5 jugadas (ver video)"), "#3cc35c");
      button(b.retry, t("Tentar de novo", "Try again", "Intentar de nuevo"), "#3b8cff");
    }
    ctx.globalAlpha = 1;
  }
  if (tm < adUntil) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, V.W, V.H);
    text(t("Anúncio", "Ad", "Anuncio"), V.W / 2, V.H / 2 - 20, 26);
    text(t("(aqui entra o vídeo do anúncio)", "(the video ad plays here)", "(aquí va el video del anuncio)"), V.W / 2, V.H / 2 + 14, 14, "#9aa3c7", "center", false);
    text(String(Math.ceil((adUntil - tm) / 1000)), V.W / 2, V.H / 2 + 56, 30, "#ffd23f");
  }
  requestAnimationFrame(draw);
}
let adUntil = 0;
function bestGroup() {
  let best: number[] = [];
  const seen = new Set<number>();
  for (let k = 0; k < tiles.length; k++) {
    if (!tiles[k] || seen.has(k)) continue;
    if (tiles[k]!.rocket) return [k];
    const g = group(Math.floor(k / cols), k % cols);
    g.forEach((n) => seen.add(n));
    // prefere o grupo mais baixo e maior (abre caminho para as pedras)
    const score = (gr: number[]) => gr.length + Math.max(...gr.map((n) => Math.floor(n / cols))) * 0.5;
    if (g.length >= 2 && (!best.length || score(g) > score(best))) best = g;
  }
  return best;
}
const buttons = () => {
  const w = Math.min(300, V.W - 60), x = (V.W - w) / 2, y = V.H / 2 + 10;
  return { next: { x, y, w, h: 58 }, more: { x, y, w, h: 58 }, retry: { x, y: y + (continued ? 0 : 72), w, h: 58 } };
};
function button(b: { x: number; y: number; w: number; h: number }, label: string, color: string) {
  rr(b.x, b.y + 5, b.w, b.h, b.h / 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  rr(b.x, b.y, b.w, b.h, b.h / 2);
  ctx.fillStyle = color;
  ctx.fill();
  text(label, b.x + b.w / 2, b.y + b.h / 2 + 1, 21);
}
const inside = (x: number, y: number, b: { x: number; y: number; w: number; h: number }) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

function burst(x: number, y: number, color: string, n: number, up = -2) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.5;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + up, life: 450 + Math.random() * 350, t0: performance.now(), color, size: 2 + Math.random() * 3 });
  }
}
function confetti() {
  const cols2 = ["#ffd23f", "#3cc35c", "#e8384b", "#3b8cff", "#a25cff"];
  for (let i = 0; i < 80; i++) {
    parts.push({ x: Math.random() * cols * TILE, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, life: 1800 + Math.random() * 900, t0: performance.now() + i * 8, color: cols2[i % 5], size: 3 + Math.random() * 3 });
  }
}

// ------------------------------------------------------------------------------------------------ som
let ac: AudioContext | null = null;
let lastSfx = 0;
function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 0) {
  if (!ac) return;
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
function noise(dur: number, vol: number, freq: number) {
  if (!ac) return;
  const b = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = b;
  f.type = "bandpass";
  f.frequency.value = freq;
  g.gain.value = vol;
  s.connect(f).connect(g).connect(ac.destination);
  s.start();
}
function sfx(kind: "pop" | "nope" | "rocket" | "thud" | "hiss" | "win" | "lose" | "roar" | "boing", n = 2) {
  const tm = performance.now();
  if ((kind === "thud" || kind === "hiss") && tm - lastSfx < 120) return;
  if (kind === "thud" || kind === "hiss") lastSfx = tm;
  if (kind === "pop") for (let i = 0; i < Math.min(n, 6); i++) tone(500 + i * 90, 0.08, "triangle", 0.12, i * 0.03);
  if (kind === "nope") tone(160, 0.12, "square", 0.05);
  if (kind === "roar") { tone(110, 0.5, "sawtooth", 0.08, 0, 0.6); noise(0.5, 0.12, 300); }
  if (kind === "boing") tone(300, 0.25, "sine", 0.18, 0, 2.2);
  if (kind === "rocket") noise(0.4, 0.4, 1200);
  if (kind === "thud") tone(90 + Math.random() * 30, 0.12, "sine", 0.25, 0, 0.6);
  if (kind === "hiss") noise(0.18, 0.18, 3000);
  if (kind === "win") [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, "triangle", 0.16, i * 0.12));
  if (kind === "lose") [392, 330, 262].forEach((f, i) => tone(f, 0.32, "triangle", 0.14, i * 0.15));
}
function vibrate(p: number | number[]) {
  try { navigator.vibrate?.(p); } catch { /* sem vibração */ }
}

// ------------------------------------------------------------------------------------------------ toque
cv.addEventListener("pointerdown", (e) => {
  if (!ac) {
    try { ac = new AudioContext(); } catch { /* sem áudio */ }
  }
  ac?.resume();
  const tm = performance.now();
  if (tm < adUntil) return;
  if (state !== "play") {
    if (tm - endAt < 1500) return;
    const b = buttons();
    if (state === "won" && inside(e.clientX, e.clientY, b.next)) startLevel(lvlIndex + 1);
    else if (state === "lost" && !continued && inside(e.clientX, e.clientY, b.more)) {
      // aqui entra o vídeo de anúncio (SDK do CrazyGames)
      continued = true;
      adUntil = tm + 2200;
      setTimeout(() => {
        moves += 5;
        movesMax = Math.max(movesMax, moves);
        state = "play";
        still = 0;
        ensurePlayable();
      }, 2200);
    } else if (state === "lost" && inside(e.clientX, e.clientY, b.retry)) startLevel(lvlIndex);
    return;
  }
  const bx = (e.clientX - V.ox) / V.s, by = (e.clientY - V.oy) / V.s;
  if (inside(bx, by, { x: kingHit.x - 6, y: kingHit.y - 6, w: kingHit.w + 12, h: kingHit.h + 12 })) {
    poked = tm;
    sfx("boing");
    const lines = [t("Ei! Me tira daqui!", "Hey! Get me out!", "¡Oye! ¡Sácame de aquí!"), t("Não me cutuca, estoura os blocos!", "Don't poke me, pop the blocks!", "¡No me toques, explota los bloques!"),
      t("Eu sou o rei, sabia?", "I'm the king, you know?", "Soy el rey, ¿sabías?")];
    say(lines[Math.floor(Math.random() * lines.length)], 1800);
    return;
  }
  tap(bx, by);
});

if (location.search.includes("debug")) {
  (window as unknown as Record<string, unknown>).__rescue = {
    start: (i: number) => startLevel(i),
    best: () => bestGroup(),
    tapCell: (k: number) => tap((k % cols + 0.5) * TILE, (Math.floor(k / cols) + 0.5) * TILE),
    info: () => ({ state, moves, got, need, total, still }),
    unlimited: () => { need = 1e9; moves = movesMax = 99; },
  };
}
startLevel(lvlIndex);
document.fonts?.ready.then(() => tileCache.clear());
// a arte em SVG carrega em seguida: refaz os azulejos com os ícones
[...ART.icons, ART.rocket].forEach((im) => im.addEventListener("load", () => tileCache.clear()));
requestAnimationFrame(draw);
