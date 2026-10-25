// Reel animado da PáginasPro (1080x1920), desenhado quadro a quadro no canvas a partir dos slides que a IA escreveu:
// 1) gancho com as palavras pulando; 2) "sem site × com PáginasPro" com dois celulares (exemplo ilustrativo, marcado
// como exemplo); 3) cartões dos passos voando; 4) chamada com botão pulsando. Cores e fontes da marca.
import type { Cue } from "./reel-audio";
import type { Slide } from "./types";

export const W = 1080;
export const H = 1920;

const INK = "#111110";
const PAPER = "#f3f1ea";
const PAPER2 = "#eae7dd";
const LIME = "#d4ff3f";
const FOREST = "#173b2c";
const GREY = "#6b6a63";
const WA = "#25d366";
const RED = "#ff5a4e";
const SANS = "'Inter Tight', 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Instrument Serif', Georgia, serif";

const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const back = (t: number) => {
  const c = 1.70158;
  const x = clamp(t) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
const plain = (s: string) => s.replace(/\*/g, "");

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(plain(test)).width > max && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function background(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = "rgba(243,241,234,0.05)";
  ctx.lineWidth = 2;
  const off = (t * 30) % 90;
  for (let x = -off; x <= W; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = -off; y <= H; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  const gx = W * (0.7 + 0.2 * Math.sin(t * 0.6));
  const g = ctx.createRadialGradient(gx, H * 0.85, 0, gx, H * 0.85, 900);
  g.addColorStop(0, "rgba(23,59,44,0.95)");
  g.addColorStop(1, "rgba(23,59,44,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Título com *destaques* em limão, palavra por palavra com "pulo" (cada palavra entra `step` s depois da anterior). */
function kinetic(ctx: CanvasRenderingContext2D, text: string, t: number, y: number, size: number, step = 0.12, align: "left" | "center" = "left") {
  ctx.font = `800 ${size}px ${SANS}`;
  const lines = wrap(ctx, text, W - 160);
  let n = 0;
  let hl = false;
  lines.forEach((line, li) => {
    const words = line.split(" ");
    const lineW = ctx.measureText(plain(line)).width;
    let x = align === "center" ? (W - lineW) / 2 : 80;
    for (const raw of words) {
      const p = back((t - n * step) / 0.35);
      const starts = raw.startsWith("*");
      if (starts) hl = true;
      const word = plain(raw);
      const ww = ctx.measureText(word).width;
      if (p > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(p);
        ctx.translate(x + ww / 2, y + li * size * 1.08);
        ctx.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p);
        ctx.fillStyle = hl ? LIME : PAPER;
        ctx.textAlign = "center";
        ctx.fillText(word, 0, 0);
        ctx.restore();
      }
      if (raw.endsWith("*")) hl = false;
      x += ww + ctx.measureText(" ").width;
      n++;
    }
  });
  return lines.length * size * 1.08;
}

/** Celular com uma tela desenhada por `screen` (coordenadas da tela 0..w x 0..h). */
function phone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tilt: number, screen: (w: number, h: number) => void) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  rr(ctx, 0, 0, w, h, 54, "#26261f");
  ctx.shadowColor = "transparent";
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(14, 14, w - 28, h - 28, 42);
  ctx.clip();
  ctx.translate(14, 14);
  ctx.textAlign = "left";
  screen(w - 28, h - 28);
  ctx.restore();
  rr(ctx, w / 2 - 50, 24, 100, 22, 11, "#26261f");
  ctx.restore();
}

/** Tela "sem site": busca no Google sem o negócio, só resultados de outros. */
function screenWithout(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  rr(ctx, 0, 0, w, h, 0, "#ffffff");
  rr(ctx, 24, 70, w - 48, 64, 32, "#f1f3f4");
  ctx.fillStyle = "#5f6368";
  ctx.font = `500 26px ${SANS}`;
  ctx.fillText("salão perto de mim", 60, 112);
  for (let i = 0; i < 4; i++) {
    const yy = 170 + i * 120;
    const p = easeOut((t - 0.2 - i * 0.12) / 0.4);
    ctx.globalAlpha = p;
    rr(ctx, 24, yy, w * 0.55, 20, 6, "#c6dafc");
    rr(ctx, 24, yy + 36, w - 60, 14, 6, "#e8eaed");
    rr(ctx, 24, yy + 60, w * 0.6, 14, 6, "#e8eaed");
    ctx.globalAlpha = 1;
  }
  const p = back((t - 0.9) / 0.4);
  if (p > 0) {
    ctx.save();
    ctx.translate(w / 2, h - 180);
    ctx.scale(p, p);
    rr(ctx, -150, -60, 300, 120, 24, "rgba(255,90,78,0.12)");
    ctx.fillStyle = RED;
    ctx.font = `800 30px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText("você não aparece", 0, 10);
    ctx.restore();
  }
}

/** Tela "com PáginasPro": mini site de exemplo com foto, título, botões de WhatsApp (pulsando) e como chegar. */
function screenWith(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  rr(ctx, 0, 0, w, h, 0, PAPER);
  const g = ctx.createLinearGradient(0, 0, w, 300);
  g.addColorStop(0, "#c9a58f");
  g.addColorStop(1, "#7b5a4c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 300 * easeOut(t / 0.5));
  ctx.fillStyle = INK;
  ctx.font = `800 40px ${SANS}`;
  ctx.globalAlpha = easeOut((t - 0.3) / 0.4);
  ctx.fillText("Studio da Ana", 28, 360);
  ctx.fillStyle = FOREST;
  ctx.font = `italic 400 34px ${SERIF}`;
  ctx.fillText("cabelo, unhas e make", 28, 404);
  ctx.globalAlpha = 1;
  for (let i = 0; i < 3; i++) {
    const p = easeOut((t - 0.5 - i * 0.1) / 0.4);
    rr(ctx, 28 + i * ((w - 56) / 3), 440 + (1 - p) * 40, (w - 56) / 3 - 12, 110, 18, PAPER2);
  }
  const pulse = 1 + 0.05 * Math.sin(t * 7);
  const pb = back((t - 0.9) / 0.4);
  if (pb > 0) {
    ctx.save();
    ctx.translate(w / 2, h - 230);
    ctx.scale(pb * pulse, pb * pulse);
    rr(ctx, -(w - 56) / 2, -42, w - 56, 84, 42, WA);
    ctx.fillStyle = "#fff";
    ctx.font = `800 30px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText("Agendar no WhatsApp", 0, 11);
    ctx.restore();
    ctx.save();
    ctx.translate(w / 2, h - 125);
    ctx.scale(pb, pb);
    rr(ctx, -(w - 56) / 2, -38, w - 56, 76, 38, INK);
    ctx.fillStyle = PAPER;
    ctx.font = `700 28px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText("Como chegar", 0, 10);
    ctx.restore();
  }
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, fg: string, p: number) {
  if (p <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(p, p);
  ctx.font = `800 34px ${SANS}`;
  const w = ctx.measureText(text).width + 56;
  rr(ctx, -w / 2, -36, w, 72, 36, color);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.fillText(text, 0, 12);
  ctx.restore();
}

function brand(ctx: CanvasRenderingContext2D, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `800 54px ${SANS}`;
  const a = ctx.measureText("Páginas").width;
  ctx.font = `italic 400 60px ${SERIF}`;
  const b = ctx.measureText("pro").width;
  const x = (W - a - b - 4) / 2;
  ctx.fillStyle = PAPER;
  ctx.font = `800 54px ${SANS}`;
  ctx.fillText("Páginas", x, H - 150);
  ctx.fillStyle = LIME;
  ctx.font = `italic 400 60px ${SERIF}`;
  ctx.fillText("pro", x + a + 4, H - 150);
  ctx.restore();
}

/** Perfil do Instagram de exemplo dentro do celular; `link` é o link da bio (destacado quando `hl`). */
function igProfile(ctx: CanvasRenderingContext2D, w: number, h: number, name: string, link: string, hl: number, tap: number) {
  rr(ctx, 0, 0, w, h, 0, "#ffffff");
  ctx.fillStyle = "#111";
  ctx.font = `800 26px ${SANS}`;
  ctx.fillText(name, 24, 80);
  const g = ctx.createLinearGradient(24, 110, 140, 230);
  g.addColorStop(0, "#f9ce34");
  g.addColorStop(0.5, "#ee2a7b");
  g.addColorStop(1, "#6228d7");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(84, 170, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d9cbbf";
  ctx.beginPath();
  ctx.arc(84, 170, 52, 0, Math.PI * 2);
  ctx.fill();
  ["posts", "seguidores", "seguindo"].forEach((l, i) => {
    ctx.fillStyle = "#111";
    const x = 168 + i * ((w - 180) / 3);
    ctx.font = `800 22px ${SANS}`;
    ctx.fillText(["128", "2.340", "310"][i], x, 160);
    ctx.font = `400 14px ${SANS}`;
    ctx.fillText(l, x, 184);
  });
  rr(ctx, 24, 260, w * 0.7, 16, 6, "#e3e3e3");
  rr(ctx, 24, 288, w * 0.55, 16, 6, "#e3e3e3");
  // Link da bio
  if (hl > 0) rr(ctx, 16, 312, w - 32, 50, 12, `rgba(212,255,63,${0.9 * hl})`);
  ctx.fillStyle = "#00376b";
  ctx.font = `700 22px ${SANS}`;
  ctx.fillText(`🔗 ${link}`, 26, 345);
  for (let i = 0; i < 9; i++) rr(ctx, (i % 3) * (w / 3) + 2, 390 + Math.floor(i / 3) * (w / 3) + 2, w / 3 - 4, w / 3 - 4, 0, ["#e9dccf", "#cfd8cf", "#ddd3e6"][i % 3]);
  if (tap > 0 && tap < 1) {
    ctx.strokeStyle = `rgba(23,59,44,${1 - tap})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(w / 2, 337, 20 + 70 * tap, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Bonequinho segurando o celular; `mood` -1 (chateado) a 1 (feliz); `jump` desloca para cima. */
function person(ctx: CanvasRenderingContext2D, x: number, y: number, mood: number, jump: number, t: number) {
  ctx.save();
  ctx.translate(x, y - jump);
  // Corpo e cabeça
  rr(ctx, -120, 60, 240, 330, 110, FOREST);
  rr(ctx, -60, 60, 120, 40, 20, LIME);
  ctx.fillStyle = "#e8b48f";
  ctx.beginPath();
  ctx.arc(0, -40, 105, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3b2a22";
  ctx.beginPath();
  ctx.arc(0, -70, 108, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  // Olhos (piscam)
  const blink = Math.sin(t * 2.3) > 0.97 ? 0.15 : 1;
  ctx.fillStyle = INK;
  for (const ex of [-38, 38]) {
    ctx.beginPath();
    ctx.ellipse(ex, -40, 11, 14 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Boca: curva para cima (feliz) ou para baixo (chateado)
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-34, 14);
  ctx.quadraticCurveTo(0, 14 + 34 * mood, 34, 14);
  ctx.stroke();
  if (mood > 0.6) {
    ctx.fillStyle = "rgba(255,120,120,0.35)";
    ctx.beginPath();
    ctx.arc(-70, 0, 18, 0, Math.PI * 2);
    ctx.arc(70, 0, 18, 0, Math.PI * 2);
    ctx.fill();
  }
  // Braço com o celular
  ctx.strokeStyle = "#e8b48f";
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(90, 140);
  ctx.quadraticCurveTo(180, 170, 210, 90);
  ctx.stroke();
  rr(ctx, 175, -10, 80, 140, 16, "#26261f");
  rr(ctx, 183, -2, 64, 124, 10, mood > 0.5 ? LIME : "#d8d8d8");
  ctx.restore();
}

function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, p: number, color: string) {
  if (p <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(p, p);
  rr(ctx, -70, -70, 140, 120, 40, color);
  ctx.beginPath();
  ctx.moveTo(-20, 48);
  ctx.lineTo(-44, 84);
  ctx.lineTo(10, 48);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `800 70px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText(text, 0, 14);
  ctx.restore();
}

/** Cena do bonequinho: perfil só com link do WhatsApp (desanima e passa), perfil com link da PáginasPro (abre o site e comemora). */
function scenePersona(ctx: CanvasRenderingContext2D, lt: number) {
  const swap = easeOut((lt - 2.4) / 0.5);
  const openSite = lt > 4.3;
  const mood = lt < 1 ? 0 : lt < 2.6 ? -0.8 : lt < 3.6 ? 0 : 1;
  const jump = openSite ? Math.abs(Math.sin((lt - 4.3) * 6)) * 60 : 0;
  ctx.save();
  ctx.font = `800 60px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.globalAlpha = easeOut(lt / 0.3);
  ctx.fillText(openSite ? "Esse eu chamo agora!" : lt < 2.6 ? "Só um link de WhatsApp?" : "Opa, esse tem site…", W / 2, 300);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  const pw = 470;
  const ph = 860;
  const px = W - pw - 60;
  phone(ctx, px, 420, pw, ph, 0.04, (w, h) => {
    if (openSite) {
      screenWith(ctx, w, h, lt - 4.3);
      return;
    }
    ctx.save();
    ctx.translate(-w * swap, 0);
    igProfile(ctx, w, h, "studio.exemplo", "wa.me/5561999…", 0, 0);
    ctx.translate(w, 0);
    igProfile(ctx, w, h, "salao.exemplo", "paginaspro.app.br/p/…", easeOut((lt - 3.0) / 0.4), (lt - 3.7) / 0.6);
    ctx.restore();
  });
  person(ctx, 270, 1180, mood, jump, lt);
  bubble(ctx, 360, 760, "?", back((lt - 1.0) / 0.35) * (lt < 2.6 ? 1 : 0), PAPER);
  bubble(ctx, 360, 760 - jump, "!", openSite ? back((lt - 4.4) / 0.35) : 0, LIME);
  if (openSite) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + lt;
      const r = 230 + 40 * Math.sin(lt * 5 + i);
      ctx.fillStyle = i % 2 ? LIME : PAPER;
      ctx.beginPath();
      ctx.arc(270 + Math.cos(a) * r, 1040 - jump + Math.sin(a) * r * 0.6, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "rgba(243,241,234,0.45)";
  ctx.font = `500 26px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("exemplo ilustrativo", W / 2, 1640);
  ctx.restore();
}

const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");

/** Cena dos contadores: números do painel subindo (verde) × sem site descendo (vermelho). Números ilustrativos. */
function sceneCounter(ctx: CanvasRenderingContext2D, lt: number) {
  ctx.save();
  ctx.textAlign = "left";
  const card = (y: number, title: string, rows: [string, number, number][], good: boolean, start: number) => {
    const p = back((lt - start) / 0.5);
    if (p <= 0) return;
    ctx.save();
    ctx.translate(0, (1 - p) * 300);
    ctx.globalAlpha = clamp(p);
    rr(ctx, 70, y, W - 140, 520, 44, good ? PAPER : "#1e1e1c");
    ctx.fillStyle = good ? FOREST : RED;
    ctx.font = `800 44px ${SANS}`;
    ctx.fillText(title, 120, y + 90);
    rows.forEach(([label, from, to], i) => {
      const k = easeOut((lt - start - 0.4 - i * 0.25) / 1.6);
      const v = from + (to - from) * k;
      const yy = y + 200 + i * 150;
      ctx.fillStyle = good ? GREY : "rgba(243,241,234,0.6)";
      ctx.font = `500 32px ${SANS}`;
      ctx.fillText(label, 120, yy);
      ctx.fillStyle = good ? INK : PAPER;
      ctx.font = `800 96px ${SANS}`;
      ctx.fillText(fmt(v), 120, yy + 92);
      const arrowX = W - 220;
      ctx.fillStyle = good ? "#1fa45a" : RED;
      ctx.beginPath();
      if (good) {
        ctx.moveTo(arrowX, yy + 70);
        ctx.lineTo(arrowX + 40, yy + 10);
        ctx.lineTo(arrowX + 80, yy + 70);
      } else {
        ctx.moveTo(arrowX, yy + 20);
        ctx.lineTo(arrowX + 40, yy + 80);
        ctx.lineTo(arrowX + 80, yy + 20);
      }
      ctx.fill();
    });
    ctx.restore();
  };
  card(300, "Com site (painel do cliente)", [["Visitas no mês", 0, 1248], ["Cliques no WhatsApp", 0, 186]], true, 0);
  card(900, "Sem site", [["Clientes que te acham no Google", 186, 0], ["Visitas que dá para medir", 1248, 0]], false, 1.4);
  ctx.fillStyle = "rgba(243,241,234,0.45)";
  ctx.font = `500 26px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("números ilustrativos, só para mostrar o painel", W / 2, 1520);
  ctx.restore();
}

const MONO = "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

/** Moldura de "painel de controle": cantos, rótulos em fonte mono e o relógio do vídeo correndo. */
function hud(ctx: CanvasRenderingContext2D, t: number, left: string, right: string) {
  ctx.save();
  ctx.strokeStyle = "rgba(243,241,234,0.55)";
  ctx.lineWidth = 4;
  const m = 40;
  const k = 70;
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * k, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * k);
    ctx.stroke();
  }
  ctx.font = `500 26px ${MONO}`;
  ctx.fillStyle = "rgba(243,241,234,0.6)";
  ctx.textAlign = "left";
  ctx.fillText(left, 92, 205);
  ctx.textAlign = "right";
  ctx.fillText(right, W - 92, 205);
  const s = Math.floor(t);
  const f = Math.floor((t % 1) * 30);
  ctx.fillText(`00:00:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`, W - 92, H - 70);
  ctx.textAlign = "left";
  rr(ctx, 92, H - 104, 52, 40, 4, Math.floor(t * 2) % 2 ? LIME : "rgba(212,255,63,0.35)");
  ctx.fillStyle = INK;
  ctx.font = `700 22px ${MONO}`;
  ctx.fillText("ON", 100, H - 76);
  ctx.fillStyle = "rgba(243,241,234,0.6)";
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText("SITE 1/1 ONLINE", 160, H - 76);
  ctx.restore();
}

/** Piso em perspectiva (linhas de grade fugindo para o horizonte), como palco de TV. */
function floorGrid(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  const hy = H * 0.56;
  const g = ctx.createRadialGradient(W / 2, hy, 0, W / 2, hy, 900);
  g.addColorStop(0, "rgba(23,59,44,0.9)");
  g.addColorStop(1, "rgba(17,17,16,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(212,255,63,0.16)";
  ctx.lineWidth = 2;
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 30, hy);
    ctx.lineTo(W / 2 + i * 260, H);
    ctx.stroke();
  }
  const off = (t * 0.6) % 1;
  for (let j = 0; j < 9; j++) {
    const z = (j + off) / 9;
    const y = hy + (H - hy) * z * z;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Título em duas partes: linha menor clara + palavra gigante colorida com brilho, entrando com impacto. */
function bigTitle(ctx: CanvasRenderingContext2D, small: string, big: string, color: string, p: number) {
  if (p <= 0) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha = clamp(p * 1.5);
  ctx.fillStyle = PAPER;
  ctx.font = `800 76px ${SANS}`;
  ctx.fillText(small.toUpperCase(), W / 2, 330);
  const s = 0.7 + 0.3 * back(p);
  ctx.translate(W / 2, 500);
  ctx.scale(s, s);
  ctx.shadowColor = color;
  ctx.shadowBlur = 40;
  ctx.fillStyle = color;
  let size = 190;
  ctx.font = `900 ${size}px ${SANS}`;
  while (ctx.measureText(big.toUpperCase()).width > W - 120 && size > 80) {
    size -= 10;
    ctx.font = `900 ${size}px ${SANS}`;
  }
  ctx.fillText(big.toUpperCase(), 0, 0);
  ctx.restore();
}

/** Notificação na tela de bloqueio. */
function notif(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, app: string, title: string, body: string, color: string, letter: string, p: number) {
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(p * 1.4);
  ctx.translate(0, (1 - back(p)) * -60);
  rr(ctx, x, y, w, 150, 18, "#161614");
  ctx.strokeStyle = "rgba(243,241,234,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 150, 18);
  ctx.stroke();
  rr(ctx, x + 22, y + 26, 64, 64, 12, color);
  ctx.fillStyle = color === LIME ? INK : PAPER;
  ctx.font = `900 40px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText(letter, x + 54, y + 72);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(243,241,234,0.55)";
  ctx.font = `500 20px ${MONO}`;
  ctx.fillText(`${app.toUpperCase()} · AGORA`, x + 106, y + 40);
  ctx.fillStyle = PAPER;
  ctx.font = `800 32px ${SANS}`;
  ctx.fillText(title, x + 106, y + 80);
  ctx.fillStyle = "rgba(243,241,234,0.8)";
  ctx.font = `400 26px ${SANS}`;
  ctx.fillText(body, x + 106, y + 120, w - 130);
  ctx.restore();
}

/** Cena da madrugada: o site trabalhando enquanto o dono dorme (celular com o relógio correndo e notificações). */
function sceneNight(ctx: CanvasRenderingContext2D, lt: number) {
  floorGrid(ctx, lt);
  const part = lt < 2.6 ? 0 : 1;
  bigTitle(ctx, part ? "e o site trabalhando" : "3 da manhã. você", part ? "24 horas" : "dormindo", part ? LIME : RED, part ? (lt - 2.6) / 0.45 : lt / 0.45);
  const pw = 600;
  const ph = 940;
  const px = (W - pw) / 2;
  const py = 700;
  const pin = easeOut((lt - 0.2) / 0.5);
  ctx.save();
  ctx.globalAlpha = pin;
  ctx.translate(0, (1 - pin) * 200);
  rr(ctx, px, py, pw, ph, 50, "#0b0b0a");
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 50);
  ctx.stroke();
  rr(ctx, px + pw / 2 - 70, py + 26, 140, 34, 17, PAPER);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(243,241,234,0.75)";
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText("QUARTA, 3 DA MANHÃ", W / 2, py + 130);
  const min = Math.min(59, 2 + Math.floor(lt * 2.2));
  ctx.fillStyle = PAPER;
  ctx.font = `900 150px ${SANS}`;
  ctx.fillText(`03:${String(min).padStart(2, "0")}`, W / 2, py + 290);
  const nx = px + 30;
  const nw = pw - 60;
  notif(ctx, nx, py + 340, nw, "Google", "“dentista perto de mim”", "Seu site apareceu na busca", "#4285f4", "G", (lt - 1.0) / 0.35);
  notif(ctx, nx, py + 510, nw, "Seu site", "1 visita nova", "Viu serviços e endereço", LIME, "P", (lt - 2.2) / 0.35);
  notif(ctx, nx, py + 680, nw, "WhatsApp", "Mensagem nova", "“Vi seu site, quero agendar!”", WA, "W", (lt - 3.4) / 0.35);
  ctx.restore();
  ctx.fillStyle = "rgba(243,241,234,0.45)";
  ctx.font = `500 24px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("exemplo ilustrativo", W / 2, py + ph + 40);
  hud(ctx, lt, "ATENDIMENTO // 24/7", "PAGINASPRO.HQ");
}

export type ReelScene = "compare" | "persona" | "counter" | "cards" | "night";

/** Monta a linha do tempo do Reel a partir dos slides: [duração total, desenhar(t)]. */
export function paginasproReel(slides: Slide[], scene: ReelScene = "compare") {
  const hook = slides[0]?.title || "Seu cliente te procura e *não te acha*";
  const middle = slides.slice(1, -1).slice(0, 4);
  const last = slides.length > 1 ? slides[slides.length - 1] : { title: "Prévia *grátis* em 24 h", body: "Me chama no direct." };
  const T_HOOK = 3.2;
  const T_CMP = scene === "persona" ? 6.6 : scene === "counter" ? 5.8 : scene === "night" ? 5.6 : scene === "cards" ? 0 : 5.2;
  const T_CARD = 2.4;
  const T_END = 3.8;
  const tCards = T_HOOK + T_CMP;
  const tEnd = tCards + middle.length * T_CARD;
  const total = tEnd + T_END;

  const draw = (ctx: CanvasRenderingContext2D, t: number) => {
    background(ctx, t);
    ctx.textAlign = "left";

    if (t < T_HOOK) {
      // 1) Gancho
      const lt = t;
      const out = clamp((lt - (T_HOOK - 0.35)) / 0.35);
      ctx.save();
      ctx.globalAlpha = 1 - out;
      ctx.translate(0, -120 * out);
      badge(ctx, 300, 640, "atenção, negócio local", LIME, INK, back(lt / 0.4));
      kinetic(ctx, hook, lt - 0.3, 860, 112);
      ctx.restore();
    } else if (t < tCards) {
      // 2) Cena do meio: sem site × com PáginasPro, bonequinho ou contadores (exemplos ilustrativos)
      const lt = t - T_HOOK;
      const out = clamp((lt - (T_CMP - 0.35)) / 0.35);
      if (scene !== "compare") {
        ctx.save();
        ctx.globalAlpha = 1 - out;
        if (scene === "persona") scenePersona(ctx, lt);
        else if (scene === "night") sceneNight(ctx, lt);
        else sceneCounter(ctx, lt);
        ctx.restore();
      } else {
      ctx.save();
      ctx.globalAlpha = 1 - out;
      ctx.font = `800 64px ${SANS}`;
      ctx.fillStyle = PAPER;
      ctx.textAlign = "center";
      ctx.globalAlpha = (1 - out) * easeOut(lt / 0.3);
      ctx.fillText("Quem não tem site", W / 2, 300);
      ctx.fillStyle = LIME;
      ctx.fillText("× quem tem", W / 2, 380);
      ctx.globalAlpha = 1 - out;
      const pw = 430;
      const ph = 880;
      const inL = easeOut(lt / 0.6);
      const inR = easeOut((lt - 1.4) / 0.6);
      phone(ctx, 60 - (1 - inL) * 600, 520, pw, ph, -0.05, (w, h) => screenWithout(ctx, w, h, lt));
      if (inR > 0) phone(ctx, W - pw - 60 + (1 - inR) * 600, 500, pw, ph, 0.05, (w, h) => screenWith(ctx, w, h, lt - 1.4));
      badge(ctx, 60 + pw / 2, 1490, "✕  sem site", "rgba(255,90,78,0.18)", RED, back((lt - 0.8) / 0.4));
      badge(ctx, W - 60 - pw / 2, 1490, "✓  com PáginasPro", LIME, INK, back((lt - 2.4) / 0.4));
      ctx.fillStyle = "rgba(243,241,234,0.45)";
      ctx.font = `500 26px ${SANS}`;
      ctx.fillText("exemplo ilustrativo", W / 2, 1600);
      ctx.restore();
      }
    } else if (t < tEnd) {
      // 3) Cartões dos passos, um empilhando sobre o outro
      const idx = Math.floor((t - tCards) / T_CARD);
      const lt = t - tCards - idx * T_CARD;
      ctx.save();
      ctx.font = `600 34px ${SANS}`;
      ctx.fillStyle = "rgba(243,241,234,0.6)";
      ctx.fillText(`${idx + 1}/${middle.length}`, 80, 260);
      for (let k = 0; k <= idx; k++) {
        const s = middle[k];
        const p = k === idx ? back(lt / 0.5) : 1;
        const depth = idx - k;
        const cy = 620 + depth * -46;
        ctx.save();
        ctx.globalAlpha = depth > 2 ? 0 : 1 - depth * 0.3;
        ctx.translate(W / 2, cy + (1 - p) * 700);
        ctx.rotate((k % 2 ? 1 : -1) * 0.025 * (1 + depth));
        ctx.scale(1 - depth * 0.05, 1 - depth * 0.05);
        const cw = W - 140;
        const ch = 640;
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 50;
        ctx.shadowOffsetY = 20;
        rr(ctx, -cw / 2, 0, cw, ch, 44, k % 2 ? FOREST : PAPER);
        ctx.shadowColor = "transparent";
        const dark = k % 2 === 1;
        rr(ctx, -cw / 2 + 60, 60, 96, 96, 48, LIME);
        ctx.fillStyle = INK;
        ctx.font = `800 48px ${SANS}`;
        ctx.textAlign = "center";
        ctx.fillText(String(k + 1), -cw / 2 + 108, 126);
        ctx.textAlign = "left";
        ctx.font = `800 70px ${SANS}`;
        let y = 260;
        let hl = false;
        for (const line of wrap(ctx, s.title, cw - 120)) {
          let x = -cw / 2 + 60;
          for (const raw of line.split(" ")) {
            if (raw.startsWith("*")) hl = true;
            const word = plain(raw);
            ctx.fillStyle = hl ? (dark ? LIME : FOREST) : dark ? PAPER : INK;
            ctx.fillText(word, x, y);
            x += ctx.measureText(`${word} `).width;
            if (raw.endsWith("*")) hl = false;
          }
          y += 80;
        }
        if (s.body && k === idx) {
          ctx.globalAlpha = easeOut((lt - 0.4) / 0.4);
          ctx.font = `400 40px ${SANS}`;
          ctx.fillStyle = dark ? "rgba(243,241,234,0.8)" : GREY;
          for (const line of wrap(ctx, s.body, cw - 120).slice(0, 5)) {
            y += 4;
            ctx.fillText(line, -cw / 2 + 60, y + 30);
            y += 54;
          }
        }
        ctx.restore();
      }
      ctx.restore();
    } else {
      // 4) Chamada final
      const lt = t - tEnd;
      ctx.save();
      const h = kinetic(ctx, last.title, lt, 640, 112, 0.1, "center");
      if (last.body) {
        ctx.globalAlpha = easeOut((lt - 0.8) / 0.4);
        ctx.fillStyle = "rgba(243,241,234,0.8)";
        ctx.font = `400 42px ${SANS}`;
        ctx.textAlign = "center";
        wrap(ctx, last.body, W - 200).slice(0, 3).forEach((line, i) => ctx.fillText(line, W / 2, 640 + h + 40 + i * 56));
        ctx.globalAlpha = 1;
      }
      const pulse = 1 + 0.06 * Math.sin(lt * 6);
      const pb = back((lt - 1.2) / 0.45);
      if (pb > 0) {
        ctx.save();
        ctx.translate(W / 2, 1360);
        ctx.scale(pb * pulse, pb * pulse);
        rr(ctx, -330, -66, 660, 132, 66, LIME);
        ctx.fillStyle = INK;
        ctx.font = `800 50px ${SANS}`;
        ctx.textAlign = "center";
        ctx.fillText("Chama no direct →", 0, 18);
        ctx.restore();
      }
      ctx.globalAlpha = easeOut((lt - 1.6) / 0.4);
      ctx.fillStyle = "rgba(243,241,234,0.7)";
      ctx.font = `600 36px ${SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("paginaspro.app.br", W / 2, 1520);
      ctx.restore();
    }

    // Marca e barra de progresso sempre visíveis
    brand(ctx, 0.95);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(80, 120, W - 160, 8);
    ctx.fillStyle = LIME;
    ctx.fillRect(80, 120, (W - 160) * clamp(t / total), 8);
  };

  // Momentos dos efeitos sonoros (mesmos tempos da animação)
  const words = (text: string) => plain(text).split(/\s+/).filter(Boolean).length;
  const cues: Cue[] = [{ t: 0.05, kind: "pop" }];
  for (let i = 0; i < Math.min(words(hook), 12); i++) cues.push({ t: 0.3 + i * 0.12, kind: "pop" });
  if (T_CMP > 0) {
    const s0 = T_HOOK;
    cues.push({ t: s0 - 0.25, kind: "whoosh" });
    if (scene === "compare") cues.push({ t: s0 + 0.8, kind: "sad" }, { t: s0 + 1.4, kind: "whoosh" }, { t: s0 + 2.4, kind: "ding" });
    if (scene === "persona") cues.push({ t: s0 + 1.0, kind: "sad" }, { t: s0 + 2.4, kind: "whoosh" }, { t: s0 + 3.7, kind: "pop" }, { t: s0 + 4.4, kind: "ding" });
    if (scene === "night") {
      cues.push({ t: s0 + 0.05, kind: "pop" }, { t: s0 + 1.0, kind: "ding" }, { t: s0 + 2.2, kind: "ding" }, { t: s0 + 2.6, kind: "whoosh" }, { t: s0 + 3.4, kind: "ding" });
    }
    if (scene === "counter") {
      cues.push({ t: s0 + 1.4, kind: "whoosh" }, { t: s0 + 2.0, kind: "ding" });
      for (let x = 0.4; x < 3.6; x += 0.12) cues.push({ t: s0 + x, kind: "tick" });
    }
  }
  middle.forEach((_, k) => cues.push({ t: tCards + k * T_CARD - 0.1, kind: "whoosh" }, { t: tCards + k * T_CARD + 0.3, kind: "pop" }));
  cues.push({ t: tEnd - 0.2, kind: "whoosh" });
  for (let i = 0; i < Math.min(words(last.title), 10); i++) cues.push({ t: tEnd + i * 0.1, kind: "pop" });
  cues.push({ t: tEnd + 1.25, kind: "ding" });

  return { total, draw, cues };
}
