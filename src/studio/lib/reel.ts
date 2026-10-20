// Reels a partir dos slides do carrossel: cada slide entra deslizando num quadro 9:16 (1080x1920), com barrinhas
// de progresso no topo e a marca embaixo, gravado do canvas em MP4 (MediaRecorder) — sem servidor de vídeo.
import { renderSlide, SLIDE_H, SLIDE_W } from "./carousel";
import { scheduleReelAudio, type Cue } from "./reel-audio";
import { paginasproReel, type ReelScene } from "./reel-motion";
import type { CarouselDesign, Slide } from "./types";

const W = 1080;
const H = 1920;
const FPS = 30;

const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

function mp4Type() {
  // Com som (AAC) primeiro; sem suporte, o vídeo sai mudo mesmo
  const types = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"];
  return typeof MediaRecorder !== "undefined" ? types.find((t) => MediaRecorder.isTypeSupported(t)) : undefined;
}

export const reelSupported = () => !!mp4Type();

/** Grava o Reel dos slides e devolve o MP4 (leva o tempo do vídeo: ~3 s por slide; a aba precisa ficar aberta). */
export async function renderReel(slides: Slide[], design: CarouselDesign = {}, scene?: ReelScene): Promise<Blob> {
  const type = mp4Type();
  if (!type) throw new Error("Este navegador não grava MP4. Aprove este Reel pelo Chrome (computador ou celular) ou pelo Safari do iPhone.");
  const pp = design.theme === "paginaspro";
  if (pp && document.fonts) {
    await Promise.all(["800 58px 'Inter Tight'", "400 40px 'Inter Tight'", "italic 400 62px 'Instrument Serif'"].map((f) => document.fonts.load(f).catch(() => undefined)));
  }
  // PáginasPro: Reel animado de verdade (gancho, sem site × com site, cartões, chamada)
  if (pp) {
    // Cena do meio muda de um Reel para outro (fixa por post: depende do texto do gancho)
    const scenes = ["compare", "persona", "counter"] as const;
    const seed = [...(slides[0]?.title ?? "")].reduce((a, c) => a + c.charCodeAt(0), 0);
    const motion = paginasproReel(slides, scene ?? scenes[seed % scenes.length]);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    return record(canvas, type, motion.total, (t) => motion.draw(ctx, t), motion.cues);
  }
  const frames = await Promise.all(slides.map((s, i) => renderSlide(s, i, slides.length, design)));
  const bg = pp ? "#111110" : "#0c0c0c";
  const ink = pp ? "#f3f1ea" : "#ffffff";
  const accent = pp ? "#d4ff3f" : "#ffc72c";
  const per = slides.map((_, i) => (i === 0 ? 3.4 : 3.0));
  const total = per.reduce((a, b) => a + b, 0) + 0.6;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const scale = W / SLIDE_W;
  const slideH = SLIDE_H * scale;
  const top = (H - slideH) / 2;

  const draw = (t: number) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Qual slide e há quanto tempo
    let i = 0;
    let start = 0;
    while (i < per.length - 1 && t >= start + per[i]) start += per[i++];
    const local = t - start;
    // Slide anterior saindo para a esquerda enquanto o atual entra
    const enter = ease(local / 0.45);
    if (i > 0 && enter < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - enter;
      ctx.drawImage(frames[i - 1], -W * 0.35 * enter, top, W, slideH);
      ctx.restore();
    }
    const zoom = 0.94 + 0.06 * enter + 0.02 * Math.min(local / per[i], 1);
    const w = W * zoom;
    const h = slideH * zoom;
    ctx.save();
    ctx.globalAlpha = i === 0 ? Math.min(1, local / 0.3) : enter;
    ctx.drawImage(frames[i], (W - w) / 2 + W * 0.35 * (1 - enter) * (i === 0 ? 0 : 1), top + (slideH - h) / 2, w, h);
    ctx.restore();

    // Barrinhas de progresso (estilo stories)
    const gap = 10;
    const bw = (W - 96 * 2 - gap * (per.length - 1)) / per.length;
    per.forEach((d, k) => {
      const x = 96 + k * (bw + gap);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x, 120, bw, 8);
      const fill = k < i ? 1 : k === i ? Math.min(local / d, 1) : 0;
      ctx.fillStyle = accent;
      ctx.fillRect(x, 120, bw * fill, 8);
    });

    // Marca embaixo
    ctx.textAlign = "center";
    ctx.font = "800 58px 'Inter Tight', 'Helvetica Neue', Arial, sans-serif";
    const brand = pp ? "Páginas" : (design.handle ?? "");
    const tail = pp ? "pro" : "";
    const bw2 = ctx.measureText(brand).width;
    ctx.font = "italic 400 62px 'Instrument Serif', Georgia, serif";
    const tw = tail ? ctx.measureText(tail).width : 0;
    const x0 = W / 2 - (bw2 + tw) / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = ink;
    ctx.font = "800 58px 'Inter Tight', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText(brand, x0, H - 210);
    if (tail) {
      ctx.fillStyle = accent;
      ctx.font = "italic 400 62px 'Instrument Serif', Georgia, serif";
      ctx.fillText(tail, x0 + bw2 + 4, H - 210);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(243,241,234,0.6)";
    ctx.font = "500 34px 'Inter Tight', 'Helvetica Neue', Arial, sans-serif";
    if (pp) ctx.fillText("paginaspro.app.br  ·  chama no direct", W / 2, H - 150);
    ctx.textAlign = "left";
  };

  return record(canvas, type, total, draw);
}

/** Desenha `draw(t)` a 30 quadros por segundo durante `total` segundos e grava o canvas em MP4. */
async function record(canvas: HTMLCanvasElement, type: string, total: number, draw: (t: number) => void, cues?: Cue[]): Promise<Blob> {
  draw(0);
  const stream = canvas.captureStream(FPS);
  // Som: trilha + efeitos sintetizados, gravados junto com o vídeo
  let audio: AudioContext | null = null;
  let audioStart = 0;
  if (cues && type.includes("mp4a") && typeof AudioContext !== "undefined") {
    try {
      audio = new AudioContext();
      await audio.resume();
      const dest = audio.createMediaStreamDestination();
      audioStart = audio.currentTime + 0.15;
      scheduleReelAudio(audio, dest, total, cues, audioStart);
      dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    } catch {
      audio = null;
    }
  }
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => (recorder.onstop = () => resolve(new Blob(chunks, { type: "video/mp4" }))));
  recorder.start(500);
  // Animação começa junto com o som
  if (audio) await new Promise((r) => setTimeout(r, Math.max(0, (audioStart - audio!.currentTime) * 1000)));
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    // setInterval (não requestAnimationFrame): continua desenhando mesmo se o celular baixar a prioridade da aba
    const timer = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      draw(Math.min(t, total));
      if (t >= total) {
        clearInterval(timer);
        resolve();
      }
    }, 1000 / FPS);
  });
  recorder.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  const blob = await done;
  await audio?.close().catch(() => undefined);
  return blob;
}
