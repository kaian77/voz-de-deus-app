// Tonhão em 3D: corpo musculoso (public/treino/tonhao.bin, feito por scripts/tonhao-mesh.ts) com esqueleto de verdade.
// As poses vêm das mesmas poses 2D dos exercícios (tonhao.ts): cada osso gira para apontar na direção do desenho.
// Renderiza num canvas WebGL próprio e copia para o canvas 2D (assim entra também na gravação do treino).
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ExId } from "./data";
import { ANIMS, poseAt, type Pose, type XY } from "./tonhao";
import { BONES, J, type V3 } from "./tonhao-body";

const S = 0.0187; // metros por unidade do desenho 2D
const Y = (y2: number) => (97.8 - y2) * S;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let bones: THREE.Bone[] = [];
let bar: THREE.Group, bells: THREE.Object3D[] = [], shadow: THREE.Mesh;
let ready = false;
let failed = false;
let size = 0;

export const tonhao3d = { get ready() { return ready; } };

async function init() {
  try {
    const cv = document.createElement("canvas");
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);

    // luz de academia: principal quente pela frente, contraluz fria (contorno dos músculos) e preenchimento
    scene.add(new THREE.HemisphereLight(0xe8eeff, 0x3a2a20, 0.55));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
    key.position.set(2.5, 3.5, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 2.2);
    rim.position.set(-2.5, 2.2, -3);
    scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xd4ff3f, 0.7);
    rim2.position.set(3, 1, -2.5);
    scene.add(rim2);

    const buf = await fetch("/treino/tonhao.bin").then((r) => { if (!r.ok) throw new Error("sem modelo"); return r.arrayBuffer(); });
    await MeshoptDecoder.ready;
    const dv = new DataView(buf);
    const nv = dv.getUint32(4, true), ni = dv.getUint32(8, true), vLen = dv.getUint32(36, true);
    const lo = [0, 1, 2].map((k) => dv.getFloat32(12 + k * 4, true)), range = [0, 1, 2].map((k) => dv.getFloat32(24 + k * 4, true));
    const ST = 24;
    const vb = new Uint8Array(nv * ST);
    MeshoptDecoder.decodeVertexBuffer(vb, nv, ST, new Uint8Array(buf, 40, vLen));
    const ib = new Uint32Array(ni);
    MeshoptDecoder.decodeIndexBuffer(new Uint8Array(ib.buffer), ni, 4, new Uint8Array(buf, 40 + vLen));
    const v = new DataView(vb.buffer);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
    const lin = (c: number) => Math.pow(c / 255, 2.2);
    for (let i = 0; i < nv; i++) {
      const o = i * ST;
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] = lo[k] + (v.getUint16(o + k * 2, true) / 65535) * range[k];
        nor[i * 3 + k] = v.getInt8(o + 6 + k) / 127;
      }
      const ao = Math.pow(vb[o + 13] / 255, 1.3);
      for (let k = 0; k < 3; k++) col[i * 3 + k] = lin(vb[o + 10 + k]) * ao;
      for (let k = 0; k < 4; k++) { si[i * 4 + k] = vb[o + 14 + k]; sw[i * 4 + k] = vb[o + 18 + k] / 255; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(new THREE.BufferAttribute(ib, 1));

    // ossos na pose de descanso (sem rotação: os eixos locais são os do mundo)
    bones = BONES.map(([name]) => { const b = new THREE.Bone(); b.name = name; return b; });
    BONES.forEach(([, head, , parent], i) => {
      const p = J[head];
      if (parent === null) bones[i].position.set(p[0], p[1], p[2]);
      else {
        const pi = BONES.findIndex((b) => b[0] === parent);
        const pp = J[BONES[pi][1]];
        bones[i].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
        bones[pi].add(bones[i]);
      }
    });
    const mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.46, metalness: 0,
      sheen: 0.45, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffb08a),
      clearcoat: 0.18, clearcoatRoughness: 0.55,
    });
    const mesh = new THREE.SkinnedMesh(g, mat);
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.frustumCulled = false;
    scene.add(mesh);

    // sombra no chão
    const sc = document.createElement("canvas");
    sc.width = sc.height = 128;
    const sg = sc.getContext("2d")!;
    const rg = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
    rg.addColorStop(0, "rgba(0,0,0,.55)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);

    // barra fixa e halteres
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.9, roughness: 0.28 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d2026, metalness: 0.4, roughness: 0.45 });
    bar = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.5, 16), steel);
    rod.rotation.z = Math.PI / 2;
    bar.add(rod);
    for (const sx of [-0.72, 0.72]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.6, 0.05), dark);
      post.position.set(sx, -1.3, 0);
      bar.add(post);
    }
    scene.add(bar);
    for (const n of ["handL", "handR"]) {
      const d = new THREE.Group();
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 12), steel);
      h.rotation.z = Math.PI / 2;
      d.add(h);
      for (const sx of [-0.085, 0.085]) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.045, 24), dark);
        plate.rotation.z = Math.PI / 2;
        plate.position.x = sx;
        d.add(plate);
      }
      const hb = bones[BONES.findIndex((b) => b[0] === n)];
      const w = J[n === "handL" ? "wristL" : "wristR"], e = J[n === "handL" ? "handEndL" : "handEndR"];
      d.position.set((e[0] - w[0]) * 0.45, (e[1] - w[1]) * 0.45, (e[2] - w[2]) * 0.45);
      hb.add(d);
      bells.push(d);
    }
    ready = true;
  } catch {
    failed = true;
  }
}

// ---------- pose: cada osso aponta para onde o desenho 2D aponta
const tmpQ = new THREE.Quaternion();
const vA = new THREE.Vector3(), vB = new THREE.Vector3();
const restDir = BONES.map(([, h, t]) => new THREE.Vector3(J[t][0] - J[h][0], J[t][1] - J[h][1], J[t][2] - J[h][2]).normalize());
const worldQ = BONES.map(() => new THREE.Quaternion());
const parentIdx = BONES.map(([, , , p]) => (p === null ? -1 : BONES.findIndex((b) => b[0] === p)));

function to3(p: XY, side: boolean): THREE.Vector3 {
  return side ? new THREE.Vector3(0, Y(p[1]), (p[0] - 50) * S) : new THREE.Vector3((p[0] - 50) * S, Y(p[1]), 0);
}
function dir2(a: XY, b: XY, side: boolean, rest: THREE.Vector3): THREE.Vector3 {
  // direção do desenho no plano + o afastamento lateral (ou de profundidade) do corpo em pé
  const dx = b[0] - a[0], dy = -(b[1] - a[1]);
  const l = Math.hypot(dx, dy) || 1;
  if (side) { const k = Math.sqrt(Math.max(0, 1 - rest.x * rest.x)); return new THREE.Vector3(rest.x, (dy / l) * k, (dx / l) * k).normalize(); }
  const k = Math.sqrt(Math.max(0, 1 - rest.z * rest.z));
  return new THREE.Vector3((dx / l) * k, (dy / l) * k, rest.z).normalize();
}

function applyPose(p: Pose, side: boolean, floor: number) {
  const mid = (a: XY, b: XY): XY => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const hip = mid(p.lHip, p.rHip), sh = mid(p.lSh, p.rSh);
  // tronco: "para cima" do quadril ao ombro; "para a frente" de lado = perpendicular no desenho
  const tx = sh[0] - hip[0], ty = sh[1] - hip[1];
  const up = side ? new THREE.Vector3(0, -ty, tx).normalize() : new THREE.Vector3(tx, -ty, 0).normalize();
  let fw = side ? new THREE.Vector3(0, -tx, -ty) : new THREE.Vector3(0, 0, 1);
  fw.addScaledVector(up, -fw.dot(up)).normalize();
  if (fw.lengthSq() < 0.5) fw = new THREE.Vector3(0, 0, 1);
  const sd = new THREE.Vector3().crossVectors(up, fw).normalize();
  const basis = new THREE.Matrix4().makeBasis(sd, up, fw);
  const qTorso = new THREE.Quaternion().setFromRotationMatrix(basis);

  // juntas do desenho para cada lado do corpo (de lado: l = perto da câmera = esquerda; de frente: l = direita dele)
  const pick = (n: "L" | "R") => {
    const near = side ? n === "L" : n === "R";
    return near
      ? { sh: p.lSh, el: p.lEl, wr: p.lWr, hip: p.lHip, kn: p.lKn, an: p.lAn, toe: p.lToe }
      : { sh: p.rSh, el: p.rEl, wr: p.rWr, hip: p.rHip, kn: p.rKn, an: p.rAn, toe: p.rToe };
  };
  const target: Record<string, [XY, XY]> = { neck: [p.neck, p.head], head: [p.neck, p.head] };
  for (const n of ["L", "R"] as const) {
    const q = pick(n);
    target[`upperArm${n}`] = [q.sh, q.el];
    target[`foreArm${n}`] = [q.el, q.wr];
    // mão apoiada no chão (flexão, prancha, burpee): espalmada, apontando para a frente (lado da cabeça)
    target[`hand${n}`] = q.wr[1] >= floor - 6 ? [q.wr, [q.wr[0] + (p.head[0] >= q.wr[0] ? 9 : -9), q.wr[1] + 0.5]] : [q.el, q.wr];
    target[`thigh${n}`] = [q.hip, q.kn];
    target[`shin${n}`] = [q.kn, q.an];
    target[`foot${n}`] = [q.an, q.toe];
  }
  BONES.forEach(([name], i) => {
    const pi = parentIdx[i];
    const pq = pi >= 0 ? worldQ[pi] : new THREE.Quaternion();
    if (name === "pelvis") worldQ[i].copy(qTorso);
    else if (name === "spine" || name === "chest") worldQ[i].copy(pq);
    else {
      const [a, b] = target[name];
      vA.copy(restDir[i]).applyQuaternion(pq);
      vB.copy(dir2(a, b, side, restDir[i]));
      // pé: a ponta continua para a frente do corpo
      tmpQ.setFromUnitVectors(vA, vB);
      worldQ[i].copy(tmpQ).multiply(pq);
    }
    const local = pi >= 0 ? worldQ[pi].clone().invert().multiply(worldQ[i]) : worldQ[i];
    bones[i].quaternion.copy(local);
  });
  // respiração: o peito abre e fecha de leve
  const br = Math.sin(performance.now() / 650) * 0.025;
  const ci = BONES.findIndex((b) => b[0] === "chest");
  bones[ci].quaternion.multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -br));
  // posição do quadril
  const h3 = to3(hip, side);
  const off = new THREE.Vector3(0, J.pelvis[1] - J.hipL[1], 0).applyQuaternion(qTorso);
  bones[0].position.copy(h3.add(off));
}

const frames = new Map<ExId, { cx: number; cy: number; half: number }>();
function frameOf(ex: ExId) {
  let f = frames.get(ex);
  if (f) return f;
  const an = ANIMS[ex];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of [an.a, an.b]) for (const v of Object.values(p) as XY[]) {
    x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]);
  }
  y0 -= 9; // cabeça (o ponto é o centro dela)
  if (an.prop === "bar") y0 -= 4;
  y1 = Math.min(y1 + 2, an.floor + 2);
  const w = (x1 - x0) * S, h = (y1 - y0) * S;
  f = { cx: ((x0 + x1) / 2 - 50) * S, cy: Y((y0 + y1) / 2), half: Math.max(0.62, Math.max(w, h) * 0.6) };
  frames.set(ex, f);
  return f;
}

export interface Draw3D { time: number; x: number; y: number; size: number; bg?: boolean; flip?: boolean }

if (typeof window !== "undefined") init();

/** Desenha o Tonhão 3D no canvas 2D. Devolve false se o 3D ainda não está pronto (aí vale o desenho 2D). */
export function drawTonhao3D(g: CanvasRenderingContext2D, ex: ExId, o: Draw3D): boolean {
  if (!ready || failed || !renderer) return false;
  const an = ANIMS[ex];
  const side = an.view === "lado";
  applyPose(poseAt(an, o.time), side, an.floor);
  const px = Math.max(64, Math.min(1024, Math.round(o.size)));
  if (px !== size) { renderer.setSize(px, px, false); size = px; }
  // câmera em 3/4 para dar profundidade
  // enquadra o exercício: centro e tamanho pelas duas poses (deitado fica grande, em pé inteiro)
  const fr = frameOf(ex);
  const tgt = new THREE.Vector3(side ? 0 : fr.cx, fr.cy, side ? fr.cx : 0);
  const d = fr.half / Math.tan(THREE.MathUtils.degToRad(14));
  // câmera girando devagar em volta dele (dá vida e mostra o corpo em 3D)
  const a = THREE.MathUtils.degToRad((side ? 24 : -18) + Math.sin(o.time * 0.35) * 14);
  camera.position.copy(tgt).add(side ? new THREE.Vector3(Math.cos(a) * d, 0.32, Math.sin(a) * d) : new THREE.Vector3(Math.sin(a) * d, 0.32, Math.cos(a) * d));
  camera.lookAt(tgt);
  bar.visible = an.prop === "bar";
  if (bar.visible) {
    const p = poseAt(an, o.time);
    bar.position.set(0, Y((p.lWr[1] + p.rWr[1]) / 2) + 0.01, 0);
  }
  for (const b of bells) b.visible = an.prop === "dumbbell";
  const h = bones[0].position;
  shadow.visible = an.floor < 120;
  shadow.position.set(h.x, Y(an.floor) + 0.002, h.z);
  shadow.scale.set(1.3, 0.9, 1);
  renderer.render(scene, camera);
  g.save();
  g.translate(o.x, o.y);
  if (o.bg) {
    const grad = g.createRadialGradient(o.size / 2, o.size * 0.45, o.size * 0.05, o.size / 2, o.size / 2, o.size * 0.75);
    grad.addColorStop(0, "rgba(40,46,58,.95)"); grad.addColorStop(1, "rgba(10,12,16,.95)");
    g.fillStyle = grad;
    g.beginPath(); g.roundRect(0, 0, o.size, o.size, o.size * 0.08); g.fill();
    g.strokeStyle = "rgba(212,255,63,.85)"; g.lineWidth = Math.max(2, o.size / 90); g.stroke();
  }
  if (o.flip) { g.translate(o.size, 0); g.scale(-1, 1); }
  g.drawImage(renderer.domElement, 0, 0, o.size, o.size);
  g.restore();
  return true;
}
