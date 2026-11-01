// Lagartixa-de-parede (Hemidactylus mabouia) solta o rabo de propósito (autotomia caudal): o rabo quebra num ponto
// fraco das vértebras, fica se mexendo por minutos e distrai o predador enquanto ela foge; depois cresce de novo
// (o novo tem cartilagem no lugar de osso). Fontes: Bateman & Fleming 2009 (J. Zoology, revisão de autotomia),
// Higham & Russell 2010 (rabo solto de lagartixa se mexe por até ~30 min).
// Estilo "bicho fofo" (formas arredondadas), cena de quarto: parede, chão de madeira, luminária, gato.
let THREE, gecko, legs = [], tail, segs = [], ring, cat, paw, pawArm, man, manArm, manLegs = [];
const WALL_Y = 8, SEG = 12, SEG_L = 0.24;

export const SHOTS = [
  [[0, 8.5, 4.2], [1.2, 9.4, 7.5], [0, 7.6, 0], [0, 8.4, 0]],
  [[3, 2.4, 18], [2.4, 2.8, 16], [0, 6.4, 2], [0, 6.9, 2]],
  [[2.6, 8.5, 5.5], [3.4, 9.5, 6.2], [0, 7.6, 0.5], [0, 8.6, 0.5]],
  [[-2.2, 7.4, 3.6], [-1.6, 8.2, 3.2], [0, 7.4, 0.4], [0, 8.2, 0.4]],
  [[4, 2.2, 13], [3.2, 1.8, 12], [0.4, 0.6, 8], [0.4, 0.5, 8.2]],
  [[2.5, 11, 6], [2.5, 16, 6], [0, 11, 0], [0, 16, 0]],
  [[-12, 6, 24], [-13, 5, 20], [-14, 4.6, 10], [-14, 4, 10]],
  [[2.8, 12.5, 4.6], [3.2, 12.2, 5.4], [0, 11.6, 0], [0, 11.8, 0]],
];

function speckle(base, dots, n, size = 128) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const g = cv.getContext("2d"); g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) { g.fillStyle = dots[i % dots.length]; g.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function planks() {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 256;
  const g = cv.getContext("2d");
  for (let i = 0; i < 8; i++) { g.fillStyle = ["#b8743c", "#a9672f", "#c27f45", "#b06d36"][i % 4]; g.fillRect(0, i * 32, 256, 32); g.fillStyle = "#6e3f1c"; g.fillRect(0, i * 32, 256, 1.5); }
  for (let i = 0; i < 400; i++) { g.fillStyle = "rgba(90,50,20,.18)"; g.fillRect(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 40, 1); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function chevrons() { // costas da lagartixa: faixas em zigue-zague
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 256;
  const g = cv.getContext("2d"); g.fillStyle = "#c2a37f"; g.fillRect(0, 0, 64, 256);
  g.strokeStyle = "#7d6146"; g.lineWidth = 6;
  for (let y = 20; y < 256; y += 42) { g.beginPath(); for (let x = 0; x <= 64; x += 8) g.lineTo(x, y + ((x / 8) % 2 ? 7 : -7)); g.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const soft = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0, ...o });
function blob(geo, m, pos, scale) { const x = new THREE.Mesh(geo, m); x.position.set(...pos); if (scale) x.scale.set(...scale); x.castShadow = true; return x; }

function makeGecko() {
  const g = new THREE.Group(), skin = soft("#c2a37f"), dark = soft("#2b2118");
  const back = soft("#ffffff", { map: chevrons() });
  g.add(blob(new THREE.CapsuleGeometry(0.42, 1.05, 10, 20), back, [0, 0.12, 0.06], [1.18, 1, 0.5]));
  g.add(blob(new THREE.SphereGeometry(0.3, 16, 12), skin, [0, 0.95, 0.07], [1.3, 0.9, 0.5])); // pescoço
  g.add(blob(new THREE.SphereGeometry(0.42, 24, 16), skin, [0, 1.38, 0.08], [1.05, 1.15, 0.52]));
  g.add(blob(new THREE.ConeGeometry(0.36, 0.55, 20), skin, [0, 1.85, 0.06], [1.05, 1, 0.45])); // focinho
  for (const s of [-1, 1]) {
    const eye = blob(new THREE.SphereGeometry(0.15, 16, 12), soft("#d8cfae", { roughness: 0.25 }), [s * 0.33, 1.45, 0.2]);
    eye.add(blob(new THREE.SphereGeometry(0.075, 10, 8), dark, [s * 0.05, 0.01, 0.1], [0.6, 1.4, 0.6]));
    g.add(eye);
  }
  for (const [x, y, s] of [[-0.42, 0.62, -1], [0.42, 0.62, 1], [-0.42, -0.42, -1], [0.42, -0.42, 1]]) {
    const leg = new THREE.Group(); leg.position.set(x, y, 0.02);
    const fwd = y > 0 ? 1 : -1; // dianteira dobra para a frente, traseira para trás
    const up = blob(new THREE.CapsuleGeometry(0.1, 0.36, 4, 10), skin, [s * 0.22, 0.04 * fwd, 0]); up.rotation.z = Math.PI / 2 - 0.15 * fwd * s; leg.add(up);
    const low = blob(new THREE.CapsuleGeometry(0.085, 0.34, 4, 10), skin, [s * 0.46, 0.2 * fwd, 0]); low.rotation.z = 0.5 * fwd * s; leg.add(low);
    const foot = new THREE.Group(); foot.position.set(s * 0.52, 0.42 * fwd, 0);
    for (let k = 0; k < 5; k++) { // dedos abertos com almofadinha na ponta
      const a = (k - 2) * 0.45 + (fwd > 0 ? 0 : Math.PI);
      const toe = blob(new THREE.CapsuleGeometry(0.03, 0.16, 3, 6), skin, [Math.sin(a) * 0.12, Math.cos(a) * 0.12, 0]); toe.rotation.z = -a; foot.add(toe);
      foot.add(blob(new THREE.SphereGeometry(0.055, 8, 6), skin, [Math.sin(a) * 0.23, Math.cos(a) * 0.23, 0], [1, 1, 0.6]));
    }
    leg.add(foot); leg.userData.side = s; g.add(leg); legs.push(leg);
  }
  return g;
}

function makeTail() {
  const root = new THREE.Group(); let parent = root;
  for (let i = 0; i < SEG; i++) {
    const r0 = 0.3 * (1 - i / SEG) + 0.025, r1 = 0.3 * (1 - (i + 1) / SEG) + 0.02;
    const s = new THREE.Group(); s.position.y = i ? -SEG_L : 0;
    const m = blob(new THREE.CylinderGeometry(r0, r1, SEG_L + 0.02, 12), soft(i % 2 ? "#7d6146" : "#c2a37f"), [0, -SEG_L / 2, 0], [1, 1, 0.6]);
    s.add(m); s.userData.mesh = m; parent.add(s); segs.push(s); parent = s;
  }
  return root;
}

function makeCat() {
  const g = new THREE.Group(), fur = soft("#c99b6b"), cream = soft("#f1dcc3"), pink = soft("#e79a92"), black = soft("#111111");
  g.add(blob(new THREE.SphereGeometry(2.2, 28, 20), fur, [0, 2.6, 0], [1, 1.35, 0.95]));
  g.add(blob(new THREE.SphereGeometry(1.5, 24, 16), cream, [0, 3.2, 1.2], [1, 1.2, 0.6]));
  const head = new THREE.Group(); head.position.set(0, 5.9, 0.4); g.add(head); g.userData.head = head;
  head.add(blob(new THREE.SphereGeometry(1.75, 32, 24), fur, [0, 0, 0], [1.12, 0.95, 1]));
  head.add(blob(new THREE.SphereGeometry(0.9, 20, 14), cream, [0, -0.55, 1.2], [1.25, 0.7, 0.7]));
  for (const s of [-1, 1]) {
    const ear = blob(new THREE.ConeGeometry(0.62, 1.1, 4), fur, [s * 1.05, 1.45, -0.1]); ear.rotation.z = -s * 0.35; head.add(ear);
    const inner = blob(new THREE.ConeGeometry(0.38, 0.75, 4), pink, [s * 1.0, 1.4, 0.12]); inner.rotation.z = -s * 0.35; head.add(inner);
    const eye = blob(new THREE.SphereGeometry(0.42, 20, 14), soft("#f2ea9a", { roughness: 0.25 }), [s * 0.66, 0.25, 1.42], [1, 0.85, 0.5]);
    eye.add(blob(new THREE.SphereGeometry(0.24, 14, 10), black, [s * -0.05, 0.05, 0.3], [0.8, 1.2, 0.6]));
    head.add(eye);
    for (const k of [-1, 0, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), soft("#ffffff"));
      w.rotation.z = Math.PI / 2 + k * 0.12 * s; w.position.set(s * 1.55, -0.55 + k * 0.12, 1.25); head.add(w);
    }
  }
  head.add(blob(new THREE.SphereGeometry(0.17, 12, 8), pink, [0, -0.25, 1.78], [1.2, 0.8, 0.8]));
  // braço que dá o tapa (ombro direito); a pata segue um alvo
  pawArm = blob(new THREE.CapsuleGeometry(0.42, 1, 6, 12), fur, [0, 0, 0]); g.add(pawArm);
  paw = new THREE.Group(); g.add(paw);
  paw.add(blob(new THREE.SphereGeometry(0.55, 20, 14), cream, [0, 0, 0], [1, 0.8, 0.9]));
  for (let k = 0; k < 3; k++) {
    paw.add(blob(new THREE.SphereGeometry(0.17, 10, 8), pink, [(k - 1) * 0.28, 0.42, 0.25]));
    const claw = blob(new THREE.ConeGeometry(0.05, 0.28, 6), soft("#3a2d22"), [(k - 1) * 0.28, 0.62, 0.32]); paw.add(claw);
  }
  return g;
}

function makeMan() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: "#7d9bff", transparent: true, opacity: 0.6, roughness: 0.15, emissive: "#22337a", emissiveIntensity: 0.35 });
  const ball = (r, p) => blob(new THREE.SphereGeometry(r, 18, 12), glass, p);
  const limb = (a, b, r) => {
    const v = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), m = blob(new THREE.CapsuleGeometry(r, v.length(), 6, 12), glass, [0, 0, 0]);
    m.position.copy(new THREE.Vector3(...a).add(v.clone().multiplyScalar(0.5))); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); return m;
  };
  g.add(ball(0.75, [0, 8.4, 0]), limb([0, 7.4, 0], [0, 4.6, 0], 0.75), ball(0.5, [0, 4.4, 0]));
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.5, 4.3, 0);
    leg.add(limb([0, 0, 0], [0, -2, 0], 0.32), ball(0.33, [0, -2, 0]), limb([0, -2, 0], [0, -4, 0], 0.28));
    g.add(leg); manLegs.push(leg);
  }
  g.add(limb([-1.05, 7.2, 0], [-1.4, 4.9, 0.2], 0.27), ball(0.32, [-1.05, 7.2, 0]));
  manArm = new THREE.Group(); manArm.add(limb([0, 0, 0], [0.35, -2.3, 0.2], 0.27), ball(0.32, [0, 0, 0]), ball(0.3, [0.35, -2.4, 0.2]));
  manArm.userData.base = new THREE.Vector3(1.05, 7.2, 0); manArm.position.copy(manArm.userData.base); g.add(manArm);
  return g;
}

export function build(c) {
  THREE = c.THREE;
  const { scene } = c;
  scene.background = new THREE.Color("#3a332c");
  scene.fog = null;
  scene.traverse((o) => { if (o.isHemisphereLight) { o.color.set("#fff1dd"); o.groundColor.set("#6b4a30"); o.intensity = 1.2; } });
  c.sun.position.set(14, 30, 26); c.sun.intensity = 2.3;
  Object.assign(c.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -5 }); c.sun.shadow.camera.updateProjectionMatrix();
  const wallTex = speckle("#d8ccb6", ["#c9bca4", "#e4d9c6", "#bfb19a"], 30000, 512); wallTex.repeat.set(5, 3);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), soft("#ffffff", { map: wallTex, roughness: 0.95 }));
  wall.position.set(0, 20, 0); wall.receiveShadow = true; scene.add(wall);
  const floorTex = planks(); floorTex.repeat.set(4, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), soft("#ffffff", { map: floorTex, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = 30; floor.receiveShadow = true; scene.add(floor);
  const base = c.box(80, 0.5, 0.3, soft("#efe7da")); base.position.set(0, 0.25, 0.15); scene.add(base);
  // luminária de parede com lâmpada acesa
  const lamp = new THREE.Group(); lamp.position.set(-5.5, 13, 0); scene.add(lamp);
  lamp.add(blob(new THREE.CylinderGeometry(1.1, 1.1, 0.35, 28), soft("#e8dfd0"), [0, 0, 0.18], null)); lamp.children[0].rotation.x = Math.PI / 2;
  const sock = blob(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 18), soft("#e8dfd0"), [0, 0, 0.8]); sock.rotation.x = Math.PI / 2; lamp.add(sock);
  lamp.add(blob(new THREE.SphereGeometry(0.6, 20, 14), new THREE.MeshStandardMaterial({ color: "#fffbe8", emissive: "#fff2c0", emissiveIntensity: 1.6 }), [0, 0, 1.6], [1, 1, 1.2]));
  const bulb = new THREE.PointLight("#ffdca0", 90, 30); bulb.position.set(-5.5, 13, 2.4); scene.add(bulb);

  gecko = makeGecko(); scene.add(gecko);
  tail = makeTail(); scene.add(tail);
  ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 8, 28), new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0, depthTest: false }));
  ring.renderOrder = 9; scene.add(ring);
  cat = makeCat(); cat.position.set(2.8, 0, 3.2); scene.add(cat);
  man = makeMan(); man.position.set(-14, 0, 10); scene.add(man);
}

// ------------------------------------------------------------ animação
const clamp = (x) => Math.max(0, Math.min(1, x));
function walk(t, speed, amp) { legs.forEach((l, n) => { const ph = (n === 0 || n === 3) ? 0 : Math.PI; l.rotation.z = Math.sin(t * speed + ph) * amp * l.userData.side; }); }
function placeTailOnGecko() {
  gecko.updateMatrixWorld(true);
  tail.position.copy(gecko.localToWorld(new THREE.Vector3(0, -0.78, 0.05)));
  tail.quaternion.copy(gecko.quaternion); tail.scale.setScalar(1);
}
function wiggle(t, amp, speed = 13) { segs.forEach((s, i) => { s.rotation.z = Math.sin(t * speed - i * 0.7) * amp * (i ? 1 : 0.3); }); }

export function frame(c, t, i, k) {
  const { ease, pill, lerp, world } = c;
  const showCat = i >= 1 && i <= 4;
  cat.visible = showCat; man.visible = i === 6; gecko.visible = i !== 6 && i !== 4; tail.visible = i !== 6;
  segs.forEach((s) => (s.visible = true));
  // ---- lagartixa na parede
  let gy = WALL_Y, attached = true, drop = 0, slow = 1;
  if (i === 0) { gy = lerp(6.3, WALL_Y, ease(k)); walk(t, 7, 0.35); }
  else if (i === 1) walk(t, 0, 0);
  else if (i === 2 || i === 3) {
    const at = i === 2 ? 0.38 : 0.32; slow = i === 3 ? 0.25 : 1;
    attached = k < at;
    const u = clamp((k - at) / (1 - at));
    gy = WALL_Y + (attached ? 0 : ease(u) * (i === 2 ? 3.5 : 1.4));
    walk(t * slow, attached ? 0 : 16, 0.5);
    drop = attached ? 0 : clamp(u * (i === 2 ? 2.2 : 1.1));
  } else if (i === 4) { attached = false; drop = 2; }
  else if (i === 5) { gy = lerp(10.5, 17, k); walk(t, 18, 0.55); attached = false; drop = 2; }
  else if (i === 7) { gy = 11.5; walk(t, 0, 0); attached = true; }
  gecko.position.set(0, gy, 0.2); gecko.rotation.set(0, 0, i === 5 ? Math.sin(t * 9) * 0.08 : 0);
  // ---- rabo
  if (attached) {
    placeTailOnGecko();
    wiggle(t, i === 2 || i === 3 ? 0.12 : 0.05, 6);
    // fala 7: o rabo novo cresce (liso, sem as faixas)
    const grow = i === 7 ? 0.25 + 0.75 * ease((k - 0.15) / 0.6) : 1;
    segs.forEach((s, n) => {
      s.visible = n / SEG <= grow + 0.001;
      s.userData.mesh.material.color.set(i === 7 ? (n < 2 ? "#c2a37f" : "#a99b8c") : n % 2 ? "#7d6146" : "#c2a37f");
    });
  } else {
    segs.forEach((s, n) => s.userData.mesh.material.color.set(n % 2 ? "#7d6146" : "#c2a37f"));
    // cai da parede até o chão e fica se mexendo deitado
    const start = new THREE.Vector3(0, WALL_Y - 0.72, 0.25), end = new THREE.Vector3(0.4, 0.3, 2.2);
    const f = Math.min(1, drop);
    tail.position.set(lerp(start.x, end.x, f), lerp(start.y, end.y, f * f), lerp(start.z, end.z, f));
    tail.rotation.set(-Math.PI / 2 * ease(f), 0, f * 0.6);
    wiggle(t * slow, f < 1 ? 0.3 : 0.42, 15);
    if (i === 4) { tail.position.set(0.4, 0.3, 7.6); tail.rotation.set(-Math.PI / 2, 0, 0.9); }
  }
  // gecko sem rabo depois de soltar (fala 5)
  if (i === 5) tail.visible = false;
  // ---- gato: pata vai na lagartixa (1-3) e brinca com o rabo no chão (4)
  if (showCat) {
    const head = cat.userData.head;
    let target;
    if (i === 1) target = new THREE.Vector3(lerp(1.2, 0.3, ease((k - 0.45) / 0.45)), lerp(4.6, WALL_Y - 1.3, ease((k - 0.45) / 0.45)), lerp(5.6, 1.2, ease((k - 0.45) / 0.45)));
    else if (i === 2 || i === 3) target = new THREE.Vector3(0.3, WALL_Y - 1.3 - (attached ? 0 : 0.5 * drop), 1.2);
    else target = new THREE.Vector3(0.6 + Math.sin(t * 7) * 0.4, 0.9 + Math.abs(Math.sin(t * 5)) * 1.2, 7.4);
    head.rotation.x = i === 4 ? 0.55 : -0.35; head.rotation.y = Math.sin(t * 1.3) * 0.08;
    cat.position.set(i === 4 ? 1.2 : 2.8, 0, 3.2);
    cat.updateMatrixWorld(true);
    const local = cat.worldToLocal(target.clone()), shoulder = new THREE.Vector3(-1.3, 4.6, 0.9);
    paw.position.copy(local);
    const v = local.clone().sub(shoulder);
    pawArm.position.copy(shoulder.clone().add(v.clone().multiplyScalar(0.5)));
    pawArm.scale.set(1, Math.max(0.3, v.length() / 1.8), 1);
    pawArm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
  }
  // anel amarelo no ponto de quebra
  const ringOn = (i === 2 && k < 0.42) || (i === 3 && k < 0.36) ? ease(k * 5) : 0;
  ring.material.opacity = ringOn;
  if (ringOn) { gecko.updateMatrixWorld(true); ring.position.copy(gecko.localToWorld(new THREE.Vector3(0, -1.0, 0.1))); }
  // ---- boneco "se fosse você": o braço cai e fica se mexendo; ele sai andando
  if (i === 6) {
    const at = 0.3, u = clamp((k - at) / 0.25), go = clamp((k - 0.55) / 0.45);
    man.position.x = -14 - go * 5; man.rotation.y = go > 0 ? -0.9 : 0;
    manLegs.forEach((l, n) => (l.rotation.x = go > 0 ? Math.sin(t * 9 + n * Math.PI) * 0.5 : 0));
    if (k < at) { manArm.position.copy(manArm.userData.base); manArm.rotation.set(0, 0, 0.2 + Math.sin(t * 3) * 0.05); }
    else {
      manArm.position.set(1.05 + u * 1.2 + go * 5, lerp(7.2, 0.4, u * u), lerp(0, 1.5, u));
      manArm.rotation.set(0, 0, lerp(0.2, Math.PI / 2, u) + (u >= 1 ? Math.sin(t * 14) * 0.35 : 0));
    }
  }

  // ---- textos
  let html = "", title = "", titleOpacity = 1;
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  if (i === 0) { title = `<span style="color:#fff">TROPICAL HOUSE GECKO</span><div style="font:22px P;color:#ffd23f;-webkit-text-stroke:5px #1d1d1d;letter-spacing:1px">HEMIDACTYLUS MABOUIA</div>`; titleOpacity = ease(k * 5); }
  if (i === 1) html += pill("PREDATOR", world(cat, v3(0, 8.3, 0.4)), ease((k - 0.15) * 4));
  if (i === 2 && k < 0.42) html += pill("BUILT-IN BREAK POINT", gecko.localToWorld(v3(1.4, -1.0, 0.1)), ease((k - 0.05) * 5));
  if (i === 3) html += `<div style="position:absolute;left:0;right:0;top:300px;text-align:center"><span style="background:#1b1b1bdd;color:#fff;font:26px P;letter-spacing:2px;padding:8px 18px;border-radius:8px">REPLAY · SLOW MOTION</span></div>`;
  if (i === 4) html += pill("STILL WRIGGLING", v3(1.6, 1.4, 8.6), ease((k - 0.15) * 4));
  if (i === 5) html += pill("ESCAPE!", gecko.localToWorld(v3(1.3, 0.6, 0.2)), ease((k - 0.1) * 4), "g");
  if (i === 6) { title = `<span style="color:#fff">IF IT WERE YOU</span>`; titleOpacity = ease(k * 5); }
  if (i === 7) { html += pill("NEW TAIL", gecko.localToWorld(v3(1.0, -2.0, 0.1)), ease((k - 0.35) * 4), "g"); title = "IT GROWS BACK"; titleOpacity = ease((k - 0.5) * 4); }
  return { html, title, titleOpacity };
}
