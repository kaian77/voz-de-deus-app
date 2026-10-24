// Monta o apartamento em 3D a partir da planta (types.ts): piso por cômodo, paredes geradas pelas bordas
// entre cômodos (grade de 5 cm), portas/janelas/vidros recortados, guarda-corpo nas varandas, teto e móveis.
import * as THREE from "three";
import type { Plan, Room, Opening } from "./types";
import { box, mat, makeItem, FACING } from "./furniture";

export const WALL_H = 2.6;
const CELL = 5;
const T_EXT = 0.16, T_INT = 0.1;

export type Collider = { x0: number; z0: number; x1: number; z1: number };
export type RoomInfo = { room: Room; x: number; z: number; area: number; w: number; d: number };
export type Apartment = {
  group: THREE.Group;
  ceiling: THREE.Group;
  roof: THREE.Group;
  /** Pisos (para o toque no chão levar até o ponto). */
  floors: THREE.Mesh[];
  colliders: Collider[];
  rooms: RoomInfo[];
  size: { w: number; d: number };
  entry: { x: number; z: number; yaw: number };
};

type Seg = "int" | "ext" | "rail" | Opening["kind"] | "none";

function texture(kind: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const plank = (base: string, line: string, n: number) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < n; i++) {
      const y = (i * 256) / n;
      g.fillStyle = `rgba(0,0,0,${0.03 + ((i * 37) % 7) / 120})`;
      g.fillRect(0, y, 256, 256 / n);
      g.fillStyle = line;
      g.fillRect(0, y, 256, 2);
      const off = ((i * 97) % 256);
      g.fillRect(off, y, 2, 256 / n);
    }
  };
  const tiles = (base: string, line: string, n: number) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = line;
    for (let i = 0; i <= n; i++) {
      g.fillRect((i * 256) / n - 1, 0, 2, 256);
      g.fillRect(0, (i * 256) / n - 1, 256, 2);
    }
  };
  if (kind === "wood") plank("#cfa978", "rgba(90,60,30,.35)", 8);
  else if (kind === "deck") plank("#a77a4f", "rgba(50,30,15,.5)", 10);
  else if (kind === "bath") tiles("#dfe0dc", "rgba(0,0,0,.12)", 6);
  else if (kind === "tech") tiles("#b8b6b0", "rgba(0,0,0,.08)", 2);
  else tiles("#ece6dc", "rgba(120,100,80,.18)", 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Textura leve de massa corrida (sem ela a parede vira um branco chapado de perto). */
let wallTex: THREE.Texture | null = null;
function wallTexture() {
  if (wallTex) return wallTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 128, 128);
  let s = 3;
  for (let i = 0; i < 900; i++) {
    s = (s * 16807) % 2147483647;
    const x = s % 128;
    s = (s * 16807) % 2147483647;
    const y = s % 128;
    g.fillStyle = `rgba(120,100,80,${0.03 + (s % 5) / 100})`;
    g.fillRect(x, y, 2, 2);
  }
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(90,70,50,.06)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  wallTex = new THREE.CanvasTexture(c);
  wallTex.colorSpace = THREE.SRGBColorSpace;
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  return wallTex;
}

const floorKind = (k: Room["kind"]) =>
  k === "quarto" || k === "suite" ? "wood" : k === "varanda" || k === "terraco" ? "deck" : k === "banho" || k === "servico" ? "bath" : k === "tecnico" ? "tech" : "porcelain";
/** Metros de piso por repetição da textura. */
const TILE: Record<string, number> = { wood: 1.6, deck: 1.4, bath: 1.2, tech: 1.2, porcelain: 2.4 };

const outdoor = (r?: Room) => !!r && (r.kind === "varanda" || r.kind === "terraco");

export function buildApartment(plan: Plan, colors: { primary: string; accent: string }): Apartment {
  const group = new THREE.Group();
  const ceiling = new THREE.Group();
  const roof = new THREE.Group();
  const colliders: Collider[] = [];
  const floors: THREE.Mesh[] = [];
  const rooms = plan.rooms;

  let maxX = 0, maxY = 0;
  for (const r of rooms) for (const [, , x1, y1] of r.rects) { maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1); }
  const nx = Math.ceil(maxX / CELL), ny = Math.ceil(maxY / CELL);
  const grid = new Int16Array(nx * ny).fill(-1);
  rooms.forEach((r, i) => {
    for (const [x0, y0, x1, y1] of r.rects) {
      for (let y = Math.round(y0 / CELL); y < Math.round(y1 / CELL); y++)
        for (let x = Math.round(x0 / CELL); x < Math.round(x1 / CELL); x++) if (x >= 0 && y >= 0 && x < nx && y < ny) grid[y * nx + x] = i;
    }
  });
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= nx || y >= ny ? -1 : grid[y * nx + x]);
  const grp = (i: number) => rooms[i].group ?? rooms[i].id;

  const kindOf = (a: number, b: number): Seg => {
    if (a === b) return "none";
    if (a >= 0 && b >= 0 && grp(a) === grp(b)) return "none";
    if (a < 0 && b < 0) return "none";
    const ra = a >= 0 ? rooms[a] : undefined, rb = b >= 0 ? rooms[b] : undefined;
    if (a < 0 || b < 0) return outdoor(ra ?? rb) ? "rail" : "ext";
    if (outdoor(ra) && outdoor(rb)) return "none";
    return outdoor(ra) || outdoor(rb) ? "ext" : "int";
  };
  const opening = (dir: "h" | "v", line: number, pos: number) =>
    plan.openings.find((o) => o.dir === dir && Math.abs(o.at - line) <= 12 && pos >= o.a && pos < o.b);

  // ---- paredes
  const plaster = new THREE.MeshStandardMaterial({ color: 0xefe9df, map: wallTexture(), roughness: 0.92 });
  const wallMat = [plaster, plaster, mat(0x3a3a36), plaster, plaster, plaster];
  const extMat = [mat(0xf6f4ef), mat(0xf6f4ef), mat(0x3a3a36), mat(0xf6f4ef), mat(0xf6f4ef), mat(0xf6f4ef)];
  const glass = mat(0xa9d6e6, { opacity: 0.28, rough: 0.05, metal: 0.1 });
  const frame = mat(0x2d2d2b, { rough: 0.5 });
  const entryMat = mat(new THREE.Color(colors.primary).getHex(), { rough: 0.6 });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const skirt = mat(0xcfc6b6); // rodapé

  /** Peça de parede entre y0 e y1 (altura) ao longo do trecho. */
  const piece = (horiz: boolean, line: number, a: number, b: number, t: number, y0: number, y1: number, m: THREE.Material | THREE.Material[], collide: boolean) => {
    const L = b - a;
    const mesh = new THREE.Mesh(geo, m);
    if (horiz) {
      mesh.scale.set(L, y1 - y0, t);
      mesh.position.set((a + b) / 2, (y0 + y1) / 2, line);
    } else {
      mesh.scale.set(t, y1 - y0, L);
      mesh.position.set(line, (y0 + y1) / 2, (a + b) / 2);
    }
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      if (horiz) colliders.push({ x0: a, x1: b, z0: line - t / 2, z1: line + t / 2 });
      else colliders.push({ x0: line - t / 2, x1: line + t / 2, z0: a, z1: b });
    }
    return mesh;
  };

  const emit = (horiz: boolean, line: number, a: number, b: number, seg: Seg, base: Seg) => {
    // a,b em metros; base = tipo da parede onde a abertura está
    const t = base === "ext" || base === "rail" ? T_EXT : T_INT;
    const m = base === "ext" ? extMat : wallMat;
    const pad = t / 2;
    if (seg === "int" || seg === "ext") {
      piece(horiz, line, a - pad, b + pad, t, 0, WALL_H, m, true);
      piece(horiz, line, a - pad, b + pad, t + 0.025, 0, 0.09, skirt, false);
    }
    else if (seg === "rail") {
      piece(horiz, line, a, b, 0.12, 0, 0.35, extMat, true);
      piece(horiz, line, a, b, 0.02, 0.35, 1.05, glass, false);
      piece(horiz, line, a, b, 0.06, 1.05, 1.1, frame, false);
    } else if (seg === "door" || seg === "entry") {
      piece(horiz, line, a, b, t, 2.1, WALL_H, m, false);
      // só a porta de entrada tem folha (aberta a 90°); nas internas ficam só os batentes, para não tapar a vista
      const L = b - a;
      if (seg === "entry") {
        const leaf = new THREE.Mesh(geo, entryMat);
        leaf.scale.set(0.04, 2.08, L - 0.04);
        const side = -L / 2;
        if (horiz) leaf.position.set(a + 0.02, 1.04, line + side);
        else {
          leaf.position.set(line + side, 1.04, a + 0.02);
          leaf.rotation.y = Math.PI / 2;
        }
        leaf.castShadow = true;
        group.add(leaf);
      }
      // batente
      piece(horiz, line, a - 0.03, a, t + 0.02, 0, 2.1, frame, false);
      piece(horiz, line, b, b + 0.03, t + 0.02, 0, 2.1, frame, false);
    } else if (seg === "window") {
      const sill = b - a < 0.8 ? 1.5 : 1.0;
      piece(horiz, line, a, b, t, 0, sill, m, true);
      piece(horiz, line, a, b, t, 2.2, WALL_H, m, false);
      piece(horiz, line, a, b, 0.02, sill, 2.2, glass, true);
      piece(horiz, line, a, b, t + 0.01, sill, sill + 0.03, frame, false);
      piece(horiz, line, a, b, t + 0.01, 2.17, 2.2, frame, false);
      if (b - a > 0.8) piece(horiz, line, (a + b) / 2 - 0.015, (a + b) / 2 + 0.015, t + 0.01, sill, 2.2, frame, false);
    } else if (seg === "glass") {
      // porta de correr de vidro: metade aberta (passa), metade fechada
      piece(horiz, line, a, b, t, 2.3, WALL_H, m, false);
      const mid = (a + b) / 2;
      piece(horiz, line, a, mid, 0.02, 0, 2.3, glass, true);
      piece(horiz, line, a, mid + 0.04, 0.03, 0, 0.04, frame, false);
      for (const p of [a, mid]) piece(horiz, line, p, p + 0.04, 0.05, 0, 2.3, frame, false);
      piece(horiz, line, mid - 0.1, b, 0.02, 0, 2.3, glass, false).position[horiz ? "z" : "x"] += 0.05;
    }
  };

  const scan = (horiz: boolean) => {
    const lines = horiz ? ny : nx;
    const len = horiz ? nx : ny;
    for (let l = 0; l <= lines; l++) {
      let runStart = 0, runSeg: Seg = "none", runBase: Seg = "none";
      for (let p = 0; p <= len; p++) {
        let seg: Seg = "none", base: Seg = "none";
        if (p < len) {
          const a = horiz ? at(p, l - 1) : at(l - 1, p);
          const b = horiz ? at(p, l) : at(l, p);
          base = kindOf(a, b);
          seg = base;
          if (base !== "none") {
            const o = opening(horiz ? "h" : "v", l * CELL, p * CELL + CELL / 2);
            if (o) seg = o.kind;
          }
        }
        if (seg !== runSeg || (seg !== "none" && base !== runBase)) {
          if (runSeg !== "none" && p > runStart) emit(horiz, (l * CELL) / 100, (runStart * CELL) / 100, (p * CELL) / 100, runSeg, runBase);
          runStart = p;
          runSeg = seg;
          runBase = base;
        }
      }
    }
  };
  scan(true);
  scan(false);
  for (const [x0, y0, x1, y1] of plan.walls ?? []) {
    const horiz = Math.abs(y1 - y0) < Math.abs(x1 - x0);
    if (horiz) piece(true, y0 / 100, x0 / 100, x1 / 100, T_INT, 0, WALL_H, wallMat, true);
    else piece(false, x0 / 100, y0 / 100, y1 / 100, T_INT, 0, WALL_H, wallMat, true);
  }

  // ---- pisos, laje, teto
  const slab = mat(0xd8d4cc);
  const texCache = new Map<string, THREE.Texture>();
  const infos: RoomInfo[] = [];
  for (const r of rooms) {
    const fk = floorKind(r.kind);
    let base = texCache.get(fk);
    if (!base) texCache.set(fk, (base = texture(fk)));
    let area = 0, best = r.rects[0], bestA = 0;
    for (const rc of r.rects) {
      const [x0, y0, x1, y1] = rc.map((v) => v / 100);
      const w = x1 - x0, d = y1 - y0;
      area += w * d;
      if (w * d > bestA) { bestA = w * d; best = rc; }
      const t = base.clone();
      t.needsUpdate = true;
      t.repeat.set(w / TILE[fk], d / TILE[fk]);
      t.offset.set(x0 / TILE[fk], y0 / TILE[fk]);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: fk === "porcelain" ? 0.45 : 0.8 }));
      f.rotation.x = -Math.PI / 2;
      f.position.set(x0 + w / 2, outdoor(r) ? -0.01 : 0.005, y0 + d / 2);
      f.receiveShadow = true;
      group.add(f);
      floors.push(f);
      const s = new THREE.Mesh(geo, slab);
      s.scale.set(w, 0.2, d);
      s.position.set(x0 + w / 2, -0.1, y0 + d / 2);
      s.receiveShadow = true;
      group.add(s);
      if (!outdoor(r)) {
        const c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0xfbfaf7));
        c.rotation.x = Math.PI / 2;
        c.position.set(x0 + w / 2, WALL_H, y0 + d / 2);
        ceiling.add(c);
        // luminária embutida (acende o ambiente quando se anda por dentro)
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), mat(0xfff4d6, { emissive: 0xfff0c8 }));
        lamp.rotation.x = Math.PI / 2;
        lamp.position.set(x0 + w / 2, WALL_H - 0.005, y0 + d / 2);
        ceiling.add(lamp);
        const top = new THREE.Mesh(geo, mat(0xe9e6df));
        top.scale.set(w + 0.12, 0.18, d + 0.12);
        top.position.set(x0 + w / 2, WALL_H + 0.09, y0 + d / 2);
        top.castShadow = true;
        roof.add(top);
      }
    }
    const [x0, y0, x1, y1] = best.map((v) => v / 100);
    infos.push({ room: r, x: (x0 + x1) / 2, z: (y0 + y1) / 2, area: Math.round(area * 10) / 10, w: x1 - x0, d: y1 - y0 });
  }

  // ---- móveis
  for (const it of plan.items) {
    const m = makeItem(it);
    m.position.set(it.x / 100, 0, it.y / 100);
    m.rotation.y = FACING[it.f ?? "S"];
    group.add(m);
  }
  // fechadura eletrônica na porta de entrada
  const entry = plan.openings.find((o) => o.kind === "entry");
  let entryPos = { x: maxX / 200, z: maxY / 200, yaw: 0 };
  if (entry) {
    const L = (entry.b - entry.a) / 100;
    const line = entry.at / 100, a = entry.a / 100;
    const lock = new THREE.Mesh(geo, mat(0x161616, { emissive: 0x0a3a1a }));
    lock.scale.set(0.08, 0.16, 0.06);
    if (entry.dir === "h") lock.position.set(a + L - 0.08, 1.05, line);
    else lock.position.set(line, 1.05, a + L - 0.08);
    group.add(lock);
    // entra olhando para dentro do apartamento
    const mid = (entry.a + entry.b) / 200;
    const probe = (dx: number, dz: number) => {
      const px = (entry.dir === "h" ? mid : line) + dx, pz = (entry.dir === "h" ? line : mid) + dz;
      return at(Math.floor((px * 100) / CELL), Math.floor((pz * 100) / CELL)) >= 0;
    };
    if (entry.dir === "h") {
      const inside = probe(0, 0.5) ? 1 : -1;
      entryPos = { x: mid, z: line + inside * 0.7, yaw: inside > 0 ? Math.PI : 0 };
    } else {
      const inside = probe(0.5, 0) ? 1 : -1;
      entryPos = { x: line + inside * 0.7, z: mid, yaw: inside > 0 ? -Math.PI / 2 : Math.PI / 2 };
    }
  }

  group.add(ceiling);
  group.add(roof);
  return { group, ceiling, roof, floors, colliders, rooms: infos, size: { w: maxX / 100, d: maxY / 100 }, entry: entryPos };
}

/** Empurra o ponto (x,z) para fora das paredes (raio r). */
export function collide(cols: Collider[], x: number, z: number, r = 0.22) {
  for (const c of cols) {
    const cx = Math.max(c.x0, Math.min(x, c.x1));
    const cz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.0001;
      if (d2 === 0) {
        // dentro da caixa: sai pelo lado mais perto
        const opts = [[c.x0 - r - x, 0], [c.x1 + r - x, 0], [0, c.z0 - r - z], [0, c.z1 + r - z]];
        opts.sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]));
        x += opts[0][0];
        z += opts[0][1];
      } else {
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      }
    }
  }
  return { x, z };
}
