// Prédio 3D (PáginasPro): /predio/<slug>. Primeiro caso: Residencial Serrano (Sobradinho, demonstração).
// Vistas: o prédio por fora; a garagem do subsolo (feita pelas fotos e pelo mapa de vagas), onde a pessoa diz o
// apartamento (ou toca na vaga), vê o carro na rua, um bonequinho vai até ele e dirige em primeira pessoa,
// desce a rampa, passa a vaga e estaciona de ré sem encostar nos vizinhos (câmera de ré e sensor com bipe);
// e o sorteio de vagas do síndico (lottery.ts), cujo resultado vira o mapa da garagem.
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildExterior, PILOTIS, FLOOR, FLOORS } from "./building";
import { buildGarage, GY, CEIL, GATE_X, WALL, type Spot, type Box } from "./garage";
import { CAR_COLORS, CAR_TYPES, makeCar, setInside, type Car, type CarType } from "./car";
import { planPark, Track, gap, headingOf, type Plan } from "./park";
import { currentDraw, fmt, renderLottery, type Draw } from "./lottery";

const WHATSAPP = "5561992372216";
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const pad = (n: number) => String(n).padStart(2, "0");
type View = "predio" | "garagem" | "sorteio";
type Phase = "idle" | "show" | "walk" | "enter" | "fwd" | "pause" | "rev" | "done";

$("app").innerHTML = `
<div class="b3-canvas" id="canvas"></div>
<header class="b3-top">
  <div class="b3-brand"><small>Sobradinho · DF</small><b>Residencial Serrano</b></div>
  <a class="b3-demo" href="https://paginaspro.app.br/inicio" target="_blank" rel="noopener">Demonstração<small>PáginasPro</small></a>
</header>
<div class="b3-seg" id="seg"><button data-v="predio" class="on">🏢 Prédio</button><button data-v="garagem">🚗 Garagem</button><button data-v="sorteio">🎲 Sorteio</button></div>
<div class="b3-toast" id="toast" hidden></div>
<div class="b3-hud" id="hud" hidden>
  <div class="b3-gear" id="gear">D</div>
  <button id="camBtn">👁 Ver de fora</button>
  <button id="sndBtn">🔊</button>
</div>
<div class="b3-pip" id="pip" hidden>
  <svg viewBox="0 0 100 75" preserveAspectRatio="none"><path d="M18 75 L34 30 M82 75 L66 30" stroke="#ffd23f" stroke-width="1.2" fill="none"/>
  <path d="M14 75 L22 62 M86 75 L78 62" stroke="#ff4d4d" stroke-width="1.6"/><path d="M22 62 L78 62" stroke="#ff4d4d" stroke-width="1" stroke-dasharray="3 2"/>
  <path d="M27 48 L73 48" stroke="#ffd23f" stroke-width="0.8" stroke-dasharray="3 2"/><path d="M32 35 L68 35" stroke="#3fe07a" stroke-width="0.8" stroke-dasharray="3 2"/></svg>
  <span class="b3-pip-t">CÂMERA DE RÉ</span>
  <div class="b3-sensor" id="sensor"><i></i><i></i><i></i><i></i><b id="dist"></b></div>
</div>
<section class="b3-sheet" id="sheet"></section>
<section class="b3-panel" id="panel" hidden></section>
<div class="b3-load" id="load"><span>Montando o prédio…</span></div>
`;

// ---------- cena
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$("canvas").appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
function sky() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#2f7fd6");
  g.addColorStop(0.55, "#8ec3ef");
  g.addColorStop(1, "#e6f1f8");
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const skyTex = sky();
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 400);
const rearCam = new THREE.PerspectiveCamera(100, 4 / 3, 0.05, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.maxPolarAngle = Math.PI * 0.49;
controls.addEventListener("start", () => {
  fly = null;
  if (phase !== "show") controls.autoRotate = false;
});

const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
sun.position.set(-30, 45, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5c6b4a, 0.9);
scene.add(sun, hemi);

const garage = buildGarage();
scene.add(garage.group);
const exterior = buildExterior(garage.rampOutline());
scene.add(exterior);
// lâmpadas do subsolo (poucas luzes de verdade; os tubos do teto brilham sozinhos)
for (const x of [-14, -4, 6, 16]) {
  const l = new THREE.PointLight(0xf2f6ff, 14, 15, 1.3);
  l.position.set(x, CEIL - 0.4, 0);
  garage.group.add(l);
}
const tmp = new THREE.Vector3();
const toWorld = (x: number, z: number, y = 0) => new THREE.Vector3(x, GY + y, z);

// ---------- mapa de vagas e carros dos vizinhos (estacionados de ré, de frente para o corredor)
let draw: Draw = currentDraw();
const aptOf = (n: number) => draw.map[n];
let neighbors: { n: number; car: Car; box: Box }[] = [];
function seeded(n: number) {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}
function placeNeighbors(except: number | null) {
  for (const nb of neighbors) garage.group.remove(nb.car);
  neighbors = [];
  for (const sp of garage.spots) {
    if (sp.motos || sp.n === except) continue;
    if (!aptOf(sp.n) || seeded(sp.n) < 0.12) continue; // vaga sem dono ou o vizinho saiu de carro
    const t = CAR_TYPES[Math.floor(seeded(sp.n + 7) * 4)].id;
    const c = CAR_COLORS[Math.floor(seeded(sp.n + 3) * CAR_COLORS.length)].hex;
    const car = makeCar(t, c);
    const L = car.userData.L;
    const x = sp.x + (seeded(sp.n + 11) - 0.5) * 0.1, z = sp.side * (WALL - 0.3 - L / 2 - seeded(sp.n + 5) * 0.12);
    const ang = (sp.side > 0 ? Math.PI : 0) + (seeded(sp.n + 17) - 0.5) * 0.05;
    car.position.set(x, 0, z);
    car.rotation.y = ang;
    garage.group.add(car);
    neighbors.push({ n: sp.n, car, box: { x, z, hw: car.userData.W / 2 + 0.04, hd: L / 2 + 0.03, ang } });
  }
}

// ---------- bonequinho que vai até o carro
function makePerson() {
  const p = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc58c64, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), shirt);
  torso.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
  head.position.y = 1.65;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a1c12 }));
  hair.position.y = 1.67;
  p.add(torso, head, hair);
  const limbs: THREE.Object3D[] = [];
  for (const sd of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sd * 0.1, 0.86, 0);
    const lm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.68, 4, 8), pants);
    lm.position.y = -0.42;
    leg.add(lm);
    const arm = new THREE.Group();
    arm.position.set(sd * 0.26, 1.42, 0);
    const am = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 4, 8), shirt);
    am.position.y = -0.3;
    arm.add(am);
    p.add(leg, arm);
    limbs.push(leg, arm);
  }
  p.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  p.userData.limbs = limbs;
  return p;
}
const person = makePerson();
person.visible = false;
scene.add(person);

// ---------- estado
let view: View = "predio";
let phase: Phase = "idle";
let carType: CarType = "suv";
let carColor = CAR_COLORS[1].hex;
let chosen: Spot | null = null;
let myCar: Car | null = null;
let fly: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
let camMode: "fp" | "fora" = "fp";
let sound = true;
let plan: Plan | null = null;
let fwdTrack: Track | null = null, revTrack: Track | null = null;
let s = 0, pauseT = 0, walkT = 0, enterT = 0, steer = 0, lookYaw = 0, minDist = 9;
let walkTrack: Track | null = null;
let aptMsg = "";
const SHOW = new THREE.Vector3(5.5, 0, 23.6); // o carro parado na rua, na frente do prédio

function toast(msg: string, ms = 2600) {
  $("toast").textContent = msg;
  $("toast").hidden = false;
  clearTimeout((toast as unknown as { t: number }).t);
  (toast as unknown as { t: number }).t = window.setTimeout(() => ($("toast").hidden = true), ms);
}
const portrait = () => innerHeight > innerWidth;

function homeView() {
  if (view === "predio") {
    const d = portrait() ? 104 : 58;
    const t = new THREE.Vector3(0, portrait() ? 2 : PILOTIS + (FLOORS * FLOOR) / 2 - 3, 0);
    fly = { pos: new THREE.Vector3(-0.55 * d, 0.3 * d, 0.78 * d).add(t), target: t };
  } else if (portrait()) {
    // celular em pé: a garagem comprida na vertical (rampa no alto)
    const t = toWorld(1, 2.5);
    fly = { pos: new THREE.Vector3(-34, 88, 0).add(t), target: t };
  } else fly = { pos: toWorld(3, 26, 36), target: toWorld(2, 1) };
}

function setScene(outside: boolean) {
  exterior.visible = outside;
  scene.background = outside ? skyTex : new THREE.Color(0x1d2228);
  scene.fog = outside ? new THREE.Fog(0xdcebf6, 90, 220) : null;
}

function setView(v: View) {
  if (phase !== "idle" && phase !== "done" && phase !== "show") return;
  if (phase === "show") endShow();
  view = v;
  document.querySelectorAll<HTMLButtonElement>("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  $("panel").hidden = v !== "sorteio";
  $("sheet").hidden = v === "sorteio";
  if (v === "sorteio") {
    renderLottery($("panel"), (d) => {
      draw = d;
      chosen = null;
      aptMsg = "";
      clearMyCar();
      placeNeighbors(null);
      setView("garagem");
      toast(`Mapa ${fmt(d.from)} a ${fmt(d.to)} na garagem`);
    });
    return;
  }
  setScene(v === "predio");
  controls.autoRotate = v === "predio";
  controls.autoRotateSpeed = 0.6;
  controls.minDistance = v === "predio" ? 25 : 6;
  controls.maxDistance = v === "predio" ? 140 : 110;
  homeView();
  renderSheet();
}

// ---------- painel de baixo
function spotLabel(n: number) {
  const a = aptOf(n);
  return n === 1 ? "motos" : a ? `apto ${a}` : "livre";
}
function renderSheet() {
  const sh = $("sheet");
  if (view === "predio") {
    sh.classList.remove("min");
    sh.innerHTML = `<div class="b3-row"><div><small>Vista do prédio</small><b>Arraste para girar · pinça para aproximar</b></div></div>
      <button class="b3-big" id="goGarage">🚗 Estacionar na minha vaga</button>
      <a class="b3-wa" target="_blank" rel="noopener" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Olá, Bruno! Vi a demonstração 3D do Residencial Serrano e quero um 3D do meu empreendimento.")}">Quero um 3D assim do meu empreendimento</a>
      <p class="b3-legal">Demonstração ilustrativa feita a partir de imagens públicas de divulgação. Não é material oficial do empreendimento.</p>`;
    $("goGarage").onclick = () => setView("garagem");
    return;
  }
  if (phase === "show") {
    sh.classList.remove("min");
    sh.innerHTML = `
      <div class="b3-step"><i>2</i><b>Seu carro</b><small>vaga ${pad(chosen!.n)}</small></div>
      <div class="b3-types">${CAR_TYPES.map((t) => `<button data-t="${t.id}" class="${t.id === carType ? "on" : ""}"><span>${t.icon}</span>${t.name}</button>`).join("")}</div>
      <div class="b3-colors">${CAR_COLORS.map((c) => `<button data-c="${c.hex}" title="${c.name}" class="${c.hex === carColor ? "on" : ""}" style="background:#${c.hex.toString(16).padStart(6, "0")}"></button>`).join("")}</div>
      <button class="b3-big" id="go">🚶 Entrar no carro e estacionar</button>
      <button class="b3-link" id="back">← Trocar a vaga</button>`;
    sh.querySelectorAll<HTMLButtonElement>("[data-t]").forEach((b) => (b.onclick = () => {
      carType = b.dataset.t as CarType;
      spawnShowCar();
      renderSheet();
    }));
    sh.querySelectorAll<HTMLButtonElement>("[data-c]").forEach((b) => (b.onclick = () => {
      carColor = Number(b.dataset.c);
      spawnShowCar();
      renderSheet();
    }));
    $("go").onclick = startWalk;
    $("back").onclick = () => setView("garagem");
    return;
  }
  if (phase !== "idle" && phase !== "done") {
    sh.classList.add("min");
    sh.innerHTML = `<p class="b3-drive">${phase === "rev" || phase === "pause" ? `Entrando de ré na vaga <b>${pad(chosen!.n)}</b>…` : phase === "walk" || phase === "enter" ? "Indo até o carro…" : `Indo para a vaga <b>${pad(chosen!.n)}</b>…`}</p>`;
    return;
  }
  sh.classList.remove("min");
  const done = phase === "done" && chosen;
  sh.innerHTML = `
    ${done ? `<p class="b3-done">✓ Estacionado de ré na vaga <b>${pad(chosen!.n)}</b> sem encostar em nada · menor distância ${Math.max(0.05, minDist).toFixed(2).replace(".", ",")} m.</p>
      <div class="b3-two"><button class="b3-big" id="again">↺ Ver de novo</button><button class="b3-big alt" id="other">Outra vaga</button></div>` : `
    <div class="b3-step"><i>1</i><b>Sua vaga</b><small>mapa ${fmt(draw.from)} a ${fmt(draw.to)}</small></div>
    <form class="b3-apto" id="aptoForm"><input id="apto" inputmode="numeric" maxlength="3" placeholder="Nº do apto (ex.: 402)"><button>Achar</button></form>
    ${aptMsg ? `<p class="b3-msg">${aptMsg}</p>` : ""}
    <div class="b3-spots">${[...garage.spots].sort((a, b) => a.n - b.n).map((sp) => `<button data-s="${sp.n}" class="${chosen === sp ? "on" : ""} ${sp.motos ? "taken" : ""}" title="${spotLabel(sp.n)}">${pad(sp.n)}${sp.pcd ? "♿" : ""}<small>${sp.motos ? "motos" : aptOf(sp.n) ?? "—"}</small></button>`).join("")}</div>
    <button class="b3-big" id="next" ${chosen ? "" : "disabled"}>${chosen ? `Escolher o carro → vaga ${pad(chosen.n)}` : "Diga o apto ou toque na vaga"}</button>`}`;
  if (done) {
    $("again").onclick = () => {
      phase = "idle";
      startShow();
    };
    $("other").onclick = () => {
      phase = "idle";
      chosen = null;
      aptMsg = "";
      clearMyCar();
      placeNeighbors(null);
      homeView();
      renderSheet();
    };
    return;
  }
  $<HTMLFormElement>("aptoForm").onsubmit = (e) => {
    e.preventDefault();
    const a = $<HTMLInputElement>("apto").value.trim();
    const n = Object.keys(draw.map).map(Number).find((k) => draw.map[k] === a);
    if (n) {
      aptMsg = `Apto <b>${a}</b> → vaga <b>${pad(n)}</b>`;
      choose(garage.spots.find((sp) => sp.n === n)!);
    } else {
      const w = draw.waiting.indexOf(a);
      aptMsg = !/^[1-6]0[1-8]$/.test(a) ? "Apto não encontrado (101 a 608)." : w >= 0 ? `O apto <b>${a}</b> está em <b>${w + 1}º</b> na lista de espera deste mapa. Toque numa vaga para testar mesmo assim.` : `O apto <b>${a}</b> ficou sem vaga neste mapa. Toque numa vaga para testar mesmo assim.`;
      renderSheet();
    }
  };
  sh.querySelectorAll<HTMLButtonElement>("[data-s]").forEach((b) => (b.onclick = () => {
    const sp = garage.spots.find((o) => o.n === Number(b.dataset.s))!;
    if (!sp.motos) aptMsg = `Vaga <b>${pad(sp.n)}</b> · ${spotLabel(sp.n)}`;
    choose(sp);
  }));
  $<HTMLButtonElement>("next").onclick = startShow;
}

function choose(sp: Spot) {
  if (phase !== "idle" && phase !== "done") return;
  if (sp.motos) return toast("A vaga 01 é das motos");
  phase = "idle";
  chosen = sp;
  clearMyCar();
  placeNeighbors(sp.n);
  for (const o of garage.spots) (o.mesh.material as THREE.MeshBasicMaterial).opacity = o === sp ? 0.45 : 0;
  const t = toWorld(sp.x, sp.z * 0.6);
  fly = { pos: t.clone().add(portrait() ? new THREE.Vector3(-10, 34, 0) : new THREE.Vector3(0, 18, -sp.side * 14)), target: t };
  renderSheet();
}

function clearMyCar() {
  if (myCar) myCar.parent?.remove(myCar);
  myCar = null;
}

// ---------- 1) o carro na rua
function spawnShowCar() {
  clearMyCar();
  myCar = makeCar(carType, carColor);
  myCar.position.copy(SHOW);
  myCar.rotation.y = Math.PI / 2; // virado para +x (para a rampa)
  scene.add(myCar);
}
function startShow() {
  if (!chosen) return;
  phase = "show";
  setScene(true);
  spawnShowCar();
  person.visible = false;
  controls.enabled = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;
  controls.minDistance = 4;
  controls.maxDistance = 30;
  // corte direto para a rua (sem voar de dentro da garagem)
  fly = null;
  camera.position.copy(SHOW).add(tmp.set(portrait() ? -6.5 : -5.5, portrait() ? 3.2 : 2.4, portrait() ? 8 : 6));
  controls.target.copy(SHOW).setY(portrait() ? 0.2 : 0.7);
  renderSheet();
}
function endShow() {
  phase = "idle";
  clearMyCar();
  controls.autoRotateSpeed = 0.6;
}

// ---------- 2) o bonequinho anda até a porta do motorista (lado da calçada)
function startWalk() {
  if (!myCar || !chosen) return;
  audio();
  phase = "walk";
  controls.autoRotate = false;
  controls.enabled = false;
  person.visible = true;
  const door = SHOW.clone().add(new THREE.Vector3(0.25, 0, -1.25));
  walkTrack = new Track([new THREE.Vector3(5.5, 0, 9.5), new THREE.Vector3(5.5, 0, 17.6), new THREE.Vector3(5.5, 0, 19.6), new THREE.Vector3(door.x - 0.6, 0, 21.4), door]);
  walkT = 0;
  // planeja a manobra já com os vizinhos no lugar
  const obstacles = [...garage.obstacles, ...neighbors.map((n) => n.box)];
  plan = planPark(chosen, { W: myCar.userData.W, L: myCar.userData.L }, obstacles, { x: GATE_X - 0.4, z: 0 });
  // percurso de ida: rua → curva → rampa (descendo) → portão → corredor → para depois da vaga
  const street = new THREE.CubicBezierCurve3(SHOW.clone(), new THREE.Vector3(19, 0, 23.6), new THREE.Vector3(26.5, 0, 23.6), new THREE.Vector3(26.5, 0, 18.6));
  const ramp = garage.ramp.getSpacedPoints(80).map((p) => p.clone().setY(p.y + GY)).reverse();
  const pts = [...street.getSpacedPoints(60), ...ramp.slice(1), ...plan.approach.map((p) => toWorld(p.x, p.z)).slice(1)];
  fwdTrack = new Track(dedupe(pts));
  revTrack = new Track(dedupe(plan.reverse.map((p) => toWorld(p.x, p.z))));
  minDist = 9;
  renderSheet();
}
function dedupe(pts: THREE.Vector3[]) {
  return pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.02);
}

// ---------- sons: motor, bipe do sensor
let ac: AudioContext | null = null, engine: OscillatorNode | null = null, engGain: GainNode | null = null, beepAt = 0;
function audio() {
  if (ac) return void ac.resume();
  try {
    ac = new AudioContext();
    engine = ac.createOscillator();
    engine.type = "sawtooth";
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    engGain = ac.createGain();
    engGain.gain.value = 0;
    engine.connect(f).connect(engGain).connect(ac.destination);
    engine.start();
  } catch {
    ac = null;
  }
}
function beep(len = 0.07) {
  if (!ac || !sound) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.value = 2350;
  o.type = "square";
  g.gain.setValueAtTime(0.0001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + len);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + len + 0.02);
}

// ---------- HUD
$("camBtn").onclick = () => {
  camMode = camMode === "fp" ? "fora" : "fp";
  $("camBtn").textContent = camMode === "fp" ? "👁 Ver de fora" : "🧑‍✈️ Ver de dentro";
};
$("sndBtn").onclick = () => {
  sound = !sound;
  $("sndBtn").textContent = sound ? "🔊" : "🔇";
  if (engGain) engGain.gain.value = 0;
};

// ---------- toque na vaga do desenho
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down: { x: number; y: number } | null = null;
renderer.domElement.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || view !== "garagem" || (phase !== "idle" && phase !== "done") || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(garage.spots.map((sp) => sp.mesh))[0];
  if (hit) {
    const sp = garage.spots.find((o) => o.mesh === hit.object)!;
    aptMsg = sp.motos ? "" : `Vaga <b>${pad(sp.n)}</b> · ${spotLabel(sp.n)}`;
    choose(sp);
  }
});
document.querySelectorAll<HTMLButtonElement>("#seg button").forEach((b) => (b.onclick = () => setView(b.dataset.v as View)));

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
placeNeighbors(null);
const q = new URLSearchParams(location.search);
homeView();
camera.position.copy(fly!.pos);
controls.target.copy(fly!.target);
setView(q.get("ver") === "sorteio" ? "sorteio" : q.get("ver") === "garagem" || q.has("mapa") ? "garagem" : "predio");
if (q.has("mapa")) toast(`Mapa de vagas ${fmt(draw.from)} a ${fmt(draw.to)}`, 3500);
$("load").hidden = true;

// ---------- laço
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), camWant = new THREE.Vector3(), look = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
const myBox: Box = { x: 0, z: 0, hw: 0, hd: 0, ang: 0 };

function driveCar(track: Track, ds: number, reverse: boolean, dt: number) {
  const car = myCar!;
  const prevTh = car.rotation.y;
  s = Math.min(track.len, s + ds);
  track.at(s, p0);
  car.position.copy(p0);
  if (!reverse) {
    track.at(Math.min(track.len, s + 0.9), p1);
    if (p1.distanceToSquared(p0) > 1e-5) car.lookAt(p1.x, p1.y, p1.z);
  } else {
    // de ré a frente aponta para trás do caminho
    track.at(Math.max(0, s - 0.5), p1);
    if (p1.distanceToSquared(p0) > 1e-5) car.rotation.set(0, headingOf(p1.x - p0.x, p1.z - p0.z), 0);
  }
  // volante pelo quanto o carro virou (modelo da bicicleta), rodas giram
  let dth = car.rotation.y - prevTh;
  dth = Math.atan2(Math.sin(dth), Math.cos(dth));
  const want = ds > 1e-4 ? THREE.MathUtils.clamp(Math.atan(((reverse ? -1 : 1) * car.userData.base * dth) / ds), -0.6, 0.6) : steer;
  steer = THREE.MathUtils.lerp(steer, want, 1 - Math.exp(-dt * 8));
  for (const f of car.userData.front) f.rotation.y = steer;
  car.userData.wheel.rotation.z = -steer * 7;
  for (const w of car.userData.wheels) w.rotation.x += ((reverse ? -1 : 1) * ds) / car.userData.r;
}

function chase(dt: number, reverse: boolean) {
  const car = myCar!;
  car.getWorldDirection(fwd);
  const inside = camMode === "fp";
  setInside(car, inside);
  camera.fov = THREE.MathUtils.lerp(camera.fov, inside ? (portrait() ? 76 : 62) : 50, 0.1);
  camera.updateProjectionMatrix();
  if (inside) {
    // olho do motorista; de ré, vira a cabeça e olha por cima do ombro direito
    lookYaw = THREE.MathUtils.lerp(lookYaw, reverse ? -2.55 : 0, 1 - Math.exp(-dt * 2.5));
    camera.position.copy(car.localToWorld(tmp.copy(car.userData.eye)));
    const e = car.userData.eye;
    look.set(e.x + Math.sin(lookYaw) * 4, e.y - 0.22, e.z + Math.cos(lookYaw) * 4);
    camera.lookAt(car.localToWorld(look));
  } else {
    if (reverse) camWant.copy(car.position).addScaledVector(fwd, 6.5).add(tmp.set(0, 6.5, 0));
    else camWant.copy(car.position).addScaledVector(fwd, -7.5).add(tmp.set(0, 3.6, 0));
    // dentro da garagem a câmera não passa do teto
    if (car.position.y < -1) camWant.y = Math.min(camWant.y, GY + CEIL - 0.25);
    camera.position.lerp(camWant, 1 - Math.exp(-dt * 3));
    camera.lookAt(car.position.x, car.position.y + 0.8, car.position.z);
  }
}

function sensor(dt: number) {
  const car = myCar!;
  myBox.x = car.position.x;
  myBox.z = car.position.z;
  myBox.hw = car.userData.W / 2;
  myBox.hd = car.userData.L / 2;
  myBox.ang = car.rotation.y;
  let d = 9;
  for (const o of garage.obstacles) if (Math.abs(o.x - myBox.x) < 9 || o.hw > 6) d = Math.min(d, gap(myBox, o));
  for (const n of neighbors) d = Math.min(d, gap(myBox, n.box));
  minDist = Math.min(minDist, d);
  const lv = d < 0.3 ? 4 : d < 0.6 ? 3 : d < 1 ? 2 : d < 1.5 ? 1 : 0;
  $("sensor").dataset.lv = String(lv);
  $("dist").textContent = d < 2 ? `${Math.max(0.05, d).toFixed(2).replace(".", ",")} m` : "";
  beepAt -= dt;
  if (lv && beepAt <= 0) {
    beep(lv === 4 ? 0.18 : 0.07);
    beepAt = lv === 4 ? 0.2 : lv === 3 ? 0.22 : lv === 2 ? 0.4 : 0.65;
  }
}

function finish() {
  const car = myCar!;
  phase = "done";
  setScene(false);
  if (engGain) engGain.gain.value = 0;
  for (const f of car.userData.front) f.rotation.y = 0;
  setInside(car, false);
  $("hud").hidden = true;
  $("pip").hidden = true;
  controls.enabled = true;
  camera.fov = 42;
  camera.updateProjectionMatrix();
  garage.gate.position.z = 0;
  toast(`Estacionado de ré na vaga ${pad(chosen!.n)} ✓`, 3200);
  const t = car.position.clone().setY(GY);
  fly = { pos: t.clone().add(new THREE.Vector3(-5, 10.5, -chosen!.side * 9)), target: t };
  controls.target.copy(camera.position).add(camera.getWorldDirection(tmp).multiplyScalar(4));
  for (const o of garage.spots) (o.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
  renderSheet();
}

// ?tm=8 acelera o tempo (teste no robô, que desenha poucos quadros por segundo)
const TM = Math.min(20, Number(q.get("tm")) || 1);
if (q.has("debug"))
  Object.assign(window, {
    __b3: {
      phase: () => phase,
      plan: () => plan,
      minDist: () => minDist,
      // folga da manobra em cada vaga com cada tipo de carro
      all: () =>
        garage.spots.filter((sp) => !sp.motos).map((sp) => {
          placeNeighbors(sp.n);
          return [sp.n, ...CAR_TYPES.map((t) => {
            const c = makeCar(t.id, 0);
            const t0 = performance.now();
            const pl = planPark(sp, { W: c.userData.W, L: c.userData.L }, [...garage.obstacles, ...neighbors.map((n) => n.box)], { x: GATE_X - 0.4, z: 0 });
            return `${pl.clear.toFixed(2)}/${Math.round(performance.now() - t0)}ms`;
          })].join(" ");
        }),
    },
  });
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05) * TM;
  if (view === "sorteio") return;
  let driving = false;

  if (phase === "walk" && walkTrack) {
    walkT = Math.min(walkTrack.len, walkT + dt * 1.9);
    walkTrack.at(walkT, p0);
    walkTrack.at(Math.min(walkTrack.len, walkT + 0.3), p1);
    person.position.copy(p0);
    if (p1.distanceToSquared(p0) > 1e-5) person.lookAt(p1.x, 0, p1.z);
    const sw = Math.sin(walkT * 5.2) * 0.55;
    (person.userData.limbs as THREE.Object3D[]).forEach((l, i) => (l.rotation.x = (i < 2 ? 1 : -1) * (i % 2 ? -sw * 0.8 : sw)));
    camWant.copy(p0).add(tmp.set(-4.5, 2.6, 4.8));
    camera.position.lerp(camWant, 1 - Math.exp(-dt * 2.5));
    camera.lookAt(p0.x, 1.1, p0.z);
    driving = true;
    if (walkT >= walkTrack.len) {
      phase = "enter";
      enterT = 0;
    }
  } else if (phase === "enter" && myCar) {
    // entra no carro: o bonequinho some e a câmera vai para o banco do motorista
    enterT += dt;
    person.scale.setScalar(Math.max(0.01, 1 - enterT * 2));
    const eyeW = myCar.localToWorld(tmp.copy(myCar.userData.eye));
    camera.position.lerp(camMode === "fp" ? eyeW : myCar.position.clone().add(new THREE.Vector3(-7.5, 3.6, 0)), 1 - Math.exp(-dt * 3));
    camera.lookAt(myCar.localToWorld(look.set(0.37, 0.8, 5)));
    driving = true;
    if (enterT > 1.3) {
      person.visible = false;
      person.scale.setScalar(1);
      phase = "fwd";
      s = 0;
      steer = 0;
      lookYaw = 0;
      $("hud").hidden = false;
      $("gear").textContent = "D";
      renderSheet();
    }
  } else if (phase === "fwd" && myCar && fwdTrack) {
    const left = fwdTrack.len - s;
    const onRamp = myCar.position.y < -0.05 && myCar.position.y > GY + 0.05;
    const v = Math.min(onRamp ? 2.6 : 4.2, 0.8 + s * 1.2, 0.25 + left * 0.75);
    driveCar(fwdTrack, v * dt, false, dt);
    chase(dt, false);
    // portão de grades abre quando o carro chega perto
    const gd = myCar.position.distanceTo(toWorld(GATE_X, 0));
    garage.gate.position.z = THREE.MathUtils.lerp(garage.gate.position.z, gd < 12 ? -6.2 : 0, 1 - Math.exp(-dt * 1.5));
    if (engGain && sound) engGain.gain.value = 0.025;
    if (engine) engine.frequency.value = 38 + v * 9;
    driving = true;
    if (s >= fwdTrack.len - 1e-3) {
      phase = "pause";
      pauseT = 0;
      $("gear").textContent = "R";
      renderSheet();
    }
  } else if (phase === "pause" && myCar) {
    pauseT += dt;
    chase(dt, pauseT > 0.4);
    if (pauseT > 0.6) $("pip").hidden = false;
    driving = true;
    if (pauseT > 1.2) {
      phase = "rev";
      s = 0;
    }
  } else if (phase === "rev" && myCar && revTrack) {
    const left = revTrack.len - s;
    const v = Math.min(1.15, 0.35 + s * 0.8, 0.1 + left * 0.55);
    driveCar(revTrack, v * dt, true, dt);
    chase(dt, true);
    sensor(dt);
    if (engine) engine.frequency.value = 36 + v * 6;
    garage.gate.position.z = THREE.MathUtils.lerp(garage.gate.position.z, 0, 1 - Math.exp(-dt * 1.2));
    driving = true;
    if (s >= revTrack.len - 1e-3) finish();
  }

  if (!driving && fly) {
    const k = 1 - Math.exp(-dt * 3);
    camera.position.lerp(fly.pos, k);
    controls.target.lerp(fly.target, k);
    if (camera.position.distanceTo(fly.pos) < 0.05) fly = null;
  }
    if (!driving) controls.update();
  // teto do subsolo só aparece quando a câmera está embaixo dele
  garage.ceiling.visible = camera.position.y < GY + CEIL;
  // embaixo da terra o sol não ilumina: fica a luz das lâmpadas
  hemi.intensity = camera.position.y < -0.2 && exterior.visible ? 0.55 : 0.9;

  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setScissorTest(false);
  renderer.render(scene, camera);
  // câmera de ré no canto da tela
  if (myCar && (phase === "rev" || (phase === "pause" && pauseT > 0.6))) {
    const r = $("pip").getBoundingClientRect();
    const L = myCar.userData.L;
    rearCam.position.copy(myCar.localToWorld(tmp.set(0, 1.0, -L / 2 + 0.05)));
    rearCam.lookAt(myCar.localToWorld(look.set(0, -0.2, -L / 2 - 3)));
    rearCam.aspect = r.width / r.height;
    rearCam.updateProjectionMatrix();
    const cab = myCar.userData.cabin.visible;
    setInside(myCar, false);
    renderer.setScissorTest(true);
    renderer.setScissor(r.left, innerHeight - r.bottom, r.width, r.height);
    renderer.setViewport(r.left, innerHeight - r.bottom, r.width, r.height);
    renderer.render(scene, rearCam);
    renderer.setScissorTest(false);
    setInside(myCar, cab);
  }
});
