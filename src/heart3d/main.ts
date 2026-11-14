// Coração 3D (PáginasPro): /coracao/<slug>. Coração normal × tetralogia de Fallot para o médico explicar ao paciente:
// batendo, por fora, por dentro (corte) e com o fluxo do sangue; os 4 defeitos numerados. A forma vem pronta de
// public/coracao/<tipo>.bin (gerada por scripts/heart-mesh.ts a partir de anatomy.ts).
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { flowPaths, type Kind } from "./anatomy";
import type { V3 } from "./sdf";
import { DEFECTS, INTRO, STRUCTURES, TREATMENT, type Spot } from "./texts";
import { lang, langSwitch, pitchMsg, t as T } from "../i18n3d";

type Show = Kind | "both";
type Mode = "out" | "cut" | "flow";
const WHATSAPP = "5561992372216";
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const L = (x: { pt: string; en: string; es: string }) => x[lang] ?? x.pt;
const params = new URLSearchParams(location.search);
document.title = `${T("Coração 3D", "3D Heart", "Corazón 3D")} · ${T("demonstração", "demo", "demostración")}`;

$("app").innerHTML = `
<div class="h3-canvas" id="canvas"></div>
<div class="h3-labels" id="labels"></div>
<header class="h3-top">
  <div class="h3-brand"><small>${T("Anatomia 3D", "3D anatomy", "Anatomía 3D")}</small><b>${T("Coração", "Heart", "Corazón")}</b></div>
  <a class="h3-demo" href="https://paginaspro.app.br/inicio" target="_blank" rel="noopener">${T("Demonstração", "Demo", "Demostración")}<small>PáginasPro</small></a>
</header>
<div class="h3-seg" id="seg">
  <button data-k="normal">${T("Normal", "Normal", "Normal")}</button>
  <button data-k="tof">${T("Tetralogia de Fallot", "Tetralogy of Fallot", "Tetralogía de Fallot")}</button>
  <button data-k="both">${T("Comparar", "Compare", "Comparar")}</button>
</div>
<section class="h3-card" id="card"></section>
<div class="h3-cut" id="cutBox" hidden><span>${T("Corte", "Cut", "Corte")}</span><input type="range" id="cut" min="0" max="100" value="50" aria-label="${T("Profundidade do corte", "Cut depth", "Profundidad del corte")}"></div>
<nav class="h3-bar">
  <div class="h3-modes" id="modes">
    <button data-m="out"><i>◉</i>${T("Por fora", "Outside", "Por fuera")}</button>
    <button data-m="cut"><i>◐</i>${T("Por dentro", "Inside", "Por dentro")}</button>
    <button data-m="flow"><i>⇄</i>${T("Fluxo do sangue", "Blood flow", "Flujo de sangre")}</button>
  </div>
  <div class="h3-tools">
    <button id="beat" class="on" aria-label="${T("Batimento", "Heartbeat", "Latido")}">♥<span>${T("Batendo", "Beating", "Latiendo")}</span></button>
    <button id="sound" aria-label="${T("Som", "Sound", "Sonido")}">🔈<span>${T("Som", "Sound", "Sonido")}</span></button>
    <button id="labelsBtn" class="on" aria-label="${T("Nomes", "Names", "Nombres")}">Aa<span>${T("Nomes", "Names", "Nombres")}</span></button>
    <a id="wa" class="h3-wa" target="_blank" rel="noopener">${T("Quero no meu consultório", "I want this for my clinic", "Lo quiero en mi consultorio")}</a>
  </div>
</nav>
<div class="h3-load" id="load"><div class="h3-pulse">♥</div><span>${T("Preparando o coração…", "Preparing the heart…", "Preparando el corazón…")}</span></div>
`;
$("app").querySelector(".h3-top")!.appendChild(langSwitch("h3-lang"));
$<HTMLAnchorElement>("wa").href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(pitchMsg(T("do coração 3D", "of the 3D heart", "del corazón 3D")))}`;

// ---------- cena
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
$("canvas").appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 90;
controls.addEventListener("start", () => (fly = null));

const key = new THREE.DirectionalLight(0xfff1e6, 2.4);
key.position.set(-6, 9, 10);
const rim = new THREE.DirectionalLight(0x9ec4ff, 1.6);
rim.position.set(8, 4, -10);
const fill = new THREE.DirectionalLight(0xffd9cc, 0.6);
fill.position.set(6, -6, 6);
scene.add(key, rim, fill, new THREE.HemisphereLight(0x8fb2d6, 0x2a1210, 0.35));

// ---------- material: cor por parte (fora/dentro), gordura nos sulcos, sombra de ambiente, relevo e corte
const linear = (hex: number) => new THREE.Color(hex);
const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);
const uniforms = {
  uBeat: { value: 0 },
  uAtr: { value: 0 },
  uFat: { value: linear(0xd6ae5c) },
  uCut: { value: linear(0xc86e5c) },
  uHiRV: { value: 0 },
  uCutN: { value: new THREE.Vector3(0, 0, 1) },
  uGlass: { value: 0 },
};
/** Batimento no vertex shader (ventrículos encolhem na sístole, átrios antes, aorta e pulmonar dilatam). */
function beatVertex(sh: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(sh.uniforms, uniforms);
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", `#include <common>
attribute vec4 info; attribute vec3 tint; varying vec4 vInfo; varying vec3 vObj; varying vec3 vTint; uniform float uBeat; uniform float uAtr;`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
vInfo = info; vObj = position; vTint = pow(tint, vec3(2.2));
float part = info.x;
if (part < 1.5) { vec3 c = vec3(0.7, -0.9, 0.2); transformed = c + (transformed - c) * (1.0 - 0.05 * uBeat); }
else if (part < 2.5) { vec3 c = vec3(-2.6, 0.95, 0.05); transformed = c + (transformed - c) * (1.0 - 0.06 * uAtr); }
else if (part < 3.5) { vec3 c = vec3(0.85, 1.55, -2.45); transformed = c + (transformed - c) * (1.0 - 0.06 * uAtr); }
else if (part < 5.5) { transformed += normal * 0.05 * uBeat; }`);
}
/** Corte "tampado": as faces de trás e da frente marcam no stencil onde o plano passa por dentro da parede,
 *  e um plano com textura de músculo é desenhado só ali (técnica do exemplo de clipping com stencil do three.js). */
function stencilMaterial(side: THREE.Side, op: THREE.StencilOp) {
  const m = new THREE.MeshBasicMaterial({
    depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc,
    side, clippingPlanes: [cutPlane], stencilFail: op, stencilZFail: op, stencilZPass: op,
  });
  m.onBeforeCompile = beatVertex;
  return m;
}
function fiberTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d")!;
  x.fillStyle = "#c66b59";
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * 512, a = (Math.random() - 0.5) * 0.25, len = 60 + Math.random() * 160, x0 = Math.random() * 512;
    x.strokeStyle = Math.random() < 0.5 ? `rgba(140,50,40,${0.12 + Math.random() * 0.18})` : `rgba(230,150,130,${0.1 + Math.random() * 0.15})`;
    x.lineWidth = 1 + Math.random() * 2.5;
    x.beginPath();
    x.moveTo(x0, y);
    x.quadraticCurveTo(x0 + len / 2, y + Math.sin(a) * 40 + (Math.random() - 0.5) * 10, x0 + len, y + Math.sin(a) * 80);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}
const capMat = new THREE.MeshStandardMaterial({
  map: fiberTexture(), roughness: 0.75, metalness: 0,
  stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
});
const cap = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), capMat);
cap.renderOrder = 2;
cap.onAfterRender = (r) => r.clearStencil();
cap.visible = false;
scene.add(cap);

function heartMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.32, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xff9a8a),
    side: THREE.FrontSide, clippingPlanes: [cutPlane],
  });
  m.onBeforeCompile = (sh) => {
    beatVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec4 vInfo; varying vec3 vObj; varying vec3 vTint;
uniform vec3 uFat; uniform float uHiRV; uniform vec3 uCut; uniform vec3 uCutN; uniform float uGlass;
float h3noise(vec3 p) {
  // ondas suaves torcidas (o ruído de grade deixava quadradinhos na superfície)
  vec3 q = p + 0.6 * sin(p.yzx * 1.7 + 1.3);
  return 0.5 + 0.5 * (sin(q.x * 1.9 + sin(q.z * 1.3)) * 0.5 + sin(q.y * 2.3 + sin(q.x * 1.1 + 0.7)) * 0.3 + sin(q.z * 2.9 + q.y) * 0.2);
}
float h3fbm(vec3 p) { return 0.55 * h3noise(p) + 0.3 * h3noise(p * 2.13 + 3.1) + 0.15 * h3noise(p * 4.37 + 7.7); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
int pi = int(vInfo.x + 0.5);
float isOut = vInfo.y;
float fat = vInfo.z / 255.0;
float ao = vInfo.w / 255.0;
float n1 = h3fbm(vObj * 1.3);
vec3 base;
if (gl_FrontFacing) {
  base = vTint;
  base *= 0.88 + 0.24 * n1;
  if (isOut > 0.5 && pi < 4) {
    float f = smoothstep(0.25, 0.8, fat + (h3fbm(vObj * 2.6) - 0.5) * 0.55);
    base = mix(base, uFat * (0.85 + 0.3 * h3fbm(vObj * 4.5)), f);
  }
  base *= mix(0.28, 1.0, ao);
} else {
  base = uCut * (0.8 + 0.3 * h3fbm(vObj * vec3(5.0, 1.4, 5.0)));
}
diffuseColor.rgb = base;
diffuseColor.a = mix(1.0, isOut > 0.5 ? 0.22 : 0.0, uGlass);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
if (uHiRV > 0.0 && int(vInfo.x + 0.5) == 1) totalEmissiveRadiance += vec3(1.0, 0.75, 0.2) * uHiRV * (gl_FrontFacing ? 0.35 : 0.6);`)
      .replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>
if (!gl_FrontFacing) { material.roughness = 0.85; material.clearcoat = 0.0; material.sheenColor = vec3(0.0); }`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
if (gl_FrontFacing) {
  float hgt = h3fbm(vObj * 1.6) * 0.75 + h3noise(vObj * 4.2) * 0.25;
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float dhx = dFdx(hgt), dhy = dFdy(hgt);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - g * 0.07);
} else {
  normal = normalize(uCutN);
}`);
  };
  return m;
}

// ---------- carregar o coração pronto (.bin compactado com meshopt)
type Model = { mesh: THREE.Mesh; group: THREE.Group; cor: THREE.Group; kind: Kind };
const models: Partial<Record<Kind, Promise<Model>>> = {};
function loadModel(kind: Kind): Promise<Model> {
  return (models[kind] ??= (async () => {
    const [buf, cor] = await Promise.all([
      fetch(`/coracao/${kind}.bin`).then((r) => r.arrayBuffer()),
      fetch(`/coracao/${kind}.json`).then((r) => r.json() as Promise<Record<string, V3[]>>),
    ]);
    await MeshoptDecoder.ready;
    const dv = new DataView(buf);
    const nv = dv.getUint32(4, true), ni = dv.getUint32(8, true), vLen = dv.getUint32(36, true);
    const lo = [0, 1, 2].map((k) => dv.getFloat32(12 + k * 4, true)), range = [0, 1, 2].map((k) => dv.getFloat32(24 + k * 4, true));
    const vb = new Uint8Array(nv * 16);
    MeshoptDecoder.decodeVertexBuffer(vb, nv, 16, new Uint8Array(buf, 40, vLen));
    const ib = new Uint32Array(ni);
    MeshoptDecoder.decodeIndexBuffer(new Uint8Array(ib.buffer), ni, 4, new Uint8Array(buf, 40 + vLen));
    const v = new DataView(vb.buffer);
    const pos = new Float32Array(nv * 3), nor = new Int8Array(nv * 3), info = new Uint8Array(nv * 4), tint = new Uint8Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] = lo[k] + (v.getUint16(i * 16 + k * 2, true) / 65535) * range[k];
        nor[i * 3 + k] = v.getInt8(i * 16 + 6 + k);
      }
      for (let k = 0; k < 4; k++) info[i * 4 + k] = vb[i * 16 + 9 + k];
      for (let k = 0; k < 3; k++) tint[i * 3 + k] = vb[i * 16 + 13 + k];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3, true));
    g.setAttribute("info", new THREE.BufferAttribute(info, 4));
    g.setAttribute("tint", new THREE.BufferAttribute(tint, 3, true));
    g.setIndex(new THREE.BufferAttribute(ib, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, heartMaterial());
    mesh.renderOrder = 3;
    const back = new THREE.Mesh(g, stencilMaterial(THREE.BackSide, THREE.IncrementWrapStencilOp));
    const front = new THREE.Mesh(g, stencilMaterial(THREE.FrontSide, THREE.DecrementWrapStencilOp));
    back.renderOrder = front.renderOrder = 1;
    back.frustumCulled = front.frustumCulled = false;
    mesh.userData.stencil = [back, front];
    // coronárias (vermelho) e veias cardíacas (azul), por cima dos sulcos
    const corG = new THREE.Group();
    const art = new THREE.MeshPhysicalMaterial({ color: 0xb3251d, roughness: 0.35, clearcoat: 0.6, clippingPlanes: [cutPlane] });
    const vein = new THREE.MeshPhysicalMaterial({ color: 0x3b4f8f, roughness: 0.4, clearcoat: 0.5, clippingPlanes: [cutPlane] });
    for (const [name, pts] of Object.entries(cor)) {
      if (pts.length < 4) continue;
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      corG.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 4, name === "rca" || name === "lad" ? 0.12 : 0.1, 8), art));
      // veia acompanhando, um pouco ao lado
      const side = pts.map((p, i) => {
        const a = new THREE.Vector3(...pts[Math.max(0, i - 1)]), b = new THREE.Vector3(...pts[Math.min(pts.length - 1, i + 1)]);
        const tan = b.sub(a).normalize();
        const out = new THREE.Vector3(...p).sub(new THREE.Vector3(0.6, -0.5, -0.4)).normalize();
        return new THREE.Vector3(...p).addScaledVector(new THREE.Vector3().crossVectors(tan, out).normalize(), 0.24).addScaledVector(out, -0.03);
      });
      corG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(side), pts.length * 4, 0.075, 6), vein));
    }
    const group = new THREE.Group();
    group.add(mesh, back, front, corG);
    return { mesh, group, cor: corG, kind };
  })());
}

// ---------- sangue: bolinhas andando pelos caminhos (azul, vermelho e roxo misturado na tetralogia)
type Flow = { mesh: THREE.InstancedMesh; parts: { c: THREE.CatmullRomCurve3; u: number; off: THREE.Vector3; sp: number; mixAt: number; col: "blue" | "red" | "mix" }[] };
const BLUE = new THREE.Color(0x3f7dff), RED = new THREE.Color(0xff3528), PURPLE = new THREE.Color(0xa24bff);
function makeFlow(kind: Kind): Flow {
  const paths = flowPaths(kind);
  const total = 260;
  const wsum = paths.reduce((s, p) => s + p.weight, 0);
  const parts: Flow["parts"] = [];
  const ao = kind === "tof" ? -0.45 : 0.0;
  for (const p of paths) {
    const c = new THREE.CatmullRomCurve3(p.pts.map((q) => new THREE.Vector3(...q)));
    // onde a cor muda para roxo: na raiz da aorta (tetralogia)
    const iAo = p.pts.findIndex((q) => Math.abs(q[0] - ao) < 0.01 && Math.abs(q[1] - 1.95) < 0.01);
    const iVsd = p.pts.findIndex((q) => q[0] === 0.05 && q[1] === 0.6);
    const mixAt = p.color === "mix" ? Math.max(0, (iVsd >= 0 ? iVsd : iAo) / (p.pts.length - 1)) : 2;
    const n = Math.round((total * p.weight) / wsum);
    for (let i = 0; i < n; i++) {
      const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(p.r * 1.3);
      parts.push({ c, u: Math.random(), off, sp: 0.07 + Math.random() * 0.03, mixAt, col: p.color === "mix" && p.pts[0][2] < -3 ? "red" : p.color });
    }
  }
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false, clippingPlanes: [cutPlane] });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 8, 6), mat, parts.length);
  mesh.renderOrder = 0;
  return { mesh, parts };
}
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
function stepFlow(f: Flow, dt: number, push: number) {
  f.parts.forEach((p, i) => {
    p.u += dt * p.sp * (0.35 + push * 1.6);
    if (p.u > 1) p.u -= 1;
    const pos = p.c.getPointAt(p.u).add(p.off);
    tmpM.makeTranslation(pos.x, pos.y, pos.z);
    f.mesh.setMatrixAt(i, tmpM);
    if (p.col === "blue") tmpC.copy(BLUE);
    else if (p.col === "red") tmpC.copy(kindOfFlow(f) === "tof" && p.u > 0.62 ? PURPLE : RED);
    else tmpC.copy(BLUE).lerp(PURPLE, Math.min(1, Math.max(0, (p.u - p.mixAt) * 6)));
    f.mesh.setColorAt(i, tmpC);
  });
  f.mesh.instanceMatrix.needsUpdate = true;
  if (f.mesh.instanceColor) f.mesh.instanceColor.needsUpdate = true;
}
const flowKind = new WeakMap<Flow, Kind>();
const kindOfFlow = (f: Flow) => flowKind.get(f) ?? "normal";

// ---------- estado
let show: Show = params.get("ver") === "comparar" ? "both" : params.get("ver") === "tetralogia" || location.pathname.includes("fallot") ? "tof" : "normal";
let mode: Mode = "out";
let selected: Spot | null = null;
let beating = true, sound = false, labelsOn = true;
const stage = new THREE.Group();
scene.add(stage);
const shown: { model: Model; flow: Flow; offset: number }[] = [];
let fly: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

const BASE_TARGET = new THREE.Vector3(0.2, 0.2, 0);
function home() {
  const portrait = innerHeight > innerWidth;
  const d = show === "both" ? (portrait ? 74 : 38) : portrait ? 36 : 30;
  const t = BASE_TARGET.clone().setY(show === "both" && portrait ? 1.6 : BASE_TARGET.y);
  fly = { pos: new THREE.Vector3(-0.25 * d, 0.12 * d, 0.95 * d).add(t), target: t };
}

async function setShow(s: Show) {
  show = s;
  selected = null;
  document.querySelectorAll<HTMLButtonElement>("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.k === s));
  $("load").hidden = false;
  const kinds: Kind[] = s === "both" ? ["normal", "tof"] : [s];
  const ms = await Promise.all(kinds.map(loadModel));
  if (show !== s) return;
  stage.clear();
  shown.length = 0;
  showRing(null);
  const portrait = innerHeight > innerWidth;
  ms.forEach((m, i) => {
    const offset = s === "both" ? (i === 0 ? -1 : 1) * (portrait ? 0 : 5.6) : 0;
    const yOff = s === "both" && portrait ? (i === 0 ? 7.2 : -7.2) : 0;
    const holder = new THREE.Group();
    holder.position.set(offset, yOff, 0);
    const f = makeFlow(m.kind);
    flowKind.set(f, m.kind);
    holder.add(m.group, f.mesh);
    stage.add(holder);
    shown.push({ model: m, flow: f, offset });
  });
  $("load").hidden = true;
  home();
  applyMode();
  if (innerWidth < 700) $("card").classList.add("min");
  renderCard();
  renderLabels();
}

function applyMode() {
  document.querySelectorAll<HTMLButtonElement>("#modes button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
  $("cutBox").hidden = mode !== "cut";
  uniforms.uGlass.value = mode === "flow" ? 1 : 0;
  for (const s of shown) {
    s.flow.mesh.visible = mode !== "out";
    s.model.cor.visible = mode === "out";
    const m = s.model.mesh.material as THREE.MeshPhysicalMaterial;
    m.depthWrite = mode !== "flow";
    m.transparent = mode === "flow";
    m.needsUpdate = true;
  }
  updateCut();
}
// corte: plano inclinado de frente; o controle leva da frente (0) até o fundo (100)
// plano inclinado da "vista de 4 câmaras": mais para a frente no lado direito/baixo (VD), mais para trás no alto/esquerda (AE)
const CUT_RAW = new THREE.Vector3(-0.45, -0.5, -1);
const CUT_N = CUT_RAW.clone().normalize();
/** De onde a câmera olha o corte (de frente para o plano). */
const CUT_VIEW = CUT_N.clone().negate();
function updateCut() {
  cap.visible = mode === "cut";
  for (const s of shown) for (const m of s.model.mesh.userData.stencil as THREE.Mesh[]) m.visible = mode === "cut";
  if (mode !== "cut") {
    cutPlane.constant = 1000;
    return;
  }
  const v = Number($<HTMLInputElement>("cut").value) / 100;
  cutPlane.normal.copy(CUT_N);
  cutPlane.constant = (2.8 - v * 5.0) / CUT_RAW.length();
  cutPlane.coplanarPoint(cap.position);
  cap.lookAt(cap.position.clone().sub(cutPlane.normal));
}

// ---------- cartão de texto (apresentação, estrutura tocada ou defeito)
function renderCard() {
  const intro = INTRO[show];
  if (selected) {
    const isDef = !!selected.num;
    $("card").innerHTML = `<div class="h3-head">${isDef ? `<i>${selected.num}</i>` : ""}<div><small>${isDef ? T("Na tetralogia", "In tetralogy", "En la tetralogía") : T("Estrutura", "Structure", "Estructura")}</small><b>${esc(L(selected.name))}</b></div><button class="h3-x" id="cardX" aria-label="${T("Fechar", "Close", "Cerrar")}">×</button></div>
      <p>${esc(L(selected.text))}</p>${isDef && selected.num === 4 ? `<p class="h3-note">${esc(L(TREATMENT))}</p>` : ""}`;
    $("cardX").onclick = () => {
      selected = null;
      showRing(null);
      home();
      renderCard();
    };
  } else {
    $("card").innerHTML = `<div class="h3-head"><div><small>${T("Toque nos nomes", "Tap the names", "Toca los nombres")}</small><b>${esc(L(intro.title))}</b></div><button class="h3-min" id="cardMin" aria-label="${T("Recolher", "Collapse", "Contraer")}">–</button></div>
      <p>${esc(L(intro.text))}</p>
      ${show !== "normal" ? `<div class="h3-defs">${DEFECTS.map((d) => `<button data-d="${d.id}"><i>${d.num}</i>${esc(L(d.name))}</button>`).join("")}</div>` : ""}
      <p class="h3-legal">${T("Modelo ilustrativo para explicação. Não substitui a avaliação médica.", "Illustrative model for explanation. It does not replace medical advice.", "Modelo ilustrativo para explicación. No sustituye la evaluación médica.")}</p>`;
    $("cardMin").onclick = () => $("card").classList.toggle("min");
    $("card").querySelectorAll<HTMLButtonElement>("[data-d]").forEach((b) => (b.onclick = () => pick(DEFECTS.find((d) => d.id === b.dataset.d)!)));
  }
}

function pick(s: Spot) {
  selected = s;
  $("card").classList.remove("min");
  const holder = (shown.find((x) => !s.num || x.model.kind === "tof") ?? shown[0])?.flow.mesh.parent;
  const o = holder ? holder.position.clone() : new THREE.Vector3();
  if (s.num) {
    if (mode === "out" && s.id !== "rvh") mode = "cut";
    if (s.cut !== undefined) $<HTMLInputElement>("cut").value = String(Math.round(s.cut * 100));
    applyMode();
  }
  showRing(s);
  if (s.cam) {
    const target = new THREE.Vector3(...s.cam.target);
    const pos = target.clone().addScaledVector(CUT_VIEW, innerHeight > innerWidth ? 24 : 17);
    fly = { pos: pos.add(o), target: target.add(o) };
  }
  else {
    const at = new THREE.Vector3(...s.at).add(o);
    const dir = new THREE.Vector3(...s.dir).normalize();
    fly = { pos: at.clone().addScaledVector(dir, 13).add(new THREE.Vector3(0, 1.5, 0)), target: at.clone().lerp(BASE_TARGET.clone().add(o), 0.4) };
  }
  renderCard();
}

// ---------- anel amarelo pulsando no defeito escolhido (aparece através das paredes)
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false });
const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 10, 48), ringMat);
ring.renderOrder = 5;
function showRing(s: Spot | null) {
  ring.removeFromParent();
  if (!s?.num || !s.ring) return;
  const holder = (shown.find((x) => x.model.kind === "tof") ?? shown[0])?.flow.mesh.parent;
  if (!holder) return;
  ring.position.set(...s.ring.at);
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...s.ring.axis).normalize());
  ring.userData.r = s.ring.r;
  holder.add(ring);
}

// ---------- nomes na tela
type Lab = { el: HTMLButtonElement; at: THREE.Vector3; dir: THREE.Vector3; spot: Spot };
let labs: Lab[] = [];
function renderLabels() {
  $("labels").innerHTML = "";
  labs = [];
  for (const s of shown) {
    const holder = s.flow.mesh.parent!;
    const list = s.model.kind === "tof" ? [...DEFECTS, ...STRUCTURES.filter((x) => ["aorta", "pa", "rv", "lv"].includes(x.id))] : STRUCTURES;
    for (const sp of list) {
      const el = document.createElement("button");
      el.className = sp.num ? "h3-lab num" : "h3-lab";
      el.innerHTML = sp.num ? `<i>${sp.num}</i>` : esc(L(sp.name));
      el.onclick = () => pick(sp);
      $("labels").appendChild(el);
      labs.push({ el, at: new THREE.Vector3(...sp.at).add(holder.position), dir: new THREE.Vector3(...sp.dir).normalize(), spot: sp });
    }
    if (show === "both") {
      const el = document.createElement("button");
      el.className = "h3-lab tag";
      el.textContent = s.model.kind === "tof" ? T("Tetralogia", "Tetralogy", "Tetralogía") : T("Normal", "Normal", "Normal");
      $("labels").appendChild(el);
      labs.push({ el, at: new THREE.Vector3(0, 8.6, 0).add(holder.position), dir: new THREE.Vector3(0, 0, 1), spot: STRUCTURES[0] });
    }
  }
}
const pv = new THREE.Vector3(), cd = new THREE.Vector3();
function placeLabels() {
  const w = innerWidth, h = innerHeight;
  for (const l of labs) {
    pv.copy(l.at).project(camera);
    cd.copy(camera.position).sub(l.at).normalize();
    const facing = l.el.classList.contains("tag") || l.dir.dot(cd) > -0.1 || (mode === "flow" && !l.spot.num);
    const hideStruct = (show === "both" && !l.el.classList.contains("tag") && !l.spot.num) || (l.spot.id === "cor" && mode !== "out");
    const vis = labelsOn && facing && pv.z < 1 && !hideStruct && (!selected || selected === l.spot || !!l.spot.num);
    l.el.style.display = vis ? "" : "none";
    if (vis) l.el.style.transform = `translate(-50%, -50%) translate(${((pv.x + 1) / 2) * w}px, ${((1 - pv.y) / 2) * h}px)`;
    l.el.classList.toggle("sel", selected === l.spot);
  }
}

// ---------- som do coração (tum-tá), sintetizado
let ac: AudioContext | null = null;
function thump(freq: number, gain: number) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, ac.currentTime + 0.12);
  f.type = "lowpass";
  f.frequency.value = 160;
  g.gain.setValueAtTime(0.0001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.16);
  o.connect(f).connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + 0.2);
}

// ---------- eventos
document.querySelectorAll<HTMLButtonElement>("#seg button").forEach((b) => (b.onclick = () => setShow(b.dataset.k as Show)));
document.querySelectorAll<HTMLButtonElement>("#modes button").forEach((b) => (b.onclick = () => {
  mode = b.dataset.m as Mode;
  applyMode();
  if (mode === "cut" && !selected) {
    const d = camera.position.distanceTo(controls.target);
    fly = { pos: controls.target.clone().addScaledVector(CUT_VIEW, d), target: controls.target.clone() };
  }
}));
$("cut").addEventListener("input", updateCut);
$("beat").onclick = () => {
  beating = !beating;
  $("beat").classList.toggle("on", beating);
};
$("sound").onclick = () => {
  sound = !sound;
  ac ??= new AudioContext();
  ac.resume();
  $("sound").classList.toggle("on", sound);
  $("sound").firstChild!.textContent = sound ? "🔊" : "🔈";
};
$("labelsBtn").onclick = () => {
  labelsOn = !labelsOn;
  $("labelsBtn").classList.toggle("on", labelsOn);
};

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", () => {
  resize();
  if (show === "both") setShow("both");
});
resize();
home();
camera.position.copy(fly!.pos);
controls.target.copy(fly!.target);

// ---------- laço: batimento (72 por minuto), fluxo, câmera
const clock = new THREE.Clock();
let phase = 0, lastPhase = 0;
const bump = (x: number, a: number, b: number) => (x < a || x > b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI));
const nView = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (beating) phase = (phase + dt / 0.83) % 1;
  uniforms.uAtr.value = beating ? bump(phase, 0.0, 0.16) : 0;
  const sys = beating ? bump(phase, 0.16, 0.52) : 0;
  uniforms.uBeat.value = sys;
  if (sound && beating) {
    if (lastPhase < 0.17 && phase >= 0.17) thump(58, 0.9);
    if (lastPhase < 0.48 && phase >= 0.48) thump(78, 0.55);
  }
  lastPhase = phase;
  for (const s of shown) {
    s.model.cor.scale.setScalar(1 - 0.03 * sys);
    if (mode !== "out") stepFlow(s.flow, dt, beating ? sys : 0.4);
  }
  if (ring.parent) {
    ring.scale.setScalar(ring.userData.r * (1 + 0.12 * Math.sin(clock.elapsedTime * 5)));
    ringMat.opacity = 0.7 + 0.25 * Math.sin(clock.elapsedTime * 5);
  }
  uniforms.uHiRV.value = selected?.id === "rvh" ? 0.6 + 0.4 * Math.sin(clock.elapsedTime * 4) : 0;
  if (fly) {
    const k = 1 - Math.exp(-dt * 4);
    camera.position.lerp(fly.pos, k);
    controls.target.lerp(fly.target, k);
    if (camera.position.distanceTo(fly.pos) < 0.05) fly = null;
  }
  controls.update();
  nView.copy(cutPlane.normal).negate().transformDirection(camera.matrixWorldInverse);
  uniforms.uCutN.value.copy(nView);
  renderer.render(scene, camera);
  placeLabels();
});

if (params.get("modo") === "dentro") mode = "cut";
if (params.get("modo") === "fluxo") mode = "flow";
setShow(show);
