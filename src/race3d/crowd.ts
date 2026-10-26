// Multidão de corredores com InstancedMesh (poucos draw calls, aguenta centenas no celular).
// Boneco com proporção de gente, virado para +z: coxa/canela com joelho, braço/antebraço com cotovelo,
// tênis, short, regata com número de peito e cabelo. Pose: correndo, parado, torcendo, andando ou zumbi.
// Em prova à noite cada um pode ter lanterna de cabeça (ponto aceso + facho de luz).
// Com `gore`: respingos de sangue na camiseta e, nos zumbis, rasgos mostrando a pele, olhos vermelhos e passo mancando.
import * as THREE from "three";

export const SKIN = [0xf1c7a5, 0xd9a47c, 0xa86f4c, 0x7a4a2f];
const HAIR = [0x2b1d14, 0x111111, 0x5a3b22, 0xc9a25b, 0x3d2a1c];
const SHOES = [0xf5f5f5, 0x1c1c1c, 0xc6ff3d, 0xff4f8b, 0x2f8cff, 0xff7a1a];
export enum Pose { Run, Stand, Cheer, Walk, Zombie }
export const ZOMBIE_SKIN = [0x9aa58a, 0x8a9a7a, 0xa3a08a, 0x7f8f74];

/** Medidas do boneco (altura ~1,75 antes da escala). */
export const BODY = { hip: 0.93, chest: 1.3, chestFront: 0.125, shoulder: 1.5 };
const THIGH = 0.44, SHIN = 0.43, UPPER = 0.28;

const base = new THREE.Matrix4(), m = new THREE.Matrix4(), t = new THREE.Matrix4(), tmp = new THREE.Matrix4();
const q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();

const limb = (r: number, len: number) => new THREE.CapsuleGeometry(r, len - 2 * r, 3, 8).translate(0, -len / 2, 0);

export class Crowd {
  readonly group = new THREE.Group();
  readonly n: number;
  private head: THREE.InstancedMesh;
  private hair: THREE.InstancedMesh;
  private torso: THREE.InstancedMesh;
  private bib: THREE.InstancedMesh;
  private shorts: THREE.InstancedMesh;
  private thigh: THREE.InstancedMesh;
  private shin: THREE.InstancedMesh;
  private shoe: THREE.InstancedMesh;
  private upper: THREE.InstancedMesh;
  private fore: THREE.InstancedMesh;
  private blob: THREE.InstancedMesh;
  private lampDot?: THREE.InstancedMesh;
  private beam?: THREE.InstancedMesh;
  private lampOn: Uint8Array;
  private blood?: THREE.InstancedMesh;
  private rips?: THREE.InstancedMesh;
  private eyes?: THREE.InstancedMesh;
  private zomb: Uint8Array;
  private all: THREE.InstancedMesh[];
  /** Escala do boneco (pode mudar, ex.: menor no pódio). */
  scale: number;

  constructor(n: number, scale = 0.3, opts: { lamps?: boolean; gore?: boolean } = {}) {
    this.n = n;
    this.scale = scale;
    const std = (rough = 0.75) => new THREE.MeshStandardMaterial({ roughness: rough });
    const mk = (geo: THREE.BufferGeometry, count: number, mat: THREE.Material = std()) => {
      const im = new THREE.InstancedMesh(geo, mat, count);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    };
    this.head = mk(new THREE.SphereGeometry(0.115, 14, 10).scale(0.92, 1.06, 1), n);
    this.hair = mk(new THREE.SphereGeometry(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58).scale(0.95, 1, 1.02), n, std(0.9));
    this.torso = mk(new THREE.CapsuleGeometry(0.15, 0.26, 4, 12).scale(1.18, 1, 0.74), n, std(0.65));
    this.bib = mk(new THREE.BoxGeometry(0.17, 0.12, 0.012), n, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, map: bibTexture() }));
    this.shorts = mk(new THREE.CapsuleGeometry(0.14, 0.06, 3, 10).scale(1.18, 1, 0.8), n);
    this.thigh = mk(limb(0.075, THIGH), n * 2);
    this.shin = mk(limb(0.058, SHIN), n * 2);
    this.shoe = mk(new THREE.BoxGeometry(0.105, 0.075, 0.25).translate(0, -0.035, 0.045), n * 2, std(0.5));
    this.upper = mk(limb(0.047, UPPER), n * 2);
    this.fore = mk(limb(0.04, 0.27), n * 2);
    const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
    this.blob = mk(new THREE.CircleGeometry(0.3, 12).rotateX(-Math.PI / 2), n, blobMat);
    this.all = [this.head, this.hair, this.torso, this.bib, this.shorts, this.thigh, this.shin, this.shoe, this.upper, this.fore, this.blob];
    this.lampOn = new Uint8Array(n);
    if (opts.lamps) {
      this.lampOn.fill(1);
      this.lampDot = mk(new THREE.SphereGeometry(0.03, 8, 6), n, new THREE.MeshBasicMaterial({ color: 0xfff6dc }));
      // facho: cone com a ponta na lanterna, abrindo para a frente e um pouco para baixo
      const beamGeo = new THREE.ConeGeometry(0.42, 1.9, 12, 1, true).translate(0, -0.95, 0).rotateX(-Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.beam = mk(beamGeo, n, beamMat);
      this.all.push(this.lampDot, this.beam);
    }
    this.zomb = new Uint8Array(n);
    if (opts.gore) {
      // camadas por cima da camiseta (mesma forma, um pouco maior), recortadas pela textura
      const torsoGeo = () => new THREE.CapsuleGeometry(0.152, 0.262, 4, 12).scale(1.19, 1, 0.75);
      this.blood = mk(torsoGeo(), n, new THREE.MeshStandardMaterial({ color: 0x7a0c0c, roughness: 0.4, map: splatTexture(11, 26, "blood"), alphaTest: 0.5 }));
      this.rips = mk(torsoGeo().scale(1.01, 1.01, 1.01), n, new THREE.MeshStandardMaterial({ roughness: 0.8, map: splatTexture(5, 9, "rips"), alphaTest: 0.5 }));
      this.eyes = mk(new THREE.SphereGeometry(0.016, 6, 4), n * 2, new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
      this.all.push(this.blood, this.rips, this.eyes);
    }
    for (let i = 0; i < n; i++) this.paint(i, 0xffffff, SKIN[i % 4], 0x222a33);
  }

  paint(i: number, shirt: number, skin: number, shorts: number, shoe = SHOES[i % SHOES.length], hair = HAIR[(i * 7) % HAIR.length]) {
    const set = (im: THREE.InstancedMesh, k: number, c: number) => im.setColorAt(k, col.setHex(c));
    set(this.torso, i, shirt);
    set(this.head, i, skin);
    set(this.hair, i, hair);
    set(this.shorts, i, shorts);
    if (this.rips) set(this.rips, i, skin);
    for (const s of [0, 1]) {
      const k = i * 2 + s;
      set(this.thigh, k, skin);
      set(this.shin, k, skin);
      set(this.upper, k, skin);
      set(this.fore, k, skin);
      set(this.shoe, k, shoe);
    }
    for (const im of this.all) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  /** Marca o boneco i como zumbi (rasgos, olhos acesos, sem lanterna). */
  zombie(i: number, on: boolean) {
    this.zomb[i] = on ? 1 : 0;
    if (on) this.lampOn[i] = 0;
  }

  /** Liga ou desliga a lanterna do boneco i (zumbi não usa). */
  lamp(i: number, on: boolean) {
    this.lampOn[i] = on ? 1 : 0;
  }

  /** Posiciona o boneco i (pés em x,y,z, olhando para `yaw`), com a fase do passo. */
  pose(i: number, x: number, y: number, z: number, yaw: number, phase: number, kind: Pose) {
    const s = this.scale;
    let bob = 0, lean = 0;
    if (kind === Pose.Run) {
      bob = Math.abs(Math.cos(phase)) * 0.07;
      lean = 0.14;
    } else if (kind === Pose.Zombie) {
      bob = Math.abs(Math.cos(phase)) * 0.05;
      lean = 0.24;
    } else if (kind === Pose.Cheer) bob = Math.max(0, Math.sin(phase * 0.6)) * 0.16;
    else if (kind === Pose.Walk) bob = Math.abs(Math.cos(phase)) * 0.025;
    q.setFromAxisAngle(up, yaw);
    base.compose(v.set(x, y + bob * s, z), q, sc.set(s, s, s));
    if (lean) base.multiply(tmp.makeRotationX(lean));
    const zg = kind === Pose.Zombie;
    // zumbi: tronco gingando para o lado da perna que arrasta
    if (zg) base.multiply(tmp.makeRotationZ(0.1 * Math.sin(phase) + 0.06 * Math.sin(i * 2.3)));

    this.torso.setMatrixAt(i, m.copy(base).multiply(t.makeTranslation(0, BODY.chest, 0)));
    this.blood?.setMatrixAt(i, m);
    this.rips?.setMatrixAt(i, this.zomb[i] ? m : pm.makeScale(0, 0, 0));
    this.bib.setMatrixAt(i, m.copy(base).multiply(t.makeTranslation(0, BODY.chest - 0.02, BODY.chestFront)));
    this.shorts.setMatrixAt(i, m.copy(base).multiply(t.makeTranslation(0, 0.97, 0)));
    const nod = kind === Pose.Run ? -0.08 : kind === Pose.Cheer ? -0.25 : kind === Pose.Zombie ? 0.3 : 0;
    m.copy(base).multiply(t.makeTranslation(0, 1.6, 0)).multiply(tmp.makeRotationX(nod));
    if (kind === Pose.Zombie) m.multiply(tmp.makeRotationZ(0.32 * Math.sin(i * 1.7) + 0.1 * Math.sin(phase * 0.5)));
    this.head.setMatrixAt(i, part(m, 0, 0.09, 0.005));
    this.hair.setMatrixAt(i, part(m, 0, 0.11, -0.012));
    if (this.eyes) for (const sx of [-1, 1]) this.eyes.setMatrixAt(i * 2 + (sx > 0 ? 1 : 0), this.zomb[i] ? part(m, sx * 0.04, 0.1, 0.098) : pm.makeScale(0, 0, 0));
    if (this.lampDot && this.beam) {
      if (this.lampOn[i]) {
        this.lampDot.setMatrixAt(i, part(m, 0, 0.14, 0.1));
        this.beam.setMatrixAt(i, part(m, 0, 0.14, 0.11).multiply(tmp.makeRotationX(0.32 - nod)));
      } else {
        this.lampDot.setMatrixAt(i, pm.makeScale(0, 0, 0));
        this.beam.setMatrixAt(i, pm);
      }
    }

    for (const side of [0, 1]) {
      const k = i * 2 + side, sx = side ? 1 : -1;
      const p = phase + (side ? Math.PI : 0);
      // pernas: coxa vai para a frente com sin(p); o joelho dobra mais no meio do balanço
      let hip = 0, knee = 0.05, ua = 0.06, fa = -0.25, spread = 0.1;
      if (kind === Pose.Run) {
        hip = 0.78 * Math.sin(p);
        knee = 0.18 + 1.3 * Math.max(0, Math.cos(p)) ** 1.4;
        ua = 0.75 * Math.sin(p) - 0.1;
        fa = -1.45 + 0.25 * Math.sin(p);
        spread = 0.14;
      } else if (kind === Pose.Zombie) {
        // manca: uma perna dá o passo, a outra arrasta quase dura; um braço esticado e o outro caído (varia por boneco)
        const drag = side === i % 2;
        hip = (drag ? 0.22 : 0.55) * Math.sin(p);
        knee = drag ? 0.08 + 0.2 * Math.max(0, Math.cos(p)) : 0.25 + 0.9 * Math.max(0, Math.cos(p)) ** 1.4;
        const reach = i % 3 === 0 || side !== i % 2;
        ua = reach ? -1.3 + 0.12 * Math.sin(phase * 0.8 + side) : 0.12 + 0.18 * Math.sin(phase * 0.5 + side);
        fa = reach ? -0.12 + 0.12 * Math.sin(phase * 0.7 + side) : -0.05;
        spread = reach ? 0.06 : 0.18;
      } else if (kind === Pose.Walk) {
        hip = 0.38 * Math.sin(p);
        knee = 0.08 + 0.55 * Math.max(0, Math.cos(p));
        ua = 0.35 * Math.sin(p);
        fa = -0.3;
      } else if (kind === Pose.Cheer) {
        ua = -(Math.PI - 0.35) + Math.sin(phase * 1.3 + side) * 0.25;
        fa = -0.25 + Math.sin(phase * 2 + side) * 0.3;
        spread = 0.45;
        knee = 0.1 + Math.max(0, Math.sin(phase * 0.6)) * 0.25;
      } else {
        ua = 0.05 + Math.sin(phase * 0.4 + side) * 0.03;
      }
      m.copy(base).multiply(t.makeTranslation(sx * 0.095, BODY.hip, 0)).multiply(tmp.makeRotationX(-hip));
      this.thigh.setMatrixAt(k, m);
      m.multiply(t.makeTranslation(0, -THIGH, 0)).multiply(tmp.makeRotationX(knee));
      this.shin.setMatrixAt(k, m);
      m.multiply(t.makeTranslation(0, -SHIN, 0)).multiply(tmp.makeRotationX(-knee * 0.35 + hip * 0.2));
      this.shoe.setMatrixAt(k, m);
      m.copy(base).multiply(t.makeTranslation(sx * 0.205, BODY.shoulder, 0)).multiply(tmp.makeRotationZ(sx * spread)).multiply(tmp.makeRotationX(ua));
      this.upper.setMatrixAt(k, m);
      m.multiply(t.makeTranslation(0, -UPPER, 0)).multiply(tmp.makeRotationX(fa));
      this.fore.setMatrixAt(k, m);
    }
    this.blob.setMatrixAt(i, m.makeTranslation(x, y + 0.03, z).multiply(tmp.makeScale(s * 1.6, 1, s * 1.6)));
  }

  hide(i: number) {
    m.makeScale(0, 0, 0);
    for (const im of [this.head, this.hair, this.torso, this.bib, this.shorts, this.blob, this.lampDot, this.beam, this.blood, this.rips]) im?.setMatrixAt(i, m);
    for (const im of [this.thigh, this.shin, this.shoe, this.upper, this.fore, this.eyes]) {
      if (!im) continue;
      im.setMatrixAt(i * 2, m);
      im.setMatrixAt(i * 2 + 1, m);
    }
  }

  commit() {
    for (const im of this.all) im.instanceMatrix.needsUpdate = true;
  }
}

const pm = new THREE.Matrix4();
function part(parent: THREE.Matrix4, x: number, y: number, z: number) {
  return pm.copy(parent).multiply(t.makeTranslation(x, y, z));
}

/** Número de peito genérico (mesma textura para todos; o número muda de cor pelo branco do papel). */
function bibTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 48;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 48);
  g.fillStyle = "#ff5a1f";
  g.fillRect(0, 0, 64, 9);
  g.fillStyle = "#111";
  g.font = "700 26px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("1024", 32, 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Manchas recortadas (alphaTest): sangue respingado ou rasgos de pano. Sempre as mesmas (semente fixa). */
function splatTexture(seed: number, count: number, kind: "blood" | "rips") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = "#ffffff";
  for (let k = 0; k < count; k++) {
    const x = r() * 128, y = 20 + r() * 96, big = kind === "rips" ? 7 + r() * 8 : 2 + r() * 7;
    g.beginPath();
    // borda irregular
    for (let a = 0; a <= 12; a++) {
      const ang = (a / 12) * Math.PI * 2, rr = big * (0.55 + r() * 0.7);
      const px = x + Math.cos(ang) * rr * (kind === "rips" ? 0.6 : 1), py = y + Math.sin(ang) * rr * (kind === "rips" ? 1.5 : 1);
      if (a) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.fill();
    // escorrido
    if (kind === "blood" && r() < 0.5) g.fillRect(x - 1, y, 2.2, 6 + r() * 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
