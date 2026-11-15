// Prédio 3D (PáginasPro): /predio/<slug>. Primeiro caso: Residencial Serrano (Sobradinho, demonstração).
// Duas vistas: o prédio por fora e a garagem do subsolo, onde a pessoa escolhe o carro (tipo e cor) e a vaga
// e o carro desce a rampa, anda pelo corredor e estaciona na vaga escolhida.
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildExterior, PILOTIS, FLOOR, FLOORS } from "./building";
import { buildGarage, pathTo, RAMP_TOP, type Spot } from "./garage";
import { CAR_COLORS, CAR_TYPES, makeCar, type Car, type CarType } from "./car";

const WHATSAPP = "5561992372216";
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
type View = "predio" | "garagem";

$("app").innerHTML = `
<div class="b3-canvas" id="canvas"></div>
<header class="b3-top">
  <div class="b3-brand"><small>Sobradinho · DF</small><b>Residencial Serrano</b></div>
  <a class="b3-demo" href="https://paginaspro.app.br/inicio" target="_blank" rel="noopener">Demonstração<small>PáginasPro</small></a>
</header>
<div class="b3-seg" id="seg"><button data-v="predio" class="on">🏢 Prédio</button><button data-v="garagem">🚗 Garagem</button></div>
<div class="b3-toast" id="toast" hidden></div>
<section class="b3-sheet" id="sheet"></section>
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
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.maxPolarAngle = Math.PI * 0.49;
controls.addEventListener("start", () => {
  fly = null;
  controls.autoRotate = false;
});

const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
sun.position.set(-30, 45, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
scene.add(sun, new THREE.HemisphereLight(0xcfe6ff, 0x5c6b4a, 0.9));

const exterior = buildExterior();
scene.add(exterior);
const garage = buildGarage();
// a garagem fica longe do prédio (só aparece na vista dela)
garage.group.position.set(0, 0, 0);
garage.group.visible = false;
scene.add(garage.group);
const garageLight = new THREE.PointLight(0xfff6e0, 60, 60, 1.6);
garageLight.position.set(0, 9, 0);
garage.group.add(garageLight);

// ---------- vagas: algumas já ocupadas por carros de vizinhos
const occupied = new Map<number, Car>();
for (const n of [13, 7, 2, 20, 24, 10]) {
  const spot = garage.spots.find((s) => s.n === n)!;
  const t = CAR_TYPES[n % 4].id, c = CAR_COLORS[(n * 3) % CAR_COLORS.length].hex;
  const car = makeCar(t, c);
  car.position.set(spot.x, 0, spot.z + spot.side * 0.3);
  car.rotation.y = spot.side > 0 ? 0 : Math.PI; // estacionados de frente para a parede
  garage.group.add(car);
  occupied.set(n, car);
}

// ---------- estado
let view: View = "predio";
let carType: CarType = "suv";
let carColor = CAR_COLORS[3].hex;
let chosen: Spot | null = null;
let myCar: Car | null = null;
let mySpot: Spot | null = null;
let drive: { curve: THREE.CatmullRomCurve3; len: number; s: number; spot: Spot } | null = null;
let fly: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
let route: THREE.Line | null = null;

function toast(msg: string) {
  $("toast").textContent = msg;
  $("toast").hidden = false;
  clearTimeout((toast as unknown as { t: number }).t);
  (toast as unknown as { t: number }).t = window.setTimeout(() => ($("toast").hidden = true), 2600);
}

function homeView() {
  const portrait = innerHeight > innerWidth;
  if (view === "predio") {
    const d = portrait ? 104 : 58;
    const t = new THREE.Vector3(0, portrait ? 2 : PILOTIS + (FLOORS * FLOOR) / 2 - 3, 0);
    fly = { pos: new THREE.Vector3(-0.55 * d, 0.3 * d, 0.78 * d).add(t), target: t };
  } else if (portrait) {
    // celular em pé: a garagem fica comprida na vertical (rampa no alto), de cima e um pouco inclinada
    const t = new THREE.Vector3(-4, 0, 2.5);
    fly = { pos: new THREE.Vector3(-36, 92, 0).add(t), target: t };
  } else {
    fly = { pos: new THREE.Vector3(4, 36, 26), target: new THREE.Vector3(3, 0, 1) };
  }
}

function setView(v: View) {
  view = v;
  document.querySelectorAll<HTMLButtonElement>("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  exterior.visible = v === "predio";
  garage.group.visible = v === "garagem";
  scene.background = v === "predio" ? skyTex : new THREE.Color(0x1d2228);
  scene.fog = v === "predio" ? new THREE.Fog(0xdcebf6, 90, 220) : null;
  sun.intensity = v === "predio" ? 2.6 : 0.9;
  controls.autoRotate = v === "predio";
  controls.autoRotateSpeed = 0.6;
  controls.minDistance = v === "predio" ? 25 : 8;
  controls.maxDistance = v === "predio" ? 140 : 90;
  homeView();
  renderSheet();
}

// ---------- painel de baixo
function renderSheet() {
  if (view === "predio") {
    $("sheet").innerHTML = `<div class="b3-row"><div><small>Vista do prédio</small><b>Arraste para girar · pinça para aproximar</b></div></div>
      <button class="b3-big" id="goGarage">🚗 Escolher minha vaga na garagem</button>
      <a class="b3-wa" target="_blank" rel="noopener" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Olá, Bruno! Vi a demonstração 3D do Residencial Serrano e quero um 3D do meu empreendimento.")}">Quero um 3D assim do meu empreendimento</a>
      <p class="b3-legal">Demonstração ilustrativa feita a partir de imagens públicas de divulgação. Não é material oficial do empreendimento.</p>`;
    $("goGarage").onclick = () => setView("garagem");
    return;
  }
  const free = garage.spots.filter((s) => !occupied.has(s.n) && s !== mySpot);
  const busy = !!drive;
  $("sheet").classList.toggle("min", busy || (!!mySpot && !chosen && $("sheet").classList.contains("min")));
  $("sheet").innerHTML = `
    <button class="b3-handle" id="handle" aria-label="Abrir ou fechar">${$("sheet").classList.contains("min") ? "▴ Escolher carro e vaga" : "▾"}</button>
    <div class="b3-step"><i>1</i><b>Seu carro</b></div>
    <div class="b3-types">${CAR_TYPES.map((t) => `<button data-t="${t.id}" class="${t.id === carType ? "on" : ""}"><span>${t.icon}</span>${t.name}</button>`).join("")}</div>
    <div class="b3-colors">${CAR_COLORS.map((c) => `<button data-c="${c.hex}" title="${c.name}" class="${c.hex === carColor ? "on" : ""}" style="background:#${c.hex.toString(16).padStart(6, "0")}"></button>`).join("")}</div>
    <div class="b3-step"><i>2</i><b>Sua vaga</b><small>toque no número ou na vaga do desenho</small></div>
    <div class="b3-spots">${[...garage.spots].sort((a, b) => a.n - b.n).map((s) => {
      const taken = occupied.has(s.n);
      return `<button data-s="${s.n}" class="${taken ? "taken" : ""} ${chosen === s ? "on" : ""} ${mySpot === s ? "mine" : ""}" ${taken ? "disabled" : ""}>${String(s.n).padStart(2, "0")}${s.pcd ? "♿" : ""}</button>`;
    }).join("")}</div>
    <button class="b3-big" id="park" ${!chosen || busy ? "disabled" : ""}>${busy ? "Estacionando…" : chosen ? `Estacionar na vaga ${String(chosen.n).padStart(2, "0")}` : `Escolha uma vaga (${free.length} livres)`}</button>
    ${mySpot && !busy ? `<p class="b3-done">✓ Seu carro está na vaga <b>${String(mySpot.n).padStart(2, "0")}</b>. Escolha outra vaga para trocar.</p>` : ""}`;
  $("sheet").querySelectorAll<HTMLButtonElement>("[data-t]").forEach((b) => (b.onclick = () => {
    carType = b.dataset.t as CarType;
    renderSheet();
  }));
  $("sheet").querySelectorAll<HTMLButtonElement>("[data-c]").forEach((b) => (b.onclick = () => {
    carColor = Number(b.dataset.c);
    renderSheet();
  }));
  $("sheet").querySelectorAll<HTMLButtonElement>("[data-s]").forEach((b) => (b.onclick = () => choose(garage.spots.find((s) => s.n === Number(b.dataset.s))!)));
  $<HTMLButtonElement>("park").onclick = park;
  $("handle").onclick = () => {
    $("sheet").classList.toggle("min");
    renderSheet();
  };
}

function choose(s: Spot) {
  if (drive) return;
  if (occupied.has(s.n)) return toast(`A vaga ${String(s.n).padStart(2, "0")} está ocupada`);
  chosen = s;
  for (const sp of garage.spots) {
    const m = sp.mesh.material as THREE.MeshBasicMaterial;
    m.opacity = sp === s ? 0.45 : 0;
  }
  // mostra o caminho até a vaga no chão
  if (route) garage.group.remove(route);
  const curve = pathTo(s, garage.rampCurve);
  const geo = new THREE.BufferGeometry().setFromPoints(curve.getSpacedPoints(200).map((p) => p.clone().setY(p.y + 0.06)));
  route = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x5cff9a, dashSize: 0.6, gapSize: 0.4 }));
  route.computeLineDistances();
  garage.group.add(route);
  // a câmera mostra a vaga e o caminho desde a rampa
  const portrait = innerHeight > innerWidth;
  const mid = new THREE.Vector3((s.x + 26) / 2, 0, (s.z + 6) / 2);
  const span = Math.max(14, 26 - s.x);
  fly = { pos: mid.clone().add(portrait ? new THREE.Vector3(-span * 0.5, span * 1.9, 0) : new THREE.Vector3(0, span * 1.0, span * 0.7)), target: mid };
  renderSheet();
}

function park() {
  if (!chosen || drive) return;
  if (myCar) garage.group.remove(myCar);
  myCar = makeCar(carType, carColor);
  garage.group.add(myCar);
  mySpot = null;
  const curve = pathTo(chosen, garage.rampCurve);
  drive = { curve, len: curve.getLength(), s: 0, spot: chosen };
  myCar.position.copy(RAMP_TOP);
  renderSheet();
}

// ---------- toque na vaga do desenho
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down: { x: number; y: number } | null = null;
renderer.domElement.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || view !== "garagem" || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(garage.spots.map((s) => s.mesh))[0];
  if (hit) choose(garage.spots.find((s) => s.mesh === hit.object)!);
});
document.querySelectorAll<HTMLButtonElement>("#seg button").forEach((b) => (b.onclick = () => setView(b.dataset.v as View)));

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
homeView();
camera.position.copy(fly!.pos);
controls.target.copy(fly!.target);
setView(new URLSearchParams(location.search).get("ver") === "garagem" ? "garagem" : "predio");
$("load").hidden = true;

// ---------- laço
const clock = new THREE.Clock();
const ahead = new THREE.Vector3(), fwd = new THREE.Vector3(), camWant = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (drive && myCar) {
    // acelera, anda a ~16 km/h e freia perto da vaga
    const left = drive.len - drive.s;
    const speed = Math.min(4.6, 1.2 + drive.s * 1.6, 0.4 + left * 1.1);
    const ds = speed * dt;
    drive.s = Math.min(drive.len, drive.s + ds);
    const u = drive.s / drive.len;
    const p = drive.curve.getPointAt(u);
    drive.curve.getPointAt(Math.min(1, u + 0.6 / drive.len), ahead);
    myCar.position.copy(p);
    if (ahead.distanceToSquared(p) > 1e-4) myCar.lookAt(ahead.x, p.y + (ahead.y - p.y), ahead.z);
    for (const w of myCar.userData.wheels) w.rotation.x += ds / myCar.userData.r;
    // rodas da frente viram conforme a curva
    const t1 = drive.curve.getTangentAt(u), t2 = drive.curve.getTangentAt(Math.min(1, u + 2.5 / drive.len));
    const steer = THREE.MathUtils.clamp(Math.atan2(t1.x * t2.z - t1.z * t2.x, t1.x * t2.x + t1.z * t2.z) * -1.6, -0.55, 0.55);
    for (const f of myCar.userData.front) f.rotation.y = THREE.MathUtils.lerp(f.rotation.y, steer, 0.2);
    // câmera atrás do carro
    myCar.getWorldDirection(fwd);
    camWant.copy(p).addScaledVector(fwd, -9).add(new THREE.Vector3(0, 5.5, 0));
    camera.position.lerp(camWant, 1 - Math.exp(-dt * 3));
    controls.target.lerp(p, 1 - Math.exp(-dt * 5));
    fly = null;
    if (drive.s >= drive.len) {
      mySpot = drive.spot;
      chosen = null;
      drive = null;
      if (route) garage.group.remove(route);
      route = null;
      for (const sp of garage.spots) (sp.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
      for (const f of myCar.userData.front) f.rotation.y = 0;
      toast(`Estacionado na vaga ${String(mySpot.n).padStart(2, "0")} ✓`);
      $("sheet").classList.add("min");
      // de cima, olhando a vaga a partir do corredor
      const tgt = new THREE.Vector3(mySpot.x, 0, mySpot.z * 0.7);
      fly = { pos: tgt.clone().add(new THREE.Vector3(-11, 17, -mySpot.side * 7)), target: tgt };
      renderSheet();
    }
  }
  if (fly) {
    const k = 1 - Math.exp(-dt * 3);
    camera.position.lerp(fly.pos, k);
    controls.target.lerp(fly.target, k);
    if (camera.position.distanceTo(fly.pos) < 0.05) fly = null;
  }
  if (route) (route.material as THREE.LineDashedMaterial).dashSize = 0.6 + 0.1 * Math.sin(clock.elapsedTime * 4);
  if (!drive) controls.update();
  else camera.lookAt(controls.target);
  renderer.render(scene, camera);
});
