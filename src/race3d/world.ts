// Cenário da corrida (estilizado): terreno com subidas e descidas, pistas pelo percurso, pórtico de largada,
// arena (tendas, pódio, estacionamento), hidratação, placas de km e pontos de referência (Torre, Esplanada, Catedral, Congresso).
// Cenário "autodromo": pista fechada com zebra de luz, arquibancada, boxes, postes e torres de luz (prova à noite).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, cyl, mat } from "../tour3d/furniture";
import { Path } from "./path";
import type { RaceEvent } from "./types";

export const HALF = 2.6; // meia largura da pista
const SUN_DIR = new THREE.Vector3(500, 260, 220);
/** Palco do pódio: altura do piso e dos degraus (x relativo ao centro do pódio da arena). */
export const PODIUM = { deck: 0.15, steps: [{ x: 0, h: 0.45 }, { x: -0.9, h: 0.32 }, { x: 0.9, h: 0.22 }] };

/** Altura do terreno (unidades). O Eixo desce para o leste, com ondulações. */
const eixoHeight = (x: number, z: number) => -x * 0.009 + 1.4 * Math.sin(x / 85) + 0.7 * Math.sin(z / 70 + 0.5) * Math.min(1, Math.abs(z) / 60);
/** Autódromo: morro no miolo (Subida/Descida do Placar) e o terreno caindo para o sul (Mergulho da Bruxa). */
const autodromoHeight = (x: number, z: number) => 2.2 * Math.exp(-((x - 31) ** 2 + (z + 13) ** 2) / 1800) - z * 0.012 + x * 0.004;
let heightFn = eixoHeight;
export function height(x: number, z: number) {
  return heightFn(x, z);
}

export type World = {
  scene: THREE.Scene;
  paths: Map<string, Path>;
  setDistance: (id: string) => void;
  /** De longe a linha do percurso fica grossa para aparecer. */
  setFar: (far: boolean) => void;
  /** Lugares da arquibancada (torcida sentada), vazio se não tem. */
  seats: { x: number; y: number; z: number; yaw: number }[];
  /** Pontos com nome (para os rótulos), em coordenadas da cena. */
  marks: { id: string; name: string; pos: THREE.Vector3; dist?: string; kind: "land" | "spot" | "water" | "km" }[];
  /** Anima o pórtico e leva a sombra do sol para perto de onde a câmera olha. */
  update: (t: number, focus: THREE.Vector3) => void;
};

function textTexture(lines: string[], w: number, h: number, bg: string, fg: string, font = "700 64px Jost, sans-serif") {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = font;
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? 64);
  lines.forEach((l, i) => {
    g.font = font;
    const fit = Math.min(1, (w * 0.9) / g.measureText(l).width);
    g.font = font.replace(/\d+px/, `${Math.floor(size * fit)}px`);
    g.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function sign(g: THREE.Object3D, text: string[], w: number, h: number, bg: string, fg: string, both = true) {
  const tex = textTexture(text, 512, Math.round((512 * h) / w), bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: both ? THREE.DoubleSide : THREE.FrontSide }));
  g.add(m);
  return m;
}

/** Faixa ao longo do caminho (asfalto, linhas, pintura), seguindo o terreno. */
function ribbon(path: Path, half: number, offset: number, lift: number, material: THREE.Material, keep?: (x: number, z: number) => boolean) {
  const pos: number[] = [], idx: number[] = [];
  const p = { x: 0, z: 0, dx: 1, dz: 0 };
  let prev = false;
  for (let s = 0; s <= path.length + 0.01; s += 2) {
    path.at(Math.min(s, path.length - 0.01), p);
    const on = !keep || keep(p.x, p.z);
    const nx = -p.dz, nz = p.dx;
    for (const side of [-1, 1]) {
      const x = p.x + nx * (offset + side * half), z = p.z + nz * (offset + side * half);
      pos.push(x, height(x, z) + lift, z);
    }
    const k = pos.length / 3 - 2;
    if (k > 0 && on && prev) idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    prev = on;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}

/** Retângulo no chão que acompanha o terreno (senão os bonecos afundam onde o chão sobe). */
function drape(w: number, d: number, cx: number, cz: number, material: THREE.Material, rot = 0) {
  const geo = new THREE.PlaneGeometry(w, d, Math.ceil(w / 4), Math.ceil(d / 4)).rotateX(-Math.PI / 2).rotateY(rot);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, z = p.getZ(i) + cz;
    p.setXYZ(i, x, height(x, z) + 0.05, z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}

function layered(color: number, layer: number, opts: { opacity?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 2,
    transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1,
  });
}

function sky(night: boolean) {
  const geo = new THREE.SphereGeometry(5000, 24, 12);
  const c = new THREE.Color(), cols: number[] = [];
  const [top, mid, low] = (night ? [0x05030a, 0x1a0a10, 0x5a1414] : [0x6fa8dc, 0xcfe3f2, 0xffd9b0]).map((h) => new THREE.Color(h));
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 5000;
    if (y > 0.15) c.copy(mid).lerp(top, Math.min(1, (y - 0.15) / 0.6));
    else c.copy(low).lerp(mid, Math.max(0, (y + 0.05) / 0.2));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

function terrain(night: boolean, eixo: boolean) {
  const geo = new THREE.PlaneGeometry(4400, 3000, 260, 180).rotateX(-Math.PI / 2);
  geo.translate(220, 0, 0);
  const p = geo.attributes.position, cols: number[] = [];
  const a = new THREE.Color(night ? 0x2f4a26 : 0x9fbd62), b = new THREE.Color(night ? 0x3d4029 : 0xc8bb7c), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, height(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 0.031 + Math.sin(z * 0.02) * 3) * Math.cos(z * 0.027);
    c.copy(a).lerp(b, eixo && Math.abs(z) < 30 ? 0.05 : n * 0.55);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  m.receiveShadow = true;
  // chão até o horizonte
  const base = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), mat(night ? 0x1d2618 : 0xaab872, { rough: 1 }));
  base.position.y = -14;
  m.add(base);
  return m;
}

function trees(spots: [number, number, number][], night = false) {
  const n = spots.length;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6).translate(0, 1.5, 0), mat(0x6b4e33), n);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), n);
  const M = new THREE.Matrix4(), C = new THREE.Color();
  const greens = night ? [0x1f3a1c, 0x27441f, 0x2f4d24, 0x1a3318] : [0x4f7d3a, 0x5d8c41, 0x6f9a48, 0x45703a];
  spots.forEach(([x, z, s], i) => {
    const y = height(x, z);
    trunk.setMatrixAt(i, M.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
    crown.setMatrixAt(i, M.compose(new THREE.Vector3(x, y + 3.6 * s, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), new THREE.Vector3(s, s * 0.85, s)));
    crown.setColorAt(i, C.setHex(greens[i % greens.length]));
  });
  trunk.castShadow = crown.castShadow = true;
  const g = new THREE.Group();
  g.add(trunk, crown);
  return g;
}

/** Quadras da cidade (um só mesh com cores por vértice). */
function city(rand: () => number, avoid: (x: number, z: number) => boolean, spot: () => [number, number, number], night = false) {
  const geos: THREE.BufferGeometry[] = [];
  const pal = night ? [0x2a2730, 0x33303a, 0x26242b, 0x3a3540, 0x2d3036, 0x342c2c] : [0xf1ece1, 0xe6dfd0, 0xd9d4c7, 0xf4e3c8, 0xcfd8dc, 0xe8d5c4];
  const c = new THREE.Color();
  for (let i = 0; i < 260; i++) {
    const [x, z, tall] = spot();
    if (avoid(x, z)) continue;
    const w = 14 + rand() * 18, d = 8 + rand() * 10, h = 3 + rand() * tall;
    const g = new THREE.BoxGeometry(w, h, d).translate(x, height(x, z) + h / 2 - 0.5, z);
    c.setHex(pal[i % pal.length]);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    geos.push(g);
  }
  const m = new THREE.Mesh(
    mergeGeometries(geos),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, map: night ? windows(8, 5, true) : null, emissive: night ? 0xffffff : 0x000000, emissiveMap: night ? windows(8, 5, true) : null, emissiveIntensity: 0.35 }),
  );
  m.castShadow = m.receiveShadow = true;
  return m;
}

function windows(floors: number, bays: number, lit = false) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = lit ? "#2a2830" : "#eeeae0";
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = "#6f8fa6";
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    // à noite: algumas janelas acesas
    if (lit) g.fillStyle = (f * 7 + b * 3) % 5 < 2 ? "#ffcf8a" : "#1c1a20";
    g.fillRect(3 + (b * 58) / bays, 6 + (f * 118) / floors, 58 / bays - 3, 118 / floors - 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function landmark(scene: THREE.Scene, kind: RaceEvent["landmarks"][number]["kind"], x: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, height(x, z), z);
  scene.add(g);
  const white = mat(0xf3f1ea, { rough: 0.6 });
  if (kind === "torre") {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 16, 6), mat(0x8c8f93, { metal: 0.4, rough: 0.5 }));
      leg.position.set(Math.cos(a) * 4, 7.5, Math.sin(a) * 4);
      leg.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);
      g.add(leg);
    }
    cyl(g, 1.2, 46, mat(0x9a9da1, { metal: 0.5, rough: 0.45 }), 0, 0, 0, 10, 0.5);
    cyl(g, 5, 1.6, white, 0, 14, 0, 16);
    cyl(g, 3.5, 1.2, white, 0, 26, 0, 16);
    cyl(g, 0.25, 22, 0xd84a3a, 0, 46, 0, 6);
  } else if (kind === "esplanada") {
    const tex = windows(10, 6);
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(4.5, 9, 22), [mat(0xeeeae0), mat(0xeeeae0), mat(0xeeeae0), mat(0xeeeae0), face, face]);
      m.position.set(-100 + i * 28, height(x - 100 + i * 28, s * 50) - g.position.y + 4.5, s * 50);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
  } else if (kind === "catedral") {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.5), white);
      lower.position.set(Math.cos(a) * 5, 3.6, Math.sin(a) * 5);
      lower.lookAt(0, 3.6, 0);
      lower.rotateX(-0.42);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.45), white);
      upper.position.set(Math.cos(a) * 2.6, 9.2, Math.sin(a) * 2.6);
      upper.lookAt(0, 9.2, 0);
      upper.rotateX(0.5);
      g.add(lower, upper);
    }
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 6.4, 8, 16, 1, true), mat(0x7fb4d6, { opacity: 0.55, rough: 0.1 }));
    glass.position.y = 4;
    g.add(glass);
    box(g, 30, 0.4, 30, 0xdcd6c8, 0, -0.2, 0, false);
  } else if (kind === "congresso") {
    box(g, 70, 2, 34, white, 0, 0, 0);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2.6), white);
    bowl.rotation.x = Math.PI;
    bowl.position.set(-12, 2 + 4.6, 9);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), white);
    dome.position.set(-12, 2, -9);
    g.add(bowl, dome);
    for (const s of [-1, 1]) box(g, 3, 22, 9, mat(0xe9e5da), 14, 2, s * 2.6);
    box(g, 3.2, 1.2, 2.2, mat(0xe9e5da), 14, 15, 0);
    box(g, 120, 0.3, 26, 0x7fa9c4, -70, 0, 0, false).material = mat(0x88b4cc, { rough: 0.2 });
  } else if (kind === "estadio") {
    // Mané Garrincha estilizado: anel de pilares, cobertura em anel e arquibancada por dentro
    const n = 48, R = 34;
    const pillar = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 12, 0.8).translate(0, 6, 0), white, n);
    const M = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pillar.setMatrixAt(i, M.makeTranslation(Math.cos(a) * R, 0, Math.sin(a) * R));
    }
    g.add(pillar);
    const roof = new THREE.Mesh(new THREE.RingGeometry(18, R + 2, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe9e5da, roughness: 0.5, side: THREE.DoubleSide }));
    roof.position.y = 12;
    const glow = new THREE.Mesh(new THREE.TorusGeometry(18, 0.35, 6, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
    glow.position.y = 11.8;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(R - 1, 16, 9, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.8, side: THREE.DoubleSide }));
    bowl.position.y = 4.5;
    const pitch = new THREE.Mesh(new THREE.CircleGeometry(16, 32).rotateX(-Math.PI / 2), mat(0x3f7a3a));
    pitch.position.y = 0.2;
    g.add(roof, glow, bowl, pitch);
  } else if (kind === "lago") {
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2400).rotateX(-Math.PI / 2), mat(0x4f8fb5, { rough: 0.15, metal: 0.1 }));
    lake.position.set(700, -height(x, z) - 8.6, 0);
    g.add(lake);
  }
  return g;
}

function tent(g: THREE.Object3D, x: number, z: number, color: number, label: string, y: number, night: boolean) {
  const t = new THREE.Group();
  t.position.set(x, y, z);
  for (const [px, pz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) cyl(t, 0.12, 3.4, 0xdddddd, px, 0, pz, 6);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6, 2.4, 4, 1), mat(night ? 0x2a2224 : 0xffffff, { rough: 0.6 }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 4.6;
  roof.castShadow = true;
  t.add(roof);
  box(t, 8.2, 0.6, 8.2, color, 0, 3.2, 0);
  box(t, 6, 0.9, 1.2, 0xf2efe6, 0, 0, -2.6);
  const s = sign(t, [label], 7.6, 1.5, night ? "#1a0d0e" : "#ffffff", night ? "#f2e6d0" : "#0f2238");
  s.position.set(0, 2.4, -4.25);
  s.rotation.y = Math.PI;
  g.add(t);
}

/** Amostras da pista para saber se um ponto cai em cima de alguma faixa. */
function trackSamples(path: Path) {
  const xs: number[] = [], zs: number[] = [];
  for (let s = 0; s < path.length; s += 2.5) {
    const a = path.at(s);
    xs.push(a.x);
    zs.push(a.z);
  }
  return (x: number, z: number, r: number) => {
    for (let i = 0; i < xs.length; i++) if ((xs[i] - x) ** 2 + (zs[i] - z) ** 2 < r * r) return true;
    return false;
  };
}

/** Postes ao longo da pista, com a poça de luz no chão (sem luz de verdade, para rodar leve no celular). */
function lightPoles(path: Path, onTrack: (x: number, z: number, r: number) => boolean) {
  const spots: { x: number; z: number; yaw: number }[] = [];
  const a = { x: 0, z: 0, dx: 1, dz: 0 };
  let k = 0;
  for (let s = 6; s < path.length; s += 19) {
    path.at(s, a);
    const side = k++ % 2 ? 1 : -1, nx = -a.dz * side, nz = a.dx * side, off = HALF + 1.6;
    const x = a.x + nx * off, z = a.z + nz * off;
    if (onTrack(x, z, HALF + 1)) continue;
    spots.push({ x, z, yaw: Math.atan2(-nx, -nz) });
  }
  const n = spots.length, g = new THREE.Group();
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 6.5, 6).translate(0, 3.25, 0), mat(0x55575c, { metal: 0.5, rough: 0.5 }), n);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 1.6).translate(0, 6.4, 0.7), mat(0x55575c), n);
  const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 0.7).translate(0, 6.3, 1.4), new THREE.MeshBasicMaterial({ color: 0xffe9cf }), n);
  const pool = new THREE.InstancedMesh(
    new THREE.CircleGeometry(3.2, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff8a5c, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }),
    n,
  );
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
  spots.forEach((p, i) => {
    const y = height(p.x, p.z);
    M.compose(V.set(p.x, y, p.z), Q.setFromAxisAngle(Y, p.yaw), S);
    pole.setMatrixAt(i, M);
    arm.setMatrixAt(i, M);
    lamp.setMatrixAt(i, M);
    const fx = p.x + Math.sin(p.yaw) * 1.6, fz = p.z + Math.cos(p.yaw) * 1.6;
    pool.setMatrixAt(i, M.makeTranslation(fx, height(fx, fz) + 0.12, fz));
  });
  pole.castShadow = true;
  g.add(pole, arm, lamp, pool);
  return g;
}

/** Torre de iluminação (refletores virados para a pista). */
function floodTower(scene: THREE.Scene, x: number, z: number, look: THREE.Vector3) {
  const g = new THREE.Group();
  g.position.set(x, height(x, z), z);
  g.rotation.y = Math.atan2(look.x - x, look.z - z);
  cyl(g, 0.7, 20, mat(0x4a4c52, { metal: 0.5 }), 0, 0, 0, 8, 0.4);
  box(g, 6, 3.2, 0.5, mat(0x2b2c30), 0, 19, 0.4);
  const face = new THREE.MeshBasicMaterial({ color: 0xfff7e8 });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), face);
    l.position.set(-2.1 + c * 1.4, 19.8 + r * 1.4, 0.7);
    g.add(l);
  }
  scene.add(g);
}

export function buildWorld(ev: RaceEvent): World {
  const night = !!ev.night, auto = ev.venue === "autodromo";
  heightFn = auto ? autodromoHeight : eixoHeight;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(night ? 0x0b0508 : 0xcfe3f2);
  scene.fog = night ? new THREE.Fog(0x1a0b0e, 300, 1700) : new THREE.Fog(0xe6e9e6, 700, 2600);
  scene.add(sky(night));
  scene.add(new THREE.HemisphereLight(night ? 0x9a7f95 : 0xdfeeff, night ? 0x3a1616 : 0x6f8a4a, night ? 1.0 : 1.25));
  // de dia é o sol; à noite, a luz dos refletores (mais fraca e quente)
  const sun = new THREE.DirectionalLight(night ? 0xffd6c4 : 0xffe2b8, night ? 1.5 : 2.2);
  sun.position.set(500, 260, 220);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 10; sc.far = 1400;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  // à noite, um refletor acompanha onde a câmera olha (os corredores aparecem melhor de perto)
  const spot = new THREE.PointLight(0xffe2cc, night ? 2.4 : 0, 70, 0);
  scene.add(spot);
  if (night) {
    const moon = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd9c2, fog: false }));
    moon.position.set(-1900, 900, -3600);
    scene.add(moon);
  }
  scene.add(terrain(night, !auto));

  const paths = new Map<string, Path>();
  for (const d of ev.distances) paths.set(d.id, new Path(d.points));
  const longest = [...ev.distances].sort((a, b) => b.km - a.km)[0];
  const shortest = [...ev.distances].sort((a, b) => a.km - b.km)[0];
  const lap = paths.get(shortest.id)!;
  const onTrack = trackSamples(lap);

  // pistas: o maior percurso inteiro; os outros só onde saem dele (retornos). No autódromo todas são a mesma volta.
  const asphalt = layered(night ? 0x2a2c31 : 0x41464d, 1);
  if (auto) {
    scene.add(ribbon(lap, HALF, 0, 0.05, asphalt));
    // bordas acesas em vermelho, como no mapa do evento
    const edge = new THREE.MeshBasicMaterial({ color: 0xff3a30, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const halo = new THREE.MeshBasicMaterial({
      color: 0xff2418, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    });
    for (const s of [-1, 1]) {
      scene.add(ribbon(lap, 0.1, s * (HALF - 0.2), 0.07, edge));
      scene.add(ribbon(lap, 0.45, s * (HALF + 0.2), 0.06, halo));
    }
  } else {
    const lines = layered(0xf4f4f0, 2);
    const onLongest = (x: number, z: number) => Math.abs(Math.abs(z) - 12) < 0.6 && x > -342 && x < 620;
    for (const d of ev.distances) {
      const p = paths.get(d.id)!;
      const keep = d === longest ? undefined : (x: number, z: number) => !onLongest(x, z);
      scene.add(ribbon(p, HALF, 0, 0.05, asphalt, keep));
      for (const s of [-1, 1]) scene.add(ribbon(p, 0.08, s * (HALF - 0.25), 0.07, lines, keep));
    }
  }
  // pintura do percurso, uma cor por distância
  const paints = new Map<string, THREE.MeshStandardMaterial>();
  const glows = new Map<string, THREE.Mesh>();
  let far = false, current = ev.distances[0].id;
  ev.distances.forEach((d, i) => {
    const m = layered(new THREE.Color(d.color).getHex(), 3, { opacity: 0.95 });
    m.emissive = new THREE.Color(d.color).multiplyScalar(night ? 0.6 : 0.25);
    paints.set(d.id, m);
    scene.add(ribbon(paths.get(d.id)!, 0.22, (i === 0 ? -1 : 1) * 1.05, 0.08, m));
    const g = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    const glow = ribbon(paths.get(d.id)!, 2.6, (i === 0 ? -1 : 1) * 2.2, 0.4, g);
    glow.visible = false;
    glows.set(d.id, glow);
    scene.add(glow);
  });

  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots: [number, number, number][] = [];
  const start = paths.get(longest.id)!.at(0);
  const along = Math.atan2(-start.dz, start.dx); // gira objetos para ficarem no sentido da largada
  const nx = -start.dz, nz = start.dx; // lado direito de quem larga
  const seats: World["seats"] = [];
  let inStand = (_x: number, _z: number) => false;

  if (auto) {
    // arquibancada do lado de fora da Reta Principal, com a faixa do evento na cobertura
    const stand = new THREE.Group();
    const off = HALF + 6;
    stand.position.set(start.x - nx * off, height(start.x - nx * off, start.z - nz * off), start.z - nz * off);
    stand.rotation.y = along;
    scene.add(stand);
    const concrete = mat(0x55565c, { rough: 0.9 });
    const TIERS = 7, U0 = -44, U1 = 30;
    for (let t = 0; t < TIERS; t++) box(stand, U1 - U0, 0.6 + t * 0.75, 1.3, concrete, (U0 + U1) / 2, 0, -t * 1.3);
    box(stand, U1 - U0, 0.3, 11, mat(0x232328), (U0 + U1) / 2, 0.6 + TIERS * 0.75 + 3.4, -3.6);
    for (let u = U0; u <= U1; u += 12) cyl(stand, 0.15, 0.6 + TIERS * 0.75 + 3.4, 0x6a6c72, u, 0, -TIERS * 1.3 + 0.4, 6);
    if (ev.slogan) {
      const sl = sign(stand, [ev.slogan], 34, 2.2, "#120808", ev.colors.primary);
      sl.position.set((U0 + U1) / 2, 0.6 + TIERS * 0.75 + 2.6, 1.95);
    }
    stand.updateMatrixWorld();
    const yaw = Math.atan2(nx, nz);
    const v = new THREE.Vector3();
    for (let t = 0; t < TIERS; t++) for (let u = U0 + 1; u < U1 - 1; u += 1.1) {
      if (rand() < 0.42) continue;
      stand.localToWorld(v.set(u + (rand() - 0.5) * 0.3, 0.6 + t * 0.75, -t * 1.3 - 0.2));
      seats.push({ x: v.x, y: v.y, z: v.z, yaw });
    }
    inStand = (x, z) => {
      const rx = x - stand.position.x, rz = z - stand.position.z;
      const u = rx * start.dx + rz * start.dz, w = -(rx * nx + rz * nz);
      return u > U0 - 4 && u < U1 + 4 && w > -3 && w < 16;
    };
    // boxes do lado de fora da Reta do Militar
    const pitMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.7, map: windows(2, 12, true), emissive: 0xffffff, emissiveMap: windows(2, 12, true), emissiveIntensity: 0.4 });
    const pit = box(scene, 6, 4.5, 52, pitMat, 89, height(89, -16) - 0.3, -16);
    pit.castShadow = true;
    // postes e torres de luz
    scene.add(lightPoles(lap, onTrack));
    const mid = new THREE.Vector3(0, 0, 0);
    for (const [x, z] of [[-92, -88], [96, -88], [98, 84], [-92, 78]]) floodTower(scene, x, z, mid);
    // paddock entre a Reta Principal e a Reta Oposta (onde ficam as tendas)
    scene.add(drape(86, 12, 3, -48, layered(0x34343a, 1), along));
    // árvores: no miolo e em volta, longe das pistas
    const arenaNear = (x: number, z: number) => ev.arena.some((a) => Math.hypot(a.x - x, a.z - z) < (a.w ? Math.max(a.w, a.d ?? 0) * 0.7 : 9)) || (z < -36 && z > -60 && x > -45 && x < 50);
    for (let i = 0; i < 900 && spots.length < 360; i++) {
      const x = -130 + rand() * 260, z = -120 + rand() * 240;
      if (onTrack(x, z, HALF + 3) || arenaNear(x, z) || inStand(x, z) || Math.hypot(x - 89, z + 16) < 30) continue;
      spots.push([x, z, 0.6 + rand() * 0.7]);
    }
    scene.add(trees(spots, night));
    const avoid = (x: number, z: number) => Math.abs(x) < 150 && Math.abs(z) < 140 || ev.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < 60);
    scene.add(city(rand, avoid, () => {
      const a = rand() * Math.PI * 2, r = 180 + rand() * 520;
      return [Math.cos(a) * r, Math.sin(a) * r, r < 320 ? 7 : 4];
    }, night));
  } else {
    // canteiro central e árvores
    const turns = ev.distances.flatMap((d) => {
      const xs = d.points.map((p) => p[0]);
      return [Math.min(...xs), Math.max(...xs)];
    });
    for (let x = -330; x < 610; x += 16) if (!turns.some((t) => Math.abs(x - t) < 26)) spots.push([x + rand() * 4, (rand() - 0.5) * 6, 0.8 + rand() * 0.4]);
    for (let i = 0; i < 170; i++) {
      const x = -520 + rand() * 1150, z = (rand() < 0.5 ? -1 : 1) * (22 + rand() * 200);
      if (x > -90 && x < 100 && z > 20 && z < 115) continue;
      if (x > 360 && x < 640 && Math.abs(z) < 70) continue;
      if (Math.hypot(x - 330, z - 70) < 22) continue;
      spots.push([x, z, 0.7 + rand() * 0.7]);
    }
    scene.add(trees(spots, night));
    scene.add(city(
      rand,
      (x, z) => (x > -100 && x < 120 && z > 15 && z < 125) || (x > 330 && x < 820 && Math.abs(z) < 90) || Math.hypot(x - 330, z - 70) < 40 || Math.hypot(x + 400, z) < 40,
      () => {
        const z = (rand() < 0.5 ? -1 : 1) * (80 + rand() * 520);
        return [-560 + rand() * 1250, z, Math.abs(z) < 200 ? 9 : 4];
      },
      night,
    ));
  }

  const marks: World["marks"] = [];
  for (const l of ev.landmarks) {
    landmark(scene, l.kind, l.x, l.z);
    const top = l.kind === "torre" ? 50 : l.kind === "congresso" ? 26 : l.kind === "estadio" ? 18 : 14;
    if (l.name) marks.push({ id: l.kind, name: l.name, pos: new THREE.Vector3(l.x, height(l.x, l.z) + top, l.z), kind: "land" });
  }

  // arena
  const arena = new THREE.Group();
  scene.add(arena);
  if (!auto) arena.add(drape(150, 46, 8, 46, layered(0xb7cf86, 1)));
  const colors = night ? [0xe3262e, 0x2a2a2e, 0x8c1016, 0x3a3a40, 0xe3262e, 0x2a2a2e] : [0xff5a1f, 0x2f8cff, 0x14a37f, 0xffb21f, 0x9b59d0, 0x2f8cff];
  ev.arena.forEach((s, i) => {
    marks.push({ id: s.id, name: `${s.icon} ${s.name}`, pos: new THREE.Vector3(s.x, height(s.x, s.z) + 7, s.z), kind: "spot" });
    if (s.id === "largada") return;
    if (s.id === "podio") {
      const g = new THREE.Group();
      g.position.set(s.x, height(s.x, s.z), s.z);
      // palco + degraus em escala de gente (1º no meio, 2º à esquerda, 3º à direita de quem olha)
      box(g, 7, PODIUM.deck, 4.2, 0x6b7787, 0, 0, 0.4);
      const [first, second, third] = PODIUM.steps;
      box(g, 0.9, first.h, 0.8, 0xffc72c, first.x, PODIUM.deck, 0);
      box(g, 0.9, second.h, 0.8, 0xd7dbe0, second.x, PODIUM.deck, 0);
      box(g, 0.9, third.h, 0.8, 0xcd8a4e, third.x, PODIUM.deck, 0);
      for (const [n, st, bg] of [["1", first, "#ffc72c"], ["2", second, "#d7dbe0"], ["3", third, "#cd8a4e"]] as const) {
        const num = sign(g, [n], 0.5, 0.3, bg, "#0f2238", false);
        num.position.set(st.x, PODIUM.deck + st.h / 2, 0.41);
      }
      const back = sign(g, ["PÓDIO", ev.name.toUpperCase()], 5.6, 2.4, ev.colors.dark, night ? ev.colors.primary : "#ffffff");
      back.position.set(0, 2.1, -0.9);
      for (const sx of [-2.8, 2.8]) cyl(g, 0.06, 3.3, 0xcfd4da, sx, 0, -0.92, 6);
      arena.add(g);
      return;
    }
    if (s.id === "estac") {
      const w = s.w ?? 90, d = s.d ?? 34;
      arena.add(drape(w, d, s.x, s.z, layered(night ? 0x4a4c50 : 0x8d9095, 1)));
      const cols = Math.floor((w - 4) / 6.5), rows = Math.max(1, Math.floor(d / 14));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        const cx = s.x - ((cols - 1) * 6.5) / 2 + c * 6.5, cz = s.z + (r - (rows - 1) / 2) * 14;
        box(arena, 2.2, 1.4, 4.4, [0xd8433b, 0xf2f2f2, 0x2d3c55, 0x8a9aa6, 0x1c1c1c][k % 5], cx, height(cx, cz), cz);
      }
      return;
    }
    tent(arena, s.x, s.z, colors[i % colors.length], s.name.toUpperCase(), height(s.x, s.z), night);
  });

  // pórtico de largada / chegada (no sentido da largada)
  const arch = new THREE.Group();
  arch.position.set(start.x, height(start.x, start.z), start.z);
  arch.rotation.y = along;
  const orange = mat(new THREE.Color(ev.colors.primary).getHex(), { rough: 0.5, emissive: night ? new THREE.Color(ev.colors.primary).multiplyScalar(0.35).getHex() : 0 });
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 8, 4, 12), orange);
    col.position.set(0, 4.8, s * (HALF + 0.9));
    col.castShadow = true;
    arch.add(col);
  }
  const beam = new THREE.Mesh(new THREE.CapsuleGeometry(1, 2 * HALF + 1.8, 4, 12), orange);
  beam.rotation.x = Math.PI / 2;
  beam.position.y = 9.6;
  beam.castShadow = true;
  arch.add(beam);
  for (const s of [-1, 1]) {
    const b = sign(arch, ["LARGADA · CHEGADA"], 7.5, 1.6, ev.colors.dark, "#ffffff", false);
    b.position.set(s * 1.05, 9.6, 0);
    b.rotation.y = s * Math.PI / 2;
  }
  scene.add(arch);
  // grades do pelotão (antes do pórtico) e da reta final
  const fence = mat(0xd5d9de, { metal: 0.3, rough: 0.5 });
  const sp = paths.get(longest.id)!, fa = { x: 0, z: 0, dx: 1, dz: 0 };
  for (let s = auto ? -46 : -70; s <= (auto ? 26 : 40); s += 3) {
    sp.at(s, fa);
    for (const side of [-1, 1]) {
      const x = fa.x - fa.dz * side * (HALF + 0.35), z = fa.z + fa.dx * side * (HALF + 0.35);
      box(scene, 2.8, 0.9, 0.08, fence, x, height(x, z), z, false).rotation.y = Math.atan2(-fa.dz, fa.dx);
    }
  }

  // placas de km e hidratação por distância (em percurso de voltas, a mesma placa junta os km: "1 · 6 km")
  const kmGroups = new Map<string, THREE.Group>();
  ev.distances.forEach((d, di) => {
    const g = new THREE.Group();
    const p = paths.get(d.id)!;
    const scale = p.length / d.km;
    const side = di === 0 ? -1 : 1;
    const at = { x: 0, z: 0, dx: 1, dz: 0 };
    const kmAt: { x: number; z: number; yaw: number; ks: number[] }[] = [];
    for (let k = 1; k < d.km; k++) {
      p.at(k * scale, at);
      const nx = -at.dz * side, nz = at.dx * side;
      const x = at.x + nx * (HALF + 1.2), z = at.z + nz * (HALF + 1.2);
      const same = kmAt.find((q) => Math.hypot(q.x - x, q.z - z) < 4);
      if (same) same.ks.push(k);
      else kmAt.push({ x, z, yaw: Math.atan2(-at.dx, -at.dz), ks: [k] });
    }
    for (const q of kmAt) {
      const post = new THREE.Group();
      post.position.set(q.x, height(q.x, q.z), q.z);
      post.rotation.y = q.yaw;
      cyl(post, 0.1, 3.2, 0xffffff, 0, 0, 0, 6);
      const txt = `${q.ks.join(" · ")} km`;
      const s = sign(post, [txt], 2.6, 1.3, d.color, night ? "#140a0b" : "#ffffff");
      s.position.y = 3.6;
      g.add(post);
      marks.push({ id: `${d.id}-km${q.ks[0]}`, name: txt, pos: new THREE.Vector3(q.x, height(q.x, q.z) + 5, q.z), dist: d.id, kind: "km" });
    }
    const waterAt: { x: number; z: number; ws: number[] }[] = [];
    for (const w of d.water) {
      p.at(w * scale, at);
      const nx = at.dz * side, nz = -at.dx * side;
      const x = at.x - nx * (HALF + 2.6), z = at.z - nz * (HALF + 2.6);
      const same = waterAt.find((q) => Math.hypot(q.x - x, q.z - z) < 6);
      if (same) {
        same.ws.push(w);
        continue;
      }
      waterAt.push({ x, z, ws: [w] });
      const post = new THREE.Group();
      post.position.set(x, height(x, z), z);
      post.rotation.y = Math.atan2(at.dx, at.dz) + Math.PI / 2;
      box(post, 8, 0.9, 1.2, 0xf2efe6, 0, 0, 0);
      for (let c = 0; c < 10; c++) cyl(post, 0.16, 0.36, 0x2f8cff, -3.6 + c * 0.8, 0.9, 0, 8);
      const roof = box(post, 9, 0.3, 4, 0x2f8cff, 0, 3.2, 1);
      roof.castShadow = true;
      for (const [px, pz] of [[-4.2, -0.8], [4.2, -0.8], [-4.2, 2.8], [4.2, 2.8]]) cyl(post, 0.08, 3.2, 0xdddddd, px, 0, pz, 6);
      g.add(post);
    }
    for (const q of waterAt) {
      const kms = q.ws.map((w) => String(w).replace(".", ","));
      const name = `💧 Água · km ${kms.length > 1 ? `${kms.slice(0, -1).join(", ")} e ${kms[kms.length - 1]}` : kms[0]}`;
      marks.push({ id: `${d.id}-agua${q.ws[0]}`, name, pos: new THREE.Vector3(q.x, height(q.x, q.z) + 6, q.z), dist: d.id, kind: "water" });
    }
    scene.add(g);
    kmGroups.set(d.id, g);
  });

  const setFar = (f: boolean) => {
    far = f;
    for (const [k, g] of glows) g.visible = far && k === current;
  };
  const setDistance = (id: string) => {
    current = id;
    setFar(far);
    for (const [k, m] of paints) {
      m.opacity = k === id ? 1 : 0.28;
      m.transparent = true;
    }
    for (const [k, g] of kmGroups) g.visible = k === id;
  };
  setDistance(ev.distances[0].id);

  const update = (t: number, focus: THREE.Vector3) => {
    const s = 1 + Math.sin(t * 3) * 0.015;
    arch.scale.set(1, s, 1);
    sun.target.position.set(Math.round(focus.x / 20) * 20, 0, Math.round(focus.z / 20) * 20);
    sun.position.copy(sun.target.position).add(SUN_DIR);
    spot.position.set(focus.x + 4, height(focus.x, focus.z) + 16, focus.z + 6);
  };

  return { scene, paths, setDistance, setFar, marks, seats, update };
}
