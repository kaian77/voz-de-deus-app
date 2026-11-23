// Tonhão, o personal musculoso: desenhado por código (sem imagens), faz cada exercício do jeito certo.
// Cada exercício = 2 poses (começo e meio do movimento) num quadro 100x100; a animação vai e volta.
import { EXERCISES, type CamId, type ExId } from "./data";
import { drawTonhao3D } from "./tonhao3d";
import { drawArt } from "./exart";

export type XY = [number, number];
export interface Pose {
  head: XY; neck: XY;
  lSh: XY; rSh: XY; lEl: XY; rEl: XY; lWr: XY; rWr: XY;
  lHip: XY; rHip: XY; lKn: XY; rKn: XY; lAn: XY; rAn: XY;
  lToe: XY; rToe: XY;
}

const off = (p: XY, dx = 2.5, dy = -1): XY => [p[0] + dx, p[1] + dy];

/** Vista de lado: o braço/perna de trás é o da frente um pouco deslocado. */
function side(o: { head: XY; sh: XY; el: XY; wr: XY; hip: XY; kn: XY; an: XY; toe: XY; kn2?: XY; an2?: XY; toe2?: XY }): Pose {
  return {
    head: o.head, neck: [(o.head[0] + o.sh[0]) / 2, (o.head[1] + o.sh[1]) / 2],
    lSh: o.sh, rSh: off(o.sh), lEl: o.el, rEl: off(o.el), lWr: o.wr, rWr: off(o.wr),
    lHip: o.hip, rHip: off(o.hip), lKn: o.kn, rKn: o.kn2 ?? off(o.kn), lAn: o.an, rAn: o.an2 ?? off(o.an), lToe: o.toe, rToe: o.toe2 ?? off(o.toe),
  };
}

interface Front { head: XY; sh: [XY, XY]; el: [XY, XY]; wr: [XY, XY]; hip: [XY, XY]; kn: [XY, XY]; an: [XY, XY] }
function front(o: Front): Pose {
  return {
    head: o.head, neck: [o.head[0], (o.head[1] + o.sh[0][1]) / 2 + 1],
    lSh: o.sh[0], rSh: o.sh[1], lEl: o.el[0], rEl: o.el[1], lWr: o.wr[0], rWr: o.wr[1],
    lHip: o.hip[0], rHip: o.hip[1], lKn: o.kn[0], rKn: o.kn[1], lAn: o.an[0], rAn: o.an[1],
    lToe: [o.an[0][0] - 3, o.an[0][1] + 2], rToe: [o.an[1][0] + 3, o.an[1][1] + 2],
  };
}

/** Espelha a pose (x → 100 − x): todo exercício de lado fica com o Tonhão virado para a direita. */
function mir(p: Pose): Pose {
  const o = {} as Pose;
  for (const k of Object.keys(p) as (keyof Pose)[]) o[k] = [100 - p[k][0], p[k][1]];
  return o;
}

const STAND_LEGS = { hip: [[44, 52], [56, 52]] as [XY, XY], kn: [[44, 72], [56, 72]] as [XY, XY], an: [[44, 92], [56, 92]] as [XY, XY] };

export interface Anim { a: Pose; b: Pose; view: "lado" | "frente"; floor: number; prop?: "bar" | "dumbbell"; speed: number }

export const ANIMS: Record<CamId, Anim> = {
  squat: { view: "lado", floor: 95, speed: 0.45,
    a: side({ head: [50, 11], sh: [50, 23], el: [60, 26], wr: [72, 26], hip: [50, 52], kn: [51, 73], an: [50, 93], toe: [58, 95] }),
    b: side({ head: [47, 36], sh: [46, 46], el: [58, 47], wr: [70, 46], hip: [33, 67], kn: [56, 69], an: [50, 93], toe: [58, 95] }) },
  pushup: { view: "lado", floor: 90, speed: 0.5,
    a: mir(side({ head: [17, 56], sh: [26, 62], el: [27, 75], wr: [27, 88], hip: [56, 66], kn: [72, 70], an: [88, 74], toe: [91, 89] })),
    b: mir(side({ head: [16, 74], sh: [26, 78], el: [37, 76], wr: [27, 88], hip: [56, 80], kn: [72, 82], an: [88, 84], toe: [91, 89] })) },
  pullup: { view: "frente", floor: 200, prop: "bar", speed: 0.4,
    a: front({ head: [50, 32], sh: [[40, 42], [60, 42]], el: [[38, 26], [62, 26]], wr: [[36, 10], [64, 10]], hip: [[45, 66], [55, 66]], kn: [[46, 82], [54, 82]], an: [[47, 97], [53, 97]] }),
    b: front({ head: [50, 6], sh: [[40, 22], [60, 22]], el: [[28, 24], [72, 24]], wr: [[36, 10], [64, 10]], hip: [[45, 47], [55, 47]], kn: [[46, 64], [54, 64]], an: [[47, 80], [53, 80]] }) },
  curl: { view: "lado", floor: 95, prop: "dumbbell", speed: 0.5,
    a: side({ head: [50, 11], sh: [50, 23], el: [50, 41], wr: [52, 58], hip: [50, 52], kn: [50, 73], an: [50, 93], toe: [58, 95] }),
    b: side({ head: [50, 11], sh: [50, 23], el: [51, 41], wr: [56, 26], hip: [50, 52], kn: [50, 73], an: [50, 93], toe: [58, 95] }) },
  press: { view: "frente", floor: 95, prop: "dumbbell", speed: 0.45,
    a: front({ head: [50, 14], sh: [[40, 26], [60, 26]], el: [[29, 34], [71, 34]], wr: [[31, 20], [69, 20]], ...STAND_LEGS }),
    b: front({ head: [50, 14], sh: [[40, 26], [60, 26]], el: [[36, 12], [64, 12]], wr: [[40, -1], [60, -1]], ...STAND_LEGS }) },
  lunge: { view: "lado", floor: 95, speed: 0.4,
    a: side({ head: [50, 11], sh: [50, 23], el: [50, 38], wr: [50, 50], hip: [50, 52], kn: [55, 72], an: [56, 93], toe: [63, 95], kn2: [45, 72], an2: [40, 93], toe2: [46, 95] }),
    b: side({ head: [48, 27], sh: [48, 39], el: [48, 54], wr: [48, 66], hip: [48, 67], kn: [66, 69], an: [64, 93], toe: [71, 95], kn2: [42, 89], an2: [26, 90], toe2: [26, 95] }) },
  plank: { view: "lado", floor: 90, speed: 0.25,
    a: mir(side({ head: [16, 64], sh: [26, 70], el: [27, 87], wr: [14, 87.5], hip: [56, 72], kn: [72, 75], an: [88, 78], toe: [91, 89] })),
    b: mir(side({ head: [16, 63], sh: [26, 69.5], el: [27, 87], wr: [14, 87.5], hip: [56, 71.5], kn: [72, 74.5], an: [88, 78], toe: [91, 89] })) },
  lateral: { view: "frente", floor: 95, prop: "dumbbell", speed: 0.45,
    a: front({ head: [50, 14], sh: [[40, 26], [60, 26]], el: [[36, 40], [64, 40]], wr: [[35, 53], [65, 53]], ...STAND_LEGS }),
    b: front({ head: [50, 14], sh: [[40, 26], [60, 26]], el: [[25, 27], [75, 27]], wr: [[12, 29], [88, 29]], ...STAND_LEGS }) },
  bridge: { view: "lado", floor: 92, speed: 0.4,
    a: side({ head: [13, 86], sh: [24, 87], el: [36, 89], wr: [46, 89], hip: [50, 86], kn: [66, 70], an: [74, 89], toe: [81, 91] }),
    b: side({ head: [13, 86], sh: [24, 86], el: [36, 89], wr: [46, 89], hip: [48, 72], kn: [68, 66], an: [74, 89], toe: [81, 91] }) },
  stiff: { view: "lado", floor: 95, prop: "dumbbell", speed: 0.4,
    a: side({ head: [50, 11], sh: [50, 23], el: [51, 40], wr: [52, 56], hip: [50, 52], kn: [51, 73], an: [50, 93], toe: [58, 95] }),
    b: side({ head: [80, 42], sh: [71, 44], el: [70, 60], wr: [69, 74], hip: [42, 50], kn: [47, 72], an: [48, 93], toe: [56, 95] }) },
  row: { view: "lado", floor: 95, prop: "dumbbell", speed: 0.55,
    a: side({ head: [72, 30], sh: [64, 35], el: [64, 52], wr: [65, 68], hip: [40, 55], kn: [48, 74], an: [45, 93], toe: [53, 95] }),
    b: side({ head: [72, 30], sh: [64, 35], el: [52, 34], wr: [57, 49], hip: [40, 55], kn: [48, 74], an: [45, 93], toe: [53, 95] }) },
  burpee: { view: "lado", floor: 92, speed: 0.4,
    a: side({ head: [48, 30], sh: [46, 40], el: [56, 55], wr: [58, 70], hip: [32, 62], kn: [52, 66], an: [44, 90], toe: [52, 92] }),
    b: mir(side({ head: [17, 58], sh: [26, 64], el: [27, 77], wr: [27, 90], hip: [56, 68], kn: [72, 72], an: [88, 76], toe: [91, 91] })) },
  situp: { view: "lado", floor: 92, speed: 0.45,
    a: side({ head: [13, 85], sh: [24, 87], el: [20, 80], wr: [16, 86], hip: [50, 87], kn: [64, 72], an: [76, 89], toe: [83, 91] }),
    b: side({ head: [44, 50], sh: [44, 61], el: [38, 55], wr: [42, 50], hip: [50, 87], kn: [64, 72], an: [76, 89], toe: [83, 91] }) },
  jack: { view: "frente", floor: 95, speed: 0.9,
    a: front({ head: [50, 14], sh: [[40, 26], [60, 26]], el: [[37, 40], [63, 40]], wr: [[36, 53], [64, 53]], ...STAND_LEGS }),
    b: front({ head: [50, 12], sh: [[40, 24], [60, 24]], el: [[30, 12], [70, 12]], wr: [[42, 0], [58, 0]], hip: [[43, 50], [57, 50]], kn: [[36, 70], [64, 70]], an: [[29, 90], [71, 90]] }) },
};

const SKIN = "#c98a5e", SKIN_D = "#a36a43", SKIN_L = "#e0a77c", SHORTS = "#111", BAND = "#E3262E", HAIR = "#1d1410";

const lerp = (a: XY, b: XY, t: number): XY => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function poseAt(an: Anim, time: number): Pose {
  // vai e volta, parando um pouquinho em cada ponta
  const ph = (time * an.speed) % 1;
  const t = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
  const k = Math.min(1, Math.max(0, (t - 0.08) / 0.84));
  const out = {} as Pose;
  for (const key of Object.keys(an.a) as (keyof Pose)[]) out[key] = lerp(an.a[key], an.b[key], k);
  return out;
}

/** Membro musculoso: cápsula afinando com um "volume" de músculo no meio. */
function limb(g: CanvasRenderingContext2D, a: XY, b: XY, w1: number, w2: number, bulge: number, color: string, shade: string) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 0.01;
  const nx = -dy / L, ny = dx / L;
  const m: XY = [a[0] + dx * 0.42, a[1] + dy * 0.42];
  const wm = Math.max(w1, w2) * bulge;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(a[0] + nx * w1, a[1] + ny * w1);
  g.quadraticCurveTo(m[0] + nx * wm * 1.15, m[1] + ny * wm * 1.15, b[0] + nx * w2, b[1] + ny * w2);
  g.arc(b[0], b[1], w2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, true);
  g.lineTo(b[0] - nx * w2, b[1] - ny * w2);
  g.quadraticCurveTo(m[0] - nx * wm * 1.15, m[1] - ny * wm * 1.15, a[0] - nx * w1, a[1] - ny * w1);
  g.arc(a[0], a[1], w1, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI, true);
  g.fill();
  g.strokeStyle = shade;
  g.lineWidth = 0.7;
  g.stroke();
}

function dumbbell(g: CanvasRenderingContext2D, p: XY, vertical: boolean) {
  g.fillStyle = "#2a2d33";
  g.save();
  g.translate(p[0], p[1]);
  if (vertical) g.rotate(Math.PI / 2);
  g.fillRect(-5, -0.9, 10, 1.8);
  g.fillStyle = "#4a4f58";
  g.beginPath(); g.roundRect(-6.5, -3.2, 3, 6.4, 1); g.fill();
  g.beginPath(); g.roundRect(3.5, -3.2, 3, 6.4, 1); g.fill();
  g.restore();
}

function head(g: CanvasRenderingContext2D, p: Pose, view: "lado" | "frente", faceRight: boolean) {
  const [x, y] = p.head;
  g.fillStyle = SKIN;
  g.beginPath(); g.ellipse(x, y, 5.6, 6.3, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = HAIR;
  g.beginPath(); g.ellipse(x, y - 3.4, 5.6, 3.2, 0, Math.PI, Math.PI * 2); g.fill();
  g.fillStyle = BAND;
  g.fillRect(x - 5.7, y - 3.2, 11.4, 1.9);
  g.fillStyle = "#111";
  if (view === "frente") {
    g.beginPath(); g.arc(x - 2, y + 0.3, 0.75, 0, 7); g.arc(x + 2, y + 0.3, 0.75, 0, 7); g.fill();
    g.strokeStyle = "#5a2e1c"; g.lineWidth = 0.8;
    g.beginPath(); g.arc(x, y + 2.4, 1.8, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.beginPath(); g.moveTo(x - 3.4, y - 1.2); g.lineTo(x - 0.8, y - 0.7); g.moveTo(x + 3.4, y - 1.2); g.lineTo(x + 0.8, y - 0.7); g.stroke();
  } else {
    const d = faceRight ? 1 : -1;
    g.beginPath(); g.arc(x + d * 2.8, y + 0.2, 0.75, 0, 7); g.fill();
    g.strokeStyle = "#5a2e1c"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x + d * 2, y + 3); g.lineTo(x + d * 4, y + 2.6); g.stroke();
  }
}

/** Tronco largo em V (peito grande, cintura fina). */
function torso(g: CanvasRenderingContext2D, p: Pose, view: "lado" | "frente") {
  if (view === "frente") {
    const [ls, rs, lh, rh] = [p.lSh, p.rSh, p.lHip, p.rHip];
    const w = (rs[0] - ls[0]) * 0.32;
    g.fillStyle = SKIN;
    g.beginPath();
    g.moveTo(ls[0] - w, ls[1]);
    g.quadraticCurveTo((ls[0] + rs[0]) / 2, ls[1] - 4, rs[0] + w, rs[1]);
    g.quadraticCurveTo(rs[0] + w * 0.8, (rs[1] + rh[1]) / 2 - 4, rh[0] + 1, rh[1]);
    g.lineTo(lh[0] - 1, lh[1]);
    g.quadraticCurveTo(ls[0] - w * 0.8, (ls[1] + lh[1]) / 2 - 4, ls[0] - w, ls[1]);
    g.fill();
    // peitoral e abdômen
    const cx = (ls[0] + rs[0]) / 2, top = ls[1];
    const H = lh[1] - top;
    g.strokeStyle = SKIN_D; g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(cx, top + 2); g.lineTo(cx, top + H * 0.9);
    g.moveTo(cx - 8, top + H * 0.36); g.quadraticCurveTo(cx - 4, top + H * 0.44, cx, top + H * 0.36);
    g.moveTo(cx + 8, top + H * 0.36); g.quadraticCurveTo(cx + 4, top + H * 0.44, cx, top + H * 0.36);
    for (const f of [0.52, 0.64, 0.76]) { g.moveTo(cx - 4, top + H * f); g.lineTo(cx + 4, top + H * f); }
    g.stroke();
    g.fillStyle = SKIN_L;
    g.beginPath(); g.ellipse(cx - 4.5, top + H * 0.22, 3, 1.4, 0, 0, 7); g.ellipse(cx + 4.5, top + H * 0.22, 3, 1.4, 0, 0, 7); g.fill();
    // short
    g.fillStyle = SHORTS;
    g.beginPath(); g.moveTo(lh[0] - 2, lh[1] - 2); g.lineTo(rh[0] + 2, rh[1] - 2); g.lineTo(rh[0] + 3, rh[1] + 9); g.lineTo(cx, rh[1] + 6); g.lineTo(lh[0] - 3, lh[1] + 9); g.fill();
    return;
  }
  // de lado: cápsula grossa com peito saliente
  const sh = p.lSh, hip = p.lHip;
  limb(g, sh, hip, 9, 7, 1.15, SKIN, SKIN_D);
  const dx = hip[0] - sh[0], dy = hip[1] - sh[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  // peito para o lado em que ele olha
  const chest: XY = [sh[0] + dx * 0.25 - nx * 5.5, sh[1] + dy * 0.25 - ny * 5.5];
  g.fillStyle = SKIN_L;
  g.beginPath(); g.ellipse(chest[0], chest[1], 5, 4, Math.atan2(dy, dx), 0, 7); g.fill();
  // cós do short (o resto do short vai nas coxas)
  limb(g, [hip[0] - dx * 0.14, hip[1] - dy * 0.14], hip, 7.4, 6.2, 1, SHORTS, SHORTS);
}

export interface TonhaoOpts { time: number; x: number; y: number; size: number; bg?: boolean; flip?: boolean }

/** Exercício da biblioteca sem animação: cartão com o símbolo do grupo e o aparelho. */
function drawIcon(g: CanvasRenderingContext2D, ex: ExId, o: TonhaoOpts) {
  const e = EXERCISES[ex];
  const s = o.size;
  g.save();
  g.translate(o.x, o.y);
  const gr = g.createLinearGradient(0, 0, s, s);
  gr.addColorStop(0, "#1f2632"); gr.addColorStop(1, "#11151b");
  g.fillStyle = gr;
  g.beginPath(); g.roundRect(0, 0, s, s, s * 0.08); g.fill();
  if (o.bg) { g.strokeStyle = "rgba(212,255,63,.85)"; g.lineWidth = Math.max(2, s / 90); g.stroke(); }
  const bob = Math.sin(o.time * 3) * s * 0.015;
  g.textAlign = "center";
  g.font = `${s * 0.34}px system-ui, sans-serif`;
  g.fillText(e?.emoji ?? "💪", s / 2, s * 0.52 + bob);
  g.fillStyle = "#d4ff3f";
  g.font = `800 ${s * 0.075}px "Inter Tight", system-ui, sans-serif`;
  g.fillText((e?.equip ?? "").toUpperCase(), s / 2, s * 0.72);
  g.fillStyle = "rgba(255,255,255,.6)";
  g.font = `600 ${s * 0.06}px "Inter Tight", system-ui, sans-serif`;
  g.fillText(e?.timed ? "o tempo corre sozinho" : "conte com o +1", s / 2, s * 0.84);
  g.restore();
}

/** Desenha o Tonhão fazendo o exercício. (x, y) = canto de cima; size = lado do quadro. */
export function drawTonhao(g: CanvasRenderingContext2D, ex: ExId, o: TonhaoOpts) {
  // 1º o Tonhão 3D animado; se o celular não tiver WebGL (ou antes de carregar), a ilustração; por último o desenho 2D
  const key = EXERCISES[ex]?.anim;
  if (!key) return drawIcon(g, ex, o);
  if (drawTonhao3D(g, key, o)) return;
  if (drawArt(g, key, { ...o, speed: ANIMS[key].speed })) return;
  const an = ANIMS[key];
  const p = poseAt(an, o.time);
  g.save();
  g.translate(o.x, o.y);
  if (o.bg) {
    g.fillStyle = "rgba(12,14,18,.88)";
    g.beginPath(); g.roundRect(0, 0, o.size, o.size, o.size * 0.08); g.fill();
    g.strokeStyle = "rgba(212,255,63,.85)"; g.lineWidth = Math.max(2, o.size / 90);
    g.stroke();
  }
  const s = o.size / 118;
  g.translate(o.size / 2, o.size / 2);
  g.scale(s * (o.flip ? -1 : 1), s);
  g.translate(-50, -46);
  // chão
  if (an.floor < 120) {
    g.fillStyle = "rgba(255,255,255,.12)";
    g.fillRect(-4, an.floor, 108, 1.2);
    g.fillStyle = "rgba(0,0,0,.35)";
    g.beginPath(); g.ellipse((p.lAn[0] + p.rAn[0]) / 2, an.floor, 16, 2, 0, 0, 7); g.fill();
  }
  if (an.prop === "bar") {
    g.fillStyle = "#8a909c"; g.fillRect(14, 8.5, 72, 3);
    g.fillStyle = "#5a606b"; g.fillRect(14, 8.5, 3, 40); g.fillRect(83, 8.5, 3, 40);
  }
  const fr = an.view === "lado";
  const dark = (c: string) => (fr ? c : c);
  // membros de trás (só de lado) mais escuros
  if (fr) {
    limb(g, p.rHip, p.rKn, 6.8, 5, 1.2, SKIN_D, SKIN_D);
    limb(g, p.rKn, p.rAn, 4.8, 2.6, 1.25, SKIN_D, SKIN_D);
    limb(g, p.rAn, p.rToe, 2.4, 1.8, 1, "#222", "#222");
    limb(g, p.rSh, p.rEl, 5, 3.8, 1.35, SKIN_D, SKIN_D);
    limb(g, p.rEl, p.rWr, 3.6, 2.4, 1.2, SKIN_D, SKIN_D);
    if (an.prop === "dumbbell") dumbbell(g, p.rWr, false);
  }
  // pernas
  const legs: [XY, XY, XY, XY][] = fr ? [[p.lHip, p.lKn, p.lAn, p.lToe]] : [[p.lHip, p.lKn, p.lAn, p.lToe], [p.rHip, p.rKn, p.rAn, p.rToe]];
  for (const [h, k, a, t] of legs) {
    limb(g, h, k, 6.8, 5, 1.2, SKIN, SKIN_D);
    limb(g, k, a, 4.8, 2.6, 1.25, SKIN, SKIN_D);
    limb(g, a, t, 2.4, 1.8, 1, "#222", "#000");
    g.fillStyle = "#fff"; g.fillRect(a[0] - 2.2, a[1] - 0.6, 4.4, 1.3);
  }
  if (!fr) {
    // short por cima das coxas
    g.fillStyle = SHORTS;
    for (const [h, k] of [[p.lHip, p.lKn], [p.rHip, p.rKn]] as [XY, XY][]) limb(g, h, lerp(h, k, 0.45), 7.2, 6.4, 1, SHORTS, SHORTS);
  }
  torso(g, p, an.view);
  if (fr) head(g, p, an.view, true);
  // braços da frente
  const arms: [XY, XY, XY][] = fr ? [[p.lSh, p.lEl, p.lWr]] : [[p.lSh, p.lEl, p.lWr], [p.rSh, p.rEl, p.rWr]];
  for (const [sh, el, wr] of arms) {
    if (!fr) { g.fillStyle = SKIN; g.beginPath(); g.ellipse(sh[0], sh[1], 5.2, 4.2, 0, 0, 7); g.fill(); }
    limb(g, sh, el, 5, 3.8, 1.4, SKIN, SKIN_D);
    limb(g, el, wr, 3.6, 2.4, 1.2, SKIN, SKIN_D);
    g.fillStyle = SKIN; g.beginPath(); g.arc(wr[0], wr[1], 2.4, 0, 7); g.fill();
    if (an.prop === "dumbbell") dumbbell(g, wr, false);
  }
  if (!fr) head(g, p, an.view, true);
  void dark;
  g.restore();
}

export const TONHAO = "Tonhão";

/** Frase de apresentação do exercício. */
export function intro(name: string, tips: string[], first: boolean) {
  return `${first ? `Fala, eu sou o ${TONHAO}, seu personal. ` : ""}Olha como faz o ${name}: ${tips.slice(0, 3).join(". ")}. Agora é a sua vez!`;
}
