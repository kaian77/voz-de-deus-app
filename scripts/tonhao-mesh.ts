// Gera o corpo 3D do Tonhão (public/treino/tonhao.bin) a partir de src/fitness/tonhao-body.ts.
// Pesado (alguns segundos): roda uma vez aqui; o celular só baixa o resultado compactado (meshopt).
// Uso: npx tsx scripts/tonhao-mesh.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { MeshoptEncoder } from "meshoptimizer";
import { surfaceNets } from "../src/heart3d/mesh";
import { BOUNDS, colorAt, field, shapes, weights, BONES, type V3 } from "../src/fitness/tonhao-body";

const STRIDE = 24;
const OUT = new URL("../public/treino/", import.meta.url).pathname;
const H = Number(process.argv[2]) || 0.0065;

await MeshoptEncoder.ready;
const t0 = Date.now();
const S = shapes();
const f = field(S);
const m = surfaceNets(f, BOUNDS, H);
const nv = m.pos.length / 3;
const lo = BOUNDS[0], range: V3 = [BOUNDS[1][0] - lo[0], BOUNDS[1][1] - lo[1], BOUNDS[1][2] - lo[2]];
const vb = new Uint8Array(nv * STRIDE);
const dv = new DataView(vb.buffer);
const e = 0.002;
for (let i = 0; i < nv; i++) {
  const p: V3 = [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
  const o = i * STRIDE;
  for (let k = 0; k < 3; k++) dv.setUint16(o + k * 2, Math.round(((p[k] - lo[k]) / range[k]) * 65535), true);
  // normal pelo gradiente do campo (mais lisa que a da malha)
  let n: V3 = [f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e)];
  const l = Math.hypot(...n) || 1;
  n = [n[0] / l, n[1] / l, n[2] / l];
  for (let k = 0; k < 3; k++) dv.setInt8(o + 6 + k, Math.round(n[k] * 127));
  // sombra de ambiente: quanto o campo "fecha" ao andar para fora (vale entre músculos fica mais escuro)
  let occ = 0;
  for (const [dd, w] of [[0.012, 1], [0.025, 0.6], [0.05, 0.3]] as const) occ += Math.max(0, dd - f(p[0] + n[0] * dd, p[1] + n[1] * dd, p[2] + n[2] * dd)) * w / dd;
  const ao = Math.max(0.35, 1 - occ * 0.55);
  const w = weights(S, p);
  const bone = BONES[w[0][0]][0];
  const c = colorAt(p, bone);
  for (let k = 0; k < 3; k++) vb[o + 10 + k] = c[k];
  vb[o + 13] = Math.round(ao * 255);
  // até 4 ossos com peso (soma 255)
  let rest = 255;
  w.forEach(([b, wt], j) => {
    vb[o + 14 + j] = b;
    const q = j === w.length - 1 ? rest : Math.round(wt * 255);
    vb[o + 18 + j] = q;
    rest -= q;
  });
}
const idx = new Uint32Array(m.idx);
const [remap, unique] = MeshoptEncoder.reorderMesh(idx, true, false);
const vb2 = new Uint8Array(unique * STRIDE);
for (let v = 0; v < nv; v++) if (remap[v] !== 0xffffffff) vb2.set(vb.subarray(v * STRIDE, v * STRIDE + STRIDE), remap[v] * STRIDE);
const encV = MeshoptEncoder.encodeVertexBuffer(vb2, unique, STRIDE);
const encI = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx.buffer), idx.length, 4);
const head = new DataView(new ArrayBuffer(40));
head.setUint32(0, 0x314e4854, true); // "THN1"
head.setUint32(4, unique, true);
head.setUint32(8, idx.length, true);
for (let k = 0; k < 3; k++) {
  head.setFloat32(12 + k * 4, lo[k], true);
  head.setFloat32(24 + k * 4, range[k], true);
}
head.setUint32(36, encV.length, true);
const file = new Uint8Array(40 + encV.length + encI.length);
file.set(new Uint8Array(head.buffer), 0);
file.set(encV, 40);
file.set(encI, 40 + encV.length);
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}tonhao.bin`, file);
console.log(`${unique} vértices, ${idx.length / 3} triângulos, ${(file.length / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
