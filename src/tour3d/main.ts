// Tour 3D da PáginasPro (paginaspro.app.br/3d/<slug>): condomínio inteiro, apartamentos montados pela planta
// (de fora, casa de boneca e andando por dentro), diferenciais nos lugares certos, mapa de unidades e WhatsApp.
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { bernadette } from "./projects/bernadette";
import { buildCondo } from "./condo";
import { buildApartment, collide, type Apartment, type RoomInfo } from "./plan3d";
import type { FeatureKind, Plan, Project, Status } from "./types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/studio/lib/config";
import { langSwitch, t as tx } from "../i18n3d";

const PROJECTS: Record<string, Project> = { [bernadette.slug]: bernadette };

const slug = (location.pathname.match(/\/3d\/([a-z0-9-]+)/)?.[1] ?? new URLSearchParams(location.search).get("p") ?? bernadette.slug).toLowerCase();
const project = PROJECTS[slug];
const app = document.getElementById("app")!;

if (!project) {
  app.innerHTML = `<div class="t3-404"><p>${tx("Este tour não existe ou saiu do ar.", "This tour doesn't exist or is offline.", "Este tour no existe o salió del aire.")}</p></div>`;
  throw new Error("tour não encontrado");
}

document.title = `${project.name} · Tour 3D (${tx("demonstração", "demo", "demostración")})`;
const root = document.documentElement.style;
root.setProperty("--p", project.colors.primary);
root.setProperty("--pd", project.colors.dark);
root.setProperty("--pl", project.colors.light);
root.setProperty("--ac", project.colors.accent);

const FEATURES: Record<FeatureKind, { icon: string; title: string; text: string }> = {
  acustica: { icon: "🔇", title: tx("Parede acústica", "Acoustic walls", "Pared acústica"), text: tx("30% mais isolamento acústico entre os ambientes.", "30% more sound insulation between rooms.", "30% más aislamiento acústico entre ambientes.") },
  fechadura: { icon: "🔐", title: tx("Fechadura eletrônica", "Electronic lock", "Cerradura electrónica"), text: tx("Na porta de entrada do apartamento.", "On the apartment front door.", "En la puerta de entrada del departamento.") },
  varanda: { icon: "🍖", title: tx("Varanda gourmet", "Gourmet balcony", "Balcón gourmet"), text: tx("Bancada e ponto para churrasqueira.", "Counter and BBQ hookup.", "Mesada y punto para parrilla.") },
  ar: { icon: "❄️", title: tx("Infraestrutura de ar-condicionado", "Air conditioning ready", "Preinstalación de aire"), text: tx("Pronta para instalar o ar.", "Ready to install the AC.", "Lista para instalar el aire.") },
  janela: { icon: "🪟", title: tx("Janelas de até 1,5 m", "Windows up to 1.5 m", "Ventanas de hasta 1,5 m"), text: tx("Mais luz natural nos quartos.", "More daylight in the bedrooms.", "Más luz natural en los dormitorios.") },
  servico: { icon: "🧺", title: tx("Tanque", "Laundry sink", "Pileta"), text: tx("Área de serviço com tanque.", "Laundry area with sink.", "Lavadero con pileta.") },
  hidro: { icon: "🛁", title: tx("Terraço com hidromassagem", "Terrace with hot tub", "Terraza con hidromasaje"), text: tx("Deck e hidro na cobertura.", "Deck and hot tub on the penthouse.", "Deck e hidro en el penthouse.") },
};

const BLK = tx("Bloco", "Building", "Bloque"), APT = tx("Apto", "Unit", "Depto");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const wa = (msg: string) => `https://wa.me/${project.whatsapp}?text=${encodeURIComponent(msg)}`;
const WA_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"/></svg>`;

app.innerHTML = `
<div class="t3-canvas" id="cv"></div>
<div class="t3-labels" id="labels"></div>
<header class="t3-top">
  <button class="t3-back" id="back" hidden aria-label="${tx("Voltar ao condomínio", "Back to the condo", "Volver al condominio")}">←</button>
  <div class="t3-brand"><b>${esc(project.name)}</b><span>${esc(project.city)}</span></div>
  <a class="t3-demo" href="https://paginaspro.app.br/inicio" target="_blank" rel="noopener">${tx("Demonstração", "Demo", "Demostración")} · PáginasPro</a>
</header>
<div class="t3-hint" id="hint"></div>
<div class="t3-sun" id="sun">
  <button id="play" aria-label="${tx("Pausar o sol", "Pause the sun", "Pausar el sol")}">❚❚</button>
  <input type="range" id="hour" min="5" max="21" step="0.05" value="9.5" aria-label="${tx("Horário", "Time of day", "Horario")}">
  <span id="hourLbl">09:30</span>
</div>
<div class="t3-apt" id="aptbar" hidden>
  <div class="t3-plans" id="plans"></div>
  <div class="t3-modes" id="modes">
    <button data-m="fora">${tx("De fora", "Outside", "Afuera")}</button><button data-m="boneca">${tx("Casa de boneca", "Dollhouse", "Casa de muñecas")}</button><button data-m="andar">${tx("Andar por dentro", "Walk inside", "Caminar por dentro")}</button>
  </div>
</div>
<nav class="t3-rooms" id="rooms" hidden></nav>
<canvas class="t3-mini" id="mini" hidden aria-label="${tx("Planta: toque para ir até o ponto", "Floor plan: tap to go there", "Plano: toca para ir al punto")}"></canvas>
<button class="t3-auto" id="auto" hidden>▶ ${tx("Passeio automático", "Auto tour", "Paseo automático")}</button>
<div class="t3-fade" id="fade"></div>
<a class="t3-wa" id="wa" target="_blank" rel="noopener">${WA_ICON}<span>${tx("Falar com vendas", "Talk to sales", "Hablar con ventas")}</span></a>
<nav class="t3-tabs" id="tabs">
  <button data-t="condo" class="on">${tx("Condomínio", "Condo", "Condominio")}</button><button data-t="plantas">${tx("Plantas", "Floor plans", "Planos")}</button><button data-t="unidades">${tx("Unidades", "Units", "Unidades")}</button><button data-t="lazer">${tx("Lazer", "Amenities", "Ocio")}</button>
</nav>
<section class="t3-sheet" id="sheet" hidden><button class="t3-x" id="sheetX" aria-label="${tx("Fechar", "Close", "Cerrar")}">×</button><div id="sheetBody"></div></section>
<div class="t3-photo" id="photo" hidden><figure><img id="photoImg" alt=""><figcaption id="photoCap"></figcaption></figure></div>
<p class="t3-foot">${tx("Demonstração da PáginasPro para apresentação · plantas e imagens do site do empreendimento · não é material oficial", "PáginasPro demo for presentation · plans and images from the development's website · not official material", "Demostración de PáginasPro para presentación · planos e imágenes del sitio del emprendimiento · no es material oficial")}</p>
<div class="t3-loading" id="loading"><div></div><p>${tx("Montando o condomínio…", "Building the condo…", "Armando el condominio…")}</p></div>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
document.querySelector(".t3-top")!.insertBefore(langSwitch("t3-lang"), document.querySelector(".t3-demo"));

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
// Situação real (tabela tour_units, gravada pela construtora no link de edição). Sem nenhuma linha = exemplo.
const unitStatus = new Map<string, Status>();
let realStatus = false;
const editToken = new URLSearchParams(location.search).get("editar");
let canEdit = false;
const rest = (path: string, init?: RequestInit) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
/** Demonstração vencida: no lugar do tour, um aviso com o WhatsApp da PáginasPro. */
function showExpired() {
  const msg = encodeURIComponent(tx(`Olá! Vi a demonstração do Tour 3D do ${project.name} e quero saber como deixar oficial.`, `Hi! I saw the 3D Tour demo of ${project.name} and I want to make it official.`, `¡Hola! Vi la demostración del Tour 3D de ${project.name} y quiero saber cómo hacerlo oficial.`));
  app.innerHTML = `<div class="t3-expired"><div>
    <p class="t3-exp-k">Tour 3D · PáginasPro</p>
    <h1>${tx(`A demonstração do ${esc(project.name)} terminou`, `The ${esc(project.name)} demo has ended`, `La demostración de ${esc(project.name)} terminó`)}</h1>
    <p>${tx("Quer o tour 3D oficial, com as plantas, o lazer e o mapa de unidades atualizado pela sua equipe?", "Want the official 3D tour, with floor plans, amenities and a unit map your team keeps up to date?", "¿Quieres el tour 3D oficial, con planos, amenities y el mapa de unidades actualizado por tu equipo?")}</p>
    <a class="t3-btn wa" href="https://wa.me/5561992372216?text=${msg}" target="_blank" rel="noopener">${WA_ICON} ${tx("Falar com a PáginasPro", "Talk to PáginasPro", "Hablar con PáginasPro")}</a>
  </div></div>`;
}
async function loadUnits() {
  if (!SUPABASE_URL) return;
  try {
    const r = await rest("rpc/tour_open", { method: "POST", body: JSON.stringify({ p_slug: project.slug, p_count: !editToken }) });
    const info = r.ok ? await r.json() : null;
    if (info?.expired) return showExpired();
  } catch {
    /* sem conexão: segue com o tour */
  }
  try {
    const r = await rest(`tour_units?slug=eq.${encodeURIComponent(project.slug)}&select=block,unit,status`);
    const rows = r.ok ? ((await r.json()) as { block: string; unit: number; status: Status }[]) : [];
    unitStatus.clear();
    for (const u of rows) unitStatus.set(`${u.block}:${u.unit}`, u.status);
    realStatus = rows.length > 0;
  } catch {
    /* sem conexão: fica o exemplo */
  }
  if (editToken) {
    try {
      const r = await rest("rpc/tour_check", { method: "POST", body: JSON.stringify({ p_slug: project.slug, p_token: editToken }) });
      canEdit = r.ok && (await r.json()) === true;
    } catch {
      canEdit = false;
    }
    document.body.classList.toggle("editing", canEdit);
    hint(canEdit ? tx("Modo edição: em Unidades, toque numa unidade e escolha Disponível, Reservado ou Vendido.", "Edit mode: in Units, tap a unit and choose Available, Reserved or Sold.", "Modo edición: en Unidades, toca una unidad y elige Disponible, Reservado o Vendido.") : tx("Link de edição inválido.", "Invalid edit link.", "Enlace de edición inválido."));
  }
  if (!sheet.hidden && sheet.dataset.tab === "unidades") openUnits();
}
async function saveUnits(units: { block: string; unit: number; status: Status }[]) {
  const r = await rest("rpc/tour_set_units", { method: "POST", body: JSON.stringify({ p_slug: project.slug, p_token: editToken, p_units: units }) });
  if (!r.ok) {
    hint(tx("Não consegui salvar. Confira a internet e tente de novo.", "Couldn't save. Check your connection and try again.", "No pude guardar. Revisa la conexión e intenta de nuevo."));
    return false;
  }
  // primeira gravação: as outras unidades deixam de ser "exemplo" e ficam disponíveis
  if (!realStatus) unitStatus.clear();
  for (const u of units) unitStatus.set(`${u.block}:${u.unit}`, u.status);
  realStatus = true;
  return true;
}
function allUnits(status: Status) {
  return condo.blocks.flatMap((b) =>
    Array.from({ length: b.floors + 1 }, (_, i) => i + 1).flatMap((f) => (f > b.floors ? [1, 2] : [1, 2, 3, 4]).map((n) => ({ block: b.id, unit: f * 100 + n, status }))),
  );
}
function statusOf(block: string, n: number): Status {
  if (realStatus) return unitStatus.get(`${block}:${n}`) ?? "disponivel";
  let h = 2166136261;
  for (const ch of block + n) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const v = (h >>> 0) % 20;
  return v < 10 ? "vendido" : v < 13 ? "reservado" : "disponivel";
}
const STATUS_TXT: Record<Status, string> = { disponivel: tx("Disponível", "Available", "Disponible"), reservado: tx("Reservado", "Reserved", "Reservado"), vendido: tx("Vendido", "Sold", "Vendido") };

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
for (const b of condo.blocks) addLabel(`${BLK} <b>${b.id}</b>`, condo.blockTop(b.id), "condo", "block", () => openBlock(b.id));
for (const hsp of condo.hotspots) {
  const a = project.amenities.find((x) => x.id === hsp.id);
  if (a?.short) addLabel(`<i></i>${esc(a.short)}`, hsp.pos, "condo", "spot", () => showAmenity(a.id));
}
// os espaços internos ficam juntos numa etiqueta só (abre a galeria)
const indoor = project.amenities.filter((a) => a.photo && !a.short && a.id !== "local").length;
addLabel(`<i></i>${tx("Clube", "Clubhouse", "Club")} · ${indoor} ${tx("espaços", "spaces", "espacios")}`, condo.clubPos, "condo", "spot club", () => openLazer());

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
  stopAuto();
  buildMarkers();
  buildMini();
  lastHere = "";
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
  markers.visible = m === "andar";
  tapRing.visible = m === "andar";
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
    camera.fov = walkFov();
    camera.updateProjectionMatrix();
    if (prev !== "andar" || reset) {
      walk.x = a.entry.x;
      walk.z = a.entry.z;
      walk.yaw = a.entry.yaw;
      walk.pitch = -0.3;
      walkTo = null;
    }
    fly = null;
    hint(tx("Toque no chão ou nos círculos para andar. Arraste para olhar em volta.", "Tap the floor or the circles to walk. Drag to look around.", "Toca el piso o los círculos para caminar. Arrastra para mirar alrededor."));
  } else {
    stopAuto();
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

/** Tamanho no chão (cm) de cada móvel, para a câmera não parar em cima dele. */
const FOOT: Record<string, [number, number]> = {
  bed2: [175, 215], bed1: [100, 205], wardrobe: [0, 60], sofa: [0, 95], armchair: [80, 80], table: [0, 0], counter: [0, 62], fridge: [72, 68],
  bancada: [0, 52], bar: [0, 0], desk: [0, 90], tv: [0, 42], hidro: [0, 0], lounger: [70, 195], bistro: [140, 140], toilet: [45, 60], basin: [0, 48],
  washer: [62, 62], tanque: [58, 52], grill: [66, 56], night: [48, 42], plant: [50, 50], shower: [0, 0], pergola: [0, 0],
};
function occupied(xcm: number, ycm: number, pad = 30) {
  return state.plan.items.some((it) => {
    const f = FOOT[it.t];
    if (!f) return false;
    let w = f[0] || it.w || 60, d = f[1] || it.d || 60;
    if (it.t === "table") { w = (it.w ?? 140) + 100; d = (it.d ?? 90) + 100; }
    if (it.f === "E" || it.f === "W") [w, d] = [d, w];
    return Math.abs(xcm - it.x) < w / 2 + pad && Math.abs(ycm - it.y) < d / 2 + pad;
  });
}

/** Ponto de "foto de imobiliária": num canto livre do cômodo (o mais perto da porta), olhando na diagonal. */
function spot(r: RoomInfo) {
  const [x0, y0, x1, y1] = r.room.rects.reduce((a, b) => ((b[2] - b[0]) * (b[3] - b[1]) > (a[2] - a[0]) * (a[3] - a[1]) ? b : a));
  // porta do cômodo (para preferir o canto por onde se entra)
  let door: [number, number] | null = null;
  for (const o of state.plan.openings) {
    if (o.kind === "window") continue;
    const mid = (o.a + o.b) / 2;
    if (o.dir === "h" && mid > x0 && mid < x1 && (Math.abs(o.at - y0) < 12 || Math.abs(o.at - y1) < 12)) door = [mid, o.at];
    else if (o.dir === "v" && mid > y0 && mid < y1 && (Math.abs(o.at - x0) < 12 || Math.abs(o.at - x1) < 12)) door = [o.at, mid];
    if (door) break;
  }
  const inset = Math.min(45, (x1 - x0) / 4, (y1 - y0) / 4);
  const corners: [number, number, number, number][] = [
    [x0 + inset, y0 + inset, x1, y1], [x1 - inset, y0 + inset, x0, y1], [x0 + inset, y1 - inset, x1, y0], [x1 - inset, y1 - inset, x0, y0],
  ];
  const ref = door ?? [(x0 + x1) / 2, (y0 + y1) / 2];
  corners.sort((p, q) => Math.hypot(p[0] - ref[0], p[1] - ref[1]) - Math.hypot(q[0] - ref[0], q[1] - ref[1]));
  let pick = corners.find((c) => !occupied(c[0], c[1], 30)) ?? corners.find((c) => !occupied(c[0], c[1], 8));
  if (!pick) {
    // cantos ocupados: entra pela porta e olha para o lado mais comprido do cômodo
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const px = door ? cx + (door[0] - cx) * 0.6 : cx, py = door ? cy + (door[1] - cy) * 0.6 : cy;
    pick = x1 - x0 >= y1 - y0 ? [px, py, px - cx > 0 ? x0 : x1, py] : [px, py, px, py - cy > 0 ? y0 : y1];
  }
  const [px, py, tx, ty] = pick;
  const x = px / 100, z = py / 100;
  return { x, z, yaw: Math.atan2(-(tx / 100 - x), -(ty / 100 - z)) };
}

function goRoom(r: RoomInfo) {
  const s = spot(r);
  if (state.mode !== "andar") setMode("andar");
  moveTo(s.x, s.z, s.yaw);
  markRoom(r.room.id);
}
function markRoom(id: string) {
  $("rooms").querySelectorAll<HTMLElement>("button").forEach((b) => {
    const on = b.dataset.r === id;
    b.classList.toggle("on", on);
    if (on) b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  });
}

// ---------------- andar por dentro: toque no chão (ou nos círculos) para ir, arrastar para olhar
const EYE = 1.45;
const walk = { x: 0, z: 0, yaw: 0, pitch: -0.3, keys: new Set<string>() };
let walkTo: null | { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; k: number; dur: number } = null;
let fading = false;
const fadeEl = $("fade");

/** Lente de "foto de imobiliária": uns 64° na largura, também com o celular em pé. */
function walkFov() {
  const v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(32)) / camera.aspect));
  return THREE.MathUtils.clamp(v, 72, 104);
}

/** Tem parede no caminho reto entre os dois pontos? */
function blocked(x0: number, z0: number, x1: number, z1: number) {
  const cols = state.apt!.colliders;
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.12);
  for (let i = 1; i < n; i++) {
    const px = x0 + ((x1 - x0) * i) / n, pz = z0 + ((z1 - z0) * i) / n;
    const p = collide(cols, px, pz, 0.1);
    if (Math.hypot(p.x - px, p.z - pz) > 0.02) return true;
  }
  return false;
}

/** Vai até o ponto: desliza se o caminho está livre; atrás de parede, esmaece e aparece lá. */
function moveTo(x: number, z: number, yaw?: number) {
  const a = state.apt!;
  const p = collide(a.colliders, x, z, 0.3);
  x = THREE.MathUtils.clamp(p.x, 0.25, a.size.w - 0.25);
  z = THREE.MathUtils.clamp(p.z, 0.25, a.size.d - 0.25);
  const y1 = yaw ?? walk.yaw;
  if (blocked(walk.x, walk.z, x, z)) {
    walkTo = null;
    fading = true;
    fadeEl.classList.add("on");
    setTimeout(() => {
      walk.x = x;
      walk.z = z;
      walk.yaw = y1;
      walk.pitch = -0.3;
      fadeEl.classList.remove("on");
      setTimeout(() => (fading = false), 220);
    }, 220);
    return;
  }
  const L = Math.hypot(x - walk.x, z - walk.z);
  walkTo = { x0: walk.x, z0: walk.z, y0: walk.yaw, x1: x, z1: z, y1, k: 0, dur: THREE.MathUtils.clamp(L / 2.2, 0.35, 1.5) };
}

/** Em que cômodo fica o ponto (metros). */
function roomAt(x: number, z: number) {
  return state.apt?.rooms.find((r) => r.room.rects.some(([x0, y0, x1, y1]) => x * 100 >= x0 && x * 100 < x1 && z * 100 >= y0 && z * 100 < y1));
}

// círculos no chão de cada cômodo + anel do toque
const markers = new THREE.Group();
aptScene.add(markers);
const ringGeo = new THREE.RingGeometry(0.22, 0.3, 32);
const dotGeo = new THREE.CircleGeometry(0.07, 16);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
function buildMarkers() {
  markers.clear();
  for (const r of state.apt!.rooms) {
    if (r.room.nav === false) continue;
    const s = spot(r);
    const g = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, ringMat);
    const dot = new THREE.Mesh(dotGeo, ringMat);
    for (const m of [ring, dot]) {
      m.rotation.x = -Math.PI / 2;
      m.userData.room = r.room.id;
      g.add(m);
    }
    // área de toque maior que o desenho
    const hit = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.rotation.x = -Math.PI / 2;
    hit.userData.room = r.room.id;
    g.add(hit);
    g.position.set(s.x, 0.03, s.z);
    markers.add(g);
  }
}
const tapRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: project.colors.accent, transparent: true, opacity: 0, depthWrite: false }));
tapRing.rotation.x = -Math.PI / 2;
aptScene.add(tapRing);
let tapT = 9;

// passeio automático: visita os cômodos em ordem, olhando em volta
let auto: null | { i: number; t: number; base: number; list: RoomInfo[] } = null;
function startAuto() {
  const list = state.apt!.rooms.filter((r) => r.room.nav !== false);
  auto = { i: 0, t: 0, base: 0, list };
  $("auto").textContent = `❚❚ ${tx("Parar passeio", "Stop tour", "Parar paseo")}`;
  goRoom(list[0]);
}
function stopAuto() {
  if (!auto) return;
  auto = null;
  $("auto").textContent = `▶ ${tx("Passeio automático", "Auto tour", "Paseo automático")}`;
}
$("auto").addEventListener("click", () => (auto ? stopAuto() : startAuto()));
function stepAuto(dt: number) {
  if (!auto || walkTo || fading) return;
  if (auto.t === 0) auto.base = walk.yaw;
  auto.t += dt;
  walk.yaw = auto.base + Math.sin(auto.t * 0.75) * 0.55;
  if (auto.t > 5) {
    auto.i++;
    auto.t = 0;
    if (auto.i >= auto.list.length) return stopAuto();
    goRoom(auto.list[auto.i]);
  }
}

// arrastar para olhar
let look: null | { id: number; x: number; y: number } = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (state.view === "apt" && state.mode === "andar") {
    look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stopAuto();
  }
});
addEventListener("pointermove", (e) => {
  if (!look || e.pointerId !== look.id) return;
  walk.yaw += (e.clientX - look.x) * 0.005;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch + (e.clientY - look.y) * 0.004, -0.9, 0.6);
  look.x = e.clientX;
  look.y = e.clientY;
  if (walkTo) walkTo.y1 = walkTo.y0 = walk.yaw;
});
addEventListener("pointerup", (e) => { if (look?.id === e.pointerId) look = null; });
addEventListener("keydown", (e) => walk.keys.add(e.key.toLowerCase()));
addEventListener("keyup", (e) => walk.keys.delete(e.key.toLowerCase()));

function stepWalk(dt: number) {
  const a = state.apt!;
  if (walkTo) {
    walkTo.k = Math.min(1, walkTo.k + dt / walkTo.dur);
    const e = walkTo.k < 0.5 ? 2 * walkTo.k * walkTo.k : 1 - (-2 * walkTo.k + 2) ** 2 / 2;
    walk.x = walkTo.x0 + (walkTo.x1 - walkTo.x0) * e;
    walk.z = walkTo.z0 + (walkTo.z1 - walkTo.z0) * e;
    let dy = walkTo.y1 - walkTo.y0;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    walk.yaw = walkTo.y0 + dy * e;
    if (walkTo.k >= 1) walkTo = null;
  } else {
    // teclado (computador): W/S anda, A/D de lado, setas giram
    let f = 0, s = 0;
    const k = walk.keys;
    if (k.has("w") || k.has("arrowup")) f += 1;
    if (k.has("s") || k.has("arrowdown")) f -= 1;
    if (k.has("a")) s -= 1;
    if (k.has("d")) s += 1;
    if (k.has("arrowleft")) walk.yaw += dt * 1.8;
    if (k.has("arrowright")) walk.yaw -= dt * 1.8;
    if (f || s) {
      stopAuto();
      const sin = Math.sin(walk.yaw), cos = Math.cos(walk.yaw);
      const p = collide(a.colliders, walk.x + (-sin * f + cos * s) * 1.6 * dt, walk.z + (-cos * f - sin * s) * 1.6 * dt);
      walk.x = THREE.MathUtils.clamp(p.x, 0.2, a.size.w - 0.2);
      walk.z = THREE.MathUtils.clamp(p.z, 0.2, a.size.d - 0.2);
    }
  }
  stepAuto(dt);
  camera.position.set(walk.x, EYE, walk.z);
  camera.rotation.set(walk.pitch, walk.yaw, 0, "YXZ");
  fill.position.set(walk.x, 2.2, walk.z);
  // círculos: some o do lugar onde você está, os outros pulsam
  const here = roomAt(walk.x, walk.z)?.room.id;
  for (const g of markers.children) {
    const d = Math.hypot(g.position.x - walk.x, g.position.z - walk.z);
    g.visible = d > 0.8;
    g.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.06);
  }
  if (here && !auto) markRoomQuiet(here);
  tapT += dt;
  (tapRing.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - tapT * 1.4);
  tapRing.scale.setScalar(1 + tapT * 1.2);
  drawMini();
}
let lastHere = "";
function markRoomQuiet(id: string) {
  if (id === lastHere) return;
  lastHere = id;
  $("rooms").querySelectorAll<HTMLElement>("button").forEach((b) => b.classList.toggle("on", b.dataset.r === id));
}

// minimapa: a planta vista de cima com você nela; toque para ir até o ponto
const mini = $<HTMLCanvasElement>("mini");
const miniCtx = mini.getContext("2d")!;
const miniPad = 6;
let miniScale = 1;
function buildMini() {
  const { w, d } = state.apt!.size;
  const W = 132;
  miniScale = (W - miniPad * 2) / w;
  const H = Math.round(d * miniScale + miniPad * 2);
  const dpr = Math.min(devicePixelRatio, 2);
  mini.width = W * dpr;
  mini.height = H * dpr;
  mini.style.width = `${W}px`;
  mini.style.height = `${H}px`;
  miniCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function drawMini() {
  if (mini.hidden || !state.apt) return;
  const g = miniCtx, s = miniScale, P = miniPad;
  g.clearRect(0, 0, mini.width, mini.height);
  const here = roomAt(walk.x, walk.z)?.room.id;
  for (const r of state.apt.rooms) {
    const out = r.room.kind === "varanda" || r.room.kind === "terraco";
    g.fillStyle = r.room.id === here ? project.colors.accent : out ? "#d8cbb4" : "#f4f1ea";
    for (const [x0, y0, x1, y1] of r.room.rects) g.fillRect(P + (x0 / 100) * s, P + (y0 / 100) * s, ((x1 - x0) / 100) * s, ((y1 - y0) / 100) * s);
  }
  g.fillStyle = "#3a3a36";
  for (const c of state.apt.colliders) g.fillRect(P + c.x0 * s, P + c.z0 * s, Math.max(1, (c.x1 - c.x0) * s), Math.max(1, (c.z1 - c.z0) * s));
  // você: ponto + cone de visão
  const cx = P + walk.x * s, cz = P + walk.z * s;
  const ang = -walk.yaw - Math.PI / 2;
  g.fillStyle = "rgba(78,90,64,.35)";
  g.beginPath();
  g.moveTo(cx, cz);
  g.arc(cx, cz, 22, ang - 0.6, ang + 0.6);
  g.closePath();
  g.fill();
  g.fillStyle = project.colors.primary;
  g.beginPath();
  g.arc(cx, cz, 4.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#fff";
  g.lineWidth = 1.5;
  g.stroke();
}
mini.addEventListener("click", (e) => {
  const r = mini.getBoundingClientRect();
  const x = (e.clientX - r.left - miniPad) / miniScale, z = (e.clientY - r.top - miniPad) / miniScale;
  const room = roomAt(x, z);
  if (!room) return;
  stopAuto();
  const dx = x - walk.x, dz = z - walk.z;
  moveTo(x, z, Math.hypot(dx, dz) > 0.3 ? Math.atan2(-dx, -dz) : undefined);
});

// ---------------- toques: blocos no condomínio, chão/círculos no apartamento
const ray = new THREE.Raycaster();
let down: null | { x: number; y: number; t: number } = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  stopIntro();
});
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 500) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  if (state.view === "apt") {
    if (state.mode !== "andar" || !state.apt) return;
    const m = ray.intersectObjects(markers.children, true).find((h) => h.object.parent?.visible);
    const room = m && state.apt.rooms.find((x) => x.room.id === m.object.userData.room);
    if (room) return goRoom(room);
    const hit = ray.intersectObjects(state.apt.floors, false)[0];
    if (!hit) return;
    tapRing.position.set(hit.point.x, 0.04, hit.point.z);
    tapT = 0;
    moveTo(hit.point.x, hit.point.z);
    return;
  }
  const hit = ray.intersectObjects(condo.blocks.flatMap((b) => b.pick), false)[0];
  if (hit) openBlock(hit.object.userData.block);
});

// ---------------- painéis
const sheet = $("sheet"), body = $("sheetBody");
function openSheet(html: string, tab?: string) {
  body.innerHTML = html;
  sheet.dataset.tab = tab ?? "";
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
  const setst = t.closest<HTMLElement>("[data-setst]");
  if (setst && state.unit && canEdit) {
    const { block, floor, final } = state.unit;
    saveUnits([{ block, unit: floor * 100 + final, status: setst.dataset.setst as Status }]).then((ok) => ok && openUnits(block));
    return;
  }
  if (t.closest("[data-reset]") && canEdit) {
    if (confirm(tx("Marcar todas as unidades de todos os blocos como disponíveis?", "Mark every unit in every building as available?", "¿Marcar todas las unidades de todos los bloques como disponibles?"))) saveUnits(allUnits("disponivel")).then((ok) => ok && openUnits());
    return;
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
    hint(tx(`Apto ${floor * 100 + final} do Bloco ${block} destacado no prédio.`, `Unit ${floor * 100 + final} in Building ${block} highlighted.`, `Depto ${floor * 100 + final} del Bloque ${block} destacado en el edificio.`));
  }
});

function openBlock(id: string) {
  const b = condo.blocks.find((x) => x.id === id)!;
  const total = b.floors * 4 + 2;
  const free = Array.from({ length: b.floors + 1 }, (_, i) => i + 1)
    .flatMap((f) => (f > b.floors ? [1, 2] : [1, 2, 3, 4]).map((n) => statusOf(id, f * 100 + n)))
    .filter((s) => s === "disponivel").length;
  openSheet(`
    <h2>${BLK} ${id}</h2>
    <p class="t3-sub">${b.floors} ${tx("andares + cobertura", "floors + penthouse", "pisos + penthouse")} · ${total} ${tx("unidades", "units", "unidades")} · <b>${free} ${tx("disponíveis", "available", "disponibles")}</b>${realStatus ? "" : ` <small>(${tx("exemplo", "sample", "ejemplo")})</small>`}</p>
    <h3>${tx("Entrar num apartamento", "Go inside an apartment", "Entrar a un departamento")}</h3>
    <div class="t3-grid">${project.plans.map((p) => planCard(p)).join("")}</div>
    <button class="t3-btn" data-blocktab="${id}">${tx(`Ver mapa de unidades do Bloco ${id}`, `See unit map of Building ${id}`, `Ver mapa de unidades del Bloque ${id}`)}</button>`, "condo");
  const p = b.group.position.clone();
  flyTo(p.clone().add(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.group.rotation.y).multiplyScalar(95)).setY(40), p.clone().setY(4), 1.2);
}

function openPlans() {
  openSheet(`
    <h2>${tx("Plantas", "Floor plans", "Planos")}</h2>
    <p class="t3-sub">${tx("Toque numa planta para ver em 3D e andar por dentro.", "Tap a plan to see it in 3D and walk inside.", "Toca un plano para verlo en 3D y caminar por dentro.")}</p>
    <div class="t3-grid">${project.plans.map((p) => planCard(p)).join("")}</div>
    <h3>${tx("Diferenciais", "Highlights", "Diferenciales")}</h3>
    <ul class="t3-list">${project.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`, "plantas");
}

function openUnits(block = state.unit?.block ?? condo.blocks[0].id) {
  const b = condo.blocks.find((x) => x.id === block)!;
  let rows = "";
  for (let f = b.floors + 1; f >= 1; f--) {
    const finals = f > b.floors ? [1, 2] : [1, 2, 3, 4];
    rows += `<div class="t3-row ${f > b.floors ? "cob" : ""}"><span>${f > b.floors ? tx("Cob.", "PH", "PH") : f + "º"}</span>${finals
      .map((n) => {
        const num = f * 100 + n;
        const st = statusOf(block, num);
        const sel = state.unit && state.unit.block === block && state.unit.floor === f && state.unit.final === n;
        return `<button class="u ${st}${sel ? " sel" : ""}" data-unit="${block}:${f}:${n}">${num}</button>`;
      })
      .join("")}</div>`;
  }
  const u = state.unit && state.unit.block === block ? state.unit : null;
  let card = `<p class="t3-sub">${tx("Toque numa unidade.", "Tap a unit.", "Toca una unidad.")}</p>`;
  if (u) {
    const num = u.floor * 100 + u.final;
    const st = statusOf(u.block, num);
    const plan = project.plans.find((p) => p.id === planOfUnit(u.floor, u.final, b.floors))!;
    card = `<div class="t3-unit">
      <div><b>${APT} ${num} · ${BLK} ${u.block}</b><span class="st ${st}">${STATUS_TXT[st]}</span></div>
      <p>${esc(plan.name)} · ${esc(plan.area)}</p>
      <div class="t3-row2">
        <button class="t3-btn" data-plan="${plan.id}" data-mode="andar">${tx("Ver por dentro", "See inside", "Ver por dentro")}</button>
        <button class="t3-btn ghost" data-see="1">${tx("Ver no prédio", "See on the building", "Ver en el edificio")}</button>
      </div>
      ${canEdit ? `<div class="t3-setst">${(["disponivel", "reservado", "vendido"] as Status[]).map((s) => `<button data-setst="${s}" class="${s}${s === st ? " on" : ""}">${STATUS_TXT[s]}</button>`).join("")}</div>` : ""}
      ${st !== "vendido" && !canEdit ? `<a class="t3-btn wa" target="_blank" rel="noopener" href="${wa(tx(`Olá! Vi o tour 3D do ${project.name} e tenho interesse no apto ${num} do Bloco ${u.block} (${plan.short}).`, `Hi! I saw the ${project.name} 3D tour and I'm interested in unit ${num}, Building ${u.block} (${plan.short}).`, `¡Hola! Vi el tour 3D de ${project.name} y me interesa el depto ${num} del Bloque ${u.block} (${plan.short}).`))}">${WA_ICON} ${tx("Tenho interesse", "I'm interested", "Me interesa")}</a>` : ""}
    </div>`;
  }
  openSheet(`
    <h2>${tx("Mapa de unidades", "Unit map", "Mapa de unidades")}</h2>
    <div class="t3-blocks">${condo.blocks.map((x) => `<button data-blocktab="${x.id}" class="${x.id === block ? "on" : ""}">${BLK} ${x.id}</button>`).join("")}</div>
    <div class="t3-legend"><i class="disponivel"></i>${STATUS_TXT.disponivel} <i class="reservado"></i>${STATUS_TXT.reservado} <i class="vendido"></i>${STATUS_TXT.vendido}</div>
    <div class="t3-map">${rows}</div>
    ${canEdit ? `<p class="t3-edit">✏️ ${tx("Modo edição: toque numa unidade e escolha a situação. Salva na hora para todo mundo.", "Edit mode: tap a unit and choose its status. It saves right away for everyone.", "Modo edición: toca una unidad y elige su estado. Se guarda al instante para todos.")}</p>` : ""}
    <p class="t3-note">${realStatus ? tx("Situação atualizada pela equipe de vendas.", "Status kept up to date by the sales team.", "Estado actualizado por el equipo de ventas.") : tx("Situação das unidades de exemplo, só para a demonstração.", "Sample unit status, for this demo only.", "Estado de las unidades de ejemplo, solo para la demostración.")}</p>
    ${canEdit ? `<button class="t3-btn ghost" data-reset="1">${tx("Marcar todas como disponíveis", "Mark all as available", "Marcar todas como disponibles")}</button>` : ""}
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
    <h2>${tx("Lazer clube", "Clubhouse amenities", "Ocio club")}</h2>
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
  stopAuto();
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
  hint(tx("Toque num bloco para escolher o apartamento. Toque nos pontos do lazer para ver as fotos.", "Tap a building to pick an apartment. Tap the amenity dots to see the photos.", "Toca un bloque para elegir el departamento. Toca los puntos de ocio para ver las fotos."));
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
  if (r) {
    stopAuto();
    goRoom(r);
  }
});

function syncUi() {
  const apt = state.view === "apt";
  $("back").hidden = !apt;
  $("aptbar").hidden = !apt;
  $("rooms").hidden = !apt;
  $("mini").hidden = !(apt && state.mode === "andar");
  $("auto").hidden = !(apt && state.mode === "andar");
  $("sun").hidden = apt;
  document.body.classList.toggle("walking", apt && state.mode === "andar");
  const msg = state.unit
    ? tx(`Olá! Vi o tour 3D do ${project.name} e quero saber do apto ${state.unit.floor * 100 + state.unit.final} do Bloco ${state.unit.block}.`, `Hi! I saw the ${project.name} 3D tour and I'd like to know about unit ${state.unit.floor * 100 + state.unit.final}, Building ${state.unit.block}.`, `¡Hola! Vi el tour 3D de ${project.name} y quiero saber del depto ${state.unit.floor * 100 + state.unit.final} del Bloque ${state.unit.block}.`)
    : apt
      ? tx(`Olá! Vi o tour 3D do ${project.name} e quero saber mais do apartamento de ${state.plan.short.toLowerCase()} (${state.plan.area}).`, `Hi! I saw the ${project.name} 3D tour and I'd like to know more about the ${state.plan.short.toLowerCase()} apartment (${state.plan.area}).`, `¡Hola! Vi el tour 3D de ${project.name} y quiero saber más del departamento de ${state.plan.short.toLowerCase()} (${state.plan.area}).`)
      : tx(`Olá! Vi o tour 3D do ${project.name} e quero saber mais.`, `Hi! I saw the ${project.name} 3D tour and I'd like to know more.`, `¡Hola! Vi el tour 3D de ${project.name} y quiero saber más.`);
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
  if (state.view === "apt" && state.mode === "andar") camera.fov = walkFov();
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
    aptHemi.intensity = state.mode === "andar" ? 1.05 : 1.1;
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
loadUnits();
requestAnimationFrame(() => {
  frame();
  setTimeout(() => $("loading").classList.add("off"), 250);
});
