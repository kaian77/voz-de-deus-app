// Reel animado da PáginasPro (1080x1920), desenhado quadro a quadro no canvas a partir dos slides que a IA escreveu:
// 1) gancho com as palavras pulando; 2) "sem site × com PáginasPro" com dois celulares (exemplo ilustrativo, marcado
// como exemplo); 3) cartões dos passos voando; 4) chamada com botão pulsando. Cores e fontes da marca.
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

/** Monta a linha do tempo do Reel a partir dos slides: [duração total, desenhar(t)]. */
export function paginasproReel(slides: Slide[]) {
  const hook = slides[0]?.title || "Seu cliente te procura e *não te acha*";
  const middle = slides.slice(1, -1).slice(0, 4);
  const last = slides.length > 1 ? slides[slides.length - 1] : { title: "Prévia *grátis* em 24 h", body: "Me chama no direct." };
  const T_HOOK = 3.2;
  const T_CMP = 5.2;
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
      // 2) Sem site × com PáginasPro (exemplo ilustrativo)
      const lt = t - T_HOOK;
      const out = clamp((lt - (T_CMP - 0.35)) / 0.35);
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

  return { total, draw };
}
