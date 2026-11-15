// Planejador da baliza de ré: o carro passa da vaga, para com a frente virada para o outro lado do corredor
// e entra de ré, terminando reto e de frente para o corredor. Testa várias manobras (onde parar, ângulo,
// curvas) e fica com a que passa mais longe dos carros vizinhos, pilares e paredes (caixas orientadas, SAT)
// e com o volante menos esterçado.
import * as THREE from "three";
import { WALL, type Box } from "./garage";

/** heading (rotation.y do three.js): frente = (sin th, cos th) */
export const headingOf = (dx: number, dz: number) => Math.atan2(dx, dz);

/** Menor folga entre duas caixas (lado de fora > 0; dentro < 0). Limite inferior da distância real. */
export function gap(a: Box, b: Box) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  let best = -Infinity;
  const axes = [a.ang, a.ang + Math.PI / 2, b.ang, b.ang + Math.PI / 2];
  for (const t of axes) {
    // eixo x local de um objeto girado por t: (cos t, -sin t)
    const ux = Math.cos(t),
      uz = -Math.sin(t);
    const ra =
      a.hw * Math.abs(Math.cos(a.ang) * ux - Math.sin(a.ang) * uz) +
      a.hd * Math.abs(Math.sin(a.ang) * ux + Math.cos(a.ang) * uz);
    const rb =
      b.hw * Math.abs(Math.cos(b.ang) * ux - Math.sin(b.ang) * uz) +
      b.hd * Math.abs(Math.sin(b.ang) * ux + Math.cos(b.ang) * uz);
    const g = Math.abs(dx * ux + dz * uz) - ra - rb;
    if (g > best) best = g;
  }
  return best;
}

type P = { x: number; z: number };
function bez(p0: P, p1: P, p2: P, p3: P, step = 0.2): P[] {
  const approx =
    Math.hypot(p1.x - p0.x, p1.z - p0.z) +
    Math.hypot(p2.x - p1.x, p2.z - p1.z) +
    Math.hypot(p3.x - p2.x, p3.z - p2.z);
  const n = Math.max(8, Math.ceil(approx / step));
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      u = 1 - t;
    out.push({
      x:
        u * u * u * p0.x +
        3 * u * u * t * p1.x +
        3 * u * t * t * p2.x +
        t * t * t * p3.x,
      z:
        u * u * u * p0.z +
        3 * u * u * t * p1.z +
        3 * u * t * t * p2.z +
        t * t * t * p3.z,
    });
  }
  return out;
}
/** Bézier entre duas poses (pontos + direção de saída/chegada). */
function bezPose(a: P, ha: P, b: P, hb: P, ka?: number, kb?: number) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const k1 = ka ?? d / 3,
    k2 = kb ?? d / 3;
  return bez(
    a,
    { x: a.x + ha.x * k1, z: a.z + ha.z * k1 },
    { x: b.x - hb.x * k2, z: b.z - hb.z * k2 },
    b,
  );
}

/** Percurso: pontos com comprimento acumulado; o carro anda por ele pela distância. */
export class Track {
  pts: THREE.Vector3[];
  cum: number[] = [0];
  len: number;
  constructor(pts: THREE.Vector3[]) {
    this.pts = pts;
    for (let i = 1; i < pts.length; i++)
      this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.len = this.cum[this.cum.length - 1];
  }
  at(s: number, out = new THREE.Vector3()) {
    s = THREE.MathUtils.clamp(s, 0, this.len);
    let lo = 0,
      hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] <= s) lo = m;
      else hi = m;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    return out.lerpVectors(
      this.pts[lo],
      this.pts[hi],
      (s - this.cum[lo]) / seg,
    );
  }
}

const poses = (pts: P[], reverse: boolean) =>
  pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    const th = headingOf(b.x - a.x, b.z - a.z) + (reverse ? Math.PI : 0);
    return { x: p.x, z: p.z, th };
  });
function maxCurv(ps: { x: number; z: number; th: number }[]) {
  let k = 0;
  for (let i = 2; i < ps.length; i++) {
    const ds = Math.hypot(ps[i].x - ps[i - 2].x, ps[i].z - ps[i - 2].z);
    if (ds < 1e-3) continue;
    let d = ps[i].th - ps[i - 2].th;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    k = Math.max(k, Math.abs(d) / ds);
  }
  return k;
}

export type Plan = {
  approach: P[];
  reverse: P[];
  clear: number;
  endTh: number;
};

/**
 * Planeja a manobra até a vaga (coordenadas da garagem). `from` = ponto logo depois do portão, indo para -x.
 * `car` = meia largura/meio comprimento do carro; `obstacles` = paredes, pilares e carros parados.
 */
export function planPark(
  spot: { x: number; side: -1 | 1 },
  car: { W: number; L: number },
  obstacles: Box[],
  from: P,
): Plan {
  const s = spot.side,
    sx = spot.x;
  const endAbs = WALL - 0.32 - car.L / 2;
  const end = { x: sx, z: s * endAbs };
  const endTh = s > 0 ? Math.PI : 0; // frente para o corredor
  const near = obstacles
    .filter((o) => Math.abs(o.x - sx) < 12 || o.hw > 6)
    .map((o) => ({ ...o, r: Math.hypot(o.hw, o.hd) }));
  const me = { x: 0, z: 0, hw: car.W / 2 + 0.06, hd: car.L / 2 + 0.03, ang: 0 };
  const rMe = Math.hypot(me.hw, me.hd);
  const clearance = (
    ps: { x: number; z: number; th: number }[],
    stopBelow: number,
  ) => {
    let c = Infinity;
    for (let i = 0; i < ps.length; i += 1) {
      me.x = ps[i].x;
      me.z = ps[i].z;
      me.ang = ps[i].th;
      for (const o of near) {
        // longe demais para mudar o mínimo: nem testa as caixas
        if (Math.hypot(o.x - me.x, o.z - me.z) - rMe - o.r > c) continue;
        const g = gap(me, o);
        if (g < c) {
          c = g;
          if (c < stopBelow) return c;
        }
      }
    }
    return c;
  };
  // centraliza o carro entre os vizinhos (eles nunca param exatamente no meio da vaga)
  let fit = -Infinity;
  for (const ox of [-0.12, -0.08, -0.04, 0, 0.04, 0.08, 0.12]) {
    const c = clearance([{ x: sx + ox, z: s * endAbs, th: endTh }], -Infinity);
    if (c > fit + 0.005) {
      fit = c;
      end.x = sx + ox;
    }
  }
  const ex = end.x;
  const W = { x: -1, z: 0 };
  let best: (Plan & { score: number }) | null = null;
  const appCache = new Map<string, { pts: P[]; clear: number; k: number }>();
  let any: (Plan & { score: number }) | null = null; // a menos ruim, se nenhuma passar limpa
  // a = quanto a frente vira para o outro lado; dx = quanto passa da vaga; c = quanto vai para o outro lado
  // (a ~90° com c grande = enfia a frente no vão do bicicletário/fim do corredor e entra de ré reto)
  // 1ª tentativa: pela mão direita; se não der (vaga do fim do corredor), abre pelo lado da vaga antes de virar
  const pass = (lz: number, lo: number) => {
    for (const a of [0.25, 0.45, 0.65, 0.85, 1.1, 1.35, 1.57])
      for (const dx of [
        -0.5, -0.25, 0, 0.25, 0.5, 1, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5,
      ])
        for (const c of [-1, 0, 1, 2, 3, 4, 5]) {
          const stop = { x: ex - dx, z: -s * c };
          const h = { x: -Math.cos(a), z: -s * Math.sin(a) };
          const key = `${a}|${dx}|${c}|${lz}|${lo}`;
          let app = appCache.get(key);
          if (!app) {
            let pts: P[];
            if (from.x - stop.x > lo + 3.5) {
              const l1 = { x: stop.x + lo, z: lz };
              pts = [
                ...bezPose(from, W, l1, W),
                ...bezPose(l1, W, stop, h).slice(1),
              ];
            } else pts = bezPose(from, W, stop, h);
            const ps = poses(pts, false);
            app = { pts, clear: clearance(ps, 0.02), k: maxCurv(ps) };
            appCache.set(key, app);
          }
          if (app.k > 0.34) continue;
          for (const k1 of [1.5, 2.5, 3.5])
            for (const k2 of [1.5, 2.5, 3.5]) {
              const rev = bez(
                stop,
                { x: stop.x - h.x * k1, z: stop.z - h.z * k1 },
                { x: ex, z: s * (endAbs - k2) },
                end,
              );
              const ps = poses(rev, true);
              const k = maxCurv(ps);
              if (k > 0.34) continue;
              const len = rev.length * 0.2;
              if (app.clear < 0.02) {
                if (best) continue;
                const cl = Math.min(app.clear, clearance(ps, -Infinity));
                if (!any || cl > any.score)
                  any = {
                    approach: app.pts,
                    reverse: rev,
                    clear: cl,
                    endTh,
                    score: cl,
                  };
                continue;
              }
              const clear = Math.min(
                app.clear,
                clearance(ps, best ? 0.02 : -Infinity),
              );
              if (clear < 0.02) {
                if (!best && (!any || clear > any.score))
                  any = {
                    approach: app.pts,
                    reverse: rev,
                    clear,
                    endTh,
                    score: clear,
                  };
                continue;
              }
              const score =
                Math.min(clear, 0.35) * 5 -
                Math.max(0, Math.max(k, app.k) - 0.2) * 8 -
                len * 0.03;
              if (!best || score > best.score)
                best = { approach: app.pts, reverse: rev, clear, endTh, score };
            }
        }
  };
  pass(-1.2, 7.5);
  if (!best)
    for (const [lz, lo] of [
      [s * 1.6, 5],
      [s * 1.6, 6],
      [s * 0.6, 5],
    ])
      if (!best) pass(lz, lo);
  return best ?? any!;
}
