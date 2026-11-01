// Janela de avião arredondada: o de Havilland Comet (1º jato comercial) tinha aberturas quase quadradas; a cabine
// pressurizada estica a fuselagem a cada voo, a tensão se concentra no canto vivo e a fadiga abre trincas. Em 1954
// dois Comet se partiram no ar (BOAC 781 e SAA 201); a investigação (RAE) achou trincas de fadiga nos cantos.
// Desde então as janelas são arredondadas.
import { makePlane } from "./plane.js";
let THREE, plane, section, squares = [], rounds = [], hot = [], rings = [], arrows = [], crack;
const P = [0, 60, -220], WY = 1.5, WR = 6, WW = 1.6, WH = 2.0, ZS = Math.sqrt(WR * WR - WY * WY) + 0.06;
const XS = [-9.6, -6.4, -3.2, 0, 3.2, 6.4, 9.6];
const p = (dx, dy, dz) => [P[0] + dx, P[1] + dy, P[2] + dz];

export const SHOTS = [
  [p(30, 6, 42), p(22, 4, 32), P, P],
  [[9, 2.5, 25], [5, 2.2, 21], [0, 1.5, 5.8], [0, 1.5, 5.8]],
  [[15, 6, 22], [12, 5, 20], [0, 1, 2], [0, 1, 2]],
  [[2, 2.6, 14], [2.2, 2.7, 12.5], [0.3, 1.8, 5.8], [0.5, 2, 5.8]],
  [[2.4, 3.2, 12.5], [2.8, 3.4, 11.5], [1, 2.4, 5.8], [1.3, 2.7, 5.8]],
  [[0, 1.5, 12], [0, 1.5, 10.4], [0, 1.5, 5.8], [0, 1.5, 5.8]],
  [[-7, 2.5, 17], [7, 2.5, 17], [0, 1.5, 5.8], [0, 1.5, 5.8]],
  [p(-30, 8, 46), p(-36, 10, 52), P, P],
];

function rrect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 16);
}

export function build(c) {
  THREE = c.THREE;
  const { scene, mat, box, rnd } = c;
  scene.background = new THREE.Color("#5fb2f5");
  scene.fog = new THREE.Fog("#b4dcff", 200, 700);
  scene.traverse((o) => { if (o.isHemisphereLight) o.groundColor.set("#cfe3f5"); });
  c.sky(18, 20, 500);
  plane = makePlane(c); plane.position.set(...P);
  // pedaço gigante da fuselagem para ver de perto
  section = new THREE.Group(); scene.add(section);
  const skin = new THREE.Mesh(new THREE.CylinderGeometry(WR, WR, 90, 48), mat("#eef1f4", { flatShading: false }));
  skin.rotation.z = Math.PI / 2; section.add(skin);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(WR + 0.02, WR + 0.02, 90, 48, 1, true, Math.PI * 0.18, Math.PI * 0.06), mat("#2f6fd1", { side: THREE.DoubleSide }));
  stripe.rotation.z = Math.PI / 2; section.add(stripe);
  for (const x of [-12, -4.8, 4.8, 12]) { // emendas das chapas
    const r = new THREE.Mesh(new THREE.TorusGeometry(WR + 0.01, 0.03, 4, 64), mat("#c4cbd3")); r.rotation.y = Math.PI / 2; r.position.x = x + 1.6; section.add(r);
  }
  const tilt = -Math.asin(WY / WR);
  const glass = new THREE.MeshBasicMaterial({ color: "#1f3557", transparent: true });
  for (const x of XS) {
    const mk = (r, color, extra = 0) => { const m = new THREE.Mesh(rrect(WW + extra, WH + extra, r), color); m.position.set(x, WY, ZS + (extra ? 0 : 0.025)); m.rotation.x = tilt; section.add(m); return m; };
    const sqF = mk(0.04, new THREE.MeshBasicMaterial({ color: "#aab3bd", transparent: true }), 0.3), sq = mk(0.03, glass.clone());
    const rdF = mk(0.62, new THREE.MeshBasicMaterial({ color: "#aab3bd", transparent: true }), 0.3), rd = mk(0.55, glass.clone());
    squares.push(sqF, sq); rounds.push(rdF, rd);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: "#ff3b2f", transparent: true, opacity: 0, depthTest: false }));
      h.position.set(x + dx * (WW / 2 + 0.15), WY + dy * (WH / 2 + 0.15), ZS + 0.05); h.rotation.x = tilt; h.renderOrder = 8; section.add(h); hot.push(h);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 6, 40), new THREE.MeshBasicMaterial({ color: "#2bd67b", transparent: true, opacity: 0, depthTest: false }));
    ring.scale.set(WW / 2 + 0.3, WH / 2 + 0.3, 1); ring.position.set(x, WY, ZS + 0.06); ring.rotation.x = tilt; ring.renderOrder = 8; section.add(ring); rings.push(ring);
  }
  crack = box(1, 0.035, 0.02, new THREE.MeshBasicMaterial({ color: "#b8160c", depthTest: false }));
  crack.renderOrder = 9; crack.rotation.z = 0.7; section.add(crack);
  for (const [x, y] of [[-8, 3.4], [-1.6, 4.2], [4.8, 3.4], [-4.8, -0.6], [1.6, -0.8], [8, -0.6]]) {
    const a = c.arrow("#ffd23f", 1.6, 0.14); a.userData.base = new THREE.Vector3(x, y, Math.sqrt(WR * WR - y * y) + 0.4); arrows.push(a);
  }
  void rnd;
}

export function frame(c, t, i, k) {
  const { ease, pill, lerp } = c;
  plane.position.y = P[1] + Math.sin(t * 1.1) * 0.2;
  // janelas: quadradas até a fala 4, arredondadas da 5 em diante (troca no começo da 5)
  const r = i < 5 ? 0 : i === 5 ? ease((k - 0.05) * 3) : 1;
  squares.forEach((m) => { m.material.opacity = 1 - r; m.visible = r < 0.99; });
  rounds.forEach((m) => { m.material.opacity = r; m.visible = r > 0.01; });
  // pressão: a fuselagem "respira" e as setas empurram para fora
  const pr = i === 2 ? ease((k - 0.1) * 3) : 0, breathe = 1 + 0.025 * pr * (0.5 + 0.5 * Math.sin(t * 5));
  section.scale.set(1, breathe, breathe);
  arrows.forEach((a) => { a.userData.m.opacity = pr; a.position.copy(a.userData.base).add(new THREE.Vector3(0, 0, 0.4 * Math.sin(t * 5) * pr)); a.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, a.userData.base.y, a.userData.base.z).normalize()); });
  // cantos quentes (quadradas) e anel por igual (redondas)
  const heat = i === 3 || i === 4 ? ease((k - 0.15) * 3) * (0.75 + 0.25 * Math.sin(t * 8)) : 0;
  hot.forEach((h) => (h.material.opacity = heat));
  const ring = i === 5 ? ease((k - 0.4) * 3) : i === 6 ? 1 : 0;
  rings.forEach((m) => (m.material.opacity = ring * 0.9));
  // trinca saindo do canto de cima à direita da janela do meio
  const L = i === 4 ? ease((k - 0.1) / 0.5) * 1.6 : 0;
  crack.visible = L > 0.02; crack.scale.x = Math.max(0.01, L);
  crack.position.set(WW / 2 + 0.1 + Math.cos(0.7) * L / 2, WY + WH / 2 + 0.1 + Math.sin(0.7) * L / 2, ZS + 0.08);

  let html = "";
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  if (i === 0) html += pill("PASSENGER JET", at(P[0], P[1] + 4, P[2]), ease((k - 0.2) * 4));
  if (i === 1) html += pill("de Havilland COMET, 1950s", at(0, 4.6, 5), ease((k - 0.2) * 4)) + pill("NEARLY SQUARE", at(-3.2, -0.6, 5.9), ease((k - 0.5) * 4));
  if (i === 2) html += pill("CABIN PRESSURE", at(0, 5.5, 4), pr, "b");
  if (i === 3) html += pill("STRESS PILES UP", at(1.6, 3.4, 5.6), heat);
  if (i === 4) html += pill(k < 0.55 ? "FATIGUE CRACK" : "1954: TWO COMETS LOST", at(1.8, 3.9, 5.4), ease((k - 0.15) * 4));
  if (i === 5) html += pill("STRESS SPREADS EVENLY", at(0, 3.3, 5.6), ring, "g");
  if (i === 6) html += pill("NO WEAK SPOT", at(0, 3.4, 5.6), ease((k - 0.2) * 4), "g");
  void lerp;
  return { html, title: i === 7 ? "ROUNDED<br>WINDOWS" : "", titleOpacity: ease(k * 4) };
}
