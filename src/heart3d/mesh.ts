// Superfície do campo de distância por "surface nets" (um vértice por célula que a superfície corta, quadriláteros
// entre células vizinhas). Para ir rápido no celular: primeiro uma grade grossa e só refina perto da superfície.
import type { V3 } from "./sdf";

export type MeshData = { pos: Float32Array; nor: Float32Array; idx: Uint32Array };

export function surfaceNets(f: (x: number, y: number, z: number) => number, bounds: [V3, V3], h: number): MeshData {
  const [lo, hi] = bounds;
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const C = 4; // grade grossa: 1 ponto a cada 4
  const cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++)
    coarse[i + cx * (j + cy * k)] = f(lo[0] + i * C * h, lo[1] + j * C * h, lo[2] + k * C * h);
  const band = C * h * 1.9;
  const val = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ci = Math.round(i / C), cj = Math.round(j / C), ck = Math.round(k / C);
    const g = coarse[Math.min(ci, cx - 1) + cx * (Math.min(cj, cy - 1) + cy * Math.min(ck, cz - 1))];
    val[i + nx * (j + ny * k)] = Math.abs(g) > band ? g : f(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h);
  }

  // vértice por célula: média dos pontos onde as arestas cruzam o zero
  const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos: number[] = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = val[i + (c & 1) + nx * (j + ((c >> 1) & 1) + ny * (k + (c >> 2)))];
      cv[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      const va = cv[a], vb = cv[b];
      if (va < 0 === vb < 0) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t;
      sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
      sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
      n++;
    }
    vid[i + (nx - 1) * (j + (ny - 1) * k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }

  // faces: cada aresta da grade que troca de sinal vira um quadrilátero com as 4 células em volta
  const idx: number[] = [];
  const cell = (i: number, j: number, k: number) => vid[i + (nx - 1) * (j + (ny - 1) * k)];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = val[i + nx * (j + ny * k)];
    for (let ax = 0; ax < 3; ax++) {
      const ni = i + (ax === 0 ? 1 : 0), nj = j + (ax === 1 ? 1 : 0), nk = k + (ax === 2 ? 1 : 0);
      if (ni >= nx || nj >= ny || nk >= nz) continue;
      const v1 = val[ni + nx * (nj + ny * nk)];
      if (v0 < 0 === v1 < 0) continue;
      let q: number[];
      if (ax === 0) q = [cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k)];
      else if (ax === 1) q = [cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1)];
      else q = [cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k)];
      if (q.some((x) => x < 0)) continue;
      if (v0 < 0) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      else idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    }
  }

  // normais pelo gradiente do campo (superfície lisa, sem facetas)
  const P = new Float32Array(pos);
  const N = new Float32Array(P.length);
  const e = h * 0.5;
  for (let v = 0; v < P.length; v += 3) {
    const x = P[v], y = P[v + 1], z = P[v + 2];
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    N[v] = gx / l;
    N[v + 1] = gy / l;
    N[v + 2] = gz / l;
  }
  return { pos: P, nor: N, idx: new Uint32Array(idx) };
}
