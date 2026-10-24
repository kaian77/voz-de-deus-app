// Condomínio inteiro em 3D (estilizado): blocos, portaria, lazer clube montado pelas imagens do site,
// bonequinhos andando, crianças no playground e na piscina, carros entrando pela cancela e sol por horário.
import * as THREE from "three";
import { box, cyl, ball, mat } from "./furniture";
import type { Project } from "./types";

const FLOOR_H = 3, BASE_H = 3.6, BL = 38, BD = 16;

export type BlockRef = { id: string; group: THREE.Group; floors: number; pick: THREE.Object3D[] };
export type Condo = {
  scene: THREE.Scene;
  blocks: BlockRef[];
  hotspots: { id: string; pos: THREE.Vector3 }[];
  setHour: (h: number) => void;
  update: (dt: number, t: number) => void;
  /** Destaca a unidade na fachada e devolve onde ela fica. */
  highlight: (block: string | null, floor?: number, unit?: number) => THREE.Vector3 | null;
  blockTop: (id: string) => THREE.Vector3;
  clubPos: THREE.Vector3;
};

/** Posição (no bloco) da unidade final `unit` do andar `floor` (8 = cobertura). */
function unitLocal(floors: number, floor: number, unit: number) {
  if (floor > floors) return new THREE.Vector3(unit === 1 ? -7.5 : 7.5, BASE_H + floors * FLOOR_H + 1.5, BD / 2 - 1);
  return new THREE.Vector3(-BL / 2 + 4.75 + (unit - 1) * 9.5, BASE_H + (floor - 1) * FLOOR_H + 1.5, BD / 2 + 1.7);
}

function facadeTexture(w: number, floors: number, units: number, primary: string, night: boolean) {
  const c = document.createElement("canvas");
  const pxm = 24;
  c.width = Math.round(w * pxm);
  c.height = Math.round(floors * FLOOR_H * pxm);
  const g = c.getContext("2d")!;
  g.fillStyle = night ? "#000" : "#ecebe6";
  g.fillRect(0, 0, c.width, c.height);
  const uw = c.width / units;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let f = 0; f < floors; f++) {
    const y = c.height - (f + 1) * FLOOR_H * pxm;
    for (let u = 0; u < units; u++) {
      const x = u * uw;
      if (!night) {
        g.fillStyle = primary;
        g.globalAlpha = 0.85;
        g.fillRect(x + uw - 10, y, 10, FLOOR_H * pxm);
        g.globalAlpha = 1;
      }
      for (let k = 0; k < 3; k++) {
        const wx = x + uw * (0.1 + k * 0.29), ww = uw * 0.22;
        const lit = rnd() < 0.45;
        g.fillStyle = night ? (lit ? `rgba(255,${200 + Math.round(rnd() * 40)},140,1)` : "#000") : "#46525a";
        g.fillRect(wx, y + 14, ww, FLOOR_H * pxm - 26);
        if (!night) {
          g.fillStyle = "rgba(255,255,255,.18)";
          g.fillRect(wx, y + 14, ww * 0.35, FLOOR_H * pxm - 26);
          g.fillStyle = "#2c2c2a";
          g.fillRect(wx + ww / 2 - 1, y + 14, 2, FLOOR_H * pxm - 26);
        }
      }
    }
    if (!night) {
      g.fillStyle = "#d9d6cf";
      g.fillRect(0, y, c.width, 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function tree(g: THREE.Object3D, x: number, z: number, s = 1) {
  cyl(g, 0.18 * s, 2.2 * s, 0x7a5a3a, x, 0, z, 6);
  ball(g, 1.5 * s, 0x5b8a3c, x, 3 * s, z, 7);
  ball(g, 1.1 * s, 0x6e9e48, x + 0.7 * s, 3.6 * s, z + 0.3 * s, 6);
}

function palm(g: THREE.Object3D, x: number, z: number, h = 6) {
  const trunk = cyl(g, 0.22, h, 0x9b8160, x, 0, z, 6, 0.16);
  trunk.rotation.z = 0.05;
  const leaf = mat(0x4f8a35);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 4), leaf);
    l.position.set(x + Math.cos(a) * 1.3, h + 0.1, z + Math.sin(a) * 1.3);
    l.rotation.set(0, -a, 0);
    l.rotateZ(-Math.PI / 2 + 0.35);
    l.scale.set(1, 1, 0.25);
    l.castShadow = true;
    g.add(l);
  }
}

function fence(g: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, h = 3) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(L, h), mat(0x30332f, { opacity: 0.22 }));
  m.material.side = THREE.DoubleSide;
  m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
  m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  g.add(m);
  const n = Math.max(1, Math.round(L / 3));
  for (let i = 0; i <= n; i++) cyl(g, 0.05, h, 0x30332f, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, 5);
}

function flat(g: THREE.Object3D, w: number, d: number, color: number | THREE.Material, x: number, z: number, y = 0.02, rot = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), typeof color === "number" ? mat(color) : color);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rot;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  g.add(m);
  return m;
}

// ---------- pessoas
const SKIN = [0xf1c7a5, 0xd9a47c, 0xa86f4c, 0x7a4a2f];
const SHIRT = [0xe3735e, 0x4e5a40, 0xf2c14e, 0x5b8fb9, 0xf5f3ec, 0xc96f9e, 0x7fb069];
type Person = { g: THREE.Group; legL: THREE.Object3D; legR: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D };
function person(seed: number, kid = false): Person {
  const g = new THREE.Group();
  const pivot = (x: number, y: number) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    g.add(p);
    return p;
  };
  const pants = [0x2f3a4a, 0x4a3f35, 0x6c757d, 0x223][seed % 4];
  const legL = pivot(-0.1, 0.8), legR = pivot(0.1, 0.8);
  box(legL, 0.13, 0.8, 0.14, pants, 0, -0.8);
  box(legR, 0.13, 0.8, 0.14, pants, 0, -0.8);
  const shirt = SHIRT[seed % SHIRT.length];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 3, 8), mat(shirt));
  body.position.y = 1.12;
  body.castShadow = true;
  g.add(body);
  const armL = pivot(-0.27, 1.4), armR = pivot(0.27, 1.4);
  box(armL, 0.09, 0.55, 0.1, shirt, 0, -0.55);
  box(armR, 0.09, 0.55, 0.1, shirt, 0, -0.55);
  ball(g, 0.16, SKIN[seed % SKIN.length], 0, 1.62, 0, 10);
  const hair = ball(g, 0.165, [0x2b1d14, 0x5a3b22, 0xc9a25b, 0x111111][seed % 4], 0, 1.67, -0.02, 10);
  hair.scale.set(1, 0.7, 1);
  if (kid) g.scale.setScalar(0.62);
  return { g, legL, legR, armL, armR };
}
function walkAnim(p: Person, phase: number, amp = 0.6) {
  const s = Math.sin(phase) * amp;
  p.legL.rotation.x = s;
  p.legR.rotation.x = -s;
  p.armL.rotation.x = -s * 0.8;
  p.armR.rotation.x = s * 0.8;
}

function car(color: number) {
  const g = new THREE.Group();
  box(g, 1.8, 0.6, 4.2, mat(color, { rough: 0.35, metal: 0.3 }), 0, 0.3);
  box(g, 1.6, 0.55, 2.2, mat(0x24303a, { rough: 0.1, metal: 0.4 }), 0, 0.9, -0.2);
  for (const [x, z] of [[-0.9, 1.35], [0.9, 1.35], [-0.9, -1.35], [0.9, -1.35]]) {
    const w = cyl(g, 0.34, 0.25, 0x161616, x, 0.34 - 0.125, z, 12);
    w.rotation.z = Math.PI / 2;
    w.position.y = 0.34;
  }
  const lamp = box(g, 1.4, 0.12, 0.05, mat(0xfff3c4, { emissive: 0x000000 }), 0, 0.45, 2.1, false);
  g.userData.lamp = lamp;
  return g;
}

export function buildCondo(project: Project): Condo {
  const scene = new THREE.Scene();
  const primary = new THREE.Color(project.colors.primary).getHex();
  const hemi = new THREE.HemisphereLight(0xdfefff, 0x6b7a4f, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog(0xcfe3ee, 260, 620);

  // ---- chão
  flat(scene, 900, 900, 0x7d9a55, 0, 0, -0.02);
  flat(scene, 172, 128, 0xd9d3c4, 0, -1.5, 0);
  flat(scene, 104, 66, 0x86a75a, 0, 2, 0.01); // jardim do lazer
  flat(scene, 600, 11, 0x3b3d40, 0, 72, 0.015);
  for (let x = -290; x < 290; x += 8) flat(scene, 3.5, 0.25, 0xf2f2f2, x, 72, 0.02);
  flat(scene, 600, 3, 0xcfcac0, 0, 65.5, 0.018);
  // via interna
  const asphalt = mat(0x55585a);
  flat(scene, 156, 7, asphalt, 0, 52, 0.02);
  flat(scene, 7, 107, asphalt, -75, -2, 0.021);
  flat(scene, 7, 107, asphalt, 75, -2, 0.021);
  flat(scene, 157, 7, asphalt, 0, -56, 0.022);
  flat(scene, 7, 12, asphalt, 0, 59, 0.023);
  // muro com a portaria
  const wallM = mat(0xe6e1d6);
  for (const [x0, x1] of [[-86, -5], [5, 86]]) box(scene, x1 - x0, 2.4, 0.3, wallM, (x0 + x1) / 2, 0, 63.8);
  box(scene, 0.3, 2.4, 128, wallM, -86, 0, -0.2);
  box(scene, 0.3, 2.4, 128, wallM, 86, 0, -0.2);
  box(scene, 172, 2.4, 0.3, wallM, 0, 0, -64.2);
  const port = new THREE.Group();
  box(port, 6, 3, 4.5, 0xf3f1ec);
  box(port, 6.2, 0.6, 4.7, primary, 0, 3);
  box(port, 5.6, 1.4, 0.05, mat(0x8fb7c9, { opacity: 0.6 }), 0, 1.2, -2.27, false);
  box(port, 14, 0.25, 7, 0xf3f1ec, -4, 3.6, 0);
  cyl(port, 0.15, 3.6, 0x30332f, -10.5, 0, 3);
  cyl(port, 0.15, 3.6, 0x30332f, -10.5, 0, -3);
  port.position.set(9, 0, 60);
  scene.add(port);
  const sign = (() => {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 160;
    const g = c.getContext("2d")!;
    g.fillStyle = project.colors.primary;
    g.fillRect(0, 0, 1024, 160);
    g.fillStyle = "#fff";
    g.font = "64px 'DM Serif Display', Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(project.name, 512, 84, 980);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(-22, 1.6, 64.1);
    return m;
  })();
  scene.add(sign);
  box(scene, 15, 3.2, 0.3, primary, -22, 0, 63.95);
  const gate = new THREE.Group();
  box(gate, 0.4, 1.1, 0.4, 0xf2c14e);
  const arm = new THREE.Group();
  arm.position.set(0, 1.0, 0);
  box(arm, 7, 0.12, 0.12, 0xe3262e, 3.5, 0, 0);
  gate.add(arm);
  gate.position.set(-4, 0, 62.5);
  scene.add(gate);

  // ---- blocos
  const blocks: BlockRef[] = [];
  const nightTex: THREE.MeshStandardMaterial[] = [];
  const spots: [string, number, number, number][] = [["A", -40, -42, 0], ["B", 40, -42, 0], ["C", -58, 15, Math.PI / 2], ["D", 58, 15, -Math.PI / 2]];
  const slabGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [id, x, z, rot] of spots) {
    const floors = project.blocks.find((b) => b.id === id)?.floors ?? 7;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const H = floors * FLOOR_H;
    // térreo recuado com vidro
    box(g, BL - 2, BASE_H, BD - 2, mat(0x3c4a52, { rough: 0.2, metal: 0.3 }));
    for (let i = 0; i < 8; i++) box(g, 0.5, BASE_H, 0.5, 0xe9e6df, -BL / 2 + 1 + (i * (BL - 2)) / 7, 0, BD / 2 - 1.2);
    const front = facadeTexture(BL, floors, 4, project.colors.primary, false);
    const frontN = facadeTexture(BL, floors, 4, project.colors.primary, true);
    const side = facadeTexture(BD, floors, 2, project.colors.primary, false);
    const sideN = facadeTexture(BD, floors, 2, project.colors.primary, true);
    const mk = (map: THREE.Texture, em: THREE.Texture) => {
      const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
      nightTex.push(m);
      return m;
    };
    const roofM = mat(0xcfcac0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(BL, H, BD), [mk(side, sideN), mk(side, sideN), roofM, roofM, mk(front, frontN), mk(front, frontN)]);
    body.position.y = BASE_H + H / 2;
    body.castShadow = body.receiveShadow = true;
    body.userData.block = id;
    g.add(body);
    // varandas (lajes + vidro) na frente e atrás
    const n = floors * 4 * 2;
    const slabs = new THREE.InstancedMesh(slabGeo, mat(0xf7f6f2), n);
    const rails = new THREE.InstancedMesh(slabGeo, mat(0x9cc7d6, { opacity: 0.45, rough: 0.1 }), n);
    const o = new THREE.Object3D();
    let k = 0;
    for (let f = 0; f < floors; f++) {
      for (let u = 0; u < 4; u++) {
        for (const s of [1, -1]) {
          const ux = -BL / 2 + 4.75 + u * 9.5 + (s * 1.5);
          o.position.set(ux, BASE_H + f * FLOOR_H + 0.1, s * (BD / 2 + 0.7));
          o.scale.set(5.2, 0.22, 1.4);
          o.updateMatrix();
          slabs.setMatrixAt(k, o.matrix);
          o.position.set(ux, BASE_H + f * FLOOR_H + 0.7, s * (BD / 2 + 1.38));
          o.scale.set(5.2, 1.0, 0.05);
          o.updateMatrix();
          rails.setMatrixAt(k, o.matrix);
          k++;
        }
      }
    }
    slabs.castShadow = true;
    slabs.receiveShadow = true;
    g.add(slabs, rails);
    // cobertura recuada com terraço, pergolado e hidro
    const top = BASE_H + H;
    const pent = box(g, 30, 3, 11, 0xf1efe9, 0, top, -2.2);
    pent.userData.block = id;
    box(g, 30.6, 0.3, 11.6, primary, 0, top + 3, -2.2);
    box(g, 37.6, 0.9, 0.2, mat(0x9cc7d6, { opacity: 0.45 }), 0, top, BD / 2 - 0.1, false);
    for (let i = 0; i < 6; i++) box(g, 0.15, 0.15, 4.6, 0x8a6a45, -14 + i * 2.2, top + 2.6, 5.6);
    box(g, 2, 0.5, 2, 0xd9cbb2, 12, top, 5.6);
    flat(g, 1.6, 1.6, mat(0x58c3d6, { emissive: 0x0b3b48 }), 12, 5.6, top + 0.52);
    // letra do bloco
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const cg = c.getContext("2d")!;
    cg.fillStyle = project.colors.primary;
    cg.beginPath();
    cg.arc(64, 64, 60, 0, Math.PI * 2);
    cg.fill();
    cg.fillStyle = "#fff";
    cg.font = "bold 76px Jost, system-ui, sans-serif";
    cg.textAlign = "center";
    cg.textBaseline = "middle";
    cg.fillText(id, 64, 68);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    const badge = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ map: tx }));
    badge.position.set(-BL / 2 + 2.5, BASE_H - 1.2, BD / 2 + 0.02);
    g.add(badge);
    scene.add(g);
    blocks.push({ id, group: g, floors, pick: [body, pent] });
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(9, 2.8, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.55, depthWrite: false }));
  hl.visible = false;
  scene.add(hl);

  // ---- clube (térreo com os espaços internos)
  const lit: THREE.MeshStandardMaterial[] = [];
  const glow = (color: number) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.4 });
    lit.push(m);
    return m;
  };
  const pavilion = (x: number, z: number, w: number, d: number) => {
    const g = new THREE.Group();
    box(g, w, 4, d, mat(0x55636b, { rough: 0.15, metal: 0.3 }));
    box(g, w + 0.6, 0.4, d + 0.6, 0xf3f1ec, 0, 4);
    flat(g, w - 1, d - 1, 0x7fa456, 0, 0, 4.42);
    for (let i = 0; i <= Math.round(w / 4); i++) box(g, 0.25, 4, 0.25, 0xf3f1ec, -w / 2 + (i * w) / Math.round(w / 4), 0, -d / 2 - 0.1);
    box(g, w - 0.4, 3.2, 0.05, glow(0xffe2a8), 0, 0.3, -d / 2 + 0.05, false).material.opacity = 1;
    g.position.set(x, 0, z);
    scene.add(g);
  };
  pavilion(-14, 40, 26, 9);
  pavilion(25, 40, 22, 9);

  // ---- lazer externo
  const deck = mat(0xc9c2b2);
  const water = new THREE.MeshStandardMaterial({ color: 0x4fc3d9, roughness: 0.08, metalness: 0.1, emissive: 0x0d5566, emissiveIntensity: 0.15 });
  lit.push(water);
  flat(scene, 34, 18, deck, -10, 2, 0.03);
  box(scene, 24, 0.12, 10, water, -10, -0.05, 2, false);
  for (let i = 1; i < 6; i++) flat(scene, 23.5, 0.12, mat(0x2f8fb0), -10, 2 - 5 + i * (10 / 6), 0.09);
  for (const hx of [-18, -10, -2]) {
    box(scene, 2.6, 0.35, 2.6, 0xd9cbb2, hx, 0, 7.9);
    flat(scene, 2.2, 2.2, water, hx, 7.9, 0.37);
  }
  for (let i = 0; i < 6; i++) {
    const l = new THREE.Group();
    box(l, 0.7, 0.3, 1.9, 0xf7f6f2);
    box(l, 0.7, 0.1, 0.6, primary, 0, 0.3, -0.6).rotation.x = -0.6;
    l.position.set(-24 + i * 2.6, 0, -5);
    l.rotation.y = Math.PI;
    scene.add(l);
  }
  for (const ux of [-20, -9, 2]) {
    cyl(scene, 0.06, 2.4, 0xeeeeee, ux, 0, -6.5, 6);
    const u = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 10), mat(0xd8c7a4));
    u.position.set(ux, 2.5, -6.5);
    u.castShadow = true;
    scene.add(u);
  }
  // piscina infantil redonda com brinquedo aquático
  const kid = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 0.3, 40), deck);
  kid.position.set(14, 0.15, -4);
  kid.receiveShadow = true;
  scene.add(kid);
  const kidW = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.32, 40), water);
  kidW.position.set(14, 0.17, -4);
  scene.add(kidW);
  const toy = new THREE.Group();
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(toy, 0.12, 3, 0xf3f1ec, px, 0, pz, 8);
  box(toy, 2.6, 0.2, 2.6, 0x6fae4a, 0, 3);
  ball(toy, 0.7, 0x4f8a35, 0, 3.7, 0, 12);
  const slideK = cyl(toy, 0.5, 3.4, 0xf2c14e, 2.2, 0.6, 0, 12);
  slideK.rotation.z = 1.0;
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 3), mat(0x5aa04a));
    leaf.position.set(-1.6, 1.2, -1 + i * 0.5);
    leaf.rotation.z = 1.2;
    toy.add(leaf);
  }
  const bucket = cyl(toy, 0.45, 0.6, 0x3d6fd8, 0, 3.9, -1.4, 10);
  toy.position.set(14, 0.3, -4);
  scene.add(toy);
  // espaço gourmet com pergolado e luzes
  const gourmet = new THREE.Group();
  flat(gourmet, 14, 9, 0xb8b0a0, 0, 0, 0.04);
  for (const sx of [-6, 6]) for (const sz of [-3.5, 3.5]) box(gourmet, 0.25, 3, 0.25, 0x2d2d2b, sx, 0, sz);
  for (let i = 0; i < 12; i++) box(gourmet, 0.12, 0.2, 7.4, 0x2d2d2b, -6 + i * 1.1, 3, 0);
  for (let i = 0; i < 5; i++) ball(gourmet, 0.8, 0x4f8a35, -5 + i * 2.5, 3.3, (i % 2 ? 1 : -1) * 2, 6);
  box(gourmet, 4, 2.6, 0.6, 0xf3f1ec, 4, 0, -4.2);
  box(gourmet, 3.6, 0.95, 0.6, 0x2d2d2b, 4, 0, -3.6);
  box(gourmet, 5, 0.06, 1.2, 0x8a6a45, -1, 0.76, 0);
  for (let i = 0; i < 4; i++) {
    box(gourmet, 0.45, 0.45, 0.45, 0x2f3a4a, -3 + i * 1.3, 0, -0.95);
    box(gourmet, 0.45, 0.45, 0.45, 0x2f3a4a, -3 + i * 1.3, 0, 0.95);
  }
  const bulbs = glow(0xfff0b0);
  for (let i = 0; i < 18; i++) ball(gourmet, 0.08, bulbs, -6 + (i * 12) / 17, 2.85 - Math.sin((i / 17) * Math.PI) * 0.3, 0, 6);
  box(gourmet, 6, 0.4, 3, 0xd9cbb2, -2, 0, 6.5);
  flat(gourmet, 5.4, 2.4, water, -2, 6.5, 0.42);
  gourmet.position.set(-34, 0, -10);
  scene.add(gourmet);
  // quadra poliesportiva
  const court = new THREE.Group();
  flat(court, 22, 13, 0xc46a3f, 0, 0, 0.04);
  flat(court, 4, 4.2, 0x3e8f8a, -8, 0, 0.05);
  flat(court, 4, 4.2, 0x3e8f8a, 8, 0, 0.05);
  const line = mat(0xffffff);
  flat(court, 20, 0.08, line, 0, -5.5, 0.06);
  flat(court, 20, 0.08, line, 0, 5.5, 0.06);
  flat(court, 0.08, 11, line, -10, 0, 0.06);
  flat(court, 0.08, 11, line, 10, 0, 0.06);
  flat(court, 0.08, 11, line, 0, 0, 0.06);
  for (const s of [-1, 1]) {
    box(court, 0.1, 2, 0.1, 0xffffff, s * 10, 0, -1.5);
    box(court, 0.1, 2, 0.1, 0xffffff, s * 10, 0, 1.5);
    box(court, 0.1, 0.1, 3, 0xffffff, s * 10, 2, 0);
    box(court, 0.15, 3.2, 0.15, 0x30332f, s * 11.2, 0, 0);
    box(court, 0.05, 1, 1.6, 0xffffff, s * 11, 3, 0);
  }
  fence(court, -11.5, -6.8, 11.5, -6.8, 4);
  fence(court, -11.5, 6.8, 11.5, 6.8, 4);
  fence(court, -11.5, -6.8, -11.5, 6.8, 4);
  fence(court, 11.5, -6.8, 11.5, 6.8, 4);
  court.position.set(28, 0, 18);
  scene.add(court);
  // quadra de areia
  const beach = new THREE.Group();
  flat(beach, 18, 10, 0xe2cf9f, 0, 0, 0.04);
  for (const [w, d, x, z] of [[16, 0.15, 0, -4], [16, 0.15, 0, 4], [0.15, 8, -8, 0], [0.15, 8, 8, 0]] as const) flat(beach, w, d, 0xc4632e, x, z, 0.05);
  box(beach, 0.12, 2.4, 0.12, 0x30332f, 0, 0, -4.6);
  box(beach, 0.12, 2.4, 0.12, 0x30332f, 0, 0, 4.6);
  box(beach, 0.03, 0.8, 9.2, mat(0x111111, { opacity: 0.5 }), 0, 1.6, 0, false);
  fence(beach, -9, -5, 9, -5, 3.5);
  fence(beach, -9, 5, 9, 5, 3.5);
  beach.position.set(-26, 0, 22);
  scene.add(beach);
  // playground
  const play = new THREE.Group();
  flat(play, 12, 9, 0x7fb069, 0, 0, 0.04);
  flat(play, 5, 4, 0xf2a65a, -3, 1.5, 0.05);
  for (const sx of [-1.5, 1.5]) {
    const a = box(play, 0.12, 2.6, 0.12, 0x8a6a45, sx - 0.9, 0, -2.5);
    a.rotation.z = 0.15;
    const b = box(play, 0.12, 2.6, 0.12, 0x8a6a45, sx + 0.9, 0, -2.5);
    b.rotation.z = -0.15;
  }
  box(play, 4.6, 0.14, 0.14, 0x8a6a45, 0, 2.5, -2.5);
  const tower = new THREE.Group();
  box(tower, 1.6, 1.6, 1.6, 0x5b8fb9, 0, 0, 0);
  box(tower, 1.8, 0.8, 1.8, 0xe3735e, 0, 2.4);
  for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) box(tower, 0.1, 2.4, 0.1, 0xffffff, x, 0, z);
  const sl = box(tower, 0.7, 0.08, 3, 0xf2c14e, 0, 0.9, 2.1);
  sl.rotation.x = 0.5;
  tower.position.set(3, 0, 1);
  play.add(tower);
  const seesaw = box(play, 3, 0.1, 0.3, 0xe3735e, -3, 0.5, 2.5);
  box(play, 0.3, 0.5, 0.3, 0x30332f, -3, 0, 2.5);
  play.position.set(4, 0, 23);
  scene.add(play);
  // pergolado verde em arco (túnel)
  const tunnel = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.35, 6, 14, Math.PI), mat(0x5f8f3e));
    arc.position.set(0, 0, i * 2);
    arc.castShadow = true;
    tunnel.add(arc);
  }
  tunnel.position.set(36, 0, -16);
  scene.add(tunnel);
  // árvores e palmeiras
  for (const [x, z] of [[-28, -4], [-26, 9], [6, -6], [8, 10], [-4, -8], [22, -14], [-14, 14], [2, 14], [20, 4], [-40, 6], [40, 4], [-42, -24], [42, -26]]) palm(scene, x, z, 5 + ((x * z) % 3 + 3) / 2);
  for (let i = 0; i < 26; i++) {
    const a = i / 26;
    const x = -80 + a * 160, z = -60 + ((i * 37) % 7);
    tree(scene, x, z, 0.8 + (i % 3) * 0.2);
  }
  for (let i = 0; i < 14; i++) {
    tree(scene, -82, -50 + i * 8, 0.9);
    tree(scene, 82, -48 + i * 8, 0.9);
  }
  for (let i = 0; i < 10; i++) tree(scene, -40 + i * 9, 30.5, 0.6);
  // postes
  const lampHead = glow(0xfff2c2);
  for (let i = 0; i < 12; i++) {
    const x = -70 + i * 13;
    cyl(scene, 0.08, 4.5, 0x30332f, x, 0, 48.5, 6);
    ball(scene, 0.3, lampHead, x, 4.6, 48.5, 8);
  }
  // estacionamento com carros parados
  const parked = [0xf5f5f5, 0x2f3a4a, 0xb3261e, 0x9aa0a6, 0x111111, 0x5b8fb9, 0xf2c14e];
  for (let i = 0; i < 24; i++) {
    const side = i < 12 ? -1 : 1;
    const k = i % 12;
    if (Math.abs(side * (12 + k * 5)) < 9) continue;
    const c = car(parked[(i * 3) % parked.length]);
    c.position.set(side * (12 + k * 5.2), 0, 57.5);
    scene.add(c);
    flat(scene, 0.12, 5, 0xffffff, side * (12 + k * 5.2) + 2.6, 57.5, 0.03);
  }
  for (let i = 0; i < 10; i++) {
    for (const s of [-1, 1]) {
      const c = car(parked[(i * 5 + (s > 0 ? 2 : 0)) % parked.length]);
      c.position.set(s * 80.5, 0, -40 + i * 7);
      c.rotation.y = Math.PI / 2;
      scene.add(c);
    }
  }

  // ---- carros andando: rua → cancela → volta pela via interna → sai
  const path = new THREE.CatmullRomCurve3(
    [
      [-170, 70.5], [-30, 70.5], [-6, 70], [-1.5, 64], [-1.5, 56], [-8, 52.5], [-70, 52], [-74, 46], [-74, -50], [-70, -55], [70, -55],
      [74, -50], [74, 46], [70, 51.5], [8, 51.5], [1.5, 56], [1.5, 64], [6, 70], [30, 73.5], [170, 73.5],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false, "centripetal",
  );
  const pathLen = path.getLength();
  const movers = [0xf5f5f5, 0xb3261e, 0x5b8fb9, 0x2f3a4a].map((c, i) => ({ g: car(c), off: i / 4 }));
  for (const m of movers) scene.add(m.g);

  // ---- pessoas
  type Walker = { p: Person; curve: THREE.Curve<THREE.Vector3>; len: number; off: number; speed: number };
  const walkers: Walker[] = [];
  const loop = (pts: number[][]) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "centripetal");
  const loops = [
    loop([[-27, -7.5], [7, -7.5], [8, 11.5], [-27, 11.5]]),
    loop([[-46, -28], [46, -28], [46, 33], [-46, 33]]),
    loop([[6, 49], [6, 31], [-2, 28], [-10, 31], [-10, 49]]),
    loop([[18, -12], [24, -4], [18, 4], [9, 3], [7, -10]]),
  ];
  let seed = 1;
  for (const [li, n] of [[0, 5], [1, 7], [2, 3], [3, 3]] as const) {
    for (let i = 0; i < n; i++) {
      const p = person(seed++);
      scene.add(p.g);
      walkers.push({ p, curve: loops[li], len: loops[li].getLength(), off: i / n + li * 0.13, speed: 1 + ((seed * 7) % 5) / 10 });
    }
  }
  // crianças: balanço, escorregador, piscina infantil
  const swings: { g: THREE.Group; phase: number }[] = [];
  for (const sx of [-1.5, 1.5]) {
    const pivot = new THREE.Group();
    pivot.position.set(4 + sx, 2.5, 23 - 2.5);
    box(pivot, 0.02, 1.9, 0.02, 0x333333, -0.25, -1.9);
    box(pivot, 0.02, 1.9, 0.02, 0x333333, 0.25, -1.9);
    box(pivot, 0.6, 0.05, 0.3, 0xe3735e, 0, -1.95);
    const k = person(seed++, true);
    k.g.position.set(0, -2.45, 0);
    k.legL.rotation.x = k.legR.rotation.x = -1.2;
    pivot.add(k.g);
    scene.add(pivot);
    swings.push({ g: pivot, phase: sx });
  }
  const sliders: Person[] = [];
  for (let i = 0; i < 2; i++) {
    const k = person(seed++, true);
    scene.add(k.g);
    sliders.push(k);
  }
  const swimmers: { p: Person; x: number; z: number; ph: number; lane?: boolean }[] = [];
  for (const [x, z] of [[12.5, -5], [15.5, -2.5], [14, -6.5]]) {
    const k = person(seed++, true);
    scene.add(k.g);
    swimmers.push({ p: k, x, z, ph: x });
  }
  for (const z of [0.3, 3.6]) {
    const p = person(seed++);
    p.g.rotation.x = Math.PI / 2;
    scene.add(p.g);
    swimmers.push({ p, x: -10, z, ph: z, lane: true });
  }
  const players: { p: Person; cx: number; cz: number; ax: number; az: number; ph: number }[] = [];
  for (const [cx, cz, ax, az] of [[-30, 22, 2, 3], [-22, 22, 2, 3], [22, 18, 4, 3], [33, 16, 4, 3], [28, 21, 6, 2]]) {
    const p = person(seed++);
    scene.add(p.g);
    players.push({ p, cx, cz, ax, az, ph: cx + cz });
  }
  // sentados no gourmet
  for (let i = 0; i < 5; i++) {
    const p = person(seed++);
    p.g.position.set(-37 + i * 1.3, -0.35, -10 + (i % 2 ? 0.95 : -0.95));
    p.g.rotation.y = i % 2 ? Math.PI : 0;
    p.legL.rotation.x = p.legR.rotation.x = -1.4;
    scene.add(p.g);
  }

  // ---- hotspots do lazer (ids de project.amenities)
  const hotspots = [
    { id: "piscina", pos: new THREE.Vector3(-10, 3, 2) },
    { id: "infantil", pos: new THREE.Vector3(14, 5.5, -4) },
    { id: "gourmet-ext", pos: new THREE.Vector3(-34, 5, -10) },
    { id: "quadra", pos: new THREE.Vector3(28, 5, 18) },
    { id: "beach", pos: new THREE.Vector3(-26, 4.5, 22) },
    { id: "playground", pos: new THREE.Vector3(4, 4.5, 23) },
    { id: "lobby", pos: new THREE.Vector3(-24, 6, 40) },
    { id: "festas", pos: new THREE.Vector3(-17, 6, 40) },
    { id: "gourmet", pos: new THREE.Vector3(-10.5, 6, 40) },
    { id: "coworking", pos: new THREE.Vector3(-4, 6, 40) },
    { id: "brinquedoteca", pos: new THREE.Vector3(16, 6, 40) },
    { id: "academia", pos: new THREE.Vector3(22, 6, 40) },
    { id: "lavanderia", pos: new THREE.Vector3(28, 6, 40) },
    { id: "pet", pos: new THREE.Vector3(34, 6, 40) },
    { id: "bike", pos: new THREE.Vector3(13, 4, 56) },
  ];

  // ---- sol por horário
  const skyDay = new THREE.Color(0x9fd0ef), skyDusk = new THREE.Color(0xf2b27a), skyNight = new THREE.Color(0x0f1a2e);
  const sunDay = new THREE.Color(0xfff6e5), sunDusk = new THREE.Color(0xffa060);
  const bg = new THREE.Color();
  let night = 0;
  const setHour = (h: number) => {
    const a = ((h - 6) / 12) * Math.PI; // 6h nasce no leste, 18h se põe no oeste
    const elev = Math.sin(a);
    const R = 200;
    sun.position.set(Math.cos(a) * R, Math.max(elev, 0.02) * R * 0.9 + 4, -R * 0.35);
    sun.target.position.set(0, 0, 0);
    const day = THREE.MathUtils.clamp(elev * 2.2, 0, 1);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(elev) * 4, 0, 1) * (h > 5 && h < 19.5 ? 1 : 0);
    night = THREE.MathUtils.clamp(-elev * 4 + 0.15, 0, 1);
    sun.intensity = 2.4 * day + 0.3 * dusk;
    sun.color.copy(sunDay).lerp(sunDusk, dusk);
    hemi.intensity = 0.25 + 0.75 * day;
    bg.copy(skyNight).lerp(skyDay, day);
    bg.lerp(skyDusk, dusk * 0.6);
    scene.background = bg;
    (scene.fog as THREE.Fog).color.copy(bg);
    for (const m of nightTex) m.emissiveIntensity = night * 1.1;
    for (const m of lit) m.emissiveIntensity = (m === water ? 0.15 : 0) + night * 1.4;
    for (const m of movers) (m.g.userData.lamp.material as THREE.MeshStandardMaterial).emissive.setHex(night > 0.3 ? 0xfff3c4 : 0);
  };
  setHour(9.5);

  // ---- animação
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  let gateOpen = 0;
  const update = (dt: number, t: number) => {
    let near = false;
    for (const m of movers) {
      const u = ((t * 7) / pathLen + m.off) % 1;
      path.getPointAt(u, tmp);
      path.getTangentAt(u, tan);
      m.g.position.copy(tmp);
      m.g.rotation.y = Math.atan2(tan.x, tan.z);
      if (Math.abs(tmp.x) < 9 && tmp.z > 54 && tmp.z < 72) near = true;
    }
    gateOpen += ((near ? 1 : 0) - gateOpen) * Math.min(1, dt * 3);
    arm.rotation.z = gateOpen * 1.4;
    for (const w of walkers) {
      const u = (((t * w.speed) / w.len) + w.off) % 1;
      w.curve.getPointAt(u, tmp);
      w.curve.getTangentAt(u, tan);
      w.p.g.position.copy(tmp);
      w.p.g.rotation.y = Math.atan2(tan.x, tan.z);
      walkAnim(w.p, t * 6 * w.speed + w.off * 10);
    }
    for (const s of swings) s.g.rotation.x = Math.sin(t * 2.2 + s.phase) * 0.6;
    sliders.forEach((k, i) => {
      const u = (t * 0.25 + i * 0.5) % 1;
      // sobe a escada, escorrega, volta andando
      const base = new THREE.Vector3(7, 0, 24);
      if (u < 0.3) {
        k.g.position.set(base.x - 0.6, (u / 0.3) * 1.6, base.z - 0.6);
        walkAnim(k, t * 10);
      } else if (u < 0.5) {
        const s = (u - 0.3) / 0.2;
        k.g.position.set(base.x, 1.6 - s * 1.5, base.z + s * 2.8);
        k.g.rotation.y = 0;
        k.legL.rotation.x = k.legR.rotation.x = -1.3;
      } else {
        const s = (u - 0.5) / 0.5;
        const a = s * Math.PI * 2;
        k.g.position.set(base.x - 1.5 + Math.cos(a) * 1.5, 0, base.z + 1.5 + Math.sin(a) * 1.6);
        k.g.rotation.y = -a;
        walkAnim(k, t * 10);
      }
    });
    for (const s of swimmers) {
      if (s.lane) {
        const x = -10 + Math.sin(t * 0.25 + s.ph) * 10;
        s.p.g.position.set(x, 0.05, s.z);
        s.p.g.rotation.y = Math.cos(t * 0.25 + s.ph) > 0 ? Math.PI / 2 : -Math.PI / 2;
        s.p.g.rotation.order = "YXZ";
        s.p.g.rotation.x = Math.PI / 2;
        s.p.armL.rotation.x = Math.sin(t * 5 + s.ph) * 2;
        s.p.armR.rotation.x = Math.sin(t * 5 + s.ph + Math.PI) * 2;
      } else {
        s.p.g.position.set(s.x, -0.45 + Math.sin(t * 3 + s.ph) * 0.08, s.z);
        s.p.armL.rotation.z = -2.4 + Math.sin(t * 4 + s.ph) * 0.4;
        s.p.armR.rotation.z = 2.4 - Math.sin(t * 4 + s.ph) * 0.4;
      }
    }
    for (const p of players) {
      const x = p.cx + Math.sin(t * 0.8 + p.ph) * p.ax, z = p.cz + Math.sin(t * 0.55 + p.ph * 2) * p.az;
      const dx = Math.cos(t * 0.8 + p.ph) * p.ax * 0.8, dz = Math.cos(t * 0.55 + p.ph * 2) * p.az * 0.55;
      p.p.g.position.set(x, 0, z);
      p.p.g.rotation.y = Math.atan2(dx, dz);
      walkAnim(p.p, t * 9 + p.ph, 0.8);
    }
    if (hl.visible) (hl.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 5) * 0.2;
    bucket.rotation.x = Math.sin(t * 1.5) * 0.6;
    seesaw.rotation.z = Math.sin(t * 1.6) * 0.25;
  };

  const highlight = (block: string | null, floor?: number, unit?: number) => {
    const b = blocks.find((x) => x.id === block);
    if (!b || !floor || !unit) {
      hl.visible = false;
      return null;
    }
    const p = unitLocal(b.floors, floor, unit);
    b.group.updateMatrixWorld();
    hl.position.copy(b.group.localToWorld(p.clone()));
    hl.rotation.y = b.group.rotation.y;
    hl.scale.set(floor > b.floors ? 1.6 : 1, 1, 1);
    hl.visible = true;
    return hl.position.clone();
  };
  const blockTop = (id: string) => {
    const b = blocks.find((x) => x.id === id)!;
    return b.group.position.clone().setY(BASE_H + b.floors * FLOOR_H + 5);
  };

  return { scene, blocks, hotspots, setHour, update, highlight, blockTop, clubPos: new THREE.Vector3(4, 7, 40) };
}
