// Gera os modelos do coração 3D (public/coracao/<tipo>.bin + .json) a partir da anatomia em src/heart3d/anatomy.ts.
// O cálculo é pesado (vários segundos), então roda uma vez aqui e o celular só baixa o resultado compactado (meshopt).
// Uso: npx tsx scripts/heart-mesh.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { MeshoptEncoder } from "meshoptimizer";
import { buildHeart, type Heart, type Kind, type Part } from "../src/heart3d/anatomy";
import { surfaceNets } from "../src/heart3d/mesh";
import { cross, norm, type V3 } from "../src/heart3d/sdf";

export const PARTS: Part[] = ["lv", "rv", "ra", "la", "aorta", "pa", "vc", "pv"];
const H_STEP = 0.085;
// cores (sRGB) por parte: lv rv ra la aorta pa vc pv — por fora e por dentro (endocárdio / parede interna dos vasos)
const OUT_COL = [0x6e1f19, 0x76231c, 0x8a3a31, 0x853630, 0xc0392e, 0x3d5ea8, 0x37558f, 0xa23b36];
const IN_COL = [0xb24a40, 0xab473e, 0xb5574d, 0xbb5a4f, 0xb8453c, 0x5d6eac, 0x5a6aa0, 0xad4a43];
const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const OUT = new URL("../public/coracao/", import.meta.url).pathname;

function grad(f: (x: number, y: number, z: number) => number, p: V3, e = 0.03): V3 {
  return norm([f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e)]);
}
/** Leva o ponto até a superfície de fora (e um pouco para fora, para o vaso ficar por cima). */
function project(H: Heart, p: V3, lift = 0): V3 {
  let q: V3 = [...p];
  for (let i = 0; i < 6; i++) {
    const d = H.outer(...q);
    const n = grad(H.outer, q);
    q = [q[0] - n[0] * d, q[1] - n[1] * d, q[2] - n[2] * d];
  }
  const n = grad(H.outer, q);
  return [q[0] + n[0] * lift, q[1] + n[1] * lift, q[2] + n[2] * lift];
}
/** Superfície de fora ao longo de um raio que sai de dentro. */
function hit(H: Heart, c: V3, d: V3): V3 | null {
  let a = 0, b = 0;
  for (let t = 0.1; t < 7; t += 0.1) {
    if (H.outer(c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t) > 0) {
      a = t - 0.1;
      b = t;
      break;
    }
  }
  if (!b) return null;
  for (let i = 0; i < 20; i++) {
    const m = (a + b) / 2;
    if (H.outer(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) > 0) b = m;
    else a = m;
  }
  return [c[0] + d[0] * a, c[1] + d[1] * a, c[2] + d[2] * a];
}
const minOf = (o: Partial<Record<Part, number>>, ps: Part[]) => Math.min(...ps.map((p) => o[p] ?? 99));
const VENT: Part[] = ["lv", "rv"], ATR: Part[] = ["ra", "la"];

function smooth(pts: V3[], n = 3): V3[] {
  let a = pts;
  for (let k = 0; k < n; k++) a = a.map((p, i) => (i === 0 || i === a.length - 1 ? p : ([0, 1, 2].map((j) => (a[i - 1][j] + 2 * p[j] + a[i + 1][j]) / 4) as V3)));
  return a;
}

/** Sulcos onde correm as coronárias: interventricular (anterior e posterior) e atrioventricular (em volta da base). */
function coronaries(H: Heart) {
  const lvC: V3 = [1.25, -0.7, -0.55];
  const u = norm([0.45, -0.8, 0.38]);
  const e1 = norm(cross(u, [0, 0, 1])), e2 = cross(e1, u);
  const ring = (s: number, th: number): [V3, V3] => [
    [lvC[0] + u[0] * s, lvC[1] + u[1] * s, lvC[2] + u[2] * s],
    norm([e1[0] * Math.cos(th) + e2[0] * Math.sin(th), e1[1] * Math.cos(th) + e2[1] * Math.sin(th), e1[2] * Math.cos(th) + e2[2] * Math.sin(th)]),
  ];
  // sulco interventricular: para cada altura no eixo do VE, o ângulo onde VE e VD se encontram
  const groove = (th0: number, th1: number) => {
    const out: V3[] = [];
    for (let s = -1.6; s <= 3.7; s += 0.25) {
      let best: V3 | null = null, bv = Infinity;
      for (let th = th0; th <= th1; th += 0.03) {
        const [c, d] = ring(s, th);
        const p = hit(H, c, d);
        if (!p) continue;
        const o = H.partDists(...p);
        const v = Math.abs((o.lv ?? 9) - (o.rv ?? 9)) + Math.max(0, Math.min(o.lv ?? 9, o.rv ?? 9)) * 2;
        if (v < bv) {
          bv = v;
          best = p;
        }
      }
      if (best && bv < 0.6) out.push(best);
    }
    return out;
  };
  // ângulo: e2 aponta mais ou menos para a frente; testa o semicírculo da frente e o de trás
  const lad = groove(-1.2 + Math.PI / 2 - 1.6, Math.PI / 2 + 1.6);
  const pda = groove(-Math.PI / 2 - 1.6, -Math.PI / 2 + 1.6);
  // sulco atrioventricular: para cada ângulo, a altura onde átrio e ventrículo se encontram
  const av: { th: number; p: V3 }[] = [];
  for (let th = -Math.PI; th < Math.PI; th += 0.08) {
    let best: V3 | null = null, bv = Infinity;
    for (let s = -3.4; s <= 0.2; s += 0.08) {
      const [c, d] = ring(s, th);
      const p = hit(H, c, d);
      if (!p) continue;
      const o = H.partDists(...p);
      const v = Math.abs(minOf(o, VENT) - minOf(o, ATR)) + Math.max(0, Math.min(minOf(o, VENT), minOf(o, ATR))) * 2;
      if (v < bv) {
        bv = v;
        best = p;
      }
    }
    if (best && bv < 0.7) av.push({ th, p: best });
  }
  const lift = 0.1;
  const fin = (a: V3[]) => smooth(a.map((p) => project(H, p, lift)), 4);
  // lado direito (RCA) x esquerdo (circunflexa) pelo x do ponto
  const right = av.filter((a) => a.p[0] < 0.2).sort((a, b) => a.th - b.th).map((a) => a.p);
  const left = av.filter((a) => a.p[0] >= 0.2).sort((a, b) => a.th - b.th).map((a) => a.p);
  return { lad: fin(lad.reverse()), pda: fin(pda), rca: fin(right), lcx: fin(left) };
}

function build(kind: Kind) {
  const t0 = Date.now();
  const H = buildHeart(kind);
  const m = surfaceNets(H.wall, H.bounds, H_STEP);
  const nv = m.pos.length / 3;
  const [lo, hi] = H.bounds;
  const range = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const STRIDE = 16;
  const vb = new Uint8Array(nv * STRIDE);
  const dv = new DataView(vb.buffer);
  for (let v = 0; v < nv; v++) {
    const p: V3 = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
    const n: V3 = [m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]];
    const o = H.partDists(...p);
    let part: Part = "lv", d1 = 99, d2 = 99, p2: Part = "lv";
    for (const k of PARTS) {
      const d = o[k];
      if (d === undefined) continue;
      if (d < d1) {
        d2 = d1;
        p2 = part;
        d1 = d;
        part = k;
      } else if (d < d2) {
        d2 = d;
        p2 = k;
      }
    }
    const outerSurf = Math.abs(H.outer(...p)) <= Math.abs(H.cavity(...p));
    // gordura nos sulcos (entre os ventrículos e entre átrio e ventrículo)
    const pair = new Set([part, p2]);
    const groovy = (pair.has("lv") && pair.has("rv")) || ([...pair].some((x) => VENT.includes(x)) && [...pair].some((x) => ATR.includes(x)));
    const fat = outerSurf && groovy ? Math.max(0, Math.min(1, (0.7 - (d2 - d1)) / 0.6)) : 0;
    // oclusão de ambiente: quanto o entorno fecha a superfície
    let occ = 0;
    for (const [s, w] of [[0.15, 0.35], [0.35, 0.3], [0.7, 0.2], [1.3, 0.15]]) {
      const f = H.wall(p[0] + n[0] * s, p[1] + n[1] * s, p[2] + n[2] * s);
      occ += (Math.max(0, s - f) / s) * w;
    }
    const ao = Math.max(0, Math.min(1, 1 - occ * 1.1));
    const o16 = v * STRIDE;
    for (let k = 0; k < 3; k++) dv.setUint16(o16 + k * 2, Math.round(((p[k] - lo[k]) / range[k]) * 65535), true);
    for (let k = 0; k < 3; k++) dv.setInt8(o16 + 6 + k, Math.round(n[k] * 127));
    dv.setUint8(o16 + 9, PARTS.indexOf(part));
    dv.setUint8(o16 + 10, outerSurf ? 1 : 0);
    dv.setUint8(o16 + 11, Math.round(fat * 255));
    dv.setUint8(o16 + 12, Math.round(ao * 255));
    // cor misturada entre as partes vizinhas (sem emenda serrilhada)
    const pal = outerSurf ? OUT_COL : IN_COL;
    let wr = 0, wg = 0, wb = 0, ws = 0;
    PARTS.forEach((k, i) => {
      const d = o[k];
      if (d === undefined) return;
      const w = Math.exp(-(d - d1) / 0.13);
      const [r, g, b] = rgb(pal[i]);
      wr += r * w;
      wg += g * w;
      wb += b * w;
      ws += w;
    });
    dv.setUint8(o16 + 13, Math.round(wr / ws));
    dv.setUint8(o16 + 14, Math.round(wg / ws));
    dv.setUint8(o16 + 15, Math.round(wb / ws));
  }
  // ordem boa para a placa de vídeo e para a compressão
  const idx = new Uint32Array(m.idx);
  const [remap, unique] = MeshoptEncoder.reorderMesh(idx, true, false);
  const vb2 = new Uint8Array(unique * STRIDE);
  for (let v = 0; v < nv; v++) if (remap[v] !== 0xffffffff) vb2.set(vb.subarray(v * STRIDE, v * STRIDE + STRIDE), remap[v] * STRIDE);
  const encV = MeshoptEncoder.encodeVertexBuffer(vb2, unique, STRIDE);
  const encI = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx.buffer), idx.length, 4);
  const head = new ArrayBuffer(40);
  const hv = new DataView(head);
  hv.setUint32(0, 0x31545248, true); // "HRT1"
  hv.setUint32(4, unique, true);
  hv.setUint32(8, idx.length, true);
  for (let k = 0; k < 3; k++) {
    hv.setFloat32(12 + k * 4, lo[k], true);
    hv.setFloat32(24 + k * 4, range[k], true);
  }
  hv.setUint32(36, encV.length, true);
  const file = new Uint8Array(40 + encV.length + encI.length);
  file.set(new Uint8Array(head), 0);
  file.set(encV, 40);
  file.set(encI, 40 + encV.length);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}${kind}.bin`, file);
  const cor = coronaries(H);
  const r = (a: V3[]) => a.map((p) => p.map((x) => Math.round(x * 1000) / 1000));
  writeFileSync(`${OUT}${kind}.json`, JSON.stringify({ lad: r(cor.lad), pda: r(cor.pda), rca: r(cor.rca), lcx: r(cor.lcx) }));
  console.log(kind, `${unique} vértices, ${idx.length / 3} triângulos, ${(file.length / 1024).toFixed(0)} KB, coronárias ${cor.lad.length}/${cor.pda.length}/${cor.rca.length}/${cor.lcx.length}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

await MeshoptEncoder.ready;
for (const k of (process.argv[2] ? [process.argv[2]] : ["normal", "tof"]) as Kind[]) build(k);
