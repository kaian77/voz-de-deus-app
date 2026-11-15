// Carros feitos por código (sem modelo baixado): perfil lateral extrudado + vidros + rodas + faróis.
// Frente do carro = +z local (o lookAt do three.js aponta o +z para o alvo).
import * as THREE from "three";

export type CarType = "hatch" | "sedan" | "suv" | "pickup";
export const CAR_TYPES: { id: CarType; name: string; icon: string }[] = [
  { id: "hatch", name: "Hatch", icon: "🚗" },
  { id: "sedan", name: "Sedã", icon: "🚘" },
  { id: "suv", name: "SUV", icon: "🚙" },
  { id: "pickup", name: "Picape", icon: "🛻" },
];
export const CAR_COLORS: { name: string; hex: number }[] = [
  { name: "Branco", hex: 0xf2f2f0 },
  { name: "Prata", hex: 0xb8bcc2 },
  { name: "Preto", hex: 0x1c1d20 },
  { name: "Vermelho", hex: 0xb3141b },
  { name: "Azul", hex: 0x1d4f9c },
];

type Spec = { L: number; W: number; body: [number, number][]; glass: [number, number][]; wheelX: number; r: number; bed?: boolean; eye: [number, number] };
// perfis de trás (x negativo) para a frente (x positivo), altura em y
const SPECS: Record<CarType, Spec> = {
  hatch: {
    L: 3.9, W: 1.72, wheelX: 1.28, r: 0.31, eye: [-0.55, 1.2],
    body: [[-1.95, 0.32], [1.95, 0.32], [1.97, 0.72], [1.55, 0.92], [0.62, 1.0], [-0.15, 1.45], [-1.55, 1.44], [-1.93, 1.02]],
    glass: [[-1.5, 1.0], [0.58, 1.0], [-0.12, 1.4], [-1.42, 1.39], [-1.82, 1.03]],
  },
  sedan: {
    L: 4.5, W: 1.76, wheelX: 1.45, r: 0.32, eye: [-0.45, 1.18],
    body: [[-2.25, 0.32], [2.25, 0.32], [2.27, 0.7], [1.75, 0.9], [0.8, 0.98], [0.05, 1.43], [-1.05, 1.43], [-1.6, 1.0], [-2.22, 0.95]],
    glass: [[-1.5, 0.99], [0.75, 0.99], [0.08, 1.38], [-1.0, 1.38]],
  },
  suv: {
    L: 4.6, W: 1.86, wheelX: 1.5, r: 0.37, eye: [-0.3, 1.45],
    body: [[-2.3, 0.4], [2.3, 0.4], [2.32, 0.92], [1.85, 1.1], [0.95, 1.18], [0.3, 1.72], [-2.05, 1.72], [-2.3, 1.25]],
    glass: [[-2.0, 1.2], [0.9, 1.2], [0.33, 1.66], [-1.95, 1.66], [-2.2, 1.27]],
  },
  pickup: {
    L: 5.25, W: 1.86, wheelX: 1.75, r: 0.38, bed: true, eye: [0.0, 1.47],
    body: [[-2.62, 0.42], [2.62, 0.42], [2.64, 0.95], [2.15, 1.12], [1.3, 1.18], [0.7, 1.75], [-0.6, 1.75], [-0.75, 1.12], [-2.62, 1.12]],
    glass: [[-0.55, 1.2], [1.25, 1.2], [0.73, 1.69], [-0.5, 1.69]],
  },
};

function extrude(pts: [number, number][], depth: number, bevel = 0.06) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -depth / 2).rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.3, metalness: 0.8 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.08, metalness: 0.6 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d8, emissiveIntensity: 0.6 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a0d10, emissive: 0xff1a1a, emissiveIntensity: 0.5 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.7 });

export type CarData = {
  wheels: THREE.Object3D[]; front: THREE.Object3D[]; r: number; L: number; W: number; base: number;
  /** olho do motorista (banco da esquerda), cabine vista de dentro e o volante */
  eye: THREE.Vector3; cabin: THREE.Group; wheel: THREE.Object3D; type: CarType;
};
export type Car = THREE.Group & { userData: CarData };

/** Primeira pessoa: mostra a cabine e esconde rodas, para-choques e faróis (de dentro não se vê). */
export function setInside(car: Car, inside: boolean) {
  for (const c of car.children) {
    if (c === car.userData.cabin) c.visible = inside;
    else if (!c.userData.keep) c.visible = !inside;
  }
}

let blobTex: THREE.Texture | null = null;
function blob() {
  if (blobTex) return blobTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.6, "rgba(0,0,0,0.32)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return (blobTex = new THREE.CanvasTexture(c));
}
const dashMat = new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.8 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b8a86, roughness: 1, side: THREE.DoubleSide });

export function makeCar(type: CarType, color: number): Car {
  const sp = SPECS[type];
  const g = new THREE.Group() as Car;
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.12 });
  const body = new THREE.Mesh(extrude(sp.body, sp.W - 0.12), paint);
  body.userData.keep = true;
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(extrude(sp.glass, sp.W - 0.06, 0.04), glassMat);
  glass.userData.keep = true;
  g.add(glass);
  // para-choques e caçamba
  const bumper = new THREE.BoxGeometry(sp.W + 0.02, 0.18, 0.12);
  for (const s of [1, -1]) {
    const b = new THREE.Mesh(bumper, trimMat);
    b.position.set(0, 0.42, s * (sp.L / 2 + 0.02));
    g.add(b);
  }
  if (sp.bed) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(sp.W - 0.3, 0.05, 1.75), trimMat);
    bed.position.set(0, 1.08, -1.65);
    g.add(bed);
  }
  // faróis e lanternas
  for (const s of [1, -1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.05), headMat);
    h.position.set(s * (sp.W / 2 - 0.3), sp.body[2][1] - 0.05, sp.L / 2 + 0.03);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), tailMat);
    t.position.set(s * (sp.W / 2 - 0.25), 0.85, -sp.L / 2 - 0.03);
    g.add(h, t);
  }
  // rodas (giram com o andar; as da frente esterçam)
  const wheels: THREE.Object3D[] = [], front: THREE.Object3D[] = [];
  const tire = new THREE.CylinderGeometry(sp.r, sp.r, 0.24, 20).rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(sp.r * 0.55, sp.r * 0.55, 0.25, 12).rotateZ(Math.PI / 2);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const steer = new THREE.Group();
    steer.position.set(x * (sp.W / 2 - 0.1), sp.r, z * sp.wheelX);
    const spin = new THREE.Group();
    const t = new THREE.Mesh(tire, tireMat);
    t.castShadow = true;
    spin.add(t, new THREE.Mesh(hub, hubMat));
    steer.add(spin);
    g.add(steer);
    wheels.push(spin);
    if (z > 0) front.push(steer);
  }
  // sombra macia embaixo (vale também no subsolo, onde o sol não chega)
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(sp.W + 0.7, sp.L + 0.6), new THREE.MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.025;
  sh.renderOrder = -1;
  sh.userData.keep = true;
  g.add(sh);
  // cabine (só aparece na primeira pessoa): painel, volante, colunas e forro do teto
  const eye = new THREE.Vector3(0.37, sp.eye[1], sp.eye[0]);
  const cabin = new THREE.Group();
  cabin.visible = false;
  const roofY = Math.max(...sp.glass.map((p) => p[1]));
  const dash = new THREE.Mesh(new THREE.BoxGeometry(sp.W - 0.16, 0.22, 0.55), dashMat);
  dash.position.set(0, eye.y - 0.62, eye.z + 0.95);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.2), dashMat); // painel de instrumentos
  hood.position.set(eye.x, eye.y - 0.47, eye.z + 0.78);
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 28), dashMat);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.03), dashMat);
  const hubC = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3b3f, roughness: 0.5, metalness: 0.4 }));
  wheel.add(rim, spoke, hubC);
  wheel.position.set(eye.x, eye.y - 0.5, eye.z + 0.6);
  wheel.rotation.x = -0.38;
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(sp.W - 0.2, 1.5), roofMat);
  roof.rotation.x = Math.PI / 2;
  roof.position.set(0, roofY - 0.07, eye.z - 0.2);
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.02), dashMat);
  mirror.position.set(0, roofY - 0.17, eye.z + 0.62);
  cabin.add(dash, hood, wheel, roof, mirror);
  for (const s of [1, -1]) {
    // colunas do para-brisa
    const a = new THREE.Vector3(s * (sp.W / 2 - 0.12), eye.y - 0.5, eye.z + 1.1);
    const b = new THREE.Vector3(s * (sp.W / 2 - 0.14), roofY - 0.06, eye.z + 0.42);
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, a.distanceTo(b)), dashMat);
    col.position.copy(a).add(b).multiplyScalar(0.5);
    col.lookAt(b);
    cabin.add(col);
  }
  g.add(cabin);
  g.userData = { wheels, front, r: sp.r, L: sp.L, W: sp.W, base: sp.wheelX * 2, eye, cabin, wheel, type };
  return g;
}
