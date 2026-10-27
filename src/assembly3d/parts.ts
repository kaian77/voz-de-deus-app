// Peças e ferragens genéricas da montagem: travessa chanfrada, cavilha, parafuso, sapata, tambor, chave Allen,
// chave Phillips e tubo de cola. Ferragem = "item": entra pela direção `dir` até a posição final, girando se for parafuso.
import * as THREE from "three";

export const Y = new THREE.Vector3(0, 1, 0);
export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const ease = (x: number) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
/** Progresso 0→1 dentro da janela [a, b] do passo. */
export const win = (t: number, a: number, b: number) => ease((t - a) / (b - a));

export function std(color: number, rough = 0.7, metal = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/** Travessa com as quinas de cima chanfradas: comprimento em x, centrada. */
export function beamGeo(len: number, w: number, h: number) {
  const s = new THREE.Shape();
  const c = Math.min(w, h) * 0.28;
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2 - c);
  s.lineTo(w / 2 - c, h / 2);
  s.lineTo(-w / 2 + c, h / 2);
  s.lineTo(-w / 2, h / 2 - c);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2).rotateY(Math.PI / 2);
}

export function dowelGeo() {
  return new THREE.CylinderGeometry(0.004, 0.004, 0.03, 10);
}
/** Parafuso: cabeça na origem, corpo para +y. */
export function screwGeo(len: number) {
  const head = new THREE.CylinderGeometry(0.0062, 0.0062, 0.0025, 14).translate(0, -0.00125, 0);
  const shaft = new THREE.CylinderGeometry(0.0028, 0.0018, len, 8).translate(0, len / 2, 0);
  const g = new THREE.Group();
  const m = std(0x9aa0a6, 0.35, 0.8);
  g.add(new THREE.Mesh(head, m), new THREE.Mesh(shaft, m));
  // fenda Phillips
  for (const r of [0, Math.PI / 2]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.0075, 0.0008, 0.0012), std(0x3a3d40));
    slot.position.y = -0.0026;
    slot.rotation.y = r;
    g.add(slot);
  }
  return g;
}
/** Sapata: disco por baixo (y < 0) e pino para +y. */
export function sapataGeo() {
  const g = new THREE.Group();
  const m = std(0x222222, 0.6);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.009, 18).translate(0, -0.0045, 0), m);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 12).translate(0, -0.011, 0), m);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0055, 0.022, 10).translate(0, 0.011, 0), m);
  g.add(disc, neck, pin);
  return g;
}
/** Tambor (cam): disco com a fenda para a chave. */
export function camGeo() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.012, 16).translate(0, 0.006, 0), std(0xb8bcc2, 0.35, 0.8)));
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.0015, 0.002), std(0x3a3d40));
  slot.position.y = -0.0002;
  g.add(slot);
  return g;
}
export function allenKey() {
  const m = std(0x2b2d31, 0.4, 0.7);
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.03, 6).translate(0, 0.015, 0), m);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.07, 6).translate(0, 0.035, 0), m);
  b.rotation.z = -Math.PI / 2;
  b.position.y = 0.03;
  g.add(a, b);
  return g;
}
/** Chave Phillips: ponta na origem, cabo para +y. */
export function screwdriver() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0012, 0.09, 8).translate(0, 0.045, 0), std(0xc7cbd0, 0.3, 0.9)));
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.075, 4, 12).translate(0, 0.135, 0), std(0x2f6f9f, 0.5));
  g.add(handle);
  return g;
}
/** Tubo de cola branco com bico laranja (bico em -y). */
export function glue() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.09, 16).translate(0, 0.06, 0), std(0xf4f1ea, 0.5)));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.03, 12).rotateX(Math.PI).translate(0, 0.0, 0), std(0xff7a1a, 0.5)));
  return g;
}
/** Furinho escuro na face (normal = para fora). */
export function hole(parent: THREE.Object3D, pos: THREE.Vector3, normal: THREE.Vector3, r = 0.0045) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 14), new THREE.MeshBasicMaterial({ color: 0x2a2018 }));
  m.position.copy(pos).addScaledVector(normal, 0.0006);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  m.userData.keep = true; // não vira desenho
  parent.add(m);
  return m;
}

export type Item = {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  q: THREE.Quaternion;
  step: number;
  a: number;
  b: number;
  travel: number;
  spin: number;
  label: string;
  /** Usa chave (Phillips/Allen) para entrar. */
  tool?: "phillips";
};
export function item(parent: THREE.Object3D, obj: THREE.Object3D, o: Omit<Item, "obj" | "q">): Item {
  parent.add(obj);
  const q = new THREE.Quaternion().setFromUnitVectors(Y, o.dir.clone().normalize());
  return { ...o, obj, q };
}
const sq = new THREE.Quaternion();
/** Coloca a ferragem; devolve o progresso (−1 = ainda escondida). */
export function placeItem(it: Item, s: number, t: number) {
  if (s < it.step || (s === it.step && t < it.a - 0.06)) {
    it.obj.visible = false;
    return -1;
  }
  const w = s > it.step ? 1 : win(t, it.a, it.b);
  it.obj.visible = true;
  it.obj.position.copy(it.pos).addScaledVector(it.dir, -it.travel * (1 - w));
  it.obj.quaternion.copy(it.q).multiply(sq.setFromAxisAngle(Y, it.spin * Math.PI * 2 * (1 - w)));
  return w;
}

export type Pose = { p: THREE.Vector3; q: THREE.Quaternion };
export const pose = (x: number, y: number, z: number, q = new THREE.Quaternion()): Pose => ({ p: new THREE.Vector3(x, y, z), q });
export const qEuler = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
/** Leva o objeto de A para B num arco (sobe `h` no meio). */
export function moveArc(o: THREE.Object3D, A: Pose, B: Pose, k: number, h = 0) {
  o.position.lerpVectors(A.p, B.p, k);
  o.position.y += Math.sin(Math.PI * k) * h;
  o.quaternion.slerpQuaternions(A.q, B.q, k);
}
