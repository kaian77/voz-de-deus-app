// Ilustrações dos exercícios (RepDB, plano grátis: uso dentro do app com o crédito "Exercise data by RepDB (repdb.co)"
// visível — está no Perfil e embaixo da lista de exercícios; NÃO usar as animações pagas de premium-samples).
// Cada exercício tem a posição inicial e a final (public/treino/ex/<id>-start|peak.webp); a imagem vai e volta entre
// as duas com uma troca suave, como uma animação. Exercício parado (prancha, burpee) tem uma só ("main").
import type { ExId } from "./data";

/** Gasto do exercício (MET do RepDB) para estimar as calorias. */
export const MET: Record<ExId, number> = {
  squat: 6, pushup: 5, pullup: 6, curl: 5, press: 6, lunge: 6, plank: 3.5, lateral: 5, bridge: 3.5, jack: 8, stiff: 6, row: 6, burpee: 8, situp: 5,
};

const SINGLE = new Set<ExId>(["plank", "burpee"]);
export const CREDIT = `Ilustrações e dados dos exercícios: <a href="https://repdb.co" target="_blank" rel="nofollow noopener">Exercise data by RepDB (repdb.co)</a>`;

interface Pair { a: HTMLImageElement; b: HTMLImageElement | null; ok: boolean }
const cache = new Map<ExId, Pair>();

function img(src: string, done: () => void) {
  const i = new Image();
  i.decoding = "async";
  i.onload = done;
  i.src = src;
  return i;
}

function get(ex: ExId): Pair {
  let p = cache.get(ex);
  if (p) return p;
  let left = SINGLE.has(ex) ? 1 : 2;
  const fin = () => { if (--left === 0) p!.ok = true; };
  p = SINGLE.has(ex)
    ? { a: img(`/treino/ex/${ex}-main.webp`, fin), b: null, ok: false }
    : { a: img(`/treino/ex/${ex}-start.webp`, fin), b: img(`/treino/ex/${ex}-peak.webp`, fin), ok: false };
  cache.set(ex, p);
  return p;
}

/** Carrega todas antes (a tela do treino não fica esperando). */
export function preloadArt(list: ExId[]) { for (const e of list) get(e); }

export interface ArtOpts { time: number; x: number; y: number; size: number; bg?: boolean; speed?: number }

/** Desenha a ilustração "animada". Devolve false se ainda não carregou (aí vale o Tonhão 3D/2D). */
export function drawArt(g: CanvasRenderingContext2D, ex: ExId, o: ArtOpts): boolean {
  const p = get(ex);
  if (!p.ok) return false;
  const s = o.size;
  g.save();
  g.translate(o.x, o.y);
  g.beginPath();
  g.roundRect(0, 0, s, s, s * 0.08);
  g.clip();
  g.fillStyle = "#dcebf8";
  g.fillRect(0, 0, s, s);
  // vai e volta: para um pouco em cada posição, troca suave no meio
  const ph = (o.time * (o.speed ?? 0.45)) % 1;
  const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
  const k = Math.min(1, Math.max(0, (tri - 0.42) / 0.16));
  const ease = k * k * (3 - 2 * k);
  const zoom = 1.02 + 0.015 * Math.sin(o.time * 0.7);
  const d = s * zoom, off = (s - d) / 2;
  g.drawImage(p.a, off, off, d, d);
  if (p.b) {
    g.globalAlpha = ease;
    g.drawImage(p.b, off, off, d, d);
    g.globalAlpha = 1;
  }
  g.restore();
  if (o.bg) {
    g.save();
    g.translate(o.x, o.y);
    g.strokeStyle = "rgba(212,255,63,.9)";
    g.lineWidth = Math.max(2, s / 90);
    g.beginPath(); g.roundRect(0, 0, s, s, s * 0.08); g.stroke();
    g.restore();
  }
  return true;
}
