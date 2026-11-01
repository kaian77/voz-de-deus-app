// Rastro branco do avião (contrail): queimar querosene solta vapor d'água; a ~10 km o ar fica abaixo de -40 °C,
// o vapor vira cristais de gelo e forma uma nuvem fina; ar seco = some rápido, úmido = dura horas. (NASA/NOAA)
import { makePlane } from "./plane.js";
let THREE, plane, puffs, cloudSea = [], ENG = [];
const N = 230, SPEED = 26, GAP = 0.7;

export const SHOTS = [
  [[18, 5, 28], [11, 3, 25], [0, 0, 0], [-3, 0, 0]],
  [[-26, 8, 30], [-34, 6, 25], [-18, -1, 0], [-28, -1, 0]],
  [[-7, -4, 12], [-9, -3.6, 11], [-1.5, -1.5, 4.6], [-3.5, -1.5, 4.6]],
  [[12, 12, 32], [8, 14, 36], [0, 0, 0], [0, 3, 0]],
  [[-11, -3, 16], [-15, -3, 15], [-9, -1.5, 4.6], [-13, -1.5, 4.6]],
  [[22, 26, 62], [12, 30, 72], [-28, 0, 0], [-38, 0, 0]],
  [[4, 28, 74], [-2, 30, 76], [-22, 0, 0], [-26, 0, 0]],
  [[30, 9, 42], [35, 12, 46], [-12, 0, 0], [-12, 0, 0]],
];

export function build(c) {
  THREE = c.THREE;
  const { scene, mat, rnd } = c;
  scene.background = new THREE.Color("#4ea7f2");
  scene.fog = new THREE.Fog("#a9d8ff", 160, 520);
  c.sun.position.set(30, 80, 40);
  scene.traverse((o) => { if (o.isHemisphereLight) o.groundColor.set("#cfe3f5"); }); // barriga do avião clara (luz do céu)
  const land = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), mat("#6aa84f")); land.rotation.x = -Math.PI / 2; land.position.y = -420; scene.add(land);
  // mar de nuvens lá embaixo
  for (let i = 0; i < 110; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(14 + rnd() * 16, 0), mat("#ffffff"));
    m.position.set(-300 + rnd() * 600, -150 - rnd() * 25, -300 + rnd() * 330); m.scale.y = 0.4;
    m.userData.x0 = m.position.x; scene.add(m); cloudSea.push(m);
  }
  plane = makePlane(c);
  ENG = [new THREE.Vector3(-0.4, -1.5, 4.6), new THREE.Vector3(-0.4, -1.5, -4.6)];
  puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true }), N * 2);
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < N * 2; i++) puffs.setColorAt(i, new THREE.Color("#ffffff"));
  scene.add(puffs);
}

const M = () => new THREE.Matrix4();
export function frame(c, t, i, k) {
  const { ease, pill, lerp } = c;
  // o avião balança de leve; o mundo passa (nuvens embaixo)
  plane.position.y = Math.sin(t * 1.3) * 0.15; plane.rotation.x = Math.sin(t * 0.9) * 0.02;
  cloudSea.forEach((m) => { m.position.x = ((m.userData.x0 - t * SPEED * 1.5 + 300) % 600 + 600) % 600 - 300; });
  // rastro: cada pedaço nasce no motor e vai ficando para trás e mais largo
  const maxLen = i < 6 ? 140 : k < 0.5 ? lerp(140, 26, ease(k * 4)) : lerp(26, 160, ease((k - 0.5) * 4));
  const vaporBlue = i === 2 || i === 3 ? 1 : i === 4 ? 1 - ease(k * 2) : 0;
  const mtx = M(), q = new THREE.Quaternion(), col = new THREE.Color();
  for (let e = 0; e < 2; e++) for (let n = 0; n < N; n++) {
    const d = (n * GAP + t * SPEED) % (N * GAP); // distância atrás do motor
    const fade = d > maxLen ? 0 : 1 - Math.max(0, (d - maxLen * 0.8) / (maxLen * 0.2));
    const s = (0.18 + d * 0.022) * fade * (d < 1.2 ? d / 1.2 : 1);
    const jitter = Math.sin(n * 12.9 + e * 3) * 0.12 * Math.min(1, d / 10);
    const p = ENG[e].clone().add(new THREE.Vector3(-d, jitter + plane.position.y, Math.cos(n * 7.3) * 0.12 * Math.min(1, d / 10)));
    q.setFromEuler(new THREE.Euler(n, n * 2, 0));
    mtx.compose(p, q, new THREE.Vector3(s, s, s));
    puffs.setMatrixAt(e * N + n, mtx);
    col.set(d < 9 && vaporBlue > 0 ? "#7cc4ff" : "#ffffff").lerp(new THREE.Color("#ffffff"), d < 9 ? 1 - vaporBlue : 1);
    puffs.setColorAt(e * N + n, col);
  }
  puffs.instanceMatrix.needsUpdate = true; puffs.instanceColor.needsUpdate = true;

  let html = "";
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  if (i === 1) html += pill("NOT SMOKE", at(-24, 1.5, 4.6), ease((k - 0.15) * 4)) + pill("ICE CLOUD", at(-36, 2, 4.6), ease((k - 0.5) * 4), "g");
  if (i === 2) html += pill("HOT EXHAUST + WATER VAPOR", at(-3.4, -0.2, 4.6), ease((k - 0.2) * 4), "b");
  if (i === 3) html += pill("−40 °C AIR", at(-6, 4, 2), ease((k - 0.15) * 4), "b") + pill("~10 KM UP", at(-6, 1.5, 2), ease((k - 0.45) * 4));
  if (i === 4) html += pill("ICE CRYSTALS", at(-10, -0.2, 4.6), ease((k - 0.2) * 4), "g");
  if (i === 5) html += pill("CONTRAIL", at(-60, 3, 4.6), ease((k - 0.2) * 4), "g");
  if (i === 6) html += k < 0.5 ? pill("DRY AIR: FADES FAST", at(-20, 4, 4.6), ease((k - 0.1) * 6)) : pill("HUMID AIR: LASTS HOURS", at(-70, 4, 4.6), ease((k - 0.55) * 6), "g");
  return { html, title: i === 7 ? "CONTRAILS" : "", titleOpacity: ease(k * 4) };
}
