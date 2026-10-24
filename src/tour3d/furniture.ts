// Móveis simples (low-poly) do Tour 3D. Cada um nasce no chão, centrado, com a "frente" virada para +z.
import * as THREE from "three";
import type { Item } from "./types";

const cache = new Map<string, THREE.Material>();
export function mat(color: number, opts: { rough?: number; metal?: number; opacity?: number; emissive?: number } = {}) {
  const key = `${color}|${opts.rough ?? 0.8}|${opts.metal ?? 0}|${opts.opacity ?? 1}|${opts.emissive ?? 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0,
      transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1,
      emissive: opts.emissive ?? 0, depthWrite: (opts.opacity ?? 1) >= 1,
    });
    cache.set(key, m);
  }
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
/** Caixa w×h×d com a base em y. */
export function box(g: THREE.Object3D, w: number, h: number, d: number, color: number | THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(boxGeo, typeof color === "number" ? mat(color) : color);
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
export function cyl(g: THREE.Object3D, r: number, h: number, color: number | THREE.Material, x = 0, y = 0, z = 0, seg = 16, rTop = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), typeof color === "number" ? mat(color) : color);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
export function ball(g: THREE.Object3D, r: number, color: number | THREE.Material, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), typeof color === "number" ? mat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

const WOOD = 0xc8a06a, WOOD_D = 0x8a6a45, WHITE = 0xf7f5f0, LINEN = 0xe8e2d6, GREIGE = 0xc9c2b6, MOSS = 0x5d6b47, SAGE = 0x9aab86;
const STONE = 0x3d3d3a, STEEL = 0xb9bcbf, BLACK = 0x1f1f1f, TERRA = 0xc77d5a;

function chair(g: THREE.Object3D, x: number, z: number, rot: number, color = LINEN) {
  const c = new THREE.Group();
  box(c, 0.44, 0.45, 0.44, WOOD);
  box(c, 0.44, 0.06, 0.44, color, 0, 0.45);
  box(c, 0.44, 0.42, 0.05, WOOD, 0, 0.45, -0.2);
  c.position.set(x, 0, z);
  c.rotation.y = rot;
  g.add(c);
}

function bed(g: THREE.Group, w: number, cover: number) {
  const L = 2.0;
  box(g, w + 0.06, 0.28, L, WOOD_D);
  box(g, w, 0.2, L - 0.04, WHITE, 0, 0.28);
  box(g, w + 0.02, 0.06, L * 0.62, cover, 0, 0.46, L * 0.17);
  box(g, w + 0.06, 0.04, 0.5, LINEN, 0, 0.5, L * 0.36);
  box(g, w + 0.16, 1.05, 0.08, GREIGE, 0, 0, -L / 2 - 0.02);
  const n = w > 1.2 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const px = n === 1 ? 0 : (i - 0.5) * (w * 0.5);
    const p = box(g, n === 1 ? 0.6 : w * 0.42, 0.13, 0.32, WHITE, px, 0.48, -L / 2 + 0.25);
    p.rotation.x = -0.25;
  }
}

/** Cria o móvel do item (medidas em metros). */
export function makeItem(it: Item): THREE.Group {
  const g = new THREE.Group();
  const w = (it.w ?? 0) / 100, d = (it.d ?? 0) / 100;
  switch (it.t) {
    case "bed2": bed(g, 1.6, SAGE); break;
    case "bed1": bed(g, 0.9, 0x9fb3c8); break;
    case "night":
      box(g, 0.45, 0.5, 0.4, WOOD);
      cyl(g, 0.07, 0.25, LINEN, 0, 0.5, 0, 10, 0.1);
      break;
    case "wardrobe": {
      const W = w || 1.5;
      box(g, W, 2.3, 0.55, 0xefe9de);
      const n = Math.max(2, Math.round(W / 0.5));
      for (let i = 1; i < n; i++) box(g, 0.01, 2.2, 0.01, 0xcfc6b7, -W / 2 + (W / n) * i, 0.05, 0.28, false);
      break;
    }
    case "tvwall":
      box(g, 1.2, 0.7, 0.05, BLACK, 0, 0.95, -0.02);
      break;
    case "tv": {
      const W = w || 1.5;
      box(g, W, 0.45, 0.4, WOOD);
      box(g, W * 0.75, 0.65, 0.05, BLACK, 0, 0.85, -0.12);
      break;
    }
    case "rug": {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w || 1.6, d || 2), mat(0xd9d1c3));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.012;
      m.receiveShadow = true;
      g.add(m);
      break;
    }
    case "desk": {
      const W = w || 1.2;
      box(g, W, 0.04, 0.5, WOOD, 0, 0.73);
      box(g, 0.04, 0.73, 0.46, WOOD, -W / 2 + 0.03);
      box(g, 0.04, 0.73, 0.46, WOOD, W / 2 - 0.03);
      chair(g, 0, 0.4, Math.PI, SAGE);
      break;
    }
    case "sofa": {
      const W = w || 1.9;
      box(g, W, 0.42, 0.9, GREIGE);
      box(g, W, 0.42, 0.22, GREIGE, 0, 0.42, -0.34);
      box(g, 0.18, 0.2, 0.9, GREIGE, -W / 2 + 0.09, 0.42);
      box(g, 0.18, 0.2, 0.9, GREIGE, W / 2 - 0.09, 0.42);
      box(g, 0.4, 0.36, 0.12, MOSS, -W / 2 + 0.45, 0.48, -0.18).rotation.x = -0.2;
      box(g, 0.4, 0.36, 0.12, LINEN, W / 2 - 0.45, 0.48, -0.18).rotation.x = -0.2;
      break;
    }
    case "armchair":
      box(g, 0.75, 0.42, 0.75, MOSS);
      box(g, 0.75, 0.4, 0.16, MOSS, 0, 0.42, -0.3);
      break;
    case "side":
      cyl(g, 0.22, 0.5, WOOD);
      break;
    case "table": {
      const W = w || 1.4, D = d || 0.9, n = it.n ?? 4;
      box(g, W, 0.04, D, WOOD, 0, 0.74);
      cyl(g, 0.12, 0.74, WOOD_D, 0, 0, 0, 10);
      // cadeiras nos lados maiores
      const long = W >= D;
      const per = Math.ceil(n / 2);
      for (let s = 0; s < 2; s++) {
        for (let i = 0; i < per && s * per + i < n; i++) {
          const t = (i + 0.5) / per - 0.5;
          if (long) chair(g, t * W * 0.9, (s ? 1 : -1) * (D / 2 + 0.25), s ? Math.PI : 0);
          else chair(g, (s ? 1 : -1) * (W / 2 + 0.25), t * D * 0.9, s ? -Math.PI / 2 : Math.PI / 2);
        }
      }
      break;
    }
    case "bistro": {
      const n = it.n ?? 2;
      cyl(g, 0.38, 0.03, WHITE, 0, 0.72, 0, 20);
      cyl(g, 0.05, 0.72, BLACK, 0, 0, 0, 8);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.PI / 4;
        chair(g, Math.sin(a) * 0.62, Math.cos(a) * 0.62, a + Math.PI, MOSS);
      }
      break;
    }
    case "counter": {
      const W = w || 1.8;
      box(g, W, 0.88, 0.6, WHITE);
      box(g, W + 0.02, 0.04, 0.62, STONE, 0, 0.88);
      box(g, W, 0.7, 0.35, 0xefe9de, 0, 1.5, -0.12);
      break;
    }
    case "cooktop":
      box(g, 0.6, 0.012, 0.5, BLACK, 0, 0.92, 0, false);
      for (const [bx, bz] of [[-0.15, -0.12], [0.15, -0.12], [-0.15, 0.12], [0.15, 0.12]]) cyl(g, 0.07, 0.01, 0x444444, bx, 0.932, bz, 12);
      break;
    case "sinkk":
      box(g, 0.55, 0.012, 0.42, STEEL, 0, 0.92, 0, false);
      cyl(g, 0.015, 0.3, STEEL, 0, 0.92, -0.2, 8);
      break;
    case "fridge":
      box(g, 0.7, 1.85, 0.65, STEEL, 0, 0, 0).material = mat(STEEL, { metal: 0.6, rough: 0.35 });
      box(g, 0.02, 0.5, 0.02, BLACK, 0.3, 1.0, 0.33, false);
      break;
    case "washer":
      box(g, 0.6, 0.85, 0.6, WHITE);
      cyl(g, 0.2, 0.02, 0x2b3a44, 0, 0.42, 0.3, 20).rotation.x = Math.PI / 2;
      break;
    case "tanque":
      box(g, 0.55, 0.85, 0.5, WHITE);
      box(g, 0.45, 0.02, 0.38, 0xd8d8d8, 0, 0.86, 0.02, false);
      cyl(g, 0.015, 0.25, STEEL, 0, 0.86, -0.2, 8);
      break;
    case "bancada": {
      const W = w || 1.6;
      box(g, W, 0.88, 0.5, WOOD);
      box(g, W + 0.02, 0.04, 0.52, STONE, 0, 0.88);
      break;
    }
    case "grill":
      box(g, 0.65, 0.9, 0.55, 0x6b6159);
      box(g, 0.5, 0.03, 0.4, BLACK, 0, 0.9);
      box(g, 0.55, 0.9, 0.45, 0x6b6159, 0, 1.4, -0.05);
      break;
    case "bar": {
      const W = w || 2, D = d || 0.5;
      box(g, W, 1.0, D, WOOD);
      box(g, W + 0.04, 0.04, D + 0.06, STONE, 0, 1.0);
      break;
    }
    case "plant":
      cyl(g, 0.2, 0.4, TERRA, 0, 0, 0, 12, 0.24);
      ball(g, 0.38, 0x4f7a3a, 0, 0.85, 0, 8);
      ball(g, 0.28, 0x5f8c45, 0.12, 1.15, 0.05, 8);
      break;
    case "toilet":
      box(g, 0.38, 0.4, 0.5, WHITE, 0, 0, 0.05);
      box(g, 0.4, 0.38, 0.18, WHITE, 0, 0.4, -0.2);
      break;
    case "basin": {
      const W = w || 0.6;
      box(g, W, 0.8, 0.45, WOOD);
      box(g, W + 0.02, 0.05, 0.47, WHITE, 0, 0.8);
      box(g, W * 0.8, 0.7, 0.02, mat(0xcfe0e8, { metal: 0.8, rough: 0.1 }), 0, 1.2, -0.22, false);
      break;
    }
    case "shower": {
      const W = w || 0.9, D = d || 0.9;
      box(g, W, 0.03, D, 0xbfc5c7, 0, 0, 0, false);
      const glass = mat(0xbfe3ef, { opacity: 0.22, rough: 0.05 });
      box(g, W, 1.95, 0.015, glass, 0, 0.03, D / 2, false);
      cyl(g, 0.08, 0.02, STEEL, 0, 2.05, -D / 2 + 0.25, 12);
      break;
    }
    case "lounger":
      box(g, 0.65, 0.3, 1.9, WHITE);
      box(g, 0.65, 0.08, 0.55, MOSS, 0, 0.3, -0.6).rotation.x = -0.6;
      break;
    case "hidro": {
      const W = w || 1.7, D = d || 1.7;
      box(g, W + 0.3, 0.55, D + 0.3, 0xd9cbb2);
      box(g, W, 0.02, D, mat(0x58c3d6, { rough: 0.1, emissive: 0x0a3540 }), 0, 0.5, 0, false);
      break;
    }
    case "pergola": {
      const W = w || 2, D = d || 3;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.12, 2.5, 0.12, WOOD_D, (sx * W) / 2, 0, (sz * D) / 2);
      const n = Math.round(D / 0.4);
      for (let i = 0; i <= n; i++) box(g, W + 0.3, 0.12, 0.06, WOOD, 0, 2.5, -D / 2 + (D / n) * i);
      break;
    }
    default:
      box(g, w || 0.5, 0.5, d || 0.5, GREIGE);
  }
  return g;
}

export const FACING: Record<string, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
