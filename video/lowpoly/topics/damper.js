// Amortecedor de massa (Taipei 101: 508 m; bola de aço de 660 t presa por cabos entre os andares 87 e 92;
// reduz o balanço em até ~40%). Fonte: site oficial do Taipei 101 / Thornton Tomasetti.
let THREE, tower, pend, ball, front, frontEdges, windM, wind = [], redArrow, greenArrow;
const ROOM_Y = 48, ROOM_H = 12, RW = 8, BALL_R = 2.1, L = 7.2;
let TOP = 0;

export const SHOTS = [
  [[50, 6, 70], [42, 12, 60], [0, 34, 0], [0, 38, 0]],
  [[30, 50, 46], [24, 58, 38], [0, 54, 0], [0, 56, 0]],
  [[18, 60, 30], [15, 58, 25], [0, 56, 0], [0, 55, 0]],
  [[0, 55, 36], [0, 54, 24], [0, 54, 0], [0, 54, 0]],
  [[-10, 56, 20], [9, 53.5, 19], [0, 53, 0], [0, 52.5, 0]],
  [[0, 54.5, 28], [0, 55, 26], [0, 53.5, 0], [0, 53.5, 0]],
  [[9, 52, 22], [34, 32, 54], [0, 52, 0], [0, 40, 0]],
  [[38, 18, 48], [42, 22, 54], [0, 32, 0], [0, 34, 0]],
];

export function build(c) {
  THREE = c.THREE;
  const { scene, mat, box, rnd, stripes } = c;
  c.ground();
  const road = mat("#5d6168"), walk = mat("#d9d4c8");
  for (const [x, z, w, d] of [[0, 16, 400, 7], [16, 0, 7, 400], [-30, -40, 7, 400], [0, -45, 400, 7]]) {
    const r = box(w, 0.1, d, road); r.position.set(x, 0.05, z); scene.add(r);
  }
  const plaza = box(22, 0.3, 22, walk); plaza.position.set(0, 0.15, 0); scene.add(plaza);
  c.city(46, 28, 118, (x, z) => Math.abs(z - 16) < 8 || Math.abs(x - 16) < 8 || Math.abs(x + 30) < 8 || Math.abs(z + 45) < 8);
  for (let i = 0; i < 40; i++) { const x = -60 + rnd() * 120, z = 20 + rnd() * 60; if (Math.abs(z - 16) > 5 && Math.abs(x - 16) > 5) c.tree(x, z, 0.8 + rnd() * 0.6); }
  for (const [x, z] of [[-9, 9], [9, 9], [-9, -9], [9, -9]]) c.tree(x, z, 1);
  c.sky();

  tower = new THREE.Group(); scene.add(tower);
  const glass = stripes("#5aa9e6", "#cfeaff");
  const part = (w, h, y, rep) => {
    const t = glass.clone(); t.needsUpdate = true; t.repeat.set(2, rep);
    const m = box(w, h, w, new THREE.MeshLambertMaterial({ map: t, flatShading: true })); m.position.y = y + h / 2; tower.add(m);
    const band = box(w + 0.5, 0.6, w + 0.5, mat("#e9eef3")); band.position.y = y + h; tower.add(band);
  };
  part(10, 18, 0, 6); part(9, 16, 18, 5); part(8, 14, 34, 5);
  const floor = box(RW, 0.6, RW, mat("#c9ced6")); floor.position.y = ROOM_Y; tower.add(floor);
  const roof = box(RW + 0.5, 0.8, RW + 0.5, mat("#e9eef3")); roof.position.y = ROOM_Y + ROOM_H; tower.add(roof);
  const walls = [];
  for (const [x, z, ry] of [[0, -RW / 2, 0], [-RW / 2, 0, Math.PI / 2], [RW / 2, 0, Math.PI / 2], [0, RW / 2, 0]]) {
    const t = glass.clone(); t.needsUpdate = true; t.repeat.set(2, 4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(RW, ROOM_H, 0.3), new THREE.MeshLambertMaterial({ map: t, flatShading: true, transparent: true }));
    m.position.set(x, ROOM_Y + ROOM_H / 2, z); m.rotation.y = ry; m.castShadow = true; tower.add(m); walls.push(m);
  }
  front = walls[3];
  const lamp = new THREE.PointLight("#fff2d6", 60, 18); lamp.position.set(0, ROOM_Y + ROOM_H - 1.5, 2); tower.add(lamp);
  frontEdges = new THREE.LineSegments(new THREE.EdgesGeometry(front.geometry), new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0 }));
  frontEdges.position.copy(front.position); tower.add(frontEdges);
  part(6.5, 6, ROOM_Y + ROOM_H, 2);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 10, 6), mat("#d0d6de")); spire.position.y = ROOM_Y + ROOM_H + 11; spire.castShadow = true; tower.add(spire);
  TOP = ROOM_Y + ROOM_H + 16;

  pend = new THREE.Group(); pend.position.y = ROOM_Y + ROOM_H - 0.4; tower.add(pend);
  ball = new THREE.Mesh(new THREE.IcosahedronGeometry(BALL_R, 1), new THREE.MeshStandardMaterial({ color: "#f2b632", metalness: 0.6, roughness: 0.35, flatShading: true }));
  ball.position.y = -L; ball.castShadow = true; pend.add(ball);
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, L - BALL_R + 0.4, 6), mat("#2d3138"));
    cb.position.set(x * 0.6, -(L - BALL_R) / 2, z * 0.6); pend.add(cb);
  }
  for (const a of [0, 1, 2, 3]) {
    const p = box(0.35, 2.4, 0.35, mat("#8a929c")); const ang = a * Math.PI / 2 + Math.PI / 4;
    p.position.set(Math.cos(ang) * 2.4, ROOM_Y + 1.4, Math.sin(ang) * 2.4); p.rotation.z = Math.cos(ang) * 0.3; p.rotation.x = -Math.sin(ang) * 0.3; tower.add(p);
  }
  windM = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0 });
  for (let i = 0; i < 34; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(4 + rnd() * 6, 0.12, 0.12), windM);
    m.userData = { y: 30 + rnd() * 40, z: -10 + rnd() * 26, o: rnd() * 60, v: 26 + rnd() * 14 };
    scene.add(m); wind.push(m);
  }
  redArrow = c.arrow("#e2463b"); greenArrow = c.arrow("#2bb673");
  c.person(4, 9, 0.5); c.person(-3, 10, -0.4);
}

const SW = 2 * Math.PI * 0.55;
function swayAmp(c, t, TL) {
  const s = (i) => (TL.lines[i] ? TL.lines[i].start : 1e9);
  let a = 0.012;
  if (t > s(1) - 0.2) a = 0.03;
  if (t > s(2) - 0.2) a = 0.05;
  if (t > s(3) - 0.2) a = 0.032;
  if (t > s(6) - 0.2) a = c.lerp(0.032, 0.006, c.ease((t - s(6)) / 2.5));
  return a;
}

export function frame(c, t, i, k, TL) {
  const { ease, proj, world, pill } = c;
  const amp = swayAmp(c, t, TL);
  tower.rotation.z = Math.sin(t * SW) * amp;
  pend.rotation.z = -Math.sin(t * SW) * (i >= 4 ? 0.22 : 0.12) * (amp / 0.032);
  const cut = i < 3 ? 0 : i === 3 ? ease((k - 0.25) / 0.5) : 1;
  front.material.opacity = 1 - cut * 0.92; front.visible = cut < 0.98; frontEdges.material.opacity = cut * 0.9;
  windM.opacity = i === 1 || i === 2 || i === 5 ? 0.75 : i === 6 ? 0.75 * (1 - ease(k * 2)) : 0;
  wind.forEach((m) => { const u = m.userData; m.position.set(((u.o + t * u.v) % 70) - 40, u.y, u.z); });
  const arr = i === 5 ? ease(k * 3) : 0;
  redArrow.userData.m.opacity = greenArrow.userData.m.opacity = arr;
  redArrow.position.set(-RW / 2 - 2.2 + Math.sin(t * SW) * 0.3, ROOM_Y + 2.2, RW / 2 + 1);
  tower.updateMatrixWorld(true);
  const bw = world(ball);
  greenArrow.position.set(bw.x + 3.4, bw.y + 3.3, bw.z + 2.4); greenArrow.rotation.z = Math.PI;

  let html = "", svg = "";
  if (i === 0) {
    const a = proj(new THREE.Vector3(9, 0.3, 6)), b = proj(new THREE.Vector3(9, TOP, 6)), o = ease((k - 0.15) * 4);
    svg += `<g opacity="${o}" stroke="#fff" stroke-width="2.5"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>` +
      `<line x1="${a[0] - 8}" y1="${a[1]}" x2="${a[0] + 8}" y2="${a[1]}"/><line x1="${b[0] - 8}" y1="${b[1]}" x2="${b[0] + 8}" y2="${b[1]}"/></g>`;
    html += pill("508 m", new THREE.Vector3(9, TOP * 0.55, 6), o, "g");
  }
  if (i === 1) html += pill("WIND", new THREE.Vector3(-14, 60, 8), ease((k - 0.2) * 4));
  if (i === 2) {
    const tp = proj(world(tower, new THREE.Vector3(0, TOP - 4, 0))), o = ease((k - 0.15) * 4);
    svg += `<g opacity="${o}" stroke="#fff" stroke-width="3" fill="#fff"><line x1="${tp[0] - 70}" y1="${tp[1] - 40}" x2="${tp[0] + 70}" y2="${tp[1] - 40}"/>` +
      `<path d="M${tp[0] - 78} ${tp[1] - 40} l12 -7 v14z"/><path d="M${tp[0] + 78} ${tp[1] - 40} l-12 -7 v14z"/></g>`;
    html += pill("SWAY", world(tower, new THREE.Vector3(0, TOP - 1, 0)), o);
  }
  if (i === 4) {
    html += pill("660 TONS", world(ball, new THREE.Vector3(0, -BALL_R - 0.8, 2)), ease((k - 0.25) * 4), "g");
    html += pill("STEEL CABLES", world(pend, new THREE.Vector3(1.6, -2.2, 1)), ease((k - 0.55) * 4));
  }
  if (i === 5) {
    html += pill("WIND", redArrow.position.clone().add(new THREE.Vector3(2.2, 1.6, 0)), arr);
    html += pill("BALL", greenArrow.position.clone().add(new THREE.Vector3(-0.6, 1.5, 0)), arr, "g");
  }
  if (i === 6) html += pill("UP TO 40% LESS SWAY", world(tower, new THREE.Vector3(0, TOP + 2, 0)), ease((k - 0.3) * 4), "g");
  return { html, svg, title: i === 7 ? "TUNED MASS<br>DAMPER" : "", titleOpacity: ease(k * 4) };
}
