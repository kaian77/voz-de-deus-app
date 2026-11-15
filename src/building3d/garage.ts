// Subsolo do Residencial Serrano, pela planta de divulgação: 27 vagas (01 PcD), corredor de mão dupla com
// faixas de pedestres, escada e hall dos elevadores no meio, rampa curva saindo pela direita até a rua.
// Unidade = 1 metro. x = comprimento (esquerda → direita da planta), z = para baixo na planta.
import * as THREE from "three";

export type Spot = { n: number; x: number; z: number; side: -1 | 1; pcd?: boolean; mesh: THREE.Mesh };
export const SPOT_W = 2.5, SPOT_D = 5;
const ROW = 6.5; // centro das vagas (|z|)
const LANE = 1.4; // faixa de cada mão no corredor
export const RAMP_TOP = new THREE.Vector3(30, 3.2, 15.5);

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
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
const asphalt = () =>
  canvasTex(256, 256, (c) => {
    c.fillStyle = "#3b3d41";
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 50 + Math.random() * 30;
      c.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
      c.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
  }, [12, 6]);

/** Número da vaga pintado no chão (e o símbolo de cadeira de rodas na 01). */
function numberMat(n: number, pcd: boolean, flip: boolean) {
  const t = canvasTex(128, 256, (c) => {
    c.clearRect(0, 0, 128, 256);
    c.save();
    if (flip) {
      c.translate(128, 256);
      c.rotate(Math.PI);
    }
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.font = "bold 64px Jost, Arial, sans-serif";
    c.textAlign = "center";
    c.fillText(String(n).padStart(2, "0"), 64, 228);
    if (pcd) {
      c.fillStyle = "#1f6fd1";
      c.fillRect(24, 40, 80, 80);
      c.fillStyle = "#fff";
      c.font = "60px Arial";
      c.fillText("♿", 64, 103);
    }
    c.restore();
  });
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
}

export function buildGarage() {
  const g = new THREE.Group();
  const spots: Spot[] = [];
  // laje do piso e paredes baixas (sem teto, para ver de cima)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 22), new THREE.MeshStandardMaterial({ map: asphalt(), roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(1.5, 0, 0);
  floor.receiveShadow = true;
  g.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.9 });
  const wall = (x: number, z: number, w: number, d: number, h = 2.8) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, h / 2, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  wall(1.5, -11, 46, 0.3);
  wall(1.5 - 2.5, 11, 41, 0.3); // fundo de baixo (abre à direita para a rampa)
  wall(-21.5, 0, 0.3, 22);
  wall(24.5, -6.5, 0.3, 9);
  // calçadas de pedestres ao longo do corredor
  const walkMat = new THREE.MeshStandardMaterial({ color: 0xbfc1c3, roughness: 0.85 });
  for (const z of [-3.6, 3.6]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(z < 0 ? 40.5 : 37, 0.08, 0.9), walkMat);
    w.position.set(z < 0 ? -0.75 : -2.5, 0.04, z);
    w.receiveShadow = true;
    g.add(w);
  }
  // faixa central tracejada e setas de mão dupla
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  for (let x = -19; x < 24; x += 3) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.12), lineMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.02, 0);
    g.add(d);
  }
  const arrow = (x: number, z: number, dir: 1 | -1) => {
    const s = new THREE.Shape([new THREE.Vector2(-0.8, -0.08), new THREE.Vector2(0.4, -0.08), new THREE.Vector2(0.4, -0.3), new THREE.Vector2(0.9, 0), new THREE.Vector2(0.4, 0.3), new THREE.Vector2(0.4, 0.08), new THREE.Vector2(-0.8, 0.08)]);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = dir > 0 ? 0 : Math.PI;
    m.position.set(x, 0.02, z);
    g.add(m);
  };
  for (const x of [-12, 9]) {
    arrow(x, -LANE, -1);
    arrow(x, LANE, 1);
  }
  // escada (em cima) e hall dos elevadores (embaixo), no meio
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.8 });
  const core = (z: number, label: string) => {
    const base = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 5), coreMat);
    base.position.set(-0.5, 0.05, z);
    g.add(base);
    wall(-2.5, z, 0.2, 5, 2.8);
    wall(1.5, z, 0.2, 5, 2.8);
    wall(-0.5, z + (z < 0 ? -2.5 : 2.5), 4, 0.2, 2.8);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.9),
      new THREE.MeshBasicMaterial({
        map: canvasTex(512, 128, (c) => {
          c.fillStyle = "#1f2b3a";
          c.fillRect(0, 0, 512, 128);
          c.fillStyle = "#fff";
          c.font = "bold 60px Jost, Arial";
          c.textAlign = "center";
          c.fillText(label, 256, 86);
        }),
      }),
    );
    sign.rotation.x = -Math.PI / 2;
    sign.position.set(-0.5, 0.12, z);
    g.add(sign);
    // elevadores: duas portas metálicas
    if (z > 0) for (const dx of [-1.4, 0.4]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.1), new THREE.MeshStandardMaterial({ color: 0xaab0b8, metalness: 0.8, roughness: 0.3 }));
      door.position.set(-0.5 + dx + 0.5, 1.1, z + 2.35);
      g.add(door);
    }
  };
  core(-ROW - 0.5, "ESCADA");
  core(ROW + 0.5, "ELEVADORES");

  // vagas: [primeiro número, quantas, x da primeira vaga, passo, lado]
  const stripe = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const hit = new THREE.MeshBasicMaterial({ color: 0x3fd07a, transparent: true, opacity: 0, depthWrite: false });
  const add = (n: number, x: number, side: -1 | 1) => {
    const z = side * ROW;
    const pcd = n === 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SPOT_W - 0.2, SPOT_D - 0.2), hit.clone());
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    m.userData.n = n;
    g.add(m);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), numberMat(n, pcd, side > 0));
    num.rotation.x = -Math.PI / 2;
    num.position.set(x, 0.035, z + side * 0.9);
    g.add(num);
    spots.push({ n, x, z, side, pcd, mesh: m });
  };
  const line = (x: number, side: -1 | 1) => {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, SPOT_D), stripe);
    l.rotation.x = -Math.PI / 2;
    l.position.set(x, 0.025, side * ROW);
    g.add(l);
  };
  // em cima: 14..08 (da esquerda para a direita), escada, 07..01
  for (let i = 0; i < 7; i++) add(14 - i, -20 + SPOT_W / 2 + i * SPOT_W, -1);
  for (let i = 0; i < 7; i++) add(7 - i, 1.5 + SPOT_W / 2 + i * SPOT_W, -1);
  // embaixo: 15..21, elevadores, 22..27
  for (let i = 0; i < 7; i++) add(15 + i, -20 + SPOT_W / 2 + i * SPOT_W, 1);
  for (let i = 0; i < 6; i++) add(22 + i, 1.5 + SPOT_W / 2 + i * SPOT_W, 1);
  for (const side of [-1, 1] as const) {
    for (let i = 0; i <= 7; i++) line(-20 + i * SPOT_W, side);
    for (let i = 0; i <= (side < 0 ? 7 : 6); i++) line(1.5 + i * SPOT_W, side);
  }
  // área hachurada ao lado da vaga PcD
  const hatch = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, SPOT_D - 0.2),
    new THREE.MeshBasicMaterial({
      map: canvasTex(64, 256, (c) => {
        c.strokeStyle = "#fff";
        c.lineWidth = 7;
        for (let y = -64; y < 320; y += 26) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(64, y + 40);
          c.stroke();
        }
      }),
      transparent: true,
    }),
  );
  hatch.rotation.x = -Math.PI / 2;
  hatch.position.set(19 + 0.75, 0.03, -ROW);
  g.add(hatch);
  // pilares entre grupos de 3 vagas
  const colMat = new THREE.MeshStandardMaterial({ color: 0xc8c4bb, roughness: 0.8 });
  for (const side of [-1, 1]) for (const x of [-20 + 3 * SPOT_W, 1.5 + 3 * SPOT_W, 1.5 + 6 * SPOT_W]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.8, 0.6), colMat);
    c.position.set(x, 1.4, side * 9.2);
    c.castShadow = true;
    g.add(c);
  }
  // luminárias (faixas acesas nas paredes)
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfffbea });
  for (let x = -18; x < 22; x += 6) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), lamp);
    l.position.set(x, 2.6, -10.8);
    g.add(l);
  }

  // rampa: sai do corredor pela direita e faz a curva para baixo (na planta) subindo até a rua
  const rampCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(21, 0, 0), new THREE.Vector3(25.5, 0.2, 0.6), new THREE.Vector3(28.6, 0.9, 3.8),
    new THREE.Vector3(29.6, 1.8, 8.5), new THREE.Vector3(30, 2.7, 12.5), RAMP_TOP,
  ]);
  const rampPts = rampCurve.getSpacedPoints(60);
  const verts: number[] = [], idx: number[] = [];
  rampPts.forEach((p, i) => {
    const t = rampCurve.getTangentAt(i / 60);
    const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
    for (const s of [-3.2, 3.2]) verts.push(p.x + n.x * s, p.y + 0.02, p.z + n.z * s);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x45474b, roughness: 0.9, side: THREE.DoubleSide });
  const ramp = new THREE.Mesh(rg, rampMat);
  ramp.receiveShadow = true;
  g.add(ramp);
  // muretas da rampa
  for (const s of [-3.4, 3.4]) {
    const pts = rampPts.map((p, i) => {
      const t = rampCurve.getTangentAt(i / 60);
      const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
      return new THREE.Vector3(p.x + n.x * s, p.y + 0.5, p.z + n.z * s);
    });
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.15, 6), wallMat);
    m.castShadow = true;
    g.add(m);
  }
  // grama e árvores do lado de fora da rampa (como na planta)
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(14, 30), new THREE.MeshStandardMaterial({ color: 0x6f9a4f, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(31, -0.02, 6);
  g.add(grass);

  return { group: g, spots, rampCurve };
}

/** Caminho do carro: rua → rampa → corredor (mão certa) → entra de frente na vaga. */
export function pathTo(spot: Spot, rampCurve: THREE.CatmullRomCurve3) {
  const pts: THREE.Vector3[] = [];
  const ramp = rampCurve.getSpacedPoints(24).reverse(); // de cima para baixo
  pts.push(...ramp.slice(0, -2));
  // no corredor, na mão de quem entra (indo para a esquerda = lado -z), até um pouco depois da vaga
  const laneZ = -LANE * 0.75;
  const approachX = Math.min(spot.x + 4.4, 20.4);
  if (approachX < 18.5) pts.push(new THREE.Vector3(20, 0, laneZ));
  pts.push(new THREE.Vector3(approachX, 0, laneZ));
  pts.push(new THREE.Vector3(spot.x + 1.4, 0, spot.side * 3.2));
  pts.push(new THREE.Vector3(spot.x + 0.15, 0, spot.side * 5.0));
  pts.push(new THREE.Vector3(spot.x, 0, spot.side * 6.9));
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}
