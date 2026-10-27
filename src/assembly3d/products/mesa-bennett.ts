// Mesa Bennett 1,15 m com tampo de vidro (demonstração para prospectar): passos e ferragens copiados do manual
// (cód. 1031400 / 1018300 / 1018600, rev. 07). Medidas das peças estimadas pelas medidas da mesa (1155 × 895 × 780 mm).
// Base em cruz (06 + duas 11) no chão, 4 travessas 14 inclinadas até o sub-tampo 10, tampo 17/19 por cima.
import * as THREE from "three";
import type { Built, Product } from "../types";
import {
  allenKey, beamGeo, camGeo, dowelGeo, glue, hole, item, moveArc, placeItem, pose, qEuler, sapataGeo, screwGeo, screwdriver, std, win,
  type Item, type Pose,
} from "../parts";

const IMG = "/montagem/mesa-bennett/";
const BH = 0.06, BW = 0.09; // seção das travessas da base
const BY = 0.012 + BH / 2; // centro das travessas em cima das sapatas
const TOP = 0.732; // embaixo do sub-tampo
const LW = 0.08, LD = 0.05; // seção das travessas 14

/** Pé (b) e topo (p) de cada travessa 14 e o lado largo dela. */
const LEGS = [
  { b: new THREE.Vector3(0.33, BY + BH / 2, 0), p: new THREE.Vector3(0.17, TOP, 0), side: new THREE.Vector3(0, 0, 1) },
  { b: new THREE.Vector3(-0.33, BY + BH / 2, 0), p: new THREE.Vector3(-0.17, TOP, 0), side: new THREE.Vector3(0, 0, 1) },
  { b: new THREE.Vector3(0, BY + BH / 2, 0.3), p: new THREE.Vector3(0, TOP, 0.13), side: new THREE.Vector3(1, 0, 0) },
  { b: new THREE.Vector3(0, BY + BH / 2, -0.3), p: new THREE.Vector3(0, TOP, -0.13), side: new THREE.Vector3(1, 0, 0) },
];

function legBasis(b: THREE.Vector3, p: THREE.Vector3, side: THREE.Vector3) {
  const y = p.clone().sub(b).normalize();
  const x = side.clone().addScaledVector(y, -side.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Contorno do tampo: retângulo com os lados compridos levemente abaulados e cantos arredondados. */
function topShape(L: number, D: number, r: number, bulge: number) {
  const s = new THREE.Shape();
  const x = L / 2, z = D / 2;
  s.moveTo(-x + r, -z);
  s.quadraticCurveTo(0, -z - bulge, x - r, -z);
  s.quadraticCurveTo(x, -z, x, -z + r);
  s.lineTo(x, z - r);
  s.quadraticCurveTo(x, z, x - r, z);
  s.quadraticCurveTo(0, z + bulge, -x + r, z);
  s.quadraticCurveTo(-x, z, -x, z - r);
  s.lineTo(-x, -z + r);
  s.quadraticCurveTo(-x, -z, -x + r, -z);
  return s;
}

function build(scene: THREE.Scene): Built {
  const wood = std(0xb98b5e, 0.65);
  const mdf = std(0xcdb48c, 0.85);
  const base = new THREE.Group(); // base inteira (vira de cabeça para baixo no passo 8)
  scene.add(base);

  const beam = (len: number) => {
    const m = new THREE.Mesh(beamGeo(len, BW, BH), wood);
    m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    base.add(g);
    return g;
  };
  const b06 = beam(0.78);
  const b11 = [beam(0.3), beam(0.3)];
  const legs = LEGS.map((l) => {
    const len = l.p.distanceTo(l.b);
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(LW, len, LD).translate(0, len / 2, 0), wood);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    g.userData.len = len;
    base.add(g);
    return g;
  });
  const p10 = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.018, 0.3), mdf);
  plate.castShadow = plate.receiveShadow = true;
  p10.add(plate);
  base.add(p10);

  // tampo 17/19: quadro de MDF + vidro pintado por cima (em coordenadas da mesa montada)
  const tampo = new THREE.Group();
  scene.add(tampo);
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(topShape(1.1, 0.84, 0.09, 0.03), { depth: 0.022, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.772, 0), std(0x2c2622, 0.7));
  const glass = new THREE.Mesh(
    new THREE.ExtrudeGeometry(topShape(1.155, 0.895, 0.1, 0.035), { depth: 0.008, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.002, bevelSegments: 2 }).rotateX(Math.PI / 2).translate(0, 0.78, 0),
    new THREE.MeshPhysicalMaterial({ color: 0xeee8dd, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }),
  );
  frame.castShadow = glass.castShadow = true;
  frame.receiveShadow = glass.receiveShadow = true;
  tampo.add(frame, glass);

  // furos e ferragens
  const items: Item[] = [];
  const dowel = () => new THREE.Mesh(dowelGeo(), std(0xd9b98a, 0.8));
  // passo 1: 3 cavilhas H em cada 14 (1 no pé, 2 no topo)
  legs.forEach((g, i) => {
    const len = g.userData.len as number;
    const a = 0.04 + i * 0.235;
    const spots: [THREE.Vector3, THREE.Vector3][] = [
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)],
      [new THREE.Vector3(-0.022, len, 0), new THREE.Vector3(0, -1, 0)],
      [new THREE.Vector3(0.022, len, 0), new THREE.Vector3(0, -1, 0)],
    ];
    spots.forEach(([pos, dir], k) => {
      hole(g, pos, dir.clone().negate());
      items.push(item(g, dowel(), { pos, dir, step: 1, a: a + k * 0.065, b: a + k * 0.065 + 0.07, travel: 0.07, spin: 0, label: "H" }));
    });
  });
  // passo 2: sapatas F (2 na 06, 1 em cada 11)
  const sap = (parent: THREE.Object3D, x: number, a: number) => {
    const pos = new THREE.Vector3(x, -BH / 2, 0);
    items.push(item(parent, sapataGeo(), { pos, dir: new THREE.Vector3(0, 1, 0), step: 2, a, b: a + 0.1, travel: 0.08, spin: 1, label: "F" }));
  };
  sap(b06, 0.35, 0.25);
  sap(b06, -0.35, 0.37);
  sap(b11[0], 0.12, 0.49);
  sap(b11[1], 0.12, 0.61);
  // passo 3: 4 cavilhas H nas laterais da 06 e a barra A atravessando
  [[0.03, 1], [-0.03, 1], [0.03, -1], [-0.03, -1]].forEach(([x, sz], k) => {
    const pos = new THREE.Vector3(x, -0.004, (sz * BW) / 2);
    const dir = new THREE.Vector3(0, 0, -sz);
    hole(b06, pos, dir.clone().negate());
    items.push(item(b06, dowel(), { pos, dir, step: 3, a: 0.12 + k * 0.11, b: 0.2 + k * 0.11, travel: 0.06, spin: 0, label: "H" }));
  });
  hole(b06, new THREE.Vector3(0, -0.004, BW / 2), new THREE.Vector3(0, 0, 1), 0.0035);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.18, 8), std(0x7d8389, 0.4, 0.8));
  items.push(item(b06, rod, { pos: new THREE.Vector3(0, -0.004, 0), dir: new THREE.Vector3(0, 0, -1), step: 3, a: 0.64, b: 0.95, travel: 0.3, spin: 0, label: "A" }));
  // passo 4: tambor C em cada 11
  const cams = b11.map((g, i) => {
    const pos = new THREE.Vector3(-0.105, BH / 2, 0);
    hole(g, pos, new THREE.Vector3(0, 1, 0), 0.008);
    const it = item(g, camGeo(), { pos, dir: new THREE.Vector3(0, -1, 0), step: 4, a: 0.62 + i * 0.08, b: 0.7 + i * 0.08, travel: 0.07, spin: 0, label: "C" });
    items.push(it);
    return it;
  });
  // passo 6: 8 parafusos B por baixo (2 por travessa 14)
  LEGS.forEach((l, i) => {
    const along = l.side.x ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    [-1, 1].forEach((s, k) => {
      const j = i * 2 + k;
      const pos = l.b.clone().addScaledVector(along, s * 0.022).setY(0.012);
      items.push(item(base, screwGeo(0.045), { pos, dir: new THREE.Vector3(0, 1, 0), step: 6, a: 0.16 + j * 0.088, b: 0.23 + j * 0.088, travel: 0.06, spin: 5, label: "B", tool: "phillips" }));
    });
  });
  // passo 7: 8 parafusos D de cima do sub-tampo nos topos das 14
  LEGS.forEach((l, i) => {
    [-1, 1].forEach((s, k) => {
      const j = i * 2 + k;
      const pos = l.p.clone().addScaledVector(l.side, s * 0.022).setY(TOP + 0.018);
      hole(p10, pos.clone().sub(new THREE.Vector3(0, TOP + 0.009, 0)), new THREE.Vector3(0, 1, 0), 0.004);
      items.push(item(base, screwGeo(0.03), { pos, dir: new THREE.Vector3(0, -1, 0), step: 7, a: 0.36 + j * 0.075, b: 0.42 + j * 0.075, travel: 0.06, spin: 5, label: "D", tool: "phillips" }));
    });
  });
  // passo 8: 8 parafusos D do sub-tampo no tampo
  [[0.17, 0.12], [-0.17, 0.12], [0.17, -0.12], [-0.17, -0.12], [0.08, 0.12], [-0.08, 0.12], [0.08, -0.12], [-0.08, -0.12]].forEach(([x, z], j) => {
    const pos = new THREE.Vector3(x, TOP, z);
    items.push(item(base, screwGeo(0.03), { pos, dir: new THREE.Vector3(0, 1, 0), step: 8, a: 0.76 + j * 0.028, b: 0.79 + j * 0.028, travel: 0.05, spin: 4, label: "D", tool: "phillips" }));
  });

  // ferramentas
  const driver = screwdriver();
  base.add(driver);
  const key = allenKey();
  scene.add(key);
  const bottle = glue();
  scene.add(bottle);
  for (const o of [driver, key, bottle]) o.traverse((m) => (m.castShadow = true));

  // poses das peças no chão (separadas na embalagem) e montadas
  const legLying = (i: number) => pose(-0.34, LW / 2, 0.52 + i * 0.12, qEuler(0, 0, -Math.PI / 2));
  const legFinal = LEGS.map((l) => ({ p: l.b.clone(), q: legBasis(l.b, l.p, l.side) }));
  const b06Floor = pose(0, BH / 2, -0.42);
  const b06Final = pose(0, BY, 0);
  const b11Floor = [pose(0.6, BH / 2, 0.1, qEuler(0, Math.PI / 2, 0)), pose(0.74, BH / 2, 0.1, qEuler(0, Math.PI / 2, 0))];
  const b11Final = [pose(0, BY, BW / 2 + 0.15, qEuler(0, -Math.PI / 2, 0)), pose(0, BY, -BW / 2 - 0.15, qEuler(0, Math.PI / 2, 0))];
  const p10Floor = pose(-0.74, 0.009, -0.05);
  const p10Final = pose(0, TOP + 0.009, 0);
  // tampo: de cabeça para baixo (vidro na embalagem), primeiro afastado, depois no centro
  const flipped = pose(0, 0.78, 0, qEuler(Math.PI, 0, 0));
  const tampoAway = pose(0, 0.78, -1.25, qEuler(Math.PI, 0, 0));
  const upright = pose(0, 0, 0);
  const lifted = pose(0, 0.95, 0);

  const tmp = new THREE.Vector3();
  let activeIt: Item | null = null;

  const posePieces = (s: number, t: number) => {
    const P = (k: number) => (s > k ? 1 : s < k ? 0 : t);
    // 06 e 11: viram para colocar as sapatas (passo 2), depois vão para a cruz (passo 4)
    const p2 = P(2), fl = win(p2, 0, 0.2), un = win(p2, 0.8, 1);
    const flip = (o: THREE.Object3D, floor: Pose) => {
      o.position.copy(floor.p);
      o.position.y += 0.012 * un + 0.12 * Math.sin(Math.PI * fl) + 0.12 * Math.sin(Math.PI * un);
      o.quaternion.copy(floor.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * (fl - un)));
    };
    const p4 = P(4);
    flip(b06, b06Floor);
    if (p4 > 0) moveArc(b06, { p: b06.position.clone(), q: b06.quaternion.clone() }, b06Final, win(p4, 0, 0.25), 0.08);
    b11.forEach((g, i) => {
      flip(g, b11Floor[i]);
      const k = win(p4, 0.25 + i * 0.15, 0.5 + i * 0.15);
      if (k > 0) {
        // chega por fora e encosta na 06
        const out = b11Final[i].p.clone().add(new THREE.Vector3(0, 0, (i ? -1 : 1) * 0.16));
        const mid = { p: out, q: b11Final[i].q };
        const from = { p: g.position.clone(), q: g.quaternion.clone() };
        if (k < 0.7) moveArc(g, from, mid, k / 0.7, 0.1);
        else moveArc(g, mid, b11Final[i], (k - 0.7) / 0.3);
      }
    });
    // 14: deitadas até o passo 5, depois em pé na cruz
    const p5 = P(5);
    legs.forEach((g, i) => {
      const k = win(p5, 0.06 + i * 0.22, 0.26 + i * 0.22);
      moveArc(g, legLying(i), legFinal[i], k, 0.35);
    });
    // 10: no chão até o passo 7
    moveArc(p10, p10Floor, p10Final, win(P(7), 0, 0.3), 0.45);
    // base: levanta para parafusar por baixo (6); vira sobre o tampo (8); a mesa toda vira de volta (9)
    const p6 = P(6), p8 = P(8), p9 = P(9);
    const raise = win(p6, 0, 0.12) - win(p6, 0.9, 1);
    if (p8 < 0.01) {
      moveArc(base, upright, upright, 0);
      base.position.y = 0.32 * raise;
    } else if (p8 < 0.25) moveArc(base, upright, lifted, win(p8, 0, 0.22));
    else if (p9 === 0) moveArc(base, lifted, flipped, win(p8, 0.42, 0.72), 0.15);
    // tampo
    if (p9 > 0) {
      const k = win(p9, 0, 0.55);
      moveArc(base, flipped, upright, k, 0.6);
      tampo.position.copy(base.position);
      tampo.quaternion.copy(base.quaternion);
    } else moveArc(tampo, tampoAway, flipped, win(p8, 0.2, 0.42));
  };

  const pose_ = (s: number, t: number) => {
    posePieces(s, t);
    activeIt = null;
    for (const it of items) {
      const w = placeItem(it, s, t);
      if (s === it.step && w >= 0 && t >= it.a - 0.03 && t <= it.b + 0.02) activeIt = it;
    }
    // sapatas niveladoras giram no fim (passo 9)
    if (s === 9) for (const it of items) if (it.label === "F") it.obj.rotateY(Math.sin(Math.min(1, Math.max(0, (t - 0.6) / 0.35)) * Math.PI * 2) * 0.8);
    // chave Phillips no parafuso que está entrando
    const ph = activeIt && activeIt.tool === "phillips" ? activeIt : null;
    driver.visible = !!ph;
    if (ph) {
      driver.position.copy(ph.obj.position).addScaledVector(ph.dir, -0.003);
      // mesmo giro do parafuso, virada para fora da peça
      driver.quaternion.copy(ph.obj.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
    }
    // chave Allen girando os tambores (passo 4)
    const kk = s === 4 ? (t - 0.8) / 0.2 : -1;
    key.visible = kk >= 0 && kk <= 1;
    if (key.visible) {
      const cam = cams[kk < 0.5 ? 0 : 1].obj;
      cam.getWorldPosition(tmp);
      key.position.copy(tmp);
      key.rotation.set(0, ((kk % 0.5) / 0.5) * Math.PI * 1.2, 0);
    }
    // cola: aparece onde vai a próxima cavilha (passos 1, 3 e 5)
    let gl: THREE.Vector3 | null = null;
    if ((s === 1 || s === 3) && activeIt && activeIt.label === "H") gl = activeIt.obj.parent!.localToWorld(activeIt.pos.clone());
    if (s === 5) {
      const i = Math.floor((t - 0.02) / 0.22);
      if (i >= 0 && i < 4 && (t - 0.02) % 0.22 < 0.08) gl = LEGS[i].b.clone();
    }
    bottle.visible = !!gl;
    if (gl) {
      bottle.position.copy(gl).add(new THREE.Vector3(0.02, 0.04, 0.02));
      bottle.rotation.set(0.5 + Math.sin(performance.now() / 160) * 0.06, 0, -0.4);
    }
  };

  const center = (o: THREE.Object3D, y = 0) => () => o.localToWorld(new THREE.Vector3(0, y, 0));
  return {
    pose: pose_,
    badges: [
      { id: "06", label: "06", at: center(b06, 0.05) },
      { id: "11", label: "11", at: center(b11[0], 0.05) },
      { id: "11", label: "11", at: center(b11[1], 0.05) },
      ...legs.map((g) => ({ id: "14", label: "14", at: () => g.localToWorld(new THREE.Vector3(0, (g.userData.len as number) * 0.5, 0.04)) })),
      { id: "10", label: "10", at: center(p10, 0.03) },
      { id: "17/19", label: "17/19", at: () => tampo.localToWorld(new THREE.Vector3(0.3, 0.8, 0.2)) },
    ],
    active: () => (activeIt ? { label: activeIt.label, at: activeIt.obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.04, 0)) } : null),
  };
}

export const mesaBennett: Product = {
  slug: "mesa-bennett",
  name: "Mesa Bennett 1,15 m",
  subtitle: "Tampo de vidro · cód. 1031400 / 1018300 / 1018600",
  size: "1155 × 895 × 780 mm",
  pieces: [
    { id: "06", name: "Base central", qty: 1 },
    { id: "10", name: "Sub-tampo", qty: 1 },
    { id: "11", name: "Travessa menor", qty: 2 },
    { id: "14", name: "Travessa lateral", qty: 4 },
    { id: "17/19", name: "Tampo (30 kg)", qty: 1 },
  ],
  hardware: [
    { id: "A", name: "Barra roscada", size: "M6 × 180", qty: 1 },
    { id: "B", name: "Parafuso", size: "6,0 × 45", qty: 8 },
    { id: "C", name: "Tambor", qty: 2 },
    { id: "D", name: "Parafuso", size: "6,0 × 30", qty: 16 },
    { id: "F", name: "Sapata", qty: 4 },
    { id: "H", name: "Cavilha", size: "8 × 30", qty: 16 },
  ],
  steps: [
    {
      n: "", title: "Separe as peças", img: IMG + "pecas.jpg", uses: {}, pieces: ["06", "11", "14", "10", "17/19"],
      text: "Forre o chão com a embalagem e separe tudo: base 06, duas travessas 11, quatro travessas 14, sub-tampo 10 e o tampo 17/19 (30 kg, peça ajuda para mover).",
      cam: { target: [0, 0.1, -0.15], offset: [1.5, 1.7, 2.1] }, dur: 3,
    },
    {
      n: "01", title: "Cavilhas nas travessas 14", img: IMG + "passo-01.jpg", uses: { H: 12 }, tools: ["Cola"], pieces: ["14"],
      text: "Aplique cola nos furos e encaixe 3 cavilhas H em cada travessa 14 (1 no pé e 2 no topo). Faça nas 4.",
      cam: { target: [0, 0.04, 0.7], offset: [0.5, 0.55, 0.75] }, dur: 9,
    },
    {
      n: "02", title: "Sapatas", img: IMG + "passo-02.jpg", uses: { F: 4 }, pieces: ["06", "11"],
      text: "Vire a base central 06 e as travessas menores 11 e encaixe as sapatas F: 2 na 06 e 1 em cada 11.",
      cam: { target: [0.25, 0.06, -0.15], offset: [0.75, 0.75, 1.0] }, dur: 7,
    },
    {
      n: "03", title: "Cavilhas e barra na 06", img: IMG + "passo-03.jpg", uses: { H: 4, A: 1 }, tools: ["Cola"], pieces: ["06"],
      text: "Passe cola e encaixe 4 cavilhas H nas laterais da base 06. Depois passe a barra roscada A pelo furo do meio.",
      cam: { target: [0, 0.04, -0.42], offset: [0.35, 0.4, 0.55] }, dur: 7,
    },
    {
      n: "04", title: "Monte a cruz da base", img: IMG + "passo-04.jpg", uses: { C: 2 }, tools: ["Chave Allen E"], pieces: ["06", "11"],
      text: "Encaixe uma travessa 11 de cada lado da 06. Coloque o tambor C no furo de cada 11 e gire com a chave Allen E até travar na barra.",
      cam: { target: [0, 0.05, 0], offset: [0.6, 0.65, 0.8] }, dur: 8,
    },
    {
      n: "05", title: "Encaixe as travessas 14", img: IMG + "passo-05.jpg", uses: {}, tools: ["Cola"], pieces: ["14"],
      text: "Passe cola nos furos das pontas da cruz e encaixe as 4 travessas 14, inclinadas para dentro.",
      cam: { target: [0, 0.32, 0], offset: [1.1, 0.75, 1.35] }, dur: 8,
    },
    {
      n: "06", title: "Parafuse por baixo", img: IMG + "passo-06.jpg", uses: { B: 8 }, tools: ["Chave Phillips"], pieces: ["06", "11"],
      text: "Por baixo da base, parafuse 8 parafusos B (6,0 × 45): 2 em cada travessa 14, pela 06 e pelas 11.",
      cam: { target: [0, 0.28, 0], offset: [1.05, -0.05, 1.15] }, dur: 9,
    },
    {
      n: "07", title: "Sub-tampo 10", img: IMG + "passo-07.jpg", uses: { D: 8 }, tools: ["Chave Phillips"], pieces: ["10"],
      text: "Apoie o sub-tampo 10 no topo das travessas 14 e parafuse 8 parafusos D (6,0 × 30).",
      cam: { target: [0, 0.65, 0], offset: [0.75, 0.75, 0.9] }, dur: 9,
    },
    {
      n: "08", title: "Fixe no tampo", img: IMG + "passo-08.jpg", uses: { D: 8 }, tools: ["Chave Phillips"], pieces: ["10", "17/19"],
      text: "Deite o tampo 17/19 com o vidro para baixo em cima da embalagem. Vire a base de cabeça para baixo sobre ele e parafuse mais 8 parafusos D pelo sub-tampo 10.",
      cam: { target: [0, 0.45, -0.3], offset: [1.4, 1.15, 1.7] }, dur: 10,
    },
    {
      n: "", title: "Vire e nivele", img: IMG + "passo-09.jpg", uses: {}, pieces: ["17/19"],
      text: "Com outra pessoa, vire a mesa. Gire as sapatas niveladoras F até a mesa ficar firme. Pronto!",
      cam: { target: [0, 0.42, 0], offset: [1.5, 0.95, 1.9] }, dur: 7,
    },
  ],
  build,
  whatsapp: "5561992372216",
  demo: true,
};
