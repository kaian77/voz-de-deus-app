// Tour 3D da PáginasPro (paginaspro.app.br/3d/<slug>): condomínio inteiro, apartamentos montados pela planta
// (de fora, casa de boneca e andando por dentro), diferenciais nos lugares certos, mapa de unidades e WhatsApp.
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { bernadette } from "./projects/bernadette";
import { buildCondo } from "./condo";
import { buildApartment, collide, type Apartment, type RoomInfo } from "./plan3d";
import type { FeatureKind, Plan, Project, Status } from "./types";

const PROJECTS: Record<string, Project> = { [bernadette.slug]: bernadette };

const slug = (location.pathname.match(/\/3d\/([a-z0-9-]+)/)?.[1] ?? new URLSearchParams(location.search).get("p") ?? bernadette.slug).toLowerCase();
const project = PROJECTS[slug];
const app = document.getElementById("app")!;

if (!project) {
  app.innerHTML = `<div class="t3-404"><p>Este tour não existe ou saiu do ar.</p></div>`;
  throw new Error("tour não encontrado");
}

document.title = `${project.name} · Tour 3D (demonstração)`;
const root = document.documentElement.style;
root.setProperty("--p", project.colors.primary);
root.setProperty("--pd", project.colors.dark);
root.setProperty("--pl", project.colors.light);
root.setProperty("--ac", project.colors.accent);

const FEATURES: Record<FeatureKind, { icon: string; title: string; text: string }> = {
  acustica: { icon: "🔇", title: "Parede acústica", text: "30% mais isolamento acústico entre os ambientes." },
  fechadura: { icon: "🔐", title: "Fechadura eletrônica", text: "Na porta de entrada do apartamento." },
  varanda: { icon: "🍖", title: "Varanda gourmet", text: "Bancada e ponto para churrasqueira." },
  ar: { icon: "❄️", title: "Infraestrutura de ar-condicionado", text: "Pronta para instalar o ar." },
  janela: { icon: "🪟", title: "Janelas de até 1,5 m", text: "Mais luz natural nos quartos." },
  servico: { icon: "🧺", title: "Tanque", text: "Área de serviço com tanque." },
  hidro: { icon: "🛁", title: "Terraço com hidromassagem", text: "Deck e hidro na cobertura." },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const wa = (msg: string) => `https://wa.me/${project.whatsapp}?text=${encodeURIComponent(msg)}`;
const WA_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"/></svg>`;

app.innerHTML = `
<div class="t3-canvas" id="cv"></div>
<div class="t3-labels" id="labels"></div>
<header class="t3-top">
  <button class="t3-back" id="back" hidden aria-label="Voltar ao condomínio">←</button>
  <div class="t3-brand"><b>${esc(project.name)}</b><span>${esc(project.city)}</span></div>
  <span class="t3-demo">Demonstração</span>
</header>
<div class="t3-hint" id="hint"></div>
<div class="t3-sun" id="sun">
  <button id="play" aria-label="Pausar o sol">❚❚</button>
  <input type="range" id="hour" min="5" max="21" step="0.05" value="9.5" aria-label="Horário">
  <span id="hourLbl">09:30</span>
</div>
<div class="t3-apt" id="aptbar" hidden>
  <div class="t3-plans" id="plans"></div>
  <div class="t3-modes" id="modes">
    <button data-m="fora">De fora</button><button data-m="boneca">Casa de boneca</button><button data-m="andar">Andar por dentro</button>
  </div>
</div>
<nav class="t3-rooms" id="rooms" hidden></nav>
<div class="t3-joy" id="joy" hidden><div class="t3-knob" id="knob"></div></div>
<a class="t3-wa" id="wa" target="_blank" rel="noopener">${WA_ICON}<span>Falar com vendas</span></a>
<nav class="t3-tabs" id="tabs">
  <button data-t="condo" class="on">Condomínio</button><button data-t="plantas">Plantas</button><button data-t="unidades">Unidades</button><button data-t="lazer">Lazer</button>
</nav>
<section class="t3-sheet" id="sheet" hidden><button class="t3-x" id="sheetX" aria-label="Fechar">×</button><div id="sheetBody"></div></section>
<div class="t3-photo" id="photo" hidden><figure><img id="photoImg" alt=""><figcaption id="photoCap"></figcaption></figure></div>
<p class="t3-foot">Demonstração da PáginasPro para apresentação · plantas e imagens do site do empreendimento · não é material oficial</p>
<div class="t3-loading" id="loading"><div></div><p>Montando o condomínio…</p></div>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------- renderer e câmera
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$("cv").appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const condo = buildCondo(project);
const CONDO_HOME = { pos: new THREE.Vector3(95, 95, 135), target: new THREE.Vector3(0, 0, 4) };

// cena do apartamento
const aptScene = new THREE.Scene();
aptScene.background = new THREE.Color(0xe8ebe2);
const aptHemi = new THREE.HemisphereLight(0xffffff, 0xb9b3a5, 1.1);
const aptSun = new THREE.DirectionalLight(0xfff3df, 2.0);
aptSun.castShadow = true;
aptSun.shadow.mapSize.set(2048, 2048);
aptSun.shadow.bias = -0.0004;
aptSun.shadow.normalBias = 0.03;
const fill = new THREE.PointLight(0xfff1dc, 0, 9, 1.6);
aptScene.add(aptHemi, aptSun, aptSun.target, fill);
const groundMesh = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0xdfe3d6, roughness: 1 }));
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = -0.21;
groundMesh.receiveShadow = true;
aptScene.add(groundMesh);

type View = "condo" | "apt";
type Mode = "fora" | "boneca" | "andar";
const state = {
  view: "condo" as View,
  mode: "boneca" as Mode,
  plan: project.plans[0],
  apt: null as Apartment | null,
  unit: null as null | { block: string; floor: number; final: number },
  playing: true,
  hour: 9.5,
};
const apts = new Map<string, Apartment>();

// ---------------- unidades (exemplo)
const FINAL_PLAN: Record<number, string> = { 1: "2q", 2: "3q", 3: "3q", 4: "4q" };
const planOfUnit = (floor: number, final: number, floors: number) => (floor > floors ? "cob" : FINAL_PLAN[final]);
function statusOf(block: string, n: number): Status {
  let h = 2166136261;
  for (const ch of block + n) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const v = (h >>> 0) % 20;
  return v < 10 ? "vendido" : v < 13 ? "reservado" : "disponivel";
}
const STATUS_TXT: Record<Status, string> = { disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido" };

// ---------------- etiquetas (HTML sobre o 3D)
type Label = { el: HTMLElement; pos: THREE.Vector3; view: View; near?: number };
let labels: Label[] = [];
const labelsEl = $("labels");
function addLabel(html: string, pos: THREE.Vector3, view: View, cls: string, onClick?: () => void, near?: number) {
  const el = document.createElement("button");
  el.className = `t3-lbl ${cls}`;
  el.innerHTML = html;
  if (onClick) el.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  labelsEl.appendChild(el);
  labels.push({ el, pos, view, near });
  return el;
}
function clearLabels(view: View) {
  for (const l of labels) if (l.view === view) l.el.remove();
  labels = labels.filter((l) => l.view !== view);
}
const v3 = new THREE.Vector3();
function placeLabels() {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  for (const l of labels) {
    let show = l.view === state.view;
    if (show && l.near && state.mode === "andar") show = camera.position.distanceTo(l.pos) < l.near;
    if (show && state.view === "apt" && l.el.classList.contains("room") && state.mode === "andar") show = false;
    if (show) {
      v3.copy(l.pos).project(camera);
      show = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
      if (show) l.el.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px) translate(-50%, -100%)`;
    }
    l.el.style.display = show ? "" : "none";
  }
}

// condomínio: blocos e lazer
for (const b of condo.blocks) addLabel(`Bloco <b>${b.id}</b>`, condo.blockTop(b.id), "condo", "block", () => openBlock(b.id));
for (const hsp of condo.hotspots) {
  const a = project.amenities.find((x) => x.id === hsp.id);
  if (a?.short) addLabel(`<i></i>${esc(a.short)}`, hsp.pos, "condo", "spot", () => showAmenity(a.id));
}
// os espaços internos ficam juntos numa etiqueta só (abre a galeria)
const indoor = project.amenities.filter((a) => a.photo && !a.short && a.id !== "local").length;
addLabel(`<i></i>Clube · ${indoor} espaços`, condo.clubPos, "condo", "spot club", () => openLazer());

// ---------------- câmera animada
let fly: null | { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; k: number; dur: number } = null;
function flyTo(pos: THREE.Vector3, target: THREE.Vector3, dur = 1.2) {
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), k: 0, dur };
}

// ---------------- apartamento
function getApt(plan: Plan) {
  let a = apts.get(plan.id);
  if (!a) {
    a = buildApartment(plan, project.colors);
    apts.set(plan.id, a);
  }
  return a;
}

function enterApt(planId: string, mode: Mode = "boneca") {
  const plan = project.plans.find((p) => p.id === planId)!;
  if (state.apt) aptScene.remove(state.apt.group);
  state.plan = plan;
  state.apt = getApt(plan);
  aptScene.add(state.apt.group);
  const { w, d } = state.apt.size;
  aptSun.position.set(w / 2 + 12, 22, d / 2 - 10);
  aptSun.target.position.set(w / 2, 0, d / 2);
  const sc = aptSun.shadow.camera;
  const R = Math.max(w, d) * 0.8 + 2;
  sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 80;
  sc.updateProjectionMatrix();
  groundMesh.position.x = w / 2;
  groundMesh.position.z = d / 2;
  state.view = "apt";
  closeSheet();
  clearLabels("apt");
  // cômodos e diferenciais
  for (const r of state.apt.rooms) {
    if (r.room.nav === false) continue;
    addLabel(esc(r.room.name), new THREE.Vector3(r.x, 0.9, r.z), "apt", "room", () => goRoom(r));
  }
  for (const f of plan.features) {
    const info = FEATURES[f.kind];
    const el = addLabel(`<span>${info.icon}</span><em>${esc(info.title)}</em><small>${esc(f.text ?? info.text)}</small>`, new THREE.Vector3(f.x / 100, f.h ?? 1.2, f.y / 100), "apt", "feat", () => {
      const open = el.classList.contains("open");
      labelsEl.querySelectorAll(".feat.open").forEach((x) => x.classList.remove("open"));
      if (!open) el.classList.add("open");
    }, 7);
  }
  renderRooms();
  renderPlans();
  setMode(mode, true);
  syncUi();
}

function setMode(m: Mode, reset = false) {
  if (!state.apt) return;
  const prev = state.mode;
  state.mode = m;
  const a = state.apt;
  a.roof.visible = m === "fora";
  a.ceiling.visible = m !== "fora";
  const { w, d } = a.size;
  const c = new THREE.Vector3(w / 2, 0, d / 2);
  const R = Math.max(w, d);
  // distância para a planta inteira caber na largura da tela (celular em pé)
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) * camera.aspect);
  const dist = Math.max(R * 1.1, (R * 0.62) / Math.tan(hfov / 2));
  const dir = new THREE.Vector3(0.3, m === "fora" ? 0.7 : 0.85, 0.55).normalize();
  if (m === "andar") {
    controls.enabled = false;
    camera.near = 0.05;
    camera.fov = 70;
    camera.updateProjectionMatrix();
    walk.x = a.entry.x;
    walk.z = a.entry.z;
    walk.yaw = a.entry.yaw;
    walk.pitch = 0;
    fly = null;
    hint("Use o controle para andar e arraste a tela para olhar. Toque num cômodo para ir até ele.");
  } else {
    controls.enabled = true;
    camera.near = 0.1;
    camera.fov = 50;
    camera.updateProjectionMatrix();
    controls.minDistance = 4;
    controls.maxDistance = 80;
    controls.maxPolarAngle = 1.35;
    if (reset || prev === "andar") {
      if (prev === "andar") {
        camera.position.copy(c).addScaledVector(dir, dist * 1.2);
        controls.target.copy(c);
      }
      flyTo(c.clone().addScaledVector(dir, dist), c, 1);
    }
    hint(m === "boneca" ? "Gire com um dedo, aproxime com dois. Toque no nome de um cômodo para entrar." : "Vista de fora: gire para ver o apartamento.");
  }
  $("modes").querySelectorAll("button").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.m === m));
  syncUi();
}

/** Ponto para ficar no cômodo: logo depois da porta, olhando para o centro. */
function spot(r: RoomInfo) {
  const plan = state.plan;
  for (const o of plan.openings) {
    if (o.kind === "window") continue;
    for (const [x0, y0, x1, y1] of r.room.rects) {
      const mid = (o.a + o.b) / 2;
      let px: number | null = null, pz: number | null = null;
      if (o.dir === "h" && mid > x0 && mid < x1 && (Math.abs(o.at - y0) < 12 || Math.abs(o.at - y1) < 12)) {
        px = mid / 100;
        pz = (o.at + (Math.abs(o.at - y0) < 12 ? 70 : -70)) / 100;
      } else if (o.dir === "v" && mid > y0 && mid < y1 && (Math.abs(o.at - x0) < 12 || Math.abs(o.at - x1) < 12)) {
        pz = mid / 100;
        px = (o.at + (Math.abs(o.at - x0) < 12 ? 70 : -70)) / 100;
      }
      if (px !== null && pz !== null) return { x: px, z: pz, yaw: Math.atan2(-(r.x - px), -(r.z - pz)) };
    }
  }
  return { x: r.x, z: r.z + 0.3, yaw: 0 };
}

function goRoom(r: RoomInfo) {
  const s = spot(r);
  if (state.mode !== "andar") setMode("andar");
  walkTo = { x0: walk.x, z0: walk.z, y0: walk.yaw, x1: s.x, z1: s.z, y1: s.yaw, k: 0 };
  $("rooms").querySelectorAll("button").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.r === r.room.id));
}

// ---------------- andar por dentro
const walk = { x: 0, z: 0, yaw: 0, pitch: 0, jx: 0, jy: 0, keys: new Set<string>() };
let walkTo: null | { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; k: number } = null;
const joy = $("joy"), knob = $("knob");
let joyId: number | null = null;
joy.addEventListener("pointerdown", (e) => {
  joyId = e.pointerId;
  joy.setPointerCapture(e.pointerId);
  moveJoy(e);
});
joy.addEventListener("pointermove", (e) => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = (e: PointerEvent) => {
  if (e.pointerId !== joyId) return;
  joyId = null;
  walk.jx = walk.jy = 0;
  knob.style.transform = "";
};
joy.addEventListener("pointerup", endJoy);
joy.addEventListener("pointercancel", endJoy);
function moveJoy(e: PointerEvent) {
  const r = joy.getBoundingClientRect();
  let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  walk.jx = dx;
  walk.jy = dy;
  knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
  walkTo = null;
}
let look: null | { id: number; x: number; y: number } = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (state.view === "apt" && state.mode === "andar") look = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
addEventListener("pointermove", (e) => {
  if (!look || e.pointerId !== look.id) return;
  walk.yaw -= (e.clientX - look.x) * 0.0045;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch - (e.clientY - look.y) * 0.0035, -1.1, 1.1);
  look.x = e.clientX;
  look.y = e.clientY;
  walkTo = null;
});
addEventListener("pointerup", (e) => { if (look?.id === e.pointerId) look = null; });
addEventListener("keydown", (e) => walk.keys.add(e.key.toLowerCase()));
addEventListener("keyup", (e) => walk.keys.delete(e.key.toLowerCase()));

function stepWalk(dt: number) {
  const a = state.apt!;
  if (walkTo) {
    walkTo.k = Math.min(1, walkTo.k + dt / 0.7);
    const e = walkTo.k < 0.5 ? 2 * walkTo.k * walkTo.k : 1 - (-2 * walkTo.k + 2) ** 2 / 2;
    walk.x = walkTo.x0 + (walkTo.x1 - walkTo.x0) * e;
    walk.z = walkTo.z0 + (walkTo.z1 - walkTo.z0) * e;
    let dy = walkTo.y1 - walkTo.y0;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    walk.yaw = walkTo.y0 + dy * e;
    if (walkTo.k >= 1) walkTo = null;
  } else {
    let f = -walk.jy, s = walk.jx;
    const k = walk.keys;
    if (k.has("w") || k.has("arrowup")) f += 1;
    if (k.has("s") || k.has("arrowdown")) f -= 1;
    if (k.has("a")) s -= 1;
    if (k.has("d")) s += 1;
    if (k.has("arrowleft")) walk.yaw += dt * 1.8;
    if (k.has("arrowright")) walk.yaw -= dt * 1.8;
    const speed = 1.6;
    const sin = Math.sin(walk.yaw), cos = Math.cos(walk.yaw);
    let nx = walk.x + (-sin * f + cos * s) * speed * dt;
    let nz = walk.z + (-cos * f - sin * s) * speed * dt;
    const p = collide(a.colliders, nx, nz);
    nx = THREE.MathUtils.clamp(p.x, 0.2, a.size.w - 0.2);
    nz = THREE.MathUtils.clamp(p.z, 0.2, a.size.d - 0.2);
    walk.x = nx;
    walk.z = nz;
  }
  camera.position.set(walk.x, 1.6, walk.z);
  camera.rotation.set(walk.pitch, walk.yaw, 0, "YXZ");
  fill.position.set(walk.x, 2.2, walk.z);
}

// ---------------- toque no condomínio (blocos)
const ray = new THREE.Raycaster();
let down: null | { x: number; y: number; t: number } = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  stopIntro();
});
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 500) return;
  if (state.view !== "condo") return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.intersectObjects(condo.blocks.flatMap((b) => b.pick), false)[0];
  if (hit) openBlock(hit.object.userData.block);
});

// ---------------- painéis
const sheet = $("sheet"), body = $("sheetBody");
function openSheet(html: string, tab?: string) {
  body.innerHTML = html;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  setTab(tab ?? "");
}
function closeSheet() {
  sheet.hidden = true;
  setTab(state.view === "condo" ? "condo" : "plantas");
}
$("sheetX").addEventListener("click", closeSheet);
function setTab(t: string) {
  $("tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.t === (t || (state.view === "condo" ? "condo" : "plantas"))));
}

function planCard(p: Plan, extra = "") {
  return `<button class="t3-plan" data-plan="${p.id}"><b>${esc(p.short)}</b><span>${esc(p.name)}</span><em>${esc(p.area)}</em>${extra}</button>`;
}
body.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const plan = t.closest<HTMLElement>("[data-plan]");
  if (plan) return enterApt(plan.dataset.plan!, (plan.dataset.mode as Mode) ?? "boneca");
  const am = t.closest<HTMLElement>("[data-am]");
  if (am) return showAmenity(am.dataset.am!);
  const bt = t.closest<HTMLElement>("[data-blocktab]");
  if (bt) return openUnits(bt.dataset.blocktab!);
  const u = t.closest<HTMLElement>("[data-unit]");
  if (u) {
    const [b, f, n] = u.dataset.unit!.split(":");
    return pickUnit(b, +f, +n);
  }
  const see = t.closest<HTMLElement>("[data-see]");
  if (see && state.unit) {
    const { block, floor, final } = state.unit;
    showCondo();
    closeSheet();
    const at = condo.highlight(block, floor, final)!;
    const b = condo.blocks.find((x) => x.id === block)!;
    const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.group.rotation.y);
    flyTo(at.clone().addScaledVector(out, 85).setY(at.y + 14), at, 1.4);
    hint(`Apto ${floor * 100 + final} do Bloco ${block} destacado no prédio.`);
  }
});

function openBlock(id: string) {
  const b = condo.blocks.find((x) => x.id === id)!;
  const total = b.floors * 4 + 2;
  const free = Array.from({ length: b.floors + 1 }, (_, i) => i + 1)
    .flatMap((f) => (f > b.floors ? [1, 2] : [1, 2, 3, 4]).map((n) => statusOf(id, f * 100 + n)))
    .filter((s) => s === "disponivel").length;
  openSheet(`
    <h2>Bloco ${id}</h2>
    <p class="t3-sub">${b.floors} andares + cobertura · ${total} unidades · <b>${free} disponíveis</b> <small>(exemplo)</small></p>
    <h3>Entrar num apartamento</h3>
    <div class="t3-grid">${project.plans.map((p) => planCard(p)).join("")}</div>
    <button class="t3-btn" data-blocktab="${id}">Ver mapa de unidades do Bloco ${id}</button>`, "condo");
  const p = b.group.position.clone();
  flyTo(p.clone().add(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.group.rotation.y).multiplyScalar(95)).setY(40), p.clone().setY(4), 1.2);
}

function openPlans() {
  openSheet(`
    <h2>Plantas</h2>
    <p class="t3-sub">Toque numa planta para ver em 3D e andar por dentro.</p>
    <div class="t3-grid">${project.plans.map((p) => planCard(p)).join("")}</div>
    <h3>Diferenciais</h3>
    <ul class="t3-list">${project.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`, "plantas");
}

function openUnits(block = state.unit?.block ?? condo.blocks[0].id) {
  const b = condo.blocks.find((x) => x.id === block)!;
  let rows = "";
  for (let f = b.floors + 1; f >= 1; f--) {
    const finals = f > b.floors ? [1, 2] : [1, 2, 3, 4];
    rows += `<div class="t3-row ${f > b.floors ? "cob" : ""}"><span>${f > b.floors ? "Cob." : f + "º"}</span>${finals
      .map((n) => {
        const num = f * 100 + n;
        const st = statusOf(block, num);
        const sel = state.unit && state.unit.block === block && state.unit.floor === f && state.unit.final === n;
        return `<button class="u ${st}${sel ? " sel" : ""}" data-unit="${block}:${f}:${n}">${num}</button>`;
      })
      .join("")}</div>`;
  }
  const u = state.unit && state.unit.block === block ? state.unit : null;
  let card = `<p class="t3-sub">Toque numa unidade.</p>`;
  if (u) {
    const num = u.floor * 100 + u.final;
    const st = statusOf(u.block, num);
    const plan = project.plans.find((p) => p.id === planOfUnit(u.floor, u.final, b.floors))!;
    card = `<div class="t3-unit">
      <div><b>Apto ${num} · Bloco ${u.block}</b><span class="st ${st}">${STATUS_TXT[st]}</span></div>
      <p>${esc(plan.name)} · ${esc(plan.area)}</p>
      <div class="t3-row2">
        <button class="t3-btn" data-plan="${plan.id}" data-mode="andar">Ver por dentro</button>
        <button class="t3-btn ghost" data-see="1">Ver no prédio</button>
      </div>
      ${st !== "vendido" ? `<a class="t3-btn wa" target="_blank" rel="noopener" href="${wa(`Olá! Vi o tour 3D do ${project.name} e tenho interesse no apto ${num} do Bloco ${u.block} (${plan.short}).`)}">${WA_ICON} Tenho interesse</a>` : ""}
    </div>`;
  }
  openSheet(`
    <h2>Mapa de unidades</h2>
    <div class="t3-blocks">${condo.blocks.map((x) => `<button data-blocktab="${x.id}" class="${x.id === block ? "on" : ""}">Bloco ${x.id}</button>`).join("")}</div>
    <div class="t3-legend"><i class="disponivel"></i>Disponível <i class="reservado"></i>Reservado <i class="vendido"></i>Vendido</div>
    <div class="t3-map">${rows}</div>
    <p class="t3-note">Situação das unidades de exemplo, só para a demonstração.</p>
    ${card}`, "unidades");
}

function pickUnit(block: string, floor: number, final: number) {
  state.unit = { block, floor, final };
  condo.highlight(block, floor, final);
  openUnits(block);
  syncUi();
}

function openLazer() {
  openSheet(`
    <h2>Lazer clube</h2>
    <p class="t3-sub">${esc(project.tagline)}</p>
    <div class="t3-gallery">${project.amenities
      .filter((a) => a.photo)
      .map((a) => `<button data-am="${a.id}"><img src="${a.photo}" alt="" loading="lazy"><span>${esc(a.name)}</span></button>`)
      .join("")}</div>`, "lazer");
}

function showAmenity(id: string) {
  const a = project.amenities.find((x) => x.id === id)!;
  if (!a.photo) return hint(a.name);
  $<HTMLImageElement>("photoImg").src = a.photo;
  $("photoCap").textContent = a.name;
  $("photo").hidden = false;
}
$("photo").addEventListener("click", () => ($("photo").hidden = true));

function showCondo() {
  state.view = "condo";
  if (state.apt) aptScene.remove(state.apt.group);
  controls.enabled = true;
  camera.near = 0.5;
  camera.fov = 50;
  camera.updateProjectionMatrix();
  controls.minDistance = 25;
  controls.maxDistance = 280;
  controls.maxPolarAngle = 1.4;
  camera.position.copy(CONDO_HOME.pos).multiplyScalar(1.05);
  controls.target.copy(CONDO_HOME.target);
  flyTo(CONDO_HOME.pos, CONDO_HOME.target, 0.9);
  hint("Toque num bloco para escolher o apartamento. Toque nos pontos do lazer para ver as fotos.");
  syncUi();
}

$("tabs").addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-t]")?.dataset.t;
  if (!t) return;
  if (t === "condo") {
    closeSheet();
    if (state.view !== "condo") showCondo();
    else flyTo(CONDO_HOME.pos, CONDO_HOME.target);
  } else if (t === "plantas") openPlans();
  else if (t === "unidades") openUnits();
  else openLazer();
});
$("back").addEventListener("click", () => { closeSheet(); showCondo(); });
$("modes").addEventListener("click", (e) => {
  const m = (e.target as HTMLElement).closest<HTMLElement>("[data-m]")?.dataset.m as Mode | undefined;
  if (m) setMode(m, true);
});

function renderPlans() {
  $("plans").innerHTML = project.plans.map((p) => `<button data-p="${p.id}" class="${p.id === state.plan.id ? "on" : ""}">${esc(p.short)}<small>${esc(p.area)}</small></button>`).join("");
}
$("plans").addEventListener("click", (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>("[data-p]")?.dataset.p;
  if (id && id !== state.plan.id) enterApt(id, state.mode === "andar" ? "boneca" : state.mode);
});
function renderRooms() {
  const rs = state.apt!.rooms.filter((r) => r.room.nav !== false);
  $("rooms").innerHTML = rs.map((r) => `<button data-r="${r.room.id}">${esc(r.room.name)}</button>`).join("");
}
$("rooms").addEventListener("click", (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>("[data-r]")?.dataset.r;
  const r = state.apt?.rooms.find((x) => x.room.id === id);
  if (r) goRoom(r);
});

function syncUi() {
  const apt = state.view === "apt";
  $("back").hidden = !apt;
  $("aptbar").hidden = !apt;
  $("rooms").hidden = !apt;
  $("joy").hidden = !(apt && state.mode === "andar");
  $("sun").hidden = apt;
  document.body.classList.toggle("walking", apt && state.mode === "andar");
  const msg = state.unit
    ? `Olá! Vi o tour 3D do ${project.name} e quero saber do apto ${state.unit.floor * 100 + state.unit.final} do Bloco ${state.unit.block}.`
    : apt
      ? `Olá! Vi o tour 3D do ${project.name} e quero saber mais do apartamento de ${state.plan.short.toLowerCase()} (${state.plan.area}).`
      : `Olá! Vi o tour 3D do ${project.name} e quero saber mais.`;
  $<HTMLAnchorElement>("wa").href = wa(msg);
}

let hintT = 0;
function hint(t: string) {
  const h = $("hint");
  h.textContent = t;
  h.classList.add("on");
  clearTimeout(hintT);
  hintT = window.setTimeout(() => h.classList.remove("on"), 5000);
}

// ---------------- sol
const hourEl = $<HTMLInputElement>("hour");
const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60 / 5) * 5).padStart(2, "0")}`;
function applyHour(h: number) {
  state.hour = h;
  hourEl.value = String(h);
  $("hourLbl").textContent = fmtHour(h);
  condo.setHour(h);
}
hourEl.addEventListener("input", () => {
  state.playing = false;
  $("play").textContent = "▶";
  applyHour(+hourEl.value);
});
$("play").addEventListener("click", () => {
  state.playing = !state.playing;
  $("play").textContent = state.playing ? "❚❚" : "▶";
});

// ---------------- loop
let intro = true;
function stopIntro() {
  intro = false;
}
controls.addEventListener("start", stopIntro);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  if (fly) {
    fly.k = Math.min(1, fly.k + dt / fly.dur);
    const e = 1 - (1 - fly.k) ** 3;
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (fly.k >= 1) fly = null;
  }
  if (state.view === "condo") {
    if (state.playing) {
      let h = state.hour + dt / 6;
      if (h > 20.5) h = 5.5;
      applyHour(h);
    }
    if (intro && !fly) {
      const a = dt * 0.06;
      const p = camera.position.clone().sub(controls.target);
      p.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      camera.position.copy(controls.target).add(p);
    }
    condo.update(dt, t);
    controls.update();
    renderer.render(condo.scene, camera);
  } else {
    fill.intensity = state.mode === "andar" ? 0.9 : 0;
    aptHemi.intensity = state.mode === "andar" ? 1.5 : 1.1;
    if (state.mode === "andar") stepWalk(dt);
    else controls.update();
    renderer.render(aptScene, camera);
  }
  placeLabels();
  requestAnimationFrame(frame);
}

camera.position.copy(CONDO_HOME.pos).multiplyScalar(1.3);
controls.target.copy(CONDO_HOME.target);
showCondo();
applyHour(9.5);
requestAnimationFrame(() => {
  frame();
  setTimeout(() => $("loading").classList.add("off"), 250);
});
