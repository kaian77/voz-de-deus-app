// Implante guiado em 3D (demonstração PáginasPro): planejamento, guia cirúrgica, fresagem guiada,
// implante, retirada da guia, pilar e coroa. Tudo feito por código (sem modelos), corte vestíbulo-lingual
// opcional (plano de recorte + faces de trás pintadas como "osso cortado"). Espanhol e inglês.
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type Lang = "es" | "en";
const qs = new URLSearchParams(location.search);
let lang: Lang = (qs.get("lang") as Lang) || (() => { try { return (localStorage.getItem("impl_lang") as Lang) || null; } catch { return null; } })() || (navigator.language.startsWith("en") ? "en" : "es");
if (lang !== "es" && lang !== "en") lang = "es";
const L = (es: string, en: string) => (lang === "en" ? en : es);

const BRUNO = "5561992372216";

// ---------- Tela ----------
const app = document.getElementById("app")!;
app.innerHTML = `
<canvas id="cv"></canvas>
<header class="top">
  <div class="who"><img src="/drtino/tdl-logo.png" alt=""><div><b>Dr. Tino</b><small id="sub"></small></div></div>
  <div class="tr"><button id="lng" class="pill"></button></div>
</header>
<div id="labels"></div>
<div class="wm" aria-hidden="true"><b>VISTA PREVIA</b></div>
<div class="pv">VISTA PREVIA · PREVIEW · PáginasPro</div>
<div class="tools"><button id="cut" class="pill"></button><button id="spin" class="pill"></button></div>
<section class="card">
  <div class="steps" id="dots"></div>
  <div class="head"><span id="num"></span><h1 id="ttl"></h1></div>
  <p id="txt"></p>
  <div class="nav">
    <button id="prev" class="rb" aria-label="Anterior">‹</button>
    <button id="play" class="rb play"></button>
    <button id="next" class="rb" aria-label="Siguiente">›</button>
  </div>
  <div class="foot"><span id="demo"></span><a id="wa" target="_blank" rel="noopener"></a></div>
</section>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- Cena ----------
const canvas = $<HTMLCanvasElement>("cv");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
camera.position.set(22, 14, 44);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 18;
controls.maxDistance = 90;
controls.target.set(0, 1, 0);
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(18, 30, 26);
scene.add(key, new THREE.HemisphereLight(0xfff4e6, 0x22140a, 0.6));

// Corte: tira a metade da frente (z > 0) para ver por dentro
const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
let cutOn = true;
const clipped: THREE.Material[] = [];
const caps: THREE.Mesh[] = [];
function cuttable(geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, capColor: number) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  clipped.push(mat);
  // faces de trás pintadas de cor sólida = parece um bloco cortado
  const capMat = new THREE.MeshBasicMaterial({ color: capColor, side: THREE.BackSide });
  clipped.push(capMat);
  const cap = new THREE.Mesh(geo, capMat);
  caps.push(cap);
  g.add(m, cap);
  return g;
}
function applyCut() {
  for (const m of clipped) { m.clippingPlanes = cutOn ? [cutPlane] : null; m.needsUpdate = true; }
  for (const c of caps) c.visible = cutOn;
}

// Perfil do rebordo (x do perfil = vestíbulo-lingual, y = altura em mm) extrudado ao longo do eixo X da cena
const LEN = 34;
function extrudeX(shape: THREE.Shape) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: LEN, bevelEnabled: false, curveSegments: 24 });
  g.rotateY(Math.PI / 2); // z -> x
  g.translate(-LEN / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}
const boneTop = (x: number) => 0.8 - 2.8 * (x / 5) ** 2;
function boneShape() {
  const s = new THREE.Shape();
  s.moveTo(-7, -21); s.lineTo(7, -21); s.lineTo(5, -2);
  for (let i = 1; i <= 40; i++) { const x = 5 - (10 * i) / 40; s.lineTo(x, boneTop(x)); }
  s.lineTo(-7, -21);
  return s;
}
function gumShape() {
  const s = new THREE.Shape();
  const top = (x: number) => 2.5 - 3.1 * (x / 5.9) ** 2;
  s.moveTo(-6.6, -6.5);
  s.lineTo(-5.9, top(-5.9));
  for (let i = 1; i <= 40; i++) { const x = -5.9 + (11.8 * i) / 40; s.lineTo(x, top(x)); }
  s.lineTo(6.6, -6.5);
  s.lineTo(5.48, -6.5); s.lineTo(5, -2);
  for (let i = 1; i <= 40; i++) { const x = 5 - (10 * i) / 40; s.lineTo(x, boneTop(x)); }
  s.lineTo(-5.48, -6.5);
  s.lineTo(-6.6, -6.5);
  return s;
}

// textura de osso (cortical clara + trabecular porosa) para as faces cortadas e a superfície
function boneTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const x = c.getContext("2d")!;
  x.fillStyle = "#e9d9b8"; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const r = 3 + Math.random() * 11;
    x.fillStyle = `rgba(${150 + Math.random() * 40},${105 + Math.random() * 30},${70 + Math.random() * 20},${0.25 + Math.random() * 0.35})`;
    x.beginPath(); x.ellipse(Math.random() * 512, Math.random() * 512, r, r * (0.5 + Math.random() * 0.6), Math.random() * 3, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.08, 0.08);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const boneMat = new THREE.MeshStandardMaterial({ color: 0xf2e6cc, roughness: 0.85, map: boneTexture() });
const bone = cuttable(extrudeX(boneShape()), boneMat, 0xc9a77e);
const gumMat = new THREE.MeshPhysicalMaterial({ color: 0xd9727a, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4, sheen: 0.4 });
const gum = cuttable(extrudeX(gumShape()), gumMat, 0xb44e5a);
scene.add(bone, gum);

// Dente (coroa + raiz) por torno, achatado para virar molar
function crownGeo() {
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [[0, 0], [2.6, 0], [3.4, 1.2], [3.9, 3.0], [3.8, 4.8], [3.2, 6.1], [2.2, 6.6], [1.2, 6.3], [0, 6.0]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(40), 48);
  // cúspides: ondula o topo
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
    if (Y > 4.5) { const a = Math.atan2(Z, X); p.setY(i, Y + 0.45 * Math.cos(4 * a) * ((Y - 4.5) / 2)); }
  }
  g.scale(1.08, 1, 0.95);
  g.computeVertexNormals();
  return g;
}
function rootGeo() {
  const g = new THREE.CylinderGeometry(2.5, 1.0, 13, 32, 1, true);
  g.translate(0, -6.5, 0);
  g.scale(1.1, 1, 0.9);
  return g;
}
const enamel = new THREE.MeshPhysicalMaterial({ color: 0xf7f2e6, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15 });
const rootMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 });
function tooth(x: number) {
  const g = new THREE.Group();
  const cr = cuttable(crownGeo(), enamel, 0xf3ead6); cr.position.y = 1.4;
  const rt = cuttable(rootGeo(), rootMat, 0xd9c49d); rt.position.y = 1.6;
  g.add(cr, rt); g.position.x = x;
  return g;
}
scene.add(tooth(-9), tooth(9));

// Implante planejado (fantasma)
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x46d4ff, transparent: true, opacity: 0.35, depthWrite: false });
function implantGeo() {
  const g = new THREE.Group();
  const prof: [number, number][] = [[0, -11], [0.9, -11], [1.45, -10.2], [1.75, -6], [2.0, -1], [2.05, 0.6], [1.6, 0.8], [0, 0.8]];
  const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48);
  const turns = 9, pts: THREE.Vector3[] = [];
  for (let i = 0; i <= turns * 40; i++) {
    const t = i / (turns * 40), y = -10.3 + t * 10.4, r = 1.45 + (2.0 - 1.45) * Math.min(1, (y + 10.3) / 9) + 0.18;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const thread = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 600, 0.24, 8, false);
  return { body, thread };
}
const IG = implantGeo();
const ghost = new THREE.Group();
ghost.add(new THREE.Mesh(IG.body, ghostMat), new THREE.Mesh(IG.thread, ghostMat));
const axisMat = new THREE.LineDashedMaterial({ color: 0x46d4ff, dashSize: 0.8, gapSize: 0.6, transparent: true });
const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -14, 0), new THREE.Vector3(0, 16, 0)]), axisMat);
axis.computeLineDistances();
scene.add(ghost, axis);

// Guia cirúrgica (resina translúcida) + anilha metálica
const guide = new THREE.Group();
const guideMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe9ff, roughness: 0.15, transmission: 0.55, thickness: 2, transparent: true, opacity: 0.7, clearcoat: 1 });
const slab = new THREE.Mesh(new RoundedBoxGeometry(27, 3.2, 10.5, 4, 1.2), guideMat);
slab.position.y = 7.6;
const wingL = new THREE.Mesh(new RoundedBoxGeometry(27, 4.6, 1.2, 3, 0.5), guideMat); wingL.position.set(0, 5.4, 4.9);
const wingR = wingL.clone(); wingR.position.z = -4.9;
const metal = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.22 });
const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.55, 4.4, 40, 1, true), metal);
sleeve.material = metal.clone(); (sleeve.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
sleeve.position.y = 7.6;
const sleeveRing = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.35, 12, 40), metal); sleeveRing.rotation.x = Math.PI / 2; sleeveRing.position.y = 9.8;
guide.add(slab, wingL, wingR, sleeve, sleeveRing);
scene.add(guide);

// Osteotomia (furo escuro que cresce com a broca)
const holeMat = new THREE.MeshBasicMaterial({ color: 0x3a1c12, side: THREE.DoubleSide });
clipped.push(holeMat);
const hole = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.6, 1, 32, 1, true), holeMat);
scene.add(hole);
function setHole(depth: number) { // depth: 0..1 (até -11)
  const top = 2.6, bot = 2.6 - 13.6 * depth;
  hole.visible = depth > 0.01;
  hole.scale.y = Math.max(0.01, top - bot);
  hole.position.y = (top + bot) / 2;
}

// Broca + cabeça do contra-ângulo
const drill = new THREE.Group();
const steel = new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 1, roughness: 0.28 });
const darkSteel = new THREE.MeshStandardMaterial({ color: 0x6f7780, metalness: 1, roughness: 0.35 });
const bit = new THREE.Group();
const core = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 20, 32), darkSteel); core.position.y = 10;
const tip = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.6, 32), darkSteel); tip.rotation.x = Math.PI; tip.position.y = -0.8;
bit.add(core, tip);
for (const off of [0, Math.PI]) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 120; i++) { const t = i / 120, a = off + t * Math.PI * 7; pts.push(new THREE.Vector3(Math.cos(a) * 1.5, t * 10.5, Math.sin(a) * 1.5)); }
  bit.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.22, 6, false), steel));
}
const stop = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.2, 32), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.3 })); stop.position.y = 19.8;
const shank = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 6, 24), steel); shank.position.y = 23;
bit.add(stop, shank);
const head = new THREE.Group();
const hp = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 4, 40), steel); hp.position.y = 27.5;
const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 18, 32), steel); neck.rotation.z = Math.PI / 2.4; neck.position.set(8.5, 31.5, 0);
head.add(hp, neck);
drill.add(bit, head);
scene.add(drill);

// Implante de verdade, pilar e coroa
const ti = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 1, roughness: 0.3 });
const implant = new THREE.Group();
implant.add(new THREE.Mesh(IG.body, ti), new THREE.Mesh(IG.thread, ti));
const goldTi = new THREE.MeshStandardMaterial({ color: 0xd8b56a, metalness: 1, roughness: 0.3 });
const abut = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.75, 4.2, 32), goldTi);
const crown = new THREE.Mesh(crownGeo(), enamel.clone()); // fora do corte: a coroa nova aparece inteira
scene.add(implant, abut, crown);

// ---------- Passos ----------
type Step = { t: [string, string]; d: [string, string]; dur: number; cam: [number, number, number]; tgt: [number, number, number]; labels: [string, string, THREE.Vector3][]; run: (p: number) => void };
const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const seg = (p: number, a: number, b: number) => ease((p - a) / (b - a));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function base(s: { ghost?: number; guide?: number; guideY?: number; hole?: number; drillY?: number | null; implY?: number | null; implRot?: number; abut?: number | null; crown?: number | null }) {
  ghost.visible = axis.visible = (s.ghost ?? 0) > 0.01;
  ghostMat.opacity = 0.35 * (s.ghost ?? 0); axisMat.opacity = s.ghost ?? 0;
  guide.visible = (s.guide ?? 0) > 0.01;
  guideMat.opacity = 0.7 * (s.guide ?? 0); guide.position.y = s.guideY ?? 0;
  setHole(s.hole ?? 0);
  drill.visible = s.drillY != null; if (s.drillY != null) drill.position.y = s.drillY;
  implant.visible = s.implY != null; if (s.implY != null) { implant.position.y = s.implY; implant.rotation.y = s.implRot ?? 0; }
  abut.visible = s.abut != null; if (s.abut != null) abut.position.y = 2.9 + s.abut;
  crown.visible = s.crown != null; if (s.crown != null) crown.position.y = 1.6 + s.crown;
}
const STEPS: Step[] = [
  { t: ["Planificación digital", "Digital planning"], d: ["Con la tomografía (CBCT) y el escaneo intraoral se define la posición ideal del implante: profundidad, ángulo y distancia a los dientes vecinos, antes de tocar al paciente.", "Using the CBCT scan and an intraoral scan, the ideal implant position is defined: depth, angle and distance to the neighboring teeth, before touching the patient."], dur: 3.2, cam: [24, 12, 40], tgt: [0, 0, 0],
    labels: [["Hueso", "Bone", V(-14, -12, 0)], ["Encía", "Gums", V(-14, 1.6, 0)], ["Diente vecino", "Neighbor tooth", V(9, 9.5, 0)], ["Implante planificado", "Planned implant", V(0, -4, 0)]],
    run: (p) => base({ ghost: 0.6 + 0.4 * Math.sin(p * Math.PI * 3) ** 2 }) },
  { t: ["Guía quirúrgica", "Surgical guide"], d: ["La guía impresa en 3D encaja sobre los dientes. El anillo metálico marca exactamente dónde y en qué ángulo va el implante.", "The 3D-printed guide fits over the teeth. Its metal sleeve marks exactly where and at what angle the implant goes."], dur: 2.4, cam: [26, 18, 36], tgt: [0, 4, 0],
    labels: [["Guía quirúrgica", "Surgical guide", V(-10, 11, 0)], ["Anillo guía", "Guide sleeve", V(0, 12.5, 0)]],
    run: (p) => base({ ghost: 1 - p * 0.6, guide: seg(p, 0, 0.4), guideY: 14 * (1 - seg(p, 0, 0.85)) }) },
  { t: ["Fresado guiado", "Guided drilling"], d: ["La fresa entra por el anillo de la guía: el lecho del implante queda en la posición planificada, con el tope controlando la profundidad.", "The drill goes through the guide sleeve: the implant bed matches the plan, and the stop controls the depth."], dur: 4.2, cam: [20, 10, 34], tgt: [0, 0, 0],
    labels: [["Fresa", "Drill", V(4, 18, 0)], ["Lecho del implante", "Implant bed", V(0, -6, 0)]],
    run: (p) => { const d = seg(p, 0.15, 0.8); base({ ghost: 0.25, guide: 1, hole: seg(p, 0.25, 0.8), drillY: 18 - 27.4 * d + 34 * seg(p, 0.86, 1) }); bit.rotation.y += 0.6; } },
  { t: ["Colocación del implante", "Implant placement"], d: ["El implante de titanio se enrosca a través de la guía hasta el nivel del hueso, en el mismo eje que fue planificado.", "The titanium implant is screwed in through the guide down to bone level, on the same axis that was planned."], dur: 4, cam: [18, 8, 32], tgt: [0, -2, 0],
    labels: [["Implante de titanio", "Titanium implant", V(4, -4, 0)]],
    run: (p) => { const q = seg(p, 0.05, 0.9); base({ ghost: 0, guide: 1, hole: 1, implY: 13 - 12.6 * q, implRot: q * Math.PI * 16 }); } },
  { t: ["Retiro de la guía", "Guide removal"], d: ["Se retira la guía. El implante queda exactamente donde se planificó, sin cortes grandes en la encía.", "The guide is removed. The implant sits exactly where it was planned, without large incisions in the gums."], dur: 2.2, cam: [22, 14, 36], tgt: [0, 0, 0],
    labels: [["Implante en posición", "Implant in position", V(3, -3, 0)]],
    run: (p) => base({ guide: 1 - seg(p, 0.3, 1), guideY: 16 * seg(p, 0, 1), hole: 1, implY: 0.4, implRot: 0 }) },
  { t: ["Pilar y corona", "Abutment and crown"], d: ["Después de la integración con el hueso, se coloca el pilar y la corona: el diente vuelve a verse y funcionar como natural.", "After the implant integrates with the bone, the abutment and the crown are placed: the tooth looks and works like a natural one again."], dur: 3.4, cam: [26, 12, 40], tgt: [0, 2, 0],
    labels: [["Corona", "Crown", V(0, 12, 0)], ["Pilar", "Abutment", V(4.5, 3.5, 0)], ["Implante", "Implant", V(4, -5, 0)]],
    run: (p) => base({ hole: 1, implY: 0.4, abut: 8 * (1 - seg(p, 0, 0.4)), crown: 10 * (1 - seg(p, 0.4, 0.9)) }) },
];

// ---------- Estado e UI ----------
let cur = 0, st = 0, playing = true, pauseUntil = 0, spinOn = false;
const camFrom = new THREE.Vector3(), camTo = new THREE.Vector3(), tgtFrom = new THREE.Vector3(), tgtTo = new THREE.Vector3();
let camT = 1;
function go(i: number) {
  cur = (i + STEPS.length) % STEPS.length; st = 0; pauseUntil = 0;
  camFrom.copy(camera.position); tgtFrom.copy(controls.target);
  camTo.set(...STEPS[cur].cam); tgtTo.set(...STEPS[cur].tgt); camT = 0;
  texts();
}
const labelsEl = $("labels");
function texts() {
  const s = STEPS[cur];
  $("num").textContent = `${cur + 1}/${STEPS.length}`;
  $("ttl").textContent = L(...s.t);
  $("txt").textContent = L(...s.d);
  $("sub").textContent = L("Cirugía de implante guiada · 3D", "Guided implant surgery · 3D");
  $("lng").textContent = lang === "es" ? "🌐 English" : "🌐 Español";
  $("cut").textContent = cutOn ? L("◐ Ver completo", "◐ Full view") : L("◑ Ver en corte", "◑ Cross-section");
  $("spin").textContent = spinOn ? L("⏸ Girar", "⏸ Rotate") : L("⟳ Girar", "⟳ Rotate");
  $("play").textContent = playing ? "❚❚" : "▶";
  $("demo").textContent = L("Demostración · PáginasPro", "Demo · PáginasPro");
  const wa = $<HTMLAnchorElement>("wa");
  wa.textContent = L("Quiero este 3D →", "I want this 3D →");
  wa.href = `https://wa.me/${BRUNO}?text=${encodeURIComponent(L("¡Hola! Vi la demostración del implante guiado en 3D y quiero saber más.", "Hi! I saw the guided implant 3D demo and I'd like to know more."))}`;
  document.documentElement.lang = lang;
  $("dots").innerHTML = STEPS.map((x, k) => `<button class="${k === cur ? "on" : k < cur ? "done" : ""}" data-k="${k}" aria-label="${L(...x.t)}"><i></i></button>`).join("");
  labelsEl.innerHTML = s.labels.map(([es, en]) => `<span class="lab">${lang === "en" ? en : es}</span>`).join("");
}
$("dots").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button"); if (b) go(+b.dataset.k!); });
$("prev").onclick = () => go(cur - 1);
$("next").onclick = () => go(cur + 1);
$("play").onclick = () => { playing = !playing; if (playing && st >= STEPS[cur].dur) go(cur + 1); texts(); };
$("lng").onclick = () => { lang = lang === "es" ? "en" : "es"; try { localStorage.setItem("impl_lang", lang); } catch { /* sem armazenamento */ } texts(); };
$("cut").onclick = () => { cutOn = !cutOn; applyCut(); texts(); };
$("spin").onclick = () => { spinOn = !spinOn; controls.autoRotate = spinOn; texts(); };
controls.autoRotateSpeed = 1.2;
controls.addEventListener("start", () => { camT = 1; });

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // no celular em pé, afasta a câmera para caber na largura
  const portrait = w < h;
  camera.zoom = portrait ? 0.46 : 0.9;
  // a cena sobe um pouco para não ficar atrás do cartão de baixo
  if (portrait) camera.setViewOffset(w, h, 0, h * 0.16, w, h);
  else camera.setViewOffset(w, h, w > 900 ? w * 0.12 : 0, h * 0.04, w, h);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
applyCut();
go(Math.max(0, Math.min(STEPS.length - 1, (parseInt(qs.get("paso") || "1", 10) || 1) - 1)));

const tmp = new THREE.Vector3();
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const s = STEPS[cur];
  if (playing || st < s.dur) st = Math.min(s.dur, st + dt);
  s.run(st / s.dur);
  if (playing && st >= s.dur) {
    if (!pauseUntil) pauseUntil = now + (cur === STEPS.length - 1 ? 4000 : 1400);
    else if (now > pauseUntil) { pauseUntil = 0; go(cur + 1); }
  }
  if (camT < 1) {
    camT = Math.min(1, camT + dt / 1.3); const k = ease(camT);
    camera.position.lerpVectors(camFrom, camTo, k); controls.target.lerpVectors(tgtFrom, tgtTo, k);
  }
  controls.update();
  renderer.render(scene, camera);
  // etiquetas
  const kids = labelsEl.children;
  s.labels.forEach((l, i) => {
    const el = kids[i] as HTMLElement; if (!el) return;
    tmp.copy(l[2]).project(camera);
    const vis = tmp.z < 1 && st > 0.4;
    el.style.opacity = vis ? "1" : "0";
    el.style.transform = `translate(-50%,-50%) translate(${(tmp.x * 0.5 + 0.5) * innerWidth}px,${(-tmp.y * 0.5 + 0.5) * innerHeight}px)`;
  });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
