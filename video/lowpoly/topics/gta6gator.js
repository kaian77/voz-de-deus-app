// GTA 6 (sai em 19/11/2026; o 1º trailer mostra um jacaré entrando numa loja de conveniência) × a Flórida de verdade.
// Fatos: ~1,3 milhão de jacarés selvagens na Flórida e alimentar jacaré selvagem é proibido por lei (FWC, "A Guide to
// Living with Alligators"); em terra correm em arrancadas curtas de até ~11 mph (~18 km/h) e cansam rápido; o
// "corra em zigue-zague" é mito, o certo é correr em linha reta para longe (University of Florida/IFAS, FWC).
// Cena nossa (loja genérica, casa com piscina, campo de golfe); nada do jogo aparece.
let THREE, store, gStore, gPool, gGarage, gGolf, gRun, runner, feeder, minis, green;
const D = { x: -10, z: -1.5 };

export const SHOTS = [
  [[8, 5, 20], [3, 4, 14], [-10, 1, 8], [-10, 1.6, -2]],
  [[-10, 5.5, 17], [-10, 5, 14], [-10, 3, -2], [-10, 3.2, -3]],
  [[0, 70, 75], [0, 95, 90], [0, 0, 0], [0, 0, -5]],
  [[32, 13, 26], [8, 19, -6], [17, 0, 2], [0, 0, -38]],
  [[-16, 3, 26], [-6, 3, 24], [-18, 0.8, 11], [-8, 0.8, 11]],
  [[-2, 26, 34], [2, 28, 34], [2, 0, 12], [4, 0, 12]],
  [[31, 10, 21], [29, 9, 19], [16, 1, 6], [16, 1, 6]],
  [[0, 14, 40], [0, 24, 58], [-4, 3, 0], [-4, 4, 0]],
];

function signTex(text, bg, fg) {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
  const g = cv.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg; g.font = "bold 78px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeGator(c, s = 0.8) {
  const { mat, box } = c, skin = mat("#4c6b2e"), dark = mat("#344d1f"), belly = mat("#c8bf86");
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 2.8, 2, 7), skin); torso.rotation.z = Math.PI / 2; torso.scale.set(0.62, 1, 1); torso.position.y = 0.75; torso.castShadow = true; body.add(torso);
  const bel = box(3.2, 0.2, 1.1, belly); bel.position.y = 0.35; body.add(bel);
  for (let k = 0; k < 7; k++) { const r = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.35, 4), dark); r.position.set(-1.6 + k * 0.5, 1.28, 0); body.add(r); }
  const head = new THREE.Group(); head.position.set(2.2, 0.72, 0); body.add(head);
  const skull = box(1.1, 0.6, 1.05, skin); skull.position.x = 0.3; head.add(skull);
  const snout = box(1.7, 0.36, 0.72, skin); snout.position.set(1.55, -0.08, 0); head.add(snout);
  const jaw = box(2.4, 0.18, 0.78, belly); jaw.position.set(1.2, -0.3, 0); head.add(jaw);
  for (const z of [-0.32, 0.32]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), mat("#e8d24a")); eye.position.set(0.35, 0.36, z); head.add(eye);
    const pup = box(0.06, 0.2, 0.06, mat("#111")); pup.position.set(0.46, 0.38, z); head.add(pup);
    for (let k = 0; k < 6; k++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 3), mat("#fffbe8")); tooth.rotation.x = Math.PI; tooth.position.set(0.9 + k * 0.33, -0.25, z * 1.05); head.add(tooth); }
  }
  const tail = []; let parent = body, x0 = -1.9;
  for (let k = 0; k < 6; k++) {
    const seg = new THREE.Group(); seg.position.set(k ? -0.75 : x0, k ? 0 : 0.7, 0); parent.add(seg);
    const r = 0.55 * (1 - k / 7);
    const m = box(0.8, r * 1.1, r * 1.5, skin); m.position.x = -0.38; seg.add(m);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 4), dark); sp.position.set(-0.38, r * 0.55 + 0.1, 0); seg.add(sp);
    tail.push(seg); parent = seg;
  }
  const legs = [];
  for (const [x, z] of [[1.3, 0.75], [1.3, -0.75], [-1.2, 0.75], [-1.2, -0.75]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.55, z); body.add(leg);
    const l = box(0.32, 0.6, 0.32, skin); l.position.set(0, -0.3, z > 0 ? 0.18 : -0.18); leg.add(l);
    const f = box(0.55, 0.12, 0.45, dark); f.position.set(0.12, -0.58, z > 0 ? 0.25 : -0.25); leg.add(f);
    legs.push(leg);
  }
  g.userData = { body, tail, legs, head };
  g.scale.setScalar(s); c.scene.add(g); return g;
}

function animate(g, t, speed = 1, moving = true) {
  const { tail, legs, body, head } = g.userData, f = t * 7 * speed;
  legs.forEach((l, n) => { l.rotation.z = moving ? Math.sin(f + (n === 0 || n === 3 ? 0 : Math.PI)) * 0.55 : 0; });
  tail.forEach((s, n) => { s.rotation.y = Math.sin(t * 2.2 * (moving ? speed : 0.4) - n * 0.7) * (moving ? 0.16 : 0.07); });
  body.rotation.y = moving ? Math.sin(f) * 0.05 : 0;
  head.rotation.z = moving ? 0 : Math.max(0, Math.sin(t * 0.9)) * 0.12;
}

function makeStore(c) {
  const { mat, box, scene } = c, g = new THREE.Group(); g.position.set(D.x, 0, -6); scene.add(g);
  const wallM = mat("#f4efe3"), glass = new THREE.MeshLambertMaterial({ color: "#a8d8f0", transparent: true, opacity: 0.35 });
  const back = box(16, 6, 0.4, wallM); back.position.set(0, 3, -4.5); g.add(back);
  for (const x of [-8, 8]) { const s = box(0.4, 6, 9, wallM); s.position.set(x, 3, 0); g.add(s); }
  const roof = box(16.8, 0.6, 9.8, mat("#e3262e")); roof.position.set(0, 6.3, 0); g.add(roof);
  const fl = box(16, 0.1, 9, mat("#d9d9d9")); fl.position.y = 0.05; g.add(fl);
  for (const x of [-5, 5]) { const w = box(5.6, 4.2, 0.15, glass); w.position.set(x, 2.6, 4.5); w.castShadow = false; g.add(w); const sill = box(5.8, 0.5, 0.4, wallM); sill.position.set(x, 0.25, 4.5); g.add(sill); }
  const lintel = box(4.4, 1.6, 0.4, wallM); lintel.position.set(0, 5.2, 4.5); g.add(lintel);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 0.3), [wallM, wallM, wallM, wallM, new THREE.MeshBasicMaterial({ map: signTex("OPEN 24/7", "#111111", "#ffc72c") }), wallM]);
  sign.position.set(0, 7.6, 4.3); g.add(sign);
  for (let r = 0; r < 3; r++) for (const x of [-5, 0.5, 5]) {
    if (x === 0.5) continue;
    const sh = box(3.5, 0.15, 1.2, mat("#8a929c")); sh.position.set(x, 0.9 + r * 1.1, -2.5); g.add(sh);
    for (let k = 0; k < 5; k++) { const it = box(0.5, 0.6, 0.5, mat(c.pastel[(r * 5 + k) % 8])); it.position.set(x - 1.4 + k * 0.7, 1.3 + r * 1.1, -2.5); g.add(it); }
  }
  const counter = box(4, 1.3, 1.4, mat("#b06d36")); counter.position.set(-4.5, 0.65, 1.5); g.add(counter);
  const lamp = new THREE.PointLight("#fff2d6", 50, 20); lamp.position.set(0, 5, 0); g.add(lamp);
  return g;
}

export function build(c) {
  THREE = c.THREE;
  const { scene, mat, box, rnd } = c;
  c.ground("#86c45c");
  const lot = box(34, 0.08, 18, mat("#5d6168")); lot.position.set(-8, 0.04, 8); scene.add(lot);
  for (let k = 0; k < 6; k++) { const l = box(0.2, 0.1, 4, mat("#f4f1de")); l.position.set(-22 + k * 5, 0.06, 3.5); scene.add(l); }
  const walk = box(18, 0.2, 2, mat("#d9d4c8")); walk.position.set(D.x, 0.1, -0.6); scene.add(walk);
  store = makeStore(c);
  // casa com garagem e piscina
  const house = box(11, 5, 8, mat("#f7c6a3")); house.position.set(19, 2.5, -7); scene.add(house);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(8.4, 3, 4), mat("#c1473a")); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.75; roof.position.set(19, 6.5, -7); roof.castShadow = true; scene.add(roof);
  const gdoor = box(4.4, 3.4, 0.2, mat("#ffffff")); gdoor.position.set(22, 1.7, -2.95); scene.add(gdoor);
  const drive = box(5, 0.08, 8, mat("#bdbdbd")); drive.position.set(22, 0.04, 1); scene.add(drive);
  const rim = box(10, 0.4, 6.6, mat("#f4f1de")); rim.position.set(15, 0.2, 7); scene.add(rim);
  const water = box(8.8, 0.45, 5.4, new THREE.MeshLambertMaterial({ color: "#3fb6e8", transparent: true, opacity: 0.85 })); water.position.set(15, 0.25, 7); scene.add(water);
  // campo de golfe
  green = new THREE.Mesh(new THREE.CircleGeometry(12, 16), mat("#a8e070")); green.rotation.x = -Math.PI / 2; green.position.set(0, 0.06, -38); green.receiveShadow = true; scene.add(green);
  const pole = box(0.15, 5, 0.15, mat("#ffffff")); pole.position.set(3, 2.5, -40); scene.add(pole);
  const flag = box(1.8, 1.1, 0.06, mat("#e3262e")); flag.position.set(3.9, 4.4, -40); scene.add(flag);
  // pântano ao redor (laguinhos) + palmeiras
  for (let k = 0; k < 9; k++) {
    const a = rnd() * 6.28, r = 50 + rnd() * 60, p = new THREE.Mesh(new THREE.CircleGeometry(6 + rnd() * 10, 9), mat("#4f9fc4"));
    p.rotation.x = -Math.PI / 2; p.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r - 20); scene.add(p);
  }
  for (let k = 0; k < 26; k++) { const x = -60 + rnd() * 120, z = -70 + rnd() * 50; if (Math.abs(x) > 14 || z < -52) c.palm(x, z, 0.8 + rnd() * 0.5); }
  for (const [x, z] of [[-26, 2], [28, 4], [-28, 16], [30, -16]]) c.palm(x, z, 1);
  c.sky();
  // jacarés da cena
  gStore = makeGator(c); gStore.rotation.y = Math.PI / 2;
  gPool = makeGator(c, 0.6); gPool.position.set(15, -0.1, 7); gPool.rotation.y = 0.3;
  gGarage = makeGator(c, 0.7); gGarage.position.set(21, 0, -0.6); gGarage.rotation.y = 0.2;
  gGolf = makeGator(c, 0.75); gGolf.position.set(-2, 0, -36); gGolf.rotation.y = -0.6;
  gRun = makeGator(c, 0.8);
  runner = c.person(-7, 11, -Math.PI / 2, "#e3262e");
  feeder = c.person(19.8, 7, -Math.PI / 2 - 0.2, "#4d9de0");
  // ~1,3 milhão (cada pontinho = muitos)
  const N = 900; minis = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.4, 0.5), mat("#2f4a1a"), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let k = 0; k < N; k++) {
    const a = rnd() * 6.28, r = 16 + Math.sqrt(rnd()) * 120;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
    m4.compose(new THREE.Vector3(Math.cos(a) * r, 0.25, Math.sin(a) * r - 10), q, new THREE.Vector3(1, 1, 1)); minis.setMatrixAt(k, m4);
  }
  minis.count = 0; minis.frustumCulled = false; scene.add(minis);
  c.userGreen = c.arrow("#2bb673", 14, 0.35);
}

export function frame(c, t, i, k, TL) {
  const { ease, pill, lerp, world } = c, S = (n) => TL.lines[Math.min(n, TL.lines.length - 1)].start;
  // 0: o jacaré atravessa o estacionamento e entra na loja
  const p = ease((t - 0.3) / Math.max(1, S(1) + 1 - 0.3));
  gStore.position.set(D.x, 0, lerp(14, -4.5, p));
  animate(gStore, t, 1, p < 0.999);
  [gPool, gGarage, gGolf].forEach((g, n) => animate(g, t + n, 0.6, n === 0));
  gPool.position.x = 15 + Math.sin(t * 0.5) * 2;
  // 4-5: arrancada curta e cansa; a pessoa corre em linha reta
  const sp = i < 4 ? 0 : ease((t - S(4)) / 2.2), tired = i >= 4 && t - S(4) > 2.2;
  gRun.visible = i >= 4 && i <= 5;
  gRun.position.set(lerp(-28, -15, sp), 0, 11); animate(gRun, t, 2.2, !tired && i >= 4);
  const rk = i < 5 ? 0 : ease((t - S(5)) / 3.5);
  runner.visible = i >= 4 && i <= 5;
  runner.position.set(lerp(-7, 16, rk), 0.3 + (rk > 0 && rk < 1 ? Math.abs(Math.sin(t * 12)) * 0.4 : 0), 11);
  const ga = c.userGreen; ga.userData.m.opacity = i === 5 ? ease(k * 3) : 0; ga.position.set(6, 1, 13.5);
  feeder.visible = i === 6;
  minis.count = i === 2 ? Math.floor(900 * ease(k * 1.6)) : 0;

  let html = "", svg = "";
  if (i === 0) html += pill("GTA 6 TRAILER", world(gStore, new THREE.Vector3(0, 3.2, 0)), ease((k - 0.1) * 4));
  if (i === 1) html += pill("FLORIDA, REAL LIFE", new THREE.Vector3(D.x, 2.2, 2), ease((k - 0.2) * 4), "g");
  if (i === 2) html += pill("≈1.3 MILLION WILD GATORS", new THREE.Vector3(0, 10, 10), ease((k - 0.15) * 4), "g");
  if (i === 3) {
    html += pill("POOL", new THREE.Vector3(15, 2.5, 7), ease((k - 0.05) * 5) * (1 - ease((k - 0.55) * 5)));
    html += pill("GARAGE", new THREE.Vector3(22, 4.4, -1), ease((k - 0.2) * 5) * (1 - ease((k - 0.65) * 5)));
    html += pill("GOLF COURSE", new THREE.Vector3(-2, 3, -36), ease((k - 0.6) * 4));
  }
  if (i === 4) {
    html += pill(tired ? "TIRED ALREADY" : "UP TO ~11 MPH", world(gRun, new THREE.Vector3(1, 2.4, 0)), ease(k * 5), tired ? "b" : "");
    html += pill("SHORT BURSTS ONLY", new THREE.Vector3(-14, 6, 11), ease((k - 0.55) * 4), "b");
  }
  if (i === 5) {
    const a = c.proj(new THREE.Vector3(-4, 0.5, 11)), pts = [];
    for (let n = 0; n <= 8; n++) { const q = c.proj(new THREE.Vector3(-7 + n * 2.9, 0.5, 11 + (n % 2 ? -4 : 4) * (n ? 1 : 0))); pts.push(`${q[0]},${q[1]}`); }
    const o = ease(k * 3), mid = c.proj(new THREE.Vector3(6, 0.5, 6));
    svg += `<g opacity="${o}"><polyline points="${pts.join(" ")}" fill="none" stroke="#e2463b" stroke-width="4" stroke-dasharray="10 8"/>` +
      `<g stroke="#e2463b" stroke-width="9" stroke-linecap="round"><line x1="${mid[0] - 22}" y1="${mid[1] - 22}" x2="${mid[0] + 22}" y2="${mid[1] + 22}"/><line x1="${mid[0] + 22}" y1="${mid[1] - 22}" x2="${mid[0] - 22}" y2="${mid[1] + 22}"/></g></g>`;
    html += pill("ZIGZAG = MYTH", new THREE.Vector3(6, 2, 3), o);
    html += pill("RUN STRAIGHT AWAY", new THREE.Vector3(6, 2, 17.5), ease((k - 0.3) * 4), "g");
  }
  if (i === 6) {
    html += pill("NEVER FEED A GATOR", new THREE.Vector3(17.5, 5.6, 7), ease((k - 0.1) * 4));
    html += pill("ILLEGAL IN FLORIDA", new THREE.Vector3(15, 3.3, 7), ease((k - 0.45) * 4), "b");
  }
  return { html, svg, title: i === 7 ? "GTA 6<br>NOV 19" : "", titleOpacity: ease(k * 4) };
}
