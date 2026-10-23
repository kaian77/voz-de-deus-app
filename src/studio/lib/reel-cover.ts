export const REEL_COVER_SIZE = { width: 1080, height: 1920 };

/** Sugere uma cor inicial para a capa a partir do nicho; a marca pode escolher e salvar outra. */
export function suggestCoverAccent(niche: string | null | undefined) {
  const value = (niche ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/nutri|saude|fitness|bem-estar|esport|terapia|sustent|natureza/.test(value)) return "#16875d";
  if (/beleza|estetica|moda|maqui|cabelo|unha/.test(value)) return "#db2777";
  if (/gastr|culin|confeit|restaurante|comida|chef/.test(value)) return "#ea580c";
  if (/financ|invest|contabil|negocio|empreend/.test(value)) return "#0f766e";
  if (/educa|ensino|professor|idioma|curso/.test(value)) return "#2563eb";
  if (/tecnolog|marketing|design|criador|social media/.test(value)) return "#7c3aed";
  return "#7c3aed";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Gera uma capa 9:16 para Reels com uma área central segura para o corte da grade. */
export async function renderReelCover(input: { title: string; niche: string; handle?: string; accent?: string }) {
  const canvas = document.createElement("canvas");
  canvas.width = REEL_COVER_SIZE.width;
  canvas.height = REEL_COVER_SIZE.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não consegui montar a capa neste navegador.");
  const accent = /^#[0-9a-f]{6}$/i.test(input.accent ?? "") ? input.accent! : "#7c3aed";
  const { width, height } = REEL_COVER_SIZE;

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#111116");
  background.addColorStop(0.58, "#20202c");
  background.addColorStop(1, accent);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.82, height * 0.22, 5, width * 0.82, height * 0.22, 560);
  glow.addColorStop(0, `${accent}bb`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  for (let x = -height; x < width; x += 125) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height * 0.7, 0);
    ctx.stroke();
  }
  ctx.restore();

  const safeTop = 470;
  const safeBottom = 1450;
  ctx.fillStyle = "rgba(10,10,14,.58)";
  ctx.beginPath();
  ctx.roundRect(64, safeTop, width - 128, safeBottom - safeTop, 46);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(118, safeTop + 70, 15, 72, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.74)";
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText((input.niche || "INSTAGRAM").toLocaleUpperCase("pt-BR").slice(0, 30), 160, safeTop + 107);

  const title = input.title.trim().slice(0, 90) || "Uma ideia para você";
  let fontSize = 110;
  let lines: string[];
  do {
    ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
    lines = wrap(ctx, title.toLocaleUpperCase("pt-BR"), width - 240);
    if (lines.length <= 4) break;
    fontSize -= 6;
  } while (fontSize > 68);

  const lineHeight = fontSize * 1.08;
  const titleBlock = lines.length * lineHeight;
  let y = safeTop + 300 + Math.max(0, (500 - titleBlock) / 2);
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,.24)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  for (const line of lines) {
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, 118, y, width - 236);
    y += lineHeight;
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(118, safeTop + 830, 240, 10, 5);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText("ASSISTA ATÉ O FINAL", 118, safeBottom - 90);

  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(input.handle ? `@${input.handle.replace(/^@/, "")}` : "SEU PERFIL", width / 2, 1660);
  ctx.textAlign = "start";

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não consegui exportar a capa.")), "image/jpeg", 0.92));
}
