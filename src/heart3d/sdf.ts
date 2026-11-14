// Campo de distância (SDF) do coração: formas simples (elipsoides e tubos) somadas com união suave,
// para a superfície sair orgânica. Unidade ~ 1 cm. Eixos: x = esquerda do paciente, y = para cima, z = para a frente.
export type V3 = [number, number, number];

export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** Elipsoide orientado: centro, eixo longo (direção) e semieixos (ao longo do eixo, largura, profundidade). */
export class Ellipsoid {
  private u: V3;
  private v: V3;
  private w: V3;
  readonly box: [V3, V3];
  constructor(
    readonly c: V3,
    axis: V3,
    readonly r: V3,
  ) {
    this.u = norm(axis);
    // segundo eixo: o mais perto de "para a frente" (z) que seja perpendicular ao primeiro
    const ref: V3 = Math.abs(this.u[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    this.w = norm(sub(ref, scale(this.u, dot(ref, this.u))));
    this.v = cross(this.w, this.u);
    const m = Math.max(...r);
    this.box = [
      [c[0] - m, c[1] - m, c[2] - m],
      [c[0] + m, c[1] + m, c[2] + m],
    ];
  }
  d(x: number, y: number, z: number) {
    const px = x - this.c[0], py = y - this.c[1], pz = z - this.c[2];
    const a = (px * this.u[0] + py * this.u[1] + pz * this.u[2]) / this.r[0];
    const b = (px * this.v[0] + py * this.v[1] + pz * this.v[2]) / this.r[1];
    const c = (px * this.w[0] + py * this.w[1] + pz * this.w[2]) / this.r[2];
    const k0 = Math.sqrt(a * a + b * b + c * c);
    const a2 = a / this.r[0], b2 = b / this.r[1], c2 = c / this.r[2];
    const k1 = Math.sqrt(a2 * a2 + b2 * b2 + c2 * c2);
    return k1 < 1e-9 ? -Math.min(...this.r) : (k0 * (k0 - 1)) / k1;
  }
}

/** Tubo (vaso) pelos pontos, com raio que varia ponto a ponto. */
export class Tube {
  readonly pts: V3[];
  readonly rad: number[];
  readonly box: [V3, V3];
  constructor(ctrl: V3[], radius: number | number[], samples = 10) {
    const pts: V3[] = [];
    const rad: number[] = [];
    const rr = (i: number) => (Array.isArray(radius) ? radius[Math.min(i, radius.length - 1)] : radius);
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(i - 1, 0)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(i + 2, ctrl.length - 1)];
      for (let s = 0; s < samples; s++) {
        const t = s / samples;
        pts.push(catmull(p0, p1, p2, p3, t));
        rad.push(rr(i) + (rr(i + 1) - rr(i)) * t);
      }
    }
    pts.push(ctrl[ctrl.length - 1]);
    rad.push(rr(ctrl.length - 1));
    this.pts = pts;
    this.rad = rad;
    const m = Math.max(...rad);
    const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const p of pts)
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p[k] - m);
        hi[k] = Math.max(hi[k], p[k] + m);
      }
    this.box = [lo, hi];
  }
  d(x: number, y: number, z: number) {
    let best = Infinity;
    const P = this.pts, R = this.rad;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const l2 = bx * bx + by * by + bz * bz || 1e-9;
      const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / l2));
      const dx = px - bx * t, dy = py - by * t, dz = pz - bz * t;
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz) - (R[i] + (R[i + 1] - R[i]) * t);
      if (dd < best) best = dd;
    }
    return best;
  }
}

export type Shape = Ellipsoid | Tube;

/** Distância com recorte pela caixa: longe da forma devolve só uma estimativa barata. */
export function far(s: Shape, x: number, y: number, z: number, pad: number) {
  const [lo, hi] = s.box;
  const dx = Math.max(lo[0] - pad - x, 0, x - hi[0] - pad);
  const dy = Math.max(lo[1] - pad - y, 0, y - hi[1] - pad);
  const dz = Math.max(lo[2] - pad - z, 0, z - hi[2] - pad);
  return dx + dy + dz > 0 ? pad + Math.sqrt(dx * dx + dy * dy + dz * dz) : -1;
}

export function catmull(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const t2 = t * t, t3 = t2 * t;
  const f = (i: number) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  return [f(0), f(1), f(2)];
}
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
