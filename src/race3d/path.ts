// Linha do percurso medida por distância: at(s) devolve ponto e direção a `s` unidades da largada.
// Antes da largada (s < 0, pelotão) e depois da chegada a linha segue reta.
import * as THREE from "three";

export class Path {
  readonly length: number;
  private xs: Float32Array;
  private zs: Float32Array;
  private n: number;

  constructor(points: [number, number][]) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    this.length = curve.getLength();
    this.n = Math.max(2, Math.ceil(this.length));
    const pts = curve.getSpacedPoints(this.n);
    this.xs = new Float32Array(pts.map((p) => p.x));
    this.zs = new Float32Array(pts.map((p) => p.z));
  }

  /** Ponto (x, z) e direção (dx, dz) normalizada. */
  at(s: number, out = { x: 0, z: 0, dx: 1, dz: 0 }) {
    const { n, xs, zs } = this;
    if (s <= 0 || s >= this.length) {
      const i = s <= 0 ? 0 : n - 1;
      const dx = xs[i + 1] - xs[i], dz = zs[i + 1] - zs[i], l = Math.hypot(dx, dz) || 1;
      const base = s <= 0 ? 0 : n;
      const extra = s <= 0 ? s : s - this.length;
      out.dx = dx / l;
      out.dz = dz / l;
      out.x = xs[base] + out.dx * extra;
      out.z = zs[base] + out.dz * extra;
      return out;
    }
    const f = (s / this.length) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    out.x = xs[i] + (xs[i + 1] - xs[i]) * t;
    out.z = zs[i] + (zs[i + 1] - zs[i]) * t;
    const a = Math.max(0, i - 2), b = Math.min(n, i + 3);
    const dx = xs[b] - xs[a], dz = zs[b] - zs[a], l = Math.hypot(dx, dz) || 1;
    out.dx = dx / l;
    out.dz = dz / l;
    return out;
  }
}
