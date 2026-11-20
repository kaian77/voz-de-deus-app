// Corpo 3D do Tonhão: esqueleto (juntas e ossos) e músculos em formas simples somadas com união suave (campo de
// distância). O script scripts/tonhao-mesh.ts transforma isso numa malha com pesos de pele (public/treino/tonhao.bin);
// no celular só os ossos giram (tonhao3d.ts). Unidade = metro; y para cima, rosto para +z, esquerda do Tonhão = +x.
export type V3 = [number, number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));

// ---------- juntas em pé (pose de descanso)
export const J: Record<string, V3> = { pelvis: [0, 0.98, 0], spine: [0, 1.12, 0], chest: [0, 1.3, 0], neck: [0, 1.5, -0.01], head: [0, 1.6, 0.0], headTop: [0, 1.82, 0.01] };
for (const [s, n] of [[1, "L"], [-1, "R"]] as const) {
  J[`shoulder${n}`] = [s * 0.205, 1.44, -0.015];
  J[`elbow${n}`] = [s * 0.25, 1.16, -0.03];
  J[`wrist${n}`] = [s * 0.275, 0.91, 0.0];
  J[`handEnd${n}`] = [s * 0.285, 0.81, 0.015];
  J[`hip${n}`] = [s * 0.095, 0.95, 0];
  J[`knee${n}`] = [s * 0.105, 0.52, 0.015];
  J[`ankle${n}`] = [s * 0.11, 0.09, -0.015];
  J[`toe${n}`] = [s * 0.115, 0.025, 0.14];
}

/** Ossos: nome, junta de começo, junta de fim, pai. A ordem já é de pai para filho. */
export const BONES: [string, string, string, string | null][] = [
  ["pelvis", "pelvis", "spine", null],
  ["spine", "spine", "chest", "pelvis"],
  ["chest", "chest", "neck", "spine"],
  ["neck", "neck", "head", "chest"],
  ["head", "head", "headTop", "neck"],
];
for (const n of ["L", "R"]) {
  BONES.push(
    [`upperArm${n}`, `shoulder${n}`, `elbow${n}`, "chest"],
    [`foreArm${n}`, `elbow${n}`, `wrist${n}`, `upperArm${n}`],
    [`hand${n}`, `wrist${n}`, `handEnd${n}`, `foreArm${n}`],
    [`thigh${n}`, `hip${n}`, `knee${n}`, "pelvis"],
    [`shin${n}`, `knee${n}`, `ankle${n}`, `thigh${n}`],
    [`foot${n}`, `ankle${n}`, `toe${n}`, `shin${n}`],
  );
}
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// ---------- formas (músculos)
interface Shape { d(p: V3): number; bone: string; k: number; box: [V3, V3] }

/** Elipsoide orientado: centro, eixo, semieixos (no eixo, largura, profundidade). */
function E(c: V3, axis: V3, r: V3, bone: string, k = 0.035): Shape {
  const u = nrm(axis);
  const ref: V3 = Math.abs(u[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const w = nrm(sub(ref, mul(u, dot(ref, u))));
  const v = cross(w, u);
  const m = Math.max(...r);
  return {
    bone, k,
    box: [sub(c, [m, m, m]), add(c, [m, m, m])],
    d(p) {
      const q = sub(p, c);
      const a = dot(q, u) / r[0], b = dot(q, v) / r[1], cc = dot(q, w) / r[2];
      const k0 = Math.sqrt(a * a + b * b + cc * cc);
      const a2 = a / r[0], b2 = b / r[1], c2 = cc / r[2];
      const k1 = Math.sqrt(a2 * a2 + b2 * b2 + c2 * c2);
      return k1 < 1e-9 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
    },
  };
}

/** Cápsula que afina de r1 para r2. */
function C(a: V3, b: V3, r1: number, r2: number, bone: string, k = 0.03): Shape {
  const ab = sub(b, a), l2 = dot(ab, ab);
  const m = Math.max(r1, r2);
  return {
    bone, k,
    box: [[Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m], [Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m]],
    d(p) {
      const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
      return len(sub(p, add(a, mul(ab, t)))) - (r1 + (r2 - r1) * t);
    },
  };
}

export function shapes(): Shape[] {
  const S: Shape[] = [
    // quadril e tronco
    E([0, 0.965, -0.005], [0, 1, 0], [0.1, 0.165, 0.11], "pelvis", 0.04),
    E([0, 1.12, 0.0], [0, 1, 0], [0.13, 0.135, 0.095], "spine", 0.05),
    E([0, 1.3, -0.015], [0, 1, 0], [0.15, 0.2, 0.125], "chest", 0.05),
    E([0, 1.33, -0.085], [0, 1, 0], [0.14, 0.16, 0.06], "chest", 0.04),
    C([0, 1.43, -0.015], [0, 1.585, 0.005], 0.062, 0.054, "neck", 0.04),
    // cabeça
    E([0, 1.675, 0.012], [0, 1, 0], [0.13, 0.1, 0.115], "head", 0.03),
    E([0, 1.612, 0.05], [0, 1, 0], [0.055, 0.074, 0.06], "head", 0.03),
    E([0, 1.665, 0.122], [0, 1, 0.45], [0.028, 0.014, 0.017], "head", 0.012),
    E([0, 1.698, 0.1], [1, 0, 0], [0.075, 0.019, 0.021], "head", 0.015),
  ];
  for (const s of [1, -1]) {
    const n = s > 0 ? "L" : "R";
    const sh = J[`shoulder${n}`], el = J[`elbow${n}`], wr = J[`wrist${n}`], he = J[`handEnd${n}`];
    const hp = J[`hip${n}`], kn = J[`knee${n}`], an = J[`ankle${n}`];
    const ua = nrm(sub(el, sh)), fa = nrm(sub(wr, el)), th = nrm(sub(kn, hp)), sn = nrm(sub(an, kn));
    S.push(
      // tronco: glúteo, abdômen, oblíquo, peitoral, dorsal, trapézio, orelha
      E([s * 0.07, 0.915, -0.065], [0, 1, 0], [0.085, 0.078, 0.072], "pelvis", 0.04),
      E([s * 0.108, 1.075, 0.02], [0, 1, 0], [0.085, 0.045, 0.06], "spine", 0.04),
      E([s * 0.085, 1.36, 0.068], [s, -0.28, 0.05], [0.1, 0.072, 0.048], "chest", 0.03),
      E([s * 0.145, 1.25, -0.045], [0.28 * s, 1, 0.05], [0.13, 0.06, 0.07], "chest", 0.04),
      E([s * 0.085, 1.485, -0.04], [s, -0.55, 0], [0.105, 0.045, 0.052], "chest", 0.04),
      E([s * 0.104, 1.668, 0.0], [0, 1, 0], [0.032, 0.013, 0.02], "head", 0.012),
      // braço
      E(add(sh, [s * 0.012, -0.015, 0.002]), [s * 0.3, -1, 0], [0.088, 0.072, 0.078], "upperArm" + n, 0.035),
      C(sh, el, 0.052, 0.04, "upperArm" + n),
      E(add(mix(sh, el, 0.5), [0, 0, 0.03]), ua, [0.105, 0.043, 0.046], "upperArm" + n, 0.025),
      E(add(mix(sh, el, 0.42), [s * 0.008, 0, -0.033]), ua, [0.12, 0.046, 0.042], "upperArm" + n, 0.025),
      C(el, wr, 0.043, 0.029, "foreArm" + n),
      E(add(mix(el, wr, 0.28), [s * 0.005, 0, 0.01]), fa, [0.085, 0.046, 0.043], "foreArm" + n, 0.025),
      E(mix(wr, he, 0.45), nrm(sub(he, wr)), [0.058, 0.042, 0.03], "hand" + n, 0.02),
      // perna
      C(hp, kn, 0.085, 0.055, "thigh" + n, 0.04),
      E(add(mix(hp, kn, 0.48), [s * 0.008, 0, 0.038]), th, [0.2, 0.07, 0.062], "thigh" + n, 0.03),
      E(add(mix(hp, kn, 0.42), [s * 0.02, 0, -0.03]), th, [0.19, 0.062, 0.056], "thigh" + n, 0.03),
      E(add(mix(hp, kn, 0.72), [-s * 0.035, 0, 0.02]), th, [0.09, 0.045, 0.045], "thigh" + n, 0.025),
      E(kn, [0, 1, 0], [0.05, 0.047, 0.05], "shin" + n, 0.03),
      C(kn, an, 0.05, 0.034, "shin" + n),
      E(add(mix(kn, an, 0.3), [0, 0, -0.032]), sn, [0.125, 0.055, 0.056], "shin" + n, 0.03),
      E([s * 0.11, 0.05, 0.045], [0, 0, 1], [0.145, 0.052, 0.048], "foot" + n, 0.025),
    );
    // gomos do abdômen
    for (const y of [1.05, 1.115, 1.18]) S.push(E([s * 0.032, y, 0.083], [0, 1, 0], [0.028, 0.027, 0.02], "spine", 0.016));
  }
  return S;
}

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

export function field(S: Shape[]) {
  return (x: number, y: number, z: number) => {
    const p: V3 = [x, y, z];
    let d = 1e9;
    for (const s of S) {
      // longe da caixa da forma: pula (rápido)
      if (x < s.box[0][0] - 0.06 || x > s.box[1][0] + 0.06 || y < s.box[0][1] - 0.06 || y > s.box[1][1] + 0.06 || z < s.box[0][2] - 0.06 || z > s.box[1][2] + 0.06) continue;
      d = smin(d, s.d(p), s.k);
    }
    return d > 1e8 ? 0.06 : d;
  };
}

/** Pesos de pele: os ossos das formas mais perto da superfície naquele ponto. */
export function weights(S: Shape[], p: V3): [number, number][] {
  const ds = S.map((s) => [s.d(p), BONE_INDEX[s.bone]] as const);
  const m = Math.min(...ds.map((d) => d[0]));
  const acc = new Map<number, number>();
  for (const [d, b] of ds) {
    if (d - m > 0.06) continue;
    acc.set(b, (acc.get(b) ?? 0) + Math.exp(-(d - m) / 0.012));
  }
  const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((a, t) => a + t[1], 0);
  return top.map(([b, w]) => [b, w / sum]);
}

/** Cor (sRGB) por lugar do corpo: pele, short preto com faixa vermelha, tênis, cabelo, faixa na testa, olhos. */
export function colorAt(p: V3, bone: string): [number, number, number] {
  const [x, y, z] = p;
  const SKIN: [number, number, number] = [196, 135, 92];
  if (bone.startsWith("foot") || y < 0.1) return y < 0.03 ? [235, 235, 235] : [38, 40, 46];
  if (bone === "head" || bone === "neck") {
    if (y > 1.727 && bone === "head") return [28, 20, 16];
    if (y > 1.703 && y <= 1.727 && bone === "head") return [227, 38, 46];
    for (const s of [1, -1]) if (Math.hypot(x - s * 0.04, y - 1.677, z - 0.108) < 0.014) return [30, 22, 18];
    if (y > 1.6 && y < 1.64 && z > 0.06 && Math.abs(x) < 0.05 && z > 0.088 && y < 1.615) return [150, 80, 66];
    return SKIN;
  }
  if (y > 0.985 && y < 1.012 && (bone === "pelvis" || bone === "spine")) return [227, 38, 46];
  if (y <= 0.985 && y > 0.7 && (bone === "pelvis" || bone.startsWith("thigh"))) return [24, 24, 28];
  return SKIN;
}

export const BOUNDS: [V3, V3] = [[-0.44, -0.02, -0.22], [0.44, 1.84, 0.26]];
