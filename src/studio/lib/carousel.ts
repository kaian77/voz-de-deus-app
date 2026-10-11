// Renderiza slides de carrossel em canvas 1080x1350 (4:5) e exporta JPEG — o formato que o Instagram aceita.
import type { CarouselDesign, Slide, ThemeId } from "./types";

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

interface Theme {
  name: string;
  background: (ctx: CanvasRenderingContext2D) => void;
  text: string;
  muted: string;
  accent: string;
  titleFont: string;
  bodyFont: string;
}

const gradient = (ctx: CanvasRenderingContext2D, stops: [number, string][]) => {
  const g = ctx.createLinearGradient(0, 0, SLIDE_W, SLIDE_H);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
};
const solid = (color: string) => (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
};

export const THEMES: Record<ThemeId, Theme> = {
  divino: {
    name: "Azul e dourado",
    background: (ctx) => gradient(ctx, [[0, "#0f2a6b"], [0.6, "#1d4ed8"], [1, "#c99a2e"]]),
    text: "#ffffff",
    muted: "rgba(255,255,255,0.82)",
    accent: "#f6d36b",
    titleFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "'Helvetica Neue', Arial, sans-serif",
  },
  claro: {
    name: "Minimal claro",
    background: solid("#fafaf9"),
    text: "#111827",
    muted: "#4b5563",
    accent: "#1d4ed8",
    titleFont: "'Helvetica Neue', Arial, sans-serif",
    bodyFont: "'Helvetica Neue', Arial, sans-serif",
  },
  escuro: {
    name: "Escuro elegante",
    background: solid("#0c0c10"),
    text: "#f8fafc",
    muted: "rgba(248,250,252,0.72)",
    accent: "#e5b84b",
    titleFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "'Helvetica Neue', Arial, sans-serif",
  },
  papel: {
    name: "Papel antigo",
    background: solid("#f3ead7"),
    text: "#3a2c20",
    muted: "#6b5745",
    accent: "#9a6b2f",
    titleFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "Georgia, 'Times New Roman', serif",
  },
  vibrante: {
    name: "Vibrante",
    background: (ctx) => gradient(ctx, [[0, "#7c3aed"], [0.55, "#db2777"], [1, "#f97316"]]),
    text: "#ffffff",
    muted: "rgba(255,255,255,0.88)",
    accent: "#fde047",
    titleFont: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
    bodyFont: "'Helvetica Neue', Arial, sans-serif",
  },
};

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/** Diminui a fonte até o texto caber no número máximo de linhas. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: string, weight: string, start: number, min: number, maxWidth: number, maxLines: number) {
  let size = start;
  let lines: string[] = [];
  while (size >= min) {
    ctx.font = `${weight} ${size}px ${font}`;
    lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines) break;
    size -= 4;
  }
  return { size, lines };
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(url: string) {
  if (!imageCache.has(url)) {
    imageCache.set(url, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    }));
  }
  return imageCache.get(url)!;
}

export async function renderSlide(slide: Slide, index: number, total: number, design: CarouselDesign = {}): Promise<HTMLCanvasElement> {
  const theme = THEMES[design.theme ?? "divino"];
  const canvas = document.createElement("canvas");
  canvas.width = SLIDE_W;
  canvas.height = SLIDE_H;
  const ctx = canvas.getContext("2d")!;
  theme.background(ctx);

  let text = theme.text;
  let muted = theme.muted;
  if (slide.image_url) {
    const img = await loadImage(slide.image_url);
    if (img) {
      const scale = Math.max(SLIDE_W / img.width, SLIDE_H / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (SLIDE_W - w) / 2, (SLIDE_H - h) / 2, w, h);
      const shade = ctx.createLinearGradient(0, 0, 0, SLIDE_H);
      shade.addColorStop(0, "rgba(0,0,0,0.25)");
      shade.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
      text = "#ffffff";
      muted = "rgba(255,255,255,0.85)";
    }
  }

  const pad = 96;
  const maxWidth = SLIDE_W - pad * 2;
  const isCover = index === 0;

  // Contador e barrinha de destaque
  ctx.fillStyle = muted;
  ctx.font = `600 30px ${theme.bodyFont}`;
  ctx.textAlign = "right";
  if (total > 1) ctx.fillText(`${index + 1}/${total}`, SLIDE_W - pad, pad);
  ctx.textAlign = "left";
  ctx.fillStyle = theme.accent;
  ctx.fillRect(pad, pad - 22, 84, 8);

  const title = fit(ctx, slide.title || "", theme.titleFont, "700", isCover ? 104 : 80, 44, maxWidth, isCover ? 6 : 5);
  const body = slide.body ? fit(ctx, slide.body, theme.bodyFont, "400", 46, 30, maxWidth, 9) : { size: 0, lines: [] as string[] };
  const titleLH = title.size * 1.15;
  const bodyLH = body.size * 1.4;
  const gap = body.lines.length ? 48 : 0;
  const blockH = title.lines.length * titleLH + gap + body.lines.length * bodyLH;
  let y = Math.max(pad + 80, (SLIDE_H - blockH) / 2) + title.size * 0.85;

  ctx.fillStyle = text;
  ctx.font = `700 ${title.size}px ${theme.titleFont}`;
  for (const line of title.lines) {
    ctx.fillText(line, pad, y);
    y += titleLH;
  }
  y += gap - titleLH + bodyLH;
  ctx.fillStyle = muted;
  ctx.font = `400 ${body.size}px ${theme.bodyFont}`;
  for (const line of body.lines) {
    ctx.fillText(line, pad, y);
    y += bodyLH;
  }

  // Rodapé: @ da conta e seta de "arraste"
  ctx.font = `600 32px ${theme.bodyFont}`;
  ctx.fillStyle = muted;
  const footer = slide.footer ?? design.handle ?? "";
  if (footer) ctx.fillText(footer, pad, SLIDE_H - pad + 10);
  if (index < total - 1) {
    ctx.textAlign = "right";
    ctx.fillStyle = theme.accent;
    ctx.font = `700 40px ${theme.bodyFont}`;
    ctx.fillText("→", SLIDE_W - pad, SLIDE_H - pad + 12);
  }
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))), "image/jpeg", quality),
  );
}

export async function renderSlidesToJpeg(slides: Slide[], design?: CarouselDesign): Promise<Blob[]> {
  const out: Blob[] = [];
  for (let i = 0; i < slides.length; i++) out.push(await canvasToJpeg(await renderSlide(slides[i], i, slides.length, design)));
  return out;
}
