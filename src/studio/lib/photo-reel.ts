// Reel a partir de fotos (Postar rápido): cada foto entra com zoom lento sobre um fundo desfocado da própria
// foto, troca com fade, nome do produto em Anton no alto e som (batida + whoosh) gravado junto.
import { mp4Type, record } from "./reel";
import type { Cue } from "./reel-audio";

const W = 1080;
const H = 1920;
const PER = 2.8; // segundos por foto
const FADE = 0.45;

function load(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Não consegui abrir uma das fotos"));
    im.src = url;
  });
}

/** Fundo: a foto esticada e desfocada (sem faixa preta); frente: a foto inteira com zoom lento. */
function frameOf(im: HTMLImageElement) {
  const bg = document.createElement("canvas");
  bg.width = W / 4;
  bg.height = H / 4;
  const b = bg.getContext("2d")!;
  const k = Math.max(bg.width / im.width, bg.height / im.height);
  b.filter = "blur(10px) brightness(0.6)";
  b.drawImage(im, (bg.width - im.width * k) / 2, (bg.height - im.height * k) / 2, im.width * k, im.height * k);
  return bg;
}

export async function renderPhotoReel(urls: string[], title?: string): Promise<Blob> {
  const type = mp4Type();
  if (!type) throw new Error("Este navegador não grava vídeo. Use o Chrome (computador ou celular) ou o Safari do iPhone.");
  if (document.fonts) await document.fonts.load("64px 'Anton'").catch(() => undefined);
  const images = await Promise.all(urls.slice(0, 10).map(load));
  const bgs = images.map(frameOf);
  const total = images.length * PER + 0.4;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const name = (title ?? "").trim().toUpperCase();

  const drawPhoto = (i: number, local: number, alpha: number) => {
    const im = images[i];
    ctx.globalAlpha = alpha;
    ctx.drawImage(bgs[i], 0, 0, W, H);
    const zoom = 1 + 0.07 * Math.min(local / PER, 1);
    const k = Math.min((W * 0.92) / im.width, (H * 0.7) / im.height) * zoom;
    const w = im.width * k;
    const h = im.height * k;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 40;
    ctx.drawImage(im, (W - w) / 2, (H - h) / 2 + 60, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  const draw = (t: number) => {
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, W, H);
    const i = Math.min(images.length - 1, Math.floor(t / PER));
    const local = t - i * PER;
    if (i > 0 && local < FADE) drawPhoto(i - 1, local + PER, 1);
    drawPhoto(i, local, i > 0 ? Math.min(1, local / FADE) : 1);
    if (name) {
      // nome no alto, entra de cima no começo
      const enter = Math.min(1, t / 0.5);
      ctx.save();
      ctx.textAlign = "center";
      let size = 104;
      ctx.font = `${size}px 'Anton', Impact, sans-serif`;
      while (ctx.measureText(name).width > W * 0.86 && size > 50) ctx.font = `${(size -= 4)}px 'Anton', Impact, sans-serif`;
      const y = 250 - (1 - enter) * 80;
      ctx.globalAlpha = enter;
      ctx.fillStyle = "#E3262E";
      const tw = ctx.measureText(name).width;
      ctx.fillRect((W - tw) / 2 - 36, y - size * 0.95, tw + 72, size * 1.25);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(name, W / 2, y);
      ctx.restore();
    }
  };
  const cues: Cue[] = images.map((_, i) => ({ t: i * PER, kind: i === 0 ? "pop" : "whoosh" }));
  cues.push({ t: total - 0.6, kind: "ding" });
  return record(canvas, type, total, draw, cues);
}
