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

const BRAND_TITLE = "Anton, Impact, 'Arial Black', sans-serif";

export const THEMES: Record<ThemeId, Theme> = {
  marca: {
    name: "Marca (vermelho, preto e dourado)",
    background: (ctx) => {
      gradient(ctx, [[0, "#0d0d0d"], [0.55, "#3a0a0d"], [1, "#e3262e"]]);
      // Faixas diagonais como no site
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#e3262e";
      for (let x = -SLIDE_H; x < SLIDE_W; x += 160) {
        ctx.beginPath();
        ctx.moveTo(x, SLIDE_H);
        ctx.lineTo(x + 60, SLIDE_H);
        ctx.lineTo(x + 60 + SLIDE_H * 0.6, 0);
        ctx.lineTo(x + SLIDE_H * 0.6, 0);
        ctx.fill();
      }
      ctx.restore();
    },
    text: "#ffffff",
    muted: "rgba(255,255,255,0.86)",
    accent: "#ffc72c",
    titleFont: BRAND_TITLE,
    bodyFont: "'Helvetica Neue', Arial, sans-serif",
  },
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

/** Escreve uma linha com *destaques* na cor de destaque; o estado (dentro ou fora do destaque) passa de uma linha para a outra. */
function drawRich(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, color: string, accent: string, inside: boolean) {
  for (const part of line.split(/(\*)/)) {
    if (part === "*") {
      inside = !inside;
      continue;
    }
    ctx.fillStyle = inside ? accent : color;
    ctx.fillText(part, x, y);
    x += ctx.measureText(part).width;
  }
  return inside;
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

/** Tema com as cores de uma campanha (ex.: Outubro Rosa): fundo do tom escuro para a cor principal, letras da marca. */
function paletteTheme(p: NonNullable<CarouselDesign["palette"]>): Theme {
  return {
    ...THEMES.marca,
    name: "Cores do tema",
    background: (ctx) => gradient(ctx, [[0, p.secondary], [0.5, p.secondary], [1, p.primary]]),
    accent: p.accent,
  };
}

async function fontsReady(theme: Theme) {
  if (!theme.titleFont.startsWith("Anton") || typeof document === "undefined" || !document.fonts) return;
  await document.fonts.load("80px Anton").catch(() => undefined);
}

/** Desenha a foto do produto (inteira) num cartão branco de cantos arredondados. */
function productCard(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 36);
  ctx.fill();
  ctx.restore();
  const inner = size - 60;
  const scale = Math.min(inner / img.width, inner / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
}

export async function renderSlide(slide: Slide, index: number, total: number, design: CarouselDesign = {}): Promise<HTMLCanvasElement> {
  const theme = design.palette ? paletteTheme(design.palette) : THEMES[design.theme ?? "marca"] ?? THEMES.marca;
  await fontsReady(theme);
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

  // Com foto de produto: texto em cima e a foto num cartão embaixo
  const product = slide.product_image && !slide.image_url ? await loadImage(slide.product_image) : null;
  // Anton tem um peso só (sem negrito falso) e fica em maiúsculas, como no site
  const brandFont = theme.titleFont === BRAND_TITLE;
  const titleWeight = brandFont ? "400" : "700";
  const titleText = brandFont ? (slide.title || "").toUpperCase() : slide.title || "";
  const title = fit(ctx, titleText, theme.titleFont, titleWeight, isCover ? 104 : 80, 44, maxWidth, product ? 3 : isCover ? 6 : 5);
  const body = slide.body ? fit(ctx, slide.body, theme.bodyFont, "400", product ? 38 : 46, 28, maxWidth, product ? 3 : 9) : { size: 0, lines: [] as string[] };
  const titleLH = title.size * 1.15;
  const bodyLH = body.size * 1.4;
  const gap = body.lines.length ? (product ? 28 : 48) : 0;
  const blockH = title.lines.length * titleLH + gap + body.lines.length * bodyLH;
  let y = (product ? pad + 80 : Math.max(pad + 80, (SLIDE_H - blockH) / 2)) + title.size * 0.85;
  if (product) {
    const top = pad + 80 + blockH + 48;
    const size = Math.min(maxWidth, SLIDE_H - pad - 70 - top);
    if (size > 200) productCard(ctx, product, (SLIDE_W - size) / 2, top, size);
  }

  ctx.font = `${titleWeight} ${title.size}px ${theme.titleFont}`;
  let highlight = false;
  for (const line of title.lines) {
    highlight = drawRich(ctx, line, pad, y, text, theme.accent, highlight);
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
