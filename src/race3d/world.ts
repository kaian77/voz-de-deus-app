// Cenário da corrida (estilizado): terreno com subidas e descidas, pistas pelo percurso, pórtico de largada,
// arena (tendas, pódio, estacionamento), hidratação, placas de km e pontos de referência (Torre, Esplanada, Catedral, Congresso).
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
export function height(x: number, z: number) {
  return -x * 0.009 + 1.4 * Math.sin(x / 85) + 0.7 * Math.sin(z / 70 + 0.5) * Math.min(1, Math.abs(z) / 60);
}

export type World = {
  scene: THREE.Scene;
  paths: Map<string, Path>;
  setDistance: (id: string) => void;
  /** De longe a linha do percurso fica grossa para aparecer. */
  setFar: (far: boolean) => void;
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

function layered(color: number, layer: number, opts: { opacity?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 2,
    transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1,
  });
}

function sky() {
  const geo = new THREE.SphereGeometry(5000, 24, 12);
  const c = new THREE.Color(), cols: number[] = [];
  const top = new THREE.Color(0x6fa8dc), mid = new THREE.Color(0xcfe3f2), low = new THREE.Color(0xffd9b0);
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

function terrain() {
  const geo = new THREE.PlaneGeometry(4400, 3000, 260, 180).rotateX(-Math.PI / 2);
  geo.translate(220, 0, 0);
  const p = geo.attributes.position, cols: number[] = [];
  const a = new THREE.Color(0x9fbd62), b = new THREE.Color(0xc8bb7c), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, height(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 0.031 + Math.sin(z * 0.02) * 3) * Math.cos(z * 0.027);
    c.copy(a).lerp(b, Math.abs(z) < 30 ? 0.05 : n * 0.55);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  m.receiveShadow = true;
  // chão até o horizonte
  const base = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), mat(0xaab872, { rough: 1 }));
  base.position.y = -14;
  m.add(base);
  return m;
}

function trees(spots: [number, number, number][]) {
  const n = spots.length;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6).translate(0, 1.5, 0), mat(0x6b4e33), n);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), n);
  const M = new THREE.Matrix4(), C = new THREE.Color();
  const greens = [0x4f7d3a, 0x5d8c41, 0x6f9a48, 0x45703a];
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
function city(rand: () => number, avoid: (x: number, z: number) => boolean) {
  const geos: THREE.BufferGeometry[] = [];
  const pal = [0xf1ece1, 0xe6dfd0, 0xd9d4c7, 0xf4e3c8, 0xcfd8dc, 0xe8d5c4];
  const c = new THREE.Color();
  for (let i = 0; i < 260; i++) {
    const x = -560 + rand() * 1250, z = (rand() < 0.5 ? -1 : 1) * (80 + rand() * 520);
    if (avoid(x, z)) continue;
    const w = 14 + rand() * 18, d = 8 + rand() * 10, h = 3 + rand() * (Math.abs(z) < 200 ? 9 : 4);
    const g = new THREE.BoxGeometry(w, h, d).translate(x, height(x, z) + h / 2 - 0.5, z);
    c.setHex(pal[i % pal.length]);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    geos.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

function windows(floors: number, bays: number) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#eeeae0";
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = "#6f8fa6";
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) g.fillRect(3 + (b * 58) / bays, 6 + (f * 118) / floors, 58 / bays - 3, 118 / floors - 5);
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
  } else if (kind === "lago") {
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2400).rotateX(-Math.PI / 2), mat(0x4f8fb5, { rough: 0.15, metal: 0.1 }));
    lake.position.set(700, -height(x, z) - 8.6, 0);
    g.add(lake);
  }
  return g;
}

function tent(g: THREE.Object3D, x: number, z: number, color: number, label: string, y: number) {
  const t = new THREE.Group();
  t.position.set(x, y, z);
  for (const [px, pz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) cyl(t, 0.12, 3.4, 0xdddddd, px, 0, pz, 6);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6, 2.4, 4, 1), mat(0xffffff, { rough: 0.6 }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 4.6;
  roof.castShadow = true;
  t.add(roof);
  box(t, 8.2, 0.6, 8.2, color, 0, 3.2, 0);
  box(t, 6, 0.9, 1.2, 0xf2efe6, 0, 0, -2.6);
  const s = sign(t, [label], 7.6, 1.5, "#ffffff", "#0f2238");
  s.position.set(0, 2.4, -4.25);
  s.rotation.y = Math.PI;
  g.add(t);
}

export function buildWorld(ev: RaceEvent): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe3f2);
  scene.fog = new THREE.Fog(0xe6e9e6, 700, 2600);
  scene.add(sky());
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6f8a4a, 1.25));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.2);
  sun.position.set(500, 260, 220);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 10; sc.far = 1400;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  scene.add(terrain());

  const paths = new Map<string, Path>();
  for (const d of ev.distances) paths.set(d.id, new Path(d.points));
  const longest = [...ev.distances].sort((a, b) => b.km - a.km)[0];

  // pistas: o maior percurso inteiro; os outros só onde saem dele (retornos)
  const asphalt = layered(0x41464d, 1), lines = layered(0xf4f4f0, 2);
  const onLongest = (x: number, z: number) => Math.abs(Math.abs(z) - 12) < 0.6 && x > -342 && x < 620;
  for (const d of ev.distances) {
    const p = paths.get(d.id)!;
    const keep = d === longest ? undefined : (x: number, z: number) => !onLongest(x, z);
    scene.add(ribbon(p, HALF, 0, 0.05, asphalt, keep));
    for (const s of [-1, 1]) scene.add(ribbon(p, 0.08, s * (HALF - 0.25), 0.07, lines, keep));
  }
  // pintura do percurso, uma cor por distância
  const paints = new Map<string, THREE.MeshStandardMaterial>();
  const glows = new Map<string, THREE.Mesh>();
  let far = false, current = ev.distances[0].id;
  ev.distances.forEach((d, i) => {
    const m = layered(new THREE.Color(d.color).getHex(), 3, { opacity: 0.95 });
    m.emissive = new THREE.Color(d.color).multiplyScalar(0.25);
    paints.set(d.id, m);
    scene.add(ribbon(paths.get(d.id)!, 0.22, (i === 0 ? -1 : 1) * 1.05, 0.08, m));
    const g = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    const glow = ribbon(paths.get(d.id)!, 2.6, (i === 0 ? -1 : 1) * 2.2, 0.4, g);
    glow.visible = false;
    glows.set(d.id, glow);
    scene.add(glow);
  });

  // canteiro central e árvores
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots: [number, number, number][] = [];
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
  scene.add(trees(spots));
  scene.add(city(rand, (x, z) => (x > -100 && x < 120 && z > 15 && z < 125) || (x > 330 && x < 820 && Math.abs(z) < 90) || Math.hypot(x - 330, z - 70) < 40 || Math.hypot(x + 400, z) < 40));

  const marks: World["marks"] = [];
  for (const l of ev.landmarks) {
    landmark(scene, l.kind, l.x, l.z);
    if (l.name) marks.push({ id: l.kind, name: l.name, pos: new THREE.Vector3(l.x, height(l.x, l.z) + (l.kind === "torre" ? 50 : l.kind === "congresso" ? 26 : 14), l.z), kind: "land" });
  }

  // arena
  const arena = new THREE.Group();
  scene.add(arena);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(150, 46).rotateX(-Math.PI / 2), layered(0xb7cf86, 1));
  field.position.set(8, height(8, 46) + 0.05, 46);
  field.receiveShadow = true;
  arena.add(field);
  const colors = [0xff5a1f, 0x2f8cff, 0x14a37f, 0xffb21f, 0x9b59d0, 0x2f8cff];
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
      const back = sign(g, ["PÓDIO", ev.name.toUpperCase()], 5.6, 2.4, ev.colors.dark, "#ffffff");
      back.position.set(0, 2.1, -0.9);
      for (const sx of [-2.8, 2.8]) cyl(g, 0.06, 3.3, 0xcfd4da, sx, 0, -0.92, 6);
      arena.add(g);
      return;
    }
    if (s.id === "estac") {
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(90, 34).rotateX(-Math.PI / 2), layered(0x8d9095, 1));
      lot.position.set(s.x, height(s.x, s.z) + 0.06, s.z);
      arena.add(lot);
      for (let k = 0; k < 26; k++) {
        const cx = s.x - 40 + (k % 13) * 6.5, cz = s.z + (k < 13 ? -7 : 7);
        box(arena, 2.2, 1.4, 4.4, [0xd8433b, 0xf2f2f2, 0x2d3c55, 0x8a9aa6, 0x1c1c1c][k % 5], cx, height(cx, cz), cz);
      }
      return;
    }
    tent(arena, s.x, s.z, colors[i % colors.length], s.name.toUpperCase(), height(s.x, s.z));
  });

  // pórtico de largada / chegada
  const start = paths.get(longest.id)!.at(0);
  const arch = new THREE.Group();
  arch.position.set(start.x, height(start.x, start.z), start.z);
  const orange = mat(new THREE.Color(ev.colors.primary).getHex(), { rough: 0.5 });
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
  for (let x = -70; x <= 40; x += 3) for (const s of [-1, 1]) {
    const z = start.z + s * (HALF + 0.35);
    box(scene, 2.8, 0.9, 0.08, fence, x, height(x, z), z, false);
  }

  // placas de km e hidratação por distância
  const kmGroups = new Map<string, THREE.Group>();
  ev.distances.forEach((d, di) => {
    const g = new THREE.Group();
    const p = paths.get(d.id)!;
    const scale = p.length / d.km;
    const side = di === 0 ? -1 : 1;
    const at = { x: 0, z: 0, dx: 1, dz: 0 };
    for (let k = 1; k < d.km; k++) {
      p.at(k * scale, at);
      const nx = -at.dz * side, nz = at.dx * side;
      const x = at.x + nx * (HALF + 1.2), z = at.z + nz * (HALF + 1.2);
      const post = new THREE.Group();
      post.position.set(x, height(x, z), z);
      post.rotation.y = Math.atan2(-at.dx, -at.dz);
      cyl(post, 0.1, 3.2, 0xffffff, 0, 0, 0, 6);
      const s = sign(post, [`${k} km`], 2.6, 1.3, d.color, "#ffffff");
      s.position.y = 3.6;
      g.add(post);
      marks.push({ id: `${d.id}-km${k}`, name: `${k} km`, pos: new THREE.Vector3(x, height(x, z) + 5, z), dist: d.id, kind: "km" });
    }
    for (const w of d.water) {
      p.at(w * scale, at);
      const nx = at.dz * side, nz = -at.dx * side;
      const x = at.x - nx * (HALF + 2.6), z = at.z - nz * (HALF + 2.6);
      const post = new THREE.Group();
      post.position.set(x, height(x, z), z);
      post.rotation.y = Math.atan2(at.dx, at.dz) + Math.PI / 2;
      box(post, 8, 0.9, 1.2, 0xf2efe6, 0, 0, 0);
      for (let c = 0; c < 10; c++) cyl(post, 0.16, 0.36, 0x2f8cff, -3.6 + c * 0.8, 0.9, 0, 8);
      const roof = box(post, 9, 0.3, 4, 0x2f8cff, 0, 3.2, 1);
      roof.castShadow = true;
      for (const [px, pz] of [[-4.2, -0.8], [4.2, -0.8], [-4.2, 2.8], [4.2, 2.8]]) cyl(post, 0.08, 3.2, 0xdddddd, px, 0, pz, 6);
      g.add(post);
      marks.push({ id: `${d.id}-agua${w}`, name: `💧 Água · km ${String(w).replace(".", ",")}`, pos: new THREE.Vector3(x, height(x, z) + 6, z), dist: d.id, kind: "water" });
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
  };

  return { scene, paths, setDistance, setFar, marks, update };
}
