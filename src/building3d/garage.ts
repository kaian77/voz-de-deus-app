// Subsolo do Residencial Serrano (Bloco C), pelo mapa de vagas do quadro de avisos e pelas fotos do dono:
// em cima Bicicletário | 13..08 | Depósito | Escada | 07..01 (01 = motos); embaixo 15 (PcD)..21 | Elevador (2 portas, logo à direita do carro da 21) | Hall | 22..27;
// corredor com faixas de pedestre zebradas amarelo/branco, pilares cinza-esverdeados com faixa amarela e preta,
// paredes creme com a mesma faixa, teto de concreto com canos e lâmpadas tubulares; no fim do corredor o portão
// de grades brancas e a rampa curva de concreto estampado até a rua.
// Coordenadas locais (1 = 1 m): piso em y = 0; o grupo fica em y = GY (subsolo). x = ao longo do corredor (rampa em +x).
import * as THREE from "three";

export const GY = -3.2; // altura do piso da garagem no mundo
export const CEIL = 2.7;
export const SPOT_W = 2.5, SPOT_D = 5;
const AISLE = 3.0, WALK = 1.2; // meio corredor e faixa de pedestre
export const ROW0 = AISLE + WALK; // início das vagas (|z|)
export const ROW_C = ROW0 + SPOT_D / 2; // centro das vagas
export const WALL = ROW0 + SPOT_D + 0.15;
export const GATE_X = 22.6;
export const RAMP_HALF = 2.9;

/** Apartamento de cada vaga (mapa de vagas 01/11/26 a 31/01/27; só o número do apto, sem nomes). */
export const APTO: Record<number, string> = {
  13: "506", 12: "408", 11: "106", 10: "103", 9: "502", 8: "504", 7: "402", 6: "403", 5: "201", 4: "303", 3: "607", 2: "505", 1: "Motos",
  15: "308", 16: "105", 17: "508", 18: "608", 19: "108", 20: "407", 21: "305", 22: "203", 23: "304", 24: "307", 25: "104", 26: "404", 27: "501",
};

export type Spot = { n: number; x: number; z: number; side: -1 | 1; pcd?: boolean; motos?: boolean; mesh: THREE.Mesh };
export type Box = { x: number; z: number; hw: number; hd: number; ang: number };

function tex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function grain(c: CanvasRenderingContext2D, w: number, h: number, n: number, a = 0.08) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * a})` : `rgba(255,255,255,${Math.random() * a})`;
    c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}
function blotches(c: CanvasRenderingContext2D, w: number, h: number, n: number, dark = 0.12) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = rnd(20, 120);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const a = Math.random() * dark;
    g.addColorStop(0, Math.random() < 0.65 ? `rgba(30,28,25,${a})` : `rgba(255,255,250,${a * 0.6})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// ---------- texturas (cores tiradas das fotos)
const concreteFloor = () =>
  tex(1024, 1024, (c) => {
    c.fillStyle = "#9a9b97";
    c.fillRect(0, 0, 1024, 1024);
    blotches(c, 1024, 1024, 140, 0.16);
    grain(c, 1024, 1024, 26000, 0.07);
    // juntas e trincas finas
    c.strokeStyle = "rgba(40,40,40,0.35)";
    c.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      let x = Math.random() * 1024, y = 0;
      c.moveTo(x, y);
      while (y < 1024) {
        y += rnd(20, 60);
        x += rnd(-8, 8);
        c.lineTo(x, y);
      }
      c.stroke();
    }
  }, [6, 3]);
const wallTex = () =>
  tex(64, 512, (c) => {
    // de cima (y=0 → 2.7 m) para baixo: creme, faixa amarela, faixa preta, creme, rodapé preto
    const m = (h: number) => 512 - (h / CEIL) * 512;
    c.fillStyle = "#e4dcb3";
    c.fillRect(0, 0, 64, 512);
    grain(c, 64, 512, 1500, 0.06);
    c.fillStyle = "#d4ab3c";
    c.fillRect(0, m(1.32), 64, m(1.2) - m(1.32));
    c.fillStyle = "#1c1c1a";
    c.fillRect(0, m(1.2), 64, m(1.08) - m(1.2));
    c.fillRect(0, m(0.12), 64, 512 - m(0.12));
  }, [12, 1]);
const pillarTex = () =>
  tex(64, 512, (c) => {
    const m = (h: number) => 512 - (h / CEIL) * 512;
    c.fillStyle = "#8d9787";
    c.fillRect(0, 0, 64, 512);
    grain(c, 64, 512, 1500, 0.07);
    c.fillStyle = "#d4ab3c";
    c.fillRect(0, m(1.32), 64, m(1.2) - m(1.32));
    c.fillStyle = "#1c1c1a";
    c.fillRect(0, m(1.2), 64, m(1.08) - m(1.2));
    c.fillRect(0, m(0.1), 64, 512 - m(0.1));
  });
const ceilingTex = () =>
  tex(512, 512, (c) => {
    c.fillStyle = "#a3a19b";
    c.fillRect(0, 0, 512, 512);
    blotches(c, 512, 512, 60, 0.22);
    grain(c, 512, 512, 8000, 0.08);
    c.strokeStyle = "rgba(60,60,60,0.25)";
    for (let x = 0; x < 512; x += 128) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 512);
      c.stroke();
    }
  }, [8, 4]);
/** Faixa de pedestre: listras amarelas e brancas atravessadas, com borda amarela e marcas de pneu. */
const zebraTex = () =>
  tex(1024, 64, (c) => {
    c.fillStyle = "#9a9b97";
    c.fillRect(0, 0, 1024, 64);
    for (let x = 0; x < 1024; x += 32) {
      c.fillStyle = (x / 32) % 2 ? "#e2ded2" : "#d6b75c";
      c.fillRect(x, 5, 32, 54);
    }
    c.fillStyle = "#d6b75c";
    c.fillRect(0, 0, 1024, 5);
    c.fillRect(0, 59, 1024, 5);
    blotches(c, 1024, 64, 30, 0.25);
    grain(c, 1024, 64, 4000, 0.1);
  }, [6, 1]);
const stampedTex = () =>
  tex(512, 512, (c) => {
    c.fillStyle = "#b0aa9f";
    c.fillRect(0, 0, 512, 512);
    blotches(c, 512, 512, 50, 0.2);
    grain(c, 512, 512, 9000, 0.08);
    c.strokeStyle = "rgba(45,40,35,0.55)";
    c.lineWidth = 3;
    for (let y = 20; y < 512; y += 46) {
      c.beginPath();
      c.moveTo(0, y + rnd(-4, 4));
      c.lineTo(512, y + rnd(-4, 4));
      c.stroke();
    }
    c.beginPath();
    c.moveTo(256, 0);
    c.lineTo(256, 512);
    c.stroke();
  }, [1, 6]);
function numberTex(text: string, color = "#151515", bg?: string) {
  return tex(256, 128, (c) => {
    if (bg) {
      c.fillStyle = bg;
      c.fillRect(0, 0, 256, 128);
    }
    c.fillStyle = color;
    c.font = "bold 92px 'Arial Black', Arial, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 128, 70);
  });
}

export function buildGarage() {
  const g = new THREE.Group();
  g.position.y = GY;
  const spots: Spot[] = [];
  const obstacles: Box[] = [];
  const ceiling = new THREE.Group(); // some na vista de cima
  g.add(ceiling);

  const floorMat = new THREE.MeshStandardMaterial({ map: concreteFloor(), roughness: 0.75, metalness: 0.05 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(43, 2 * WALL + 0.4), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(1.1, 0, 0);
  floor.receiveShadow = true;
  g.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex(), roughness: 0.92 });
  const pillarMat = new THREE.MeshStandardMaterial({ map: pillarTex(), roughness: 0.9 });
  const wall = (x: number, z: number, w: number, d: number, mat: THREE.Material = wallMat) => {
    const geo = new THREE.BoxGeometry(w, CEIL, d);
    // a textura repete pelo comprimento da parede (1 vez a cada 2 m)
    const len = Math.max(w, d);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 2) / 12);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, CEIL / 2, z);
    m.receiveShadow = true;
    g.add(m);
    obstacles.push({ x, z, hw: w / 2, hd: d / 2, ang: 0 });
    return m;
  };
  // paredes externas
  wall(1.2, -WALL - 0.15, 43.4, 0.3);
  wall(1.2 - 1.25, WALL + 0.15, 40.9, 0.3);
  wall(-20.35, 0, 0.3, 2 * WALL);
  wall(20.65, -(ROW0 + WALL) / 2 - 0.0, 0.3, WALL - ROW0 + 0.3); // fundo depois da vaga 01
  wall(19.2, (ROW0 + WALL) / 2, 2.6, WALL - ROW0 + 0.3); // canto depois da vaga 27
  // corredor até o portão (da largura da rampa)
  wall(21.6, -RAMP_HALF - 0.15, 2.2, 0.3);
  wall(21.6, RAMP_HALF + 0.15, 2.2, 0.3);
  wall(20.65, -(RAMP_HALF + ROW0) / 2, 0.3, ROW0 - RAMP_HALF + 0.1);
  wall(20.65, (RAMP_HALF + ROW0) / 2, 0.3, ROW0 - RAMP_HALF + 0.1);

  // faixas de pedestre zebradas e borda amarela das vagas
  const zebraMat = new THREE.MeshStandardMaterial({ map: zebraTex(), roughness: 0.8 });
  for (const s of [-1, 1]) {
    const z = new THREE.Mesh(new THREE.PlaneGeometry(41.5, WALK), zebraMat);
    z.rotation.x = -Math.PI / 2;
    z.position.set(0.3, 0.012, s * (AISLE + WALK / 2));
    z.receiveShadow = true;
    g.add(z);
  }
  // ralos e tampas no meio do corredor
  const grate = new THREE.MeshStandardMaterial({ color: 0x2c2b29, roughness: 0.6, metalness: 0.5 });
  for (const x of [-14, -4, 6, 16]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), grate);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.008, 0.3);
    g.add(m);
  }
  for (const [x, z] of [[-9, -2.6], [11, 2.6], [1, -2.4]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshStandardMaterial({ color: 0x4a3c2c, roughness: 0.7, metalness: 0.4 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.009, z);
    g.add(m);
  }

  // ---------- vagas
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd2ac45 });
  const hitMat = new THREE.MeshBasicMaterial({ color: 0x3fd07a, transparent: true, opacity: 0, depthWrite: false });
  const addSpot = (n: number, x0: number, side: -1 | 1) => {
    const x = x0 + SPOT_W / 2, z = side * ROW_C;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SPOT_W - 0.25, SPOT_D - 0.2), hitMat.clone());
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    g.add(m);
    // número no chão (perto do corredor) e na parede, acima da faixa
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: numberTex(String(n).padStart(2, "0")), transparent: true, depthWrite: false, opacity: 0.85 }));
    nm.rotation.x = -Math.PI / 2;
    if (side > 0) nm.rotation.z = Math.PI;
    nm.position.set(x, 0.022, side * (ROW0 + 0.7));
    g.add(nm);
    const wn = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: numberTex(String(n).padStart(2, "0")), transparent: true }));
    wn.position.set(x, 1.48, side * (WALL - 0.01));
    if (side > 0) wn.rotation.y = Math.PI;
    g.add(wn);
    for (const lx of [x0, x0 + SPOT_W]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.08, SPOT_D), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(lx, 0.015, z);
      g.add(l);
    }
    spots.push({ n, x, z, side, pcd: n === 15, motos: n === 1, mesh: m });
  };
  // em cima (z < 0): bicicletário em -20..-17.5, 13..08, depósito, escada, 07..01
  for (let i = 0; i < 6; i++) addSpot(13 - i, -17.5 + i * SPOT_W, -1);
  for (let i = 0; i < 7; i++) addSpot(7 - i, 3 + i * SPOT_W, -1);
  // embaixo (z > 0): 15..21, hall, elevador, 22..27
  for (let i = 0; i < 7; i++) addSpot(15 + i, -20 + i * SPOT_W, 1);
  for (let i = 0; i < 6; i++) addSpot(22 + i, 3 + i * SPOT_W, 1);
  // vaga PcD: símbolo azul no chão
  {
    const s = spots.find((p) => p.n === 15)!;
    const pcd = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({
        map: tex(256, 256, (c) => {
          c.fillStyle = "#2b6cc4";
          c.fillRect(0, 0, 256, 256);
          c.fillStyle = "#fff";
          c.font = "200px Arial";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText("♿", 128, 140);
        }),
      }),
    );
    pcd.rotation.x = -Math.PI / 2;
    pcd.position.set(s.x, 0.02, s.z + 0.6);
    g.add(pcd);
  }

  // ---------- pilares (no mapa: entre as vagas, na beira do corredor e junto da parede)
  const pillar = (x: number, z: number) => {
    const geo = new THREE.BoxGeometry(0.32, CEIL, 0.6);
    const m = new THREE.Mesh(geo, pillarMat);
    m.position.set(x, CEIL / 2, z);
    m.receiveShadow = true;
    g.add(m);
    obstacles.push({ x, z, hw: 0.16, hd: 0.3, ang: 0 });
    return m;
  };
  const extMat = new THREE.MeshStandardMaterial({ color: 0xc41a14, roughness: 0.4, metalness: 0.2 });
  const redMark = new THREE.MeshStandardMaterial({ color: 0xa3261f, roughness: 0.8 });
  const PILLARS: [number, -1 | 1][] = [
    [-17.5, -1], [-12.5, -1], [-7.5, -1], [8, -1], [13, -1], [18, -1],
    [-17.5, 1], [-12.5, 1], [-7.5, 1], [-2.5, 1], [8, 1], [13, 1],
  ];
  PILLARS.forEach(([x, side], i) => {
    pillar(x, side * (ROW0 + 0.3));
    pillar(x, side * (WALL - 0.3));
    if (i % 2 === 0) {
      // extintor no pilar e o quadrado vermelho no chão
      const e = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 12), extMat);
      e.position.set(x + 0.25, 0.6, side * (ROW0 + 0.1));
      g.add(e);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), redMark);
      r.rotation.x = -Math.PI / 2;
      r.position.set(x + 0.4, 0.016, side * (ROW0 - 0.45));
      g.add(r);
    }
  });

  // ---------- núcleo do meio: depósito + escada (em cima), hall + elevador (embaixo)
  const doorRed = new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 0.45, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xa9adb1, roughness: 0.3, metalness: 0.85 });
  wall(-1.25, -ROW0 - 0.15, 2.5, 0.3); // frente do depósito
  wall(1.5, -ROW0 - 0.15, 3, 0.3); // frente da escada
  wall(-2.5, -(ROW0 + WALL) / 2, 0.25, WALL - ROW0);
  wall(3, -(ROW0 + WALL) / 2, 0.25, WALL - ROW0);
  wall(0, -(ROW0 + WALL) / 2, 0.2, WALL - ROW0);
  const door = (x: number, z: number, mat: THREE.Material, w = 0.9, rotY = 0) => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(w, 2.1, 0.06), mat);
    d.position.set(x, 1.05, z);
    d.rotation.y = rotY;
    g.add(d);
    return d;
  };
  door(-1.25, -ROW0 + 0.02, steel); // depósito
  door(1.9, -ROW0 + 0.02, doorRed); // escada (porta corta-fogo)
  const hose = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.15), doorRed); // hidrante
  hose.position.set(0.8, 1.45, -ROW0 + 0.06);
  g.add(hose);
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.15), new THREE.MeshBasicMaterial({ color: 0x1fae4f }));
  exitSign.position.set(1.9, 2.3, -ROW0 + 0.02);
  g.add(exitSign);
  // elevadores logo à direita do carro da vaga 21 (duas portas lado a lado, de frente para o corredor) e o hall
  // de piso cinza até a vaga 22, com o quadro de avisos de cortiça no fundo
  const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(5.5, SPOT_D), new THREE.MeshStandardMaterial({ color: 0x6f7377, roughness: 0.6 }));
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set(0.25, 0.012, ROW_C);
  g.add(hallFloor);
  const EZ = ROW0 + 0.9; // frente das portas
  wall(-2.5, (ROW0 + WALL) / 2, 0.25, WALL - ROW0); // parede ao lado do carro da 21
  wall(-0.95, (EZ + WALL) / 2 + 0.15, 2.9, WALL - EZ - 0.3); // poço dos elevadores
  wall(0.55, (EZ + WALL) / 2 + 0.15, 0.2, WALL - EZ - 0.3);
  wall(3, (ROW0 + WALL) / 2, 0.25, WALL - ROW0); // parede ao lado da 22
  const frame = new THREE.MeshStandardMaterial({ color: 0x5d6166, roughness: 0.4, metalness: 0.7 });
  for (const x of [-1.75, -0.35]) {
    const d = door(x, EZ - 0.04, steel, 1.0);
    d.scale.y = 1.02;
    // batente e a junta do meio da porta
    const f = new THREE.Mesh(new THREE.BoxGeometry(1.16, 2.24, 0.04), frame);
    f.position.set(x, 1.1, EZ - 0.02);
    g.add(f);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 2.1, 0.07), frame);
    seam.position.set(x, 1.05, EZ - 0.04);
    g.add(seam);
    // indicador do andar em cima da porta
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshBasicMaterial({ map: numberTex("S", "#ff5a3a", "#111") }));
    ind.position.set(x, 2.38, EZ - 0.08);
    ind.rotation.y = Math.PI;
    g.add(ind);
  }
  // botoeira entre as duas portas
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.03), frame);
  btn.position.set(-1.05, 1.15, EZ - 0.06);
  g.add(btn);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshStandardMaterial({ color: 0x9c7a52, roughness: 1 }));
  board.position.set(1.8, 1.5, WALL - 0.02);
  board.rotation.y = Math.PI;
  g.add(board);

  // ---------- bicicletário e motos
  const metal = new THREE.MeshStandardMaterial({ color: 0x333539, roughness: 0.5, metalness: 0.6 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const bike = (x: number, z: number) => {
    const b = new THREE.Group();
    for (const dz of [-0.5, 0.5]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 20), tire);
      w.rotation.y = Math.PI / 2;
      w.position.set(0, 0.35, dz);
      b.add(w);
    }
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.9), metal);
    f.position.set(0, 0.6, 0);
    b.add(f);
    b.position.set(x, 0, z);
    g.add(b);
  };
  for (let i = 0; i < 4; i++) bike(-19.7 + i * 0.55, -WALL + 0.9);
  const moto = (x: number, z: number, cover: boolean) => {
    const m = new THREE.Group();
    for (const dz of [-0.7, 0.7]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 20), tire);
      w.rotation.y = Math.PI / 2;
      w.position.set(0, 0.32, dz);
      m.add(w);
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 1.3), cover ? new THREE.MeshStandardMaterial({ color: 0x2440a8, roughness: 0.6 }) : new THREE.MeshStandardMaterial({ color: 0x5a1b2a, roughness: 0.35, metalness: 0.4 }));
    body.position.set(0, 0.75, 0);
    m.add(body);
    if (!cover) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.6), metal);
      seat.position.set(0, 1.0, -0.2);
      m.add(seat);
    }
    m.position.set(x, 0, z);
    g.add(m);
    obstacles.push({ x, z, hw: 0.3, hd: 0.95, ang: 0 });
  };
  {
    const s = spots.find((p) => p.n === 1)!;
    moto(s.x - 0.5, s.z - 0.6, true);
    moto(s.x + 0.5, s.z + 0.2, false);
  }

  // ---------- teto: laje, vigas, canos e lâmpadas tubulares
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilingTex(), roughness: 0.95, side: THREE.DoubleSide });
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(43, 2 * WALL + 0.4), ceilMat);
  slab.rotation.x = Math.PI / 2;
  slab.position.set(1.1, CEIL, 0);
  ceiling.add(slab);
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x8f8d88, roughness: 0.95 });
  for (const x of [-17.5, -12.5, -7.5, -2.5, 3, 8, 13, 18]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 2 * WALL), beamMat);
    b.position.set(x, CEIL - 0.2, 0);
    ceiling.add(b);
  }
  const pipe = (z: number, y: number, r: number, color: number) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 43, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3 }));
    p.position.set(1.2, y, z);
    ceiling.add(p);
  };
  pipe(-1.6, CEIL - 0.45, 0.07, 0x1b1b1b);
  pipe(-1.3, CEIL - 0.5, 0.05, 0x5c3a28);
  pipe(2.2, CEIL - 0.42, 0.06, 0x1b1b1b);
  pipe(-3.8, CEIL - 0.3, 0.06, 0xa8231c);
  pipe(4.6, CEIL - 0.35, 0.03, 0xc9a23a); // gás (amarelo)
  const tube = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
  const lights: THREE.Vector3[] = [];
  for (let x = -17; x <= 21; x += 4.8) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 0.1), tube);
    t.position.set(x, CEIL - 0.08, 0);
    ceiling.add(t);
    lights.push(new THREE.Vector3(x, CEIL - 0.3, 0));
  }
  for (const s of [-1, 1]) for (let x = -15; x <= 17; x += 8) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 0.1), tube);
    t.position.set(x, CEIL - 0.08, s * ROW_C);
    ceiling.add(t);
  }

  // ---------- portão de grades brancas (abre correndo para o lado) e rampa curva até a rua
  const gate = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.5, metalness: 0.2 });
  const gw = 2 * RAMP_HALF;
  for (let i = 0; i <= 34; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.3, 0.035), white);
    b.position.set(0, 1.15, -gw / 2 + (i * gw) / 34);
    gate.add(b);
  }
  for (const y of [0.08, 1.2, 2.25]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, gw), white);
    r.position.set(0, y, 0);
    gate.add(r);
  }
  gate.position.set(GATE_X, 0, 0);
  g.add(gate);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, gw + 0.6), new THREE.MeshStandardMaterial({ color: 0xe9e7e0, roughness: 0.95 }));
  lintel.position.set(GATE_X + 0.1, 2.5, 0);
  g.add(lintel);

  // rampa: sai do portão para +x, faz a curva e sobe até a rua (z ≈ +19,5, y local 3,2 = nível da rua)
  const ramp = new THREE.CatmullRomCurve3([
    new THREE.Vector3(GATE_X, 0, 0), new THREE.Vector3(24.6, 0.05, 0.4), new THREE.Vector3(26.2, 0.45, 2.6),
    new THREE.Vector3(26.8, 1.3, 7), new THREE.Vector3(26.7, 2.45, 12.5), new THREE.Vector3(26.55, 3.12, 16.6), new THREE.Vector3(26.5, 3.2, 18.6),
  ]);
  const N = 70, HALF = RAMP_HALF;
  const pts = ramp.getSpacedPoints(N);
  const side = (i: number, s: number) => {
    const t = ramp.getTangentAt(i / N);
    const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
    return pts[i].clone().addScaledVector(n, s);
  };
  const strip = (a: (i: number) => THREE.Vector3, b: (i: number) => THREE.Vector3, mat: THREE.Material, vRepeat = 1) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const p = a(i), q = b(i);
      pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
      uv.push(0, (i / N) * vRepeat, 1, (i / N) * vRepeat);
      if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  strip((i) => side(i, -HALF), (i) => side(i, HALF), new THREE.MeshStandardMaterial({ map: stampedTex(), roughness: 0.85, side: THREE.DoubleSide }), 1);
  // muros brancos texturizados com a faixa amarela e preta, do piso da rampa até o nível da rua
  const rampWall = new THREE.MeshStandardMaterial({ map: wallTex(), roughness: 0.95, side: THREE.DoubleSide, color: 0xffffff });
  (rampWall.map as THREE.Texture).repeat.set(1, 1);
  for (const s of [-1, 1]) {
    strip((i) => side(i, s * HALF), (i) => side(i, s * HALF).setY(3.35), rampWall, 1);
    // guarda-corpo branco em cima do muro
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: N + 1 }, (_, i) => side(i, s * (HALF + 0.05)).setY(4.35))), N, 0.03, 6), white);
    g.add(rail);
    for (let i = 0; i <= N; i += 3) {
      const p = side(i, s * (HALF + 0.05));
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.0, 0.03), white);
      b.position.set(p.x, 3.85, p.z);
      g.add(b);
    }
    // luminárias redondas no muro
    for (let i = 8; i < N; i += 14) {
      const p = side(i, s * (HALF - 0.05));
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3d0 }));
      l.position.set(p.x, p.y + 1.45, p.z);
      g.add(l);
    }
  }
  // espelho convexo na curva
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24), new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.05, metalness: 1 }));
  {
    const p = side(14, HALF - 0.08);
    mirror.position.set(p.x, p.y + 2.1, p.z);
    mirror.lookAt(pts[10].x, p.y + 1.5, pts[10].z);
    g.add(mirror);
  }

  return { group: g, spots, obstacles, ceiling, gate, ramp, lights, rampOutline: () => [...pts.map((_, i) => side(i, -HALF - 0.3)), ...pts.map((_, i) => side(N - i, HALF + 0.3))] };
}
