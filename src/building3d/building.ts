// O prédio por fora (pelas fotos e pela perspectiva de divulgação): corpo branco com faixas verdes texturizadas,
// janelas com moldura branca, colunas de varandas com guarda-corpo, 6 andares sobre pilotis, caixa d'água no topo,
// gramado, calçada, grade branca, árvores e a rampa da garagem. Fachadas desenhadas num canvas (sem fotos).
import * as THREE from "three";
import { makeCar, CAR_COLORS, CAR_TYPES } from "./car";

export const W = 29, D = 13, PILOTIS = 3.2, FLOOR = 2.9, FLOORS = 6;
const PX = 48; // pixels por metro na textura da fachada
type Col = "win" | "balc" | "vent";
type Seg = { green: boolean; w: number; cols: Col[] };
const FRONT: Seg[] = [
  { green: false, w: 4, cols: ["win"] },
  { green: true, w: 7, cols: ["win", "balc", "win"] },
  { green: false, w: 7, cols: ["win", "vent", "win"] },
  { green: true, w: 7, cols: ["win", "balc", "win"] },
  { green: false, w: 4, cols: ["win"] },
];
const SIDE: Seg[] = [{ green: false, w: D, cols: ["win", "vent", "win", "win"] }];

function speckle(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, n: number) {
  c.fillStyle = base;
  c.fillRect(x, y, w, h);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 0.12;
    c.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    c.fillRect(x + Math.random() * w, y + Math.random() * h, 1.6, 1.6);
  }
}

function facade(segs: Seg[]) {
  const wm = segs.reduce((s, g) => s + g.w, 0);
  const hm = FLOORS * FLOOR + 1.0;
  const cv = document.createElement("canvas");
  cv.width = Math.round(wm * PX);
  cv.height = Math.round(hm * PX);
  const c = cv.getContext("2d")!;
  // segunda textura: só as janelas acesas (brilho à noite)
  const gv = document.createElement("canvas");
  gv.width = cv.width;
  gv.height = cv.height;
  const gc = gv.getContext("2d")!;
  gc.fillStyle = "#000";
  gc.fillRect(0, 0, gv.width, gv.height);
  const lit = (x: number, y: number, w: number, h: number) => {
    if (Math.random() < 0.38) return;
    const warm = Math.random() < 0.75;
    const gr = gc.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, warm ? "#ffd58a" : "#cfe3ff");
    gr.addColorStop(1, warm ? "#c98a3a" : "#7f9cc4");
    gc.fillStyle = gr;
    gc.fillRect(x, y, w, h);
  };
  let x0 = 0;
  for (const s of segs) {
    const x = x0 * PX, w = s.w * PX;
    speckle(c, x, 0, w, cv.height, s.green ? "#6c8c69" : "#ebe9e3", s.w * hm * (s.green ? 220 : 60));
    // janelas por andar (de baixo para cima)
    const cw = s.w / s.cols.length;
    for (let f = 0; f < FLOORS; f++) {
      const fy = cv.height - (f + 1) * FLOOR * PX; // topo do andar
      s.cols.forEach((col, i) => {
        const cx = (x0 + cw * (i + 0.5)) * PX;
        if (col === "win") {
          const ww = 1.45 * PX, wh = 1.25 * PX, wy = fy + 0.75 * PX;
          c.fillStyle = "#f7f7f5";
          c.fillRect(cx - ww / 2 - 5, wy - 5, ww + 10, wh + 10);
          const gr = c.createLinearGradient(0, wy, 0, wy + wh);
          gr.addColorStop(0, "#5d7286");
          gr.addColorStop(1, "#1f2b37");
          c.fillStyle = gr;
          c.fillRect(cx - ww / 2, wy, ww, wh);
          lit(cx - ww / 2, wy, ww, wh);
          c.fillStyle = "rgba(255,255,255,0.18)";
          c.fillRect(cx - ww / 2, wy, ww * 0.45, wh);
          c.fillStyle = "#f7f7f5";
          c.fillRect(cx - 2, wy, 4, wh);
          // grade de proteção como nas fotos
          c.strokeStyle = "rgba(240,240,240,0.55)";
          c.lineWidth = 1;
          for (let k = 1; k < 6; k++) {
            c.beginPath();
            c.moveTo(cx - ww / 2, wy + (wh * k) / 6);
            c.lineTo(cx + ww / 2, wy + (wh * k) / 6);
            c.stroke();
          }
        } else if (col === "vent") {
          const vw = 0.6 * PX, vy = fy + 0.55 * PX;
          c.fillStyle = "#f7f7f5";
          c.fillRect(cx - vw / 2 - 4, vy - 4, vw + 8, vw + 8);
          c.fillStyle = "#2b3742";
          c.fillRect(cx - vw / 2, vy, vw, vw);
          c.fillStyle = "#cfd3d6";
          for (let k = 1; k < 4; k++) c.fillRect(cx - vw / 2, vy + (vw * k) / 4, vw, 2);
        } else {
          // varanda recuada: vão escuro, porta de vidro e guarda-corpo branco
          const bw = 1.7 * PX, by = fy + 0.15 * PX, bh = (FLOOR - 0.3) * PX;
          c.fillStyle = "#3f4a43";
          c.fillRect(cx - bw / 2, by, bw, bh);
          c.fillStyle = "#26323c";
          c.fillRect(cx - bw * 0.35, by + 0.2 * PX, bw * 0.7, bh - 0.25 * PX);
          lit(cx - bw * 0.35, by + 0.2 * PX, bw * 0.7, bh - 0.25 * PX);
          c.fillStyle = "rgba(255,255,255,0.15)";
          c.fillRect(cx - bw * 0.35, by + 0.2 * PX, bw * 0.25, bh - 0.25 * PX);
          const ry = by + bh - 1.1 * PX;
          c.fillStyle = "#fafafa";
          c.fillRect(cx - bw / 2, ry, bw, 5);
          for (let k = 0; k <= 12; k++) c.fillRect(cx - bw / 2 + (bw * k) / 12 - 1, ry, 3, 1.1 * PX);
          c.fillStyle = "#e8e6e0";
          c.fillRect(cx - bw / 2 - 3, by + bh, bw + 6, 0.18 * PX);
        }
      });
      // junta entre andares
      c.fillStyle = "rgba(0,0,0,0.08)";
      c.fillRect(x, fy, w, 2);
    }
    x0 += s.w;
  }
  // platibanda no alto
  c.fillStyle = "#f2f1ec";
  c.fillRect(0, 0, cv.width, 0.85 * PX);
  c.fillStyle = "rgba(0,0,0,0.12)";
  c.fillRect(0, 0.85 * PX, cv.width, 3);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const glow = new THREE.CanvasTexture(gv);
  glow.colorSpace = THREE.SRGBColorSpace;
  return [t, glow] as const;
}

function tree(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x6b4b33, roughness: 1 }));
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  g.add(trunk);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4f7d34, roughness: 0.95, flatShading: true });
  for (const [x, y, z, r] of [[0, 3.4, 0, 1.6], [0.9, 3.0, 0.3, 1.1], [-0.8, 3.1, -0.4, 1.2], [0.1, 4.2, 0.2, 1.0]]) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaf);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

export function buildExterior(hole: { x: number; z: number }[] = []) {
  const g = new THREE.Group();
  const [front, frontGlow] = facade(FRONT), [side, sideGlow] = facade(SIDE);
  const lamp = (map: THREE.Texture, glow: THREE.Texture) => new THREE.MeshStandardMaterial({ map, roughness: 0.88, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0 });
  const white = new THREE.MeshStandardMaterial({ color: 0xedebe5, roughness: 0.9 });
  const mats = [
    lamp(side, sideGlow),
    lamp(side, sideGlow),
    new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.95 }),
    white,
    lamp(front, frontGlow),
    lamp(front, frontGlow),
  ];
  const H = FLOORS * FLOOR + 1.0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), mats);
  body.position.y = PILOTIS + H / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // faixa grossa entre os pilotis e o 1º andar (como na foto)
  const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.7, D + 0.3), white);
  band.position.y = PILOTIS + 0.1;
  band.castShadow = true;
  g.add(band);
  // pilotis: pilares, piso e o hall de entrada envidraçado
  const colMat = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 0.8 });
  for (const z of [-D / 2 + 0.6, D / 2 - 0.6]) for (let i = 0; i <= 6; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, PILOTIS, 0.9), colMat);
    c.position.set(-W / 2 + 0.6 + (i * (W - 1.2)) / 6, PILOTIS / 2, z);
    c.castShadow = true;
    g.add(c);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.6 }));
  floor.position.y = 0.05;
  floor.receiveShadow = true;
  g.add(floor);
  const lobby = new THREE.Mesh(new THREE.BoxGeometry(7, PILOTIS - 0.2, 5), new THREE.MeshStandardMaterial({ color: 0x8fa6b5, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.75 }));
  lobby.position.set(-1, PILOTIS / 2, 0);
  g.add(lobby);
  const core = new THREE.Mesh(new THREE.BoxGeometry(4, PILOTIS, 4), white);
  core.position.set(6, PILOTIS / 2, -1);
  core.castShadow = true;
  g.add(core);
  // topo: caixa d'água e casa de máquinas
  const tank = new THREE.Mesh(new THREE.BoxGeometry(6, 2.8, 4.5), white);
  tank.position.set(-1, PILOTIS + H + 1.4, -1);
  tank.castShadow = true;
  g.add(tank);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2), new THREE.MeshStandardMaterial({ color: 0x777777 }));
  ant.position.set(-2.5, PILOTIS + H + 3.8, -1);
  g.add(ant);

  // terreno: grama, calçada, rua, grade branca
  const grassTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const c = cv.getContext("2d")!;
    speckle(c, 0, 0, 256, 256, "#6e9a4c", 9000);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(30, 30);
    return t;
  })();
  // gramado com o buraco da rampa da garagem (forma no plano XY: y da forma = -z do mundo)
  const shape = new THREE.Shape([new THREE.Vector2(-80, -80), new THREE.Vector2(80, -80), new THREE.Vector2(80, 80), new THREE.Vector2(-80, 80)]);
  if (hole.length) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, -p.z))));
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  {
    // a textura repete como antes (30 vezes em 160 m)
    const uv = ground.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 80) / 160, (uv.getY(i) + 80) / 160);
  }
  ground.receiveShadow = true;
  ground.castShadow = true; // faz sombra na garagem do subsolo
  g.add(ground);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c3b6, roughness: 0.95 });
  const plate = (x: number, z: number, w: number, d: number, mat: THREE.Material, y = 0.02) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  plate(0, 0, W + 6, D + 6, concrete);
  plate(0, 20, 120, 3, concrete);
  plate(0, 26, 120, 9, new THREE.MeshStandardMaterial({ color: 0x3e4044, roughness: 0.9 }), 0.03);
  for (let x = -55; x < 60; x += 6) plate(x, 26, 3, 0.15, new THREE.MeshBasicMaterial({ color: 0xf0e6a0 }), 0.04);
  // grade branca em volta do lote
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.6 });
  const fence = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), fenceMat);
    rail.position.set((x1 + x2) / 2, 1.2, (z1 + z2) / 2);
    rail.rotation.y = -ang;
    g.add(rail);
    const n = Math.floor(len / 0.18);
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 1.2, 0.03), fenceMat, n);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      bars.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x1 + (x2 - x1) * t, 0.6, z1 + (z2 - z1) * t));
    }
    g.add(bars);
  };
  fence(-24, 18.2, 4, 18.2);
  fence(7, 18.2, 12, 18.2); // portão de pedestre em x 4..7
  fence(-24, -16, -24, 18.2);
  fence(-24, -16, 24, -16);
  // árvores e carros na rua
  for (const [x, z, s] of [[-21, 14, 1.1], [-21, 4, 0.9], [-21, -8, 1.2], [-8, 16.5, 0.8], [6, 16.5, 0.9], [31.5, 12, 1.2], [28, -6, 1.0], [-12, -13.5, 1.0], [10, -13.5, 0.9]]) {
    const t = tree(s);
    t.position.set(x, 0, z);
    g.add(t);
  }
  [[-30, 24, 1], [-14, 28, -1], [-46, 24, 1], [36, 28, -1]].forEach(([x, z, dir], i) => {
    const car = makeCar(CAR_TYPES[i % 4].id, CAR_COLORS[(i * 2) % CAR_COLORS.length].hex);
    car.position.set(x, 0, z);
    car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(car);
  });
  // postes na calçada (acendem à noite)
  const pole = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.6, metalness: 0.5 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd28a, emissiveIntensity: 0 });
  const streetLights: THREE.PointLight[] = [];
  for (const x of [-30, -12, 6, 24, 42]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 8), pole);
    p.position.set(x, 3, 21.2);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), pole);
    arm.position.set(x, 5.95, 21.9);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.6), bulbMat);
    bulb.position.set(x, 5.85, 22.5);
    const l = new THREE.PointLight(0xffc98a, 0, 16, 1.4);
    l.position.set(x, 5.6, 22.5);
    g.add(p, arm, bulb, l);
    streetLights.push(l);
  }
  // luz do hall de entrada (pilotis)
  const lobbyLight = new THREE.PointLight(0xffe2b0, 0, 14, 1.5);
  lobbyLight.position.set(0, 2.6, 4);
  g.add(lobbyLight);
  g.userData.setNight = (on: boolean) => {
    for (const m of mats) if ("emissiveIntensity" in m && m.emissiveMap) m.emissiveIntensity = on ? 1.1 : 0;
    bulbMat.emissiveIntensity = on ? 2.5 : 0;
    for (const l of streetLights) l.intensity = on ? 40 : 0;
    lobbyLight.intensity = on ? 25 : 0;
  };
  return g;
}
