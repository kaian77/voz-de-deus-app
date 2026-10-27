// Montagem 3D (PáginasPro): /montagem/<slug>. Passo a passo animado do manual, com a página do manual ao lado,
// ferragens de cada passo, contador do que já foi usado, câmera por passo (dá para girar e dar zoom) e modo Desenho (traço do manual).
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mesaBennett } from "./products/mesa-bennett";
import type { Product } from "./types";
import { langSwitch, pitchMsg, t as T, tr } from "../i18n3d";

const PRODUCTS: Record<string, Product> = { "mesa-bennett": mesaBennett };
const slug = location.pathname.split("/").filter(Boolean)[1] || new URLSearchParams(location.search).get("p") || "mesa-bennett";
const pr = PRODUCTS[slug] ?? mesaBennett;
const prName = tr(pr.name);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
document.title = `${prName} · ${T("montagem 3D", "3D assembly", "montaje 3D")}${pr.demo ? ` (${T("demonstração", "demo", "demostración")})` : ""}`;

$("app").innerHTML = `
<div class="a3-canvas" id="canvas"></div>
<div class="a3-labels" id="labels"></div>
<header class="a3-top">
  <div class="a3-brand"><small>${T("Passo a passo 3D", "Step by step 3D", "Paso a paso 3D")}</small><b>${esc(prName)}</b></div>
  ${pr.demo ? `<a class="a3-demo" href="https://paginaspro.app.br/inicio" target="_blank" rel="noopener">${T("Demonstração", "Demo", "Demostración")}<small>PáginasPro</small></a>` : ""}
</header>
<section class="a3-card" id="card"></section>
<div class="a3-view"><button data-v="sala" class="on">${T("Sala", "Room", "Sala")}</button><button data-v="desenho">${T("Desenho", "Drawing", "Dibujo")}</button></div>
<button class="a3-manual" id="manualBtn" aria-label="${T("Ver a página do manual", "See the manual page", "Ver la página del manual")}"><img id="manualImg" alt="Manual"><span>${T("Manual", "Manual", "Manual")}</span></button>
<div class="a3-zoom" id="zoom" hidden><img id="zoomImg" alt="Manual"><button class="a3-x" id="zoomX" aria-label="${T("Fechar", "Close", "Cerrar")}">×</button></div>
<nav class="a3-bar">
  <div class="a3-prog" id="prog"></div>
  <div class="a3-ctrl">
    <button id="prev" aria-label="${T("Passo anterior", "Previous step", "Paso anterior")}">‹</button>
    <button id="play" class="play" aria-label="${T("Animar", "Play", "Animar")}">▶</button>
    <button id="next" aria-label="${T("Próximo passo", "Next step", "Paso siguiente")}">›</button>
  </div>
</nav>
`;

// ---------- cena: sala clara, chão de madeira, embalagem aberta no chão
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$("canvas").appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(45, 1, 0.02, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.62;
controls.minDistance = 0.2;
controls.maxDistance = 5;
controls.enablePan = false;
controls.addEventListener("start", () => (camK = 1)); // quem mexe com o dedo manda na câmera

const room = new THREE.Group();
scene.add(room);
function planks() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    const l = 62 + ((i * 37) % 9);
    g.fillStyle = `hsl(32, 32%, ${l}%)`;
    g.fillRect(0, i * 64, 512, 64);
    g.fillStyle = "rgba(90,60,30,0.18)";
    g.fillRect(0, i * 64, 512, 2);
    g.fillRect(((i * 173) % 400) + 40, i * 64, 2, 64);
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(90,60,30,${0.04 + (k % 3) * 0.02})`;
      g.fillRect(0, i * 64 + 6 + k * 4, 512, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.75 }));
floor.receiveShadow = true;
room.add(floor);
const cardboard = new THREE.MeshStandardMaterial({ color: 0xc8a473, roughness: 0.95 });
for (const [w, d, x, z, r] of [[2.3, 1.15, 0, 0.15, 0.02], [1.35, 1.05, 0, -1.25, -0.03]] as const) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(r), cardboard);
  m.position.set(x, 0.002, z);
  m.receiveShadow = true;
  room.add(m);
}
const wallMat = new THREE.MeshStandardMaterial({ color: 0xefe9df, roughness: 0.95 });
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), wallMat);
backWall.position.set(0, 1.5, -2.3);
const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), wallMat);
sideWall.rotation.y = Math.PI / 2;
sideWall.position.set(-2.4, 1.5, 0);
room.add(backWall, sideWall);
const skirt = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
for (const [w, x, z, ry] of [[8, 0, -2.29, 0], [8, -2.39, 0, Math.PI / 2]] as const) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.015), skirt);
  b.position.set(x, 0.04, z);
  b.rotation.y = ry;
  room.add(b);
}
// faixa de luz na parede (janela)
const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.9), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
glow.position.set(1.3, 1.35, -2.29);
room.add(glow);

scene.add(new THREE.HemisphereLight(0xfff8ee, 0xb9a78c, 1.3));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
sun.position.set(1.6, 3, 1.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 8 });
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.background = new THREE.Color(0xe9e3d8);

const built = pr.build(scene);
document.querySelector(".a3-top")!.insertBefore(langSwitch("a3-lang"), document.querySelector(".a3-demo"));

// ---------- modo Desenho: tudo branco com o traço preto, como no manual
const drawMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const lineMat = new THREE.LineBasicMaterial({ color: 0x1b1b1b });
let drawing = false;
function setDrawing(on: boolean) {
  drawing = on;
  room.visible = !on;
  scene.background = new THREE.Color(on ? 0xffffff : 0xe9e3d8);
  renderer.shadowMap.enabled = !on;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.keep || room.children.includes(m)) return;
    if (on) {
      m.userData.mat ??= m.material;
      m.material = drawMat;
      if (!m.userData.edges) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), lineMat);
        m.userData.edges = e;
        m.add(e);
      }
      m.userData.edges.visible = true;
    } else {
      if (m.userData.mat) m.material = m.userData.mat;
      if (m.userData.edges) m.userData.edges.visible = false;
    }
  });
  document.querySelectorAll<HTMLButtonElement>(".a3-view button").forEach((b) => b.classList.toggle("on", (b.dataset.v === "desenho") === on));
}

// ---------- passos
let step = 0, t = 0, playing = false;
const N = pr.steps.length;
const total = Object.fromEntries(pr.hardware.map((h) => [h.id, h.qty]));
function usedUntil(s: number, frac: number) {
  const used: Record<string, number> = {};
  pr.steps.forEach((st, i) => {
    for (const [k, q] of Object.entries(st.uses)) used[k] = (used[k] ?? 0) + (i < s ? q : i === s ? Math.round(q * frac) : 0);
  });
  return used;
}
const totalHw = Object.values(total).reduce((a, b) => a + b, 0);

function renderCard() {
  const st = pr.steps[step];
  const hw = Object.entries(st.uses).map(([id, q]) => {
    const h = pr.hardware.find((x) => x.id === id)!;
    return `<span class="hw"><b>${q}×</b> ${id} · ${tr(h.name)}${h.size ? ` ${h.size}` : ""}</span>`;
  });
  const tools = (st.tools ?? []).map((x) => `<span class="tool">${tr(x)}</span>`);
  const last = step === N - 1;
  $("card").innerHTML = `
    <div class="a3-head">${st.n ? `<i>${st.n}</i>` : `<i class="s">${step === 0 ? "★" : "✓"}</i>`}<div><small>${st.n ? `${T("Passo", "Step", "Paso")} ${Number(st.n)} ${T("de", "of", "de")} ${pr.steps.filter((x) => x.n).length}` : step === 0 ? T("Antes de começar", "Before you start", "Antes de empezar") : T("Final", "Last step", "Final")}</small><b>${tr(st.title)}</b></div><span class="a3-fold" aria-hidden="true">▾</span></div>
    <p>${tr(st.text)}</p>
    ${hw.length || tools.length ? `<div class="a3-chips">${hw.join("")}${tools.join("")}</div>` : ""}
    ${step === 0 ? `<div class="a3-parts">${pr.pieces.map((p) => `<span><b>${p.id}</b>${p.qty > 1 ? ` ${p.qty}×` : ""} ${tr(p.name)}</span>`).join("")}</div>` : ""}
    <div class="a3-count" id="count"></div>
    ${last && pr.demo ? `<div class="a3-pitch"><b>${T("Quer o manual da sua marca assim?", "Want your brand's manuals like this?", "¿Quieres los manuales de tu marca así?")}</b><span>${T("QR code na caixa abre o passo a passo 3D no celular. Menos dúvida, menos devolução e avaliação melhor.", "A QR code on the box opens the 3D step by step on the phone. Fewer support calls, fewer returns, better reviews.", "Un código QR en la caja abre el paso a paso 3D en el celular. Menos dudas, menos devoluciones y mejores reseñas.")}</span><a href="https://wa.me/${pr.whatsapp}?text=${encodeURIComponent(pitchMsg(`${T("da montagem 3D", "3D assembly", "de montaje 3D")} (${prName})`))}" target="_blank" rel="noopener">${T("Falar com a PáginasPro no WhatsApp", "Talk to PáginasPro on WhatsApp", "Hablar con PáginasPro por WhatsApp")}</a></div>` : ""}`;
  $<HTMLImageElement>("manualImg").src = st.img;
  $("prog").innerHTML = pr.steps.map((_, i) => `<button data-s="${i}" class="${i < step ? "done" : i === step ? "on" : ""}" aria-label="${T("Passo", "Step", "Paso")} ${i}"></button>`).join("");
  $<HTMLButtonElement>("prev").disabled = step === 0;
  $<HTMLButtonElement>("next").disabled = step === N - 1;
  updCount();
}
function updCount() {
  const used = usedUntil(step, t);
  const n = Object.values(used).reduce((a, b) => a + b, 0);
  const el = document.getElementById("count");
  if (el) el.textContent = `${T("Ferragens usadas", "Hardware used", "Herrajes usados")}: ${n} ${T("de", "of", "de")} ${totalHw}`;
}
function playBtn() {
  $("play").textContent = playing ? "❚❚" : t >= 1 ? "↻" : "▶";
}

const camFrom = new THREE.Vector3(), camTo = new THREE.Vector3(), tgtFrom = new THREE.Vector3(), tgtTo = new THREE.Vector3();
let camK = 1;
function aim(s: number) {
  const c = pr.steps[s].cam;
  const portrait = innerWidth < innerHeight;
  const k = portrait ? 1.25 : 1; // celular em pé: afasta um pouco para caber
  // em pé, o cartão ocupa o alto da tela: mira um pouco acima para a peça descer
  const lift = portrait ? 0.12 * Math.hypot(...c.offset) : 0;
  tgtTo.set(c.target[0], c.target[1] + lift, c.target[2]);
  camTo.set(c.target[0] + c.offset[0] * k, c.target[1] + c.offset[1] * k + lift, c.target[2] + c.offset[2] * k);
  camFrom.copy(camera.position);
  tgtFrom.copy(controls.target);
  camK = 0;
}
function go(s: number, autoplay = true) {
  step = Math.max(0, Math.min(N - 1, s));
  t = 0;
  playing = autoplay;
  aim(step);
  renderCard();
  playBtn();
}

// tocar no título do passo recolhe ou abre o cartão
$("card").addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest(".a3-head")) $("card").classList.toggle("min");
});
$("prev").addEventListener("click", () => go(step - 1));
$("next").addEventListener("click", () => go(step + 1));
$("play").addEventListener("click", () => {
  if (t >= 1) t = 0;
  playing = !playing;
  playBtn();
});
$("prog").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b?.dataset.s) go(Number(b.dataset.s));
});
document.querySelector(".a3-view")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b?.dataset.v) setDrawing(b.dataset.v === "desenho");
});
$("manualBtn").addEventListener("click", () => {
  $<HTMLImageElement>("zoomImg").src = pr.steps[step].img;
  $("zoom").hidden = false;
});
$("zoomX").addEventListener("click", () => ($("zoom").hidden = true));
$("zoom").addEventListener("click", (e) => {
  if (e.target === $("zoom")) $("zoom").hidden = true;
});
addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") go(step + 1);
  if (e.key === "ArrowLeft") go(step - 1);
});

// ---------- rótulos: número da peça (bolinha preta, como no manual) e letra da ferragem em uso
const labelsEl = $("labels");
const badgeEls = built.badges.map((b) => {
  const el = document.createElement("div");
  el.className = "a3-badge";
  el.textContent = b.label;
  labelsEl.appendChild(el);
  return el;
});
const hwEl = document.createElement("div");
hwEl.className = "a3-badge hw";
labelsEl.appendChild(hwEl);
const v = new THREE.Vector3();
function place(el: HTMLElement, p: THREE.Vector3 | null) {
  if (!p) return void (el.style.display = "none");
  v.copy(p).project(camera);
  if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return void (el.style.display = "none");
  el.style.display = "";
  el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px)`;
}
function drawLabels() {
  const st = pr.steps[step];
  built.badges.forEach((b, i) => place(badgeEls[i], st.pieces.includes(b.id) ? b.at() : null));
  const a = built.active();
  hwEl.textContent = a?.label ?? "";
  place(hwEl, a?.at ?? null);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 52 : 42;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (playing) {
    t = Math.min(1, t + dt / pr.steps[step].dur);
    if (t >= 1) {
      playing = false;
      playBtn();
    }
    updCount();
  }
  if (camK < 1) {
    camK = Math.min(1, camK + dt / 1.2);
    const k = camK < 0.5 ? 4 * camK ** 3 : 1 - (-2 * camK + 2) ** 3 / 2;
    camera.position.lerpVectors(camFrom, camTo, k);
    controls.target.lerpVectors(tgtFrom, tgtTo, k);
  }
  built.pose(step, t);
  controls.update();
  renderer.render(scene, camera);
  drawLabels();
  requestAnimationFrame(frame);
}
// abre de longe e chega nas peças separadas
camera.position.set(2.6, 2.4, 3.2);
controls.target.set(0, 0.2, 0);
go(0, false);
t = 1;
playBtn();
frame();
