// Multidão de bonequinhos com InstancedMesh (poucos draw calls, aguenta centenas no celular).
// Mesmo boneco do condomínio (tour3d/condo.ts), virado para +z; pose: correndo, parado, torcendo ou andando.
import * as THREE from "three";

export const SKIN = [0xf1c7a5, 0xd9a47c, 0xa86f4c, 0x7a4a2f];
export enum Pose { Run, Stand, Cheer, Walk }

const m4 = new THREE.Matrix4(), part = new THREE.Matrix4(), tmp = new THREE.Matrix4();
const q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();

export class Crowd {
  readonly group = new THREE.Group();
  readonly n: number;
  private torso: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private blob: THREE.InstancedMesh;
  private scale: number;

  constructor(n: number, scale = 0.3) {
    this.n = n;
    this.scale = scale;
    const std = () => new THREE.MeshStandardMaterial({ roughness: 0.75 });
    const legGeo = new THREE.BoxGeometry(0.13, 0.8, 0.14).translate(0, -0.4, 0);
    const armGeo = new THREE.BoxGeometry(0.09, 0.55, 0.1).translate(0, -0.275, 0);
    this.torso = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.42, 3, 8), std(), n);
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 6), std(), n);
    this.legs = new THREE.InstancedMesh(legGeo, std(), n * 2);
    this.arms = new THREE.InstancedMesh(armGeo, std(), n * 2);
    const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
    this.blob = new THREE.InstancedMesh(new THREE.CircleGeometry(0.32, 12).rotateX(-Math.PI / 2), blobMat, n);
    for (const m of [this.torso, this.head, this.legs, this.arms, this.blob]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
    }
    for (let i = 0; i < n; i++) this.paint(i, 0xffffff, SKIN[i % 4], 0x222a33);
  }

  paint(i: number, shirt: number, skin: number, shorts: number) {
    this.torso.setColorAt(i, col.setHex(shirt));
    this.head.setColorAt(i, col.setHex(skin));
    this.arms.setColorAt(i * 2, col.setHex(skin));
    this.arms.setColorAt(i * 2 + 1, col.setHex(skin));
    this.legs.setColorAt(i * 2, col.setHex(shorts));
    this.legs.setColorAt(i * 2 + 1, col.setHex(shorts));
    for (const m of [this.torso, this.head, this.arms, this.legs]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /** Posiciona o boneco i (pés em x,y,z, olhando para `yaw`), com a fase do passo. */
  pose(i: number, x: number, y: number, z: number, yaw: number, phase: number, kind: Pose) {
    const s = this.scale;
    const swing = kind === Pose.Run ? 0.95 : kind === Pose.Walk ? 0.5 : 0;
    const k = Math.sin(phase);
    const bob = kind === Pose.Run ? Math.abs(Math.cos(phase)) * 0.09 : kind === Pose.Cheer ? Math.max(0, Math.sin(phase * 0.6)) * 0.18 : 0;
    q.setFromAxisAngle(up, yaw);
    m4.compose(v.set(x, y + bob * s, z), q, sc.set(s, s, s));
    if (kind === Pose.Run) m4.multiply(tmp.makeRotationX(0.16));

    this.torso.setMatrixAt(i, part.copy(m4).multiply(tmp.makeTranslation(0, 1.12, 0)));
    this.head.setMatrixAt(i, part.copy(m4).multiply(tmp.makeTranslation(0, 1.63, 0.02)));
    for (const side of [0, 1]) {
      const sx = side ? 0.1 : -0.1, a = (side ? -k : k) * swing;
      part.copy(m4).multiply(tmp.makeTranslation(sx, 0.8, 0)).multiply(tmp.makeRotationX(a));
      this.legs.setMatrixAt(i * 2 + side, part);
      let arm = a * 0.9;
      let spread = 0;
      if (kind === Pose.Run) arm = a * 1.1 + 0.45;
      if (kind === Pose.Cheer) {
        arm = Math.PI - 0.25 + Math.sin(phase + side) * 0.35;
        spread = side ? -0.35 : 0.35;
      }
      part.copy(m4).multiply(tmp.makeTranslation(side ? 0.27 : -0.27, 1.4, 0)).multiply(tmp.makeRotationZ(spread)).multiply(tmp.makeRotationX(-arm));
      this.arms.setMatrixAt(i * 2 + side, part);
    }
    this.blob.setMatrixAt(i, part.makeTranslation(x, y + 0.03, z).multiply(tmp.makeScale(s * 1.6, 1, s * 1.6)));
  }

  hide(i: number) {
    part.makeScale(0, 0, 0);
    this.torso.setMatrixAt(i, part);
    this.head.setMatrixAt(i, part);
    this.blob.setMatrixAt(i, part);
    for (const side of [0, 1]) {
      this.legs.setMatrixAt(i * 2 + side, part);
      this.arms.setMatrixAt(i * 2 + side, part);
    }
  }

  commit() {
    for (const m of [this.torso, this.head, this.legs, this.arms, this.blob]) m.instanceMatrix.needsUpdate = true;
  }
}
