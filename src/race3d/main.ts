// Percurso 3D de corrida (PáginasPro): largada animada com os pelotões, câmeras (geral, seguir, sobrevoo),
// altimetria, simulação do ritmo do corredor ("Você"), arena e inscrição. Página: /corrida/<slug>.
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildWorld, height, HALF } from "./world";
import { Crowd, Pose, SKIN } from "./crowd";
import { exemplo } from "./events/exemplo";
import type { Distance, RaceEvent } from "./types";

const EVENTS: Record<string, RaceEvent> = { exemplo };
const slug = location.pathname.split("/").filter(Boolean)[1] || new URLSearchParams(location.search).get("e") || "exemplo";
const ev = EVENTS[slug] ?? exemplo;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

document.title = `${ev.name} · percurso 3D${ev.demo ? " (demonstração)" : ""}`;
const root = document.documentElement.style;
root.setProperty("--p", ev.colors.primary);
root.setProperty("--d", ev.colors.dark);
root.setProperty("--a", ev.colors.accent);

$("app").innerHTML = `
<div class="r3-canvas" id="canvas"></div>
<div class="r3-labels" id="labels"></div>
<header class="r3-top">
  <div class="r3-brand"><b>${ev.name}</b><span>${ev.subtitle} · ${ev.date}, ${ev.start}h</span></div>
  ${ev.demo ? `<a class="r3-demo" href="https://paginaspro.app.br/inicio" target="_blank" rel="noopener">Demonstração<small>PáginasPro</small></a>` : ""}
</header>
<div class="r3-hud">
  <div class="r3-clock"><b id="clock">${String(ev.start).padStart(2, "0")}:00</b><span id="race">antes da largada</span></div>
  <div class="r3-lead" id="lead"></div>
</div>
<div class="r3-cams">
  <div class="r3-seg" id="cams"><button data-c="geral" class="on">Geral</button><button data-c="seguir">Seguir</button><button data-c="voo">Sobrevoo</button></div>
  <div class="r3-seg" id="speeds"><button data-s="10">10x</button><button data-s="30">30x</button><button data-s="60" class="on">60x</button><button data-s="120">120x</button></div>
</div>
<div class="r3-count" id="count" hidden></div>
<div class="r3-hint" id="hint"></div>
<div class="r3-done" id="done" hidden></div>
<button class="r3-go" id="go">▶ Dar a largada</button>
<nav class="r3-tabs" id="tabs">
  <button data-t="percurso">🗺️<span>Percurso</span></button>
  <button data-t="simular">⏱️<span>Simule</span></button>
  <button data-t="arena">🏁<span>Arena</span></button>
  <button data-t="inscricao">🎽<span>Inscrição</span></button>
</nav>
<section class="r3-sheet" id="sheet" hidden><button class="r3-x" id="sheetX" aria-label="Fechar">×</button><div id="sheetBody"></div></section>
`;

// ---------- cena
const world = buildWorld(ev);
const { scene } = world;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$("canvas").appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 3;
controls.maxDistance = 2600;
controls.screenSpacePanning = false;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const hfov = 66 * (Math.PI / 180);
  const v = (2 * Math.atan(Math.tan(hfov / 2) / camera.aspect) * 180) / Math.PI;
  camera.fov = Math.min(78, Math.max(42, v));
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

let dist: Distance = ev.distances[0];
const pathOf = (d: Distance) => world.paths.get(d.id)!;
const unitsPerKm = (d: Distance) => pathOf(d).length / d.km;

// ---------- corredores
type Runner = {
  d: Distance; di: number; pace: number; lat: number; s0: number; s: number; t0: number;
  fin: number; phase: number; ax: number; az: number; x: number; z: number; yaw: number; wob: number;
};
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const runners: Runner[] = [];
const SHIRT_ALT = [0xffffff, 0x1b1b1b, 0xffc72c, 0x14a37f, 0xe04e8a];
ev.distances.forEach((d, di) => {
  const list: number[] = [];
  for (let i = 0; i < d.runners; i++) {
    const r = (rand() + rand() + rand()) / 3;
    list.push(d.pace[0] + (d.pace[1] - d.pace[0]) * Math.pow(r, 1.15) * (i < 4 ? 0.3 : 1));
  }
  list.sort((a, b) => a - b);
  const corral = di === 0 ? -1.5 : -2 - Math.ceil(ev.distances[0].runners / 7) * 0.6 - 3;
  list.forEach((pace, i) => {
    const row = Math.floor(i / 7), colI = i % 7;
    runners.push({
      d, di, pace, lat: -2.1 + colI * 0.7 + (rand() - 0.5) * 0.3, s0: corral - row * 0.6 - rand() * 0.2, s: 0, t0: d.wave * 60 + row * 1.6,
      fin: -1, phase: rand() * 6, ax: 4 + rand() * 46, az: 27 + rand() * 11, x: 0, z: 0, yaw: 0, wob: rand() * 6,
    });
  });
});
const crowd = new Crowd(runners.length);
runners.forEach((r, i) => {
  const base = new THREE.Color(r.d.color).getHex();
  crowd.paint(i, rand() < 0.75 ? base : SHIRT_ALT[i % SHIRT_ALT.length], SKIN[i % 4], [0x1f2733, 0x2d2d2d, 0x3a4a5e][i % 3]);
});
scene.add(crowd.group);

// torcida nas grades da largada/chegada
type Fan = { x: number; z: number; yaw: number; ph: number };
const fans: Fan[] = [];
const startPt = pathOf(ev.distances[0]).at(0);
for (let x = -64; x <= 38; x += 1.3) for (const s of [-1, 1]) {
  if (rand() < 0.35) continue;
  const z = startPt.z + s * (HALF + 1.1 + rand() * 1.6);
  fans.push({ x: x + rand() * 0.6, z, yaw: s > 0 ? Math.PI : 0, ph: rand() * 6 });
}
const fanCrowd = new Crowd(fans.length);
fans.forEach((_, i) => fanCrowd.paint(i, [0xe3735e, 0x4e5a40, 0xf2c14e, 0x5b8fb9, 0xf5f3ec, 0xc96f9e, 0x7fb069][i % 7], SKIN[(i * 3) % 4], [0x2f3a4a, 0x4a3f35, 0x6c757d][i % 3]));
scene.add(fanCrowd.group);

// "Você"
const me = { on: false, pace: 6, d: ev.distances[0], s: 0, s0: 0, t0: 0, fin: -1, phase: 0, x: 0, z: 0, yaw: 0, lat: 0 };
const meCrowd = new Crowd(1, 0.33);
meCrowd.paint(0, 0xffd400, SKIN[1], 0x111111);
meCrowd.hide(0);
meCrowd.commit();
scene.add(meCrowd.group);
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 8, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
ring.visible = false;
scene.add(ring);

// ---------- simulação
type State = "idle" | "count" | "race";
let state: State = "idle";
let T = 0; // segundos de prova
let speed = 60;
const P = { x: 0, z: 0, dx: 1, dz: 0 };

/** Velocidade (unidades/s de prova) no ponto s: ritmo base, mais lento na subida e mais rápido na descida. */
function vel(d: Distance, pace: number, s: number) {
  const p = pathOf(d);
  const a = p.at(s - 2), ax = a.x, az = a.z;
  const b = p.at(s + 2);
  const grade = (height(b.x, b.z) - height(ax, az)) / 4;
  return unitsPerKm(d) / (pace * 60) / (1 + grade * 4.5);
}

/** Tempo previsto (s) e parciais por km, com o mesmo cálculo da simulação. */
function predict(d: Distance, pace: number) {
  const L = pathOf(d).length, per = unitsPerKm(d), splits: number[] = [];
  let s = 0, t = 0, next = per;
  while (s < L) {
    s += vel(d, pace, s) * 2;
    t += 2;
    if (s >= next) {
      splits.push(t);
      next += per;
    }
  }
  return { total: t, splits };
}

const fmt = (sec: number) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const fmtPace = (p: number) => `${Math.floor(p)}:${String(Math.round((p % 1) * 60) % 60).padStart(2, "0")}`;
const clockAt = (sec: number) => {
  const m = Math.floor(ev.start * 60 + sec / 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const kmTxt = (d: Distance, s: number) => (Math.max(0, s) / unitsPerKm(d)).toFixed(1).replace(".", ",");

function place(path: ReturnType<typeof pathOf>, s: number, lat: number) {
  path.at(s, P);
  const x = P.x - P.dz * lat, z = P.z + P.dx * lat;
  return { x, z, yaw: Math.atan2(P.dx, P.dz) };
}

function resetRace() {
  state = "idle";
  T = 0;
  for (const r of runners) {
    r.s = r.s0;
    r.fin = -1;
  }
  me.fin = -1;
  me.s = me.s0;
  $("done").hidden = true;
  $("race").textContent = "antes da largada";
  $("clock").textContent = clockAt(0);
  $("go").textContent = "▶ Dar a largada";
}

// pelotões que largam depois andam até a faixa quando o anterior já saiu
const shiftMax = ev.distances.map((_, di) => (di ? -1.5 - Math.max(...runners.filter((r) => r.di === di).map((r) => r.s0)) : 0));
function waitShift(di: number) {
  if (!di || state !== "race") return 0;
  const k = Math.min(1, Math.max(0, (T - 50) / 110));
  return shiftMax[di] * k * k * (3 - 2 * k);
}

function stepRunners(dt: number, dtReal: number, now: number) {
  const racing = state === "race";
  runners.forEach((r, i) => {
    const path = pathOf(r.d);
    const L = path.length;
    if (r.fin < 0) {
      if (racing && T >= r.t0) {
        if (r.s === r.s0) r.s += waitShift(r.di);
        const ramp = Math.min(1, (T - r.t0) / 8);
        r.s += vel(r.d, r.pace, r.s) * dt * (0.35 + 0.65 * ramp);
        if (r.s >= L) r.fin = T - r.d.wave * 60;
        const lat = r.lat * (r.s < 30 ? 1 : 0.9) + Math.sin(r.s * 0.05 + r.wob) * 0.25;
        const p = place(path, r.s, lat);
        r.x = p.x; r.z = p.z; r.yaw = p.yaw;
        r.phase += dtReal * 14;
        crowd.pose(i, r.x, height(r.x, r.z), r.z, r.yaw, r.phase, Pose.Run);
      } else {
        // esperando no pelotão: o 5K anda até a faixa depois que o 10K sai
        const moved = waitShift(r.di);
        const p = place(path, r.s0 + moved, r.lat);
        r.x = p.x; r.z = p.z; r.yaw = p.yaw;
        const walking = moved > 0 && moved < shiftMax[r.di] - 0.01;
        r.phase += dtReal * (walking ? 6 : 2);
        crowd.pose(i, r.x, height(r.x, r.z), r.z, r.yaw, r.phase, walking ? Pose.Walk : Pose.Stand);
      }
    } else {
      // depois da chegada: anda até a área de pós-prova e fica por lá
      const dx = r.ax - r.x, dz = r.az - r.z, l = Math.hypot(dx, dz);
      if (l > 0.3) {
        const step = Math.min(l, dtReal * 1.4);
        r.x += (dx / l) * step;
        r.z += (dz / l) * step;
        r.yaw = Math.atan2(dx, dz);
        r.phase += dtReal * 7;
        crowd.pose(i, r.x, height(r.x, r.z), r.z, r.yaw, r.phase, Pose.Walk);
      } else {
        r.phase += dtReal * 3;
        crowd.pose(i, r.x, height(r.x, r.z), r.z, r.yaw + Math.sin(now * 0.3 + i) * 0.6, r.phase, (i + Math.floor(now / 3)) % 9 === 0 ? Pose.Cheer : Pose.Stand);
      }
    }
  });
  crowd.commit();

  // torcida: vibra quando tem corredor perto
  const busy = racing;
  fans.forEach((f, i) => {
    f.ph += dtReal * (busy ? 9 : 2);
    fanCrowd.pose(i, f.x, height(f.x, f.z), f.z, f.yaw, f.ph, busy && (i + Math.floor(now * 0.7)) % 3 !== 0 ? Pose.Cheer : Pose.Stand);
  });
  fanCrowd.commit();

  if (me.on) {
    const path = pathOf(me.d), L = path.length;
    let pose = Pose.Stand;
    if (me.fin < 0 && racing && T >= me.t0) {
      if (me.s === me.s0) me.s += waitShift(ev.distances.indexOf(me.d));
      const ramp = Math.min(1, (T - me.t0) / 8);
      me.s += vel(me.d, me.pace, me.s) * dt * (0.35 + 0.65 * ramp);
      pose = Pose.Run;
      me.phase += dtReal * 14;
      if (me.s >= L) {
        me.s = L + 4;
        me.fin = T - me.t0;
        finished();
      }
    } else me.phase += dtReal * 2;
    const p = place(path, me.fin >= 0 ? L + 4 : me.s + (T < me.t0 ? waitShift(ev.distances.indexOf(me.d)) : 0), me.lat);
    me.x = p.x; me.z = p.z; me.yaw = p.yaw;
    if (me.fin >= 0) {
      pose = Math.sin(now * 2) > -0.2 ? Pose.Cheer : Pose.Stand;
      me.phase += dtReal * 6;
    }
    meCrowd.pose(0, me.x, height(me.x, me.z), me.z, me.yaw, me.phase, pose);
    meCrowd.commit();
    ring.visible = true;
    ring.position.set(me.x, height(me.x, me.z) + 0.08, me.z);
    ring.scale.setScalar(1 + Math.sin(now * 5) * 0.12);
  }
}

// ---------- rótulos
type Label = { el: HTMLElement; pos: THREE.Vector3; kind: string; dist?: string; far: number };
const labels: Label[] = [];
const labelsEl = $("labels");
function addLabel(name: string, pos: THREE.Vector3, kind: string, far: number, dist?: string, onTap?: () => void) {
  const el = document.createElement(onTap ? "button" : "div");
  el.className = `r3-lab ${kind}`;
  el.textContent = name;
  if (onTap) el.addEventListener("click", onTap);
  labelsEl.appendChild(el);
  const l = { el, pos, kind, dist, far };
  labels.push(l);
  return l;
}
for (const m of world.marks) {
  const far = m.kind === "land" ? 3000 : m.kind === "spot" ? 260 : 180;
  const spot = ev.arena.find((a) => a.id === m.id);
  addLabel(m.name, m.pos, m.kind, far, m.dist, spot ? () => focusSpot(spot.id) : undefined);
}
const meLabel = addLabel("VOCÊ", new THREE.Vector3(), "me", 1e9);
const leadLabels = ev.distances.map((d) => addLabel(`Líder ${d.label}`, new THREE.Vector3(), "leader", 900, d.id));
const v3 = new THREE.Vector3();
function drawLabels() {
  const w = innerWidth, h = innerHeight;
  for (const l of labels) {
    let show = true;
    if (l.dist && l.dist !== dist.id) show = false;
    if (l === meLabel) show = me.on;
    if (l.kind === "land" && cam === "seguir") show = false;
    const d = camera.position.distanceTo(l.pos);
    if (d > l.far) show = false;
    if (show) {
      v3.copy(l.pos).project(camera);
      if (v3.z > 1 || v3.x < -1.1 || v3.x > 1.1 || v3.y < -1.1 || v3.y > 1.1) show = false;
      else l.el.style.transform = `translate(-50%, -100%) translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px)`;
    }
    l.el.style.display = show ? "" : "none";
  }
}

// ---------- câmera
type Cam = "geral" | "seguir" | "voo";
let cam: Cam = "geral";
let fly: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number } | null = null;
let lastTouch = -10;
let vooS = 0;
const followTarget = new THREE.Vector3();
controls.addEventListener("start", () => {
  lastTouch = performance.now() / 1000;
  fly = null;
});

function flyTo(target: THREE.Vector3, offset: THREE.Vector3) {
  fly = { from: camera.position.clone(), to: target.clone().add(offset), tFrom: controls.target.clone(), tTo: target.clone(), t: 0 };
}
function setCam(c: Cam) {
  cam = c;
  document.querySelectorAll<HTMLButtonElement>("#cams button").forEach((b) => b.classList.toggle("on", b.dataset.c === c));
  camera.near = c === "geral" ? 0.5 : 0.2;
  camera.updateProjectionMatrix();
  if (c === "voo") {
    vooS = 0;
    fly = null;
  }
  if (c === "seguir") {
    const t = followPoint();
    const off = new THREE.Vector3(-P.dx * 8, 3.6, -P.dz * 8);
    flyTo(t, off);
    hint(me.on ? "Seguindo você. Arraste para girar em volta." : `Seguindo o líder do ${dist.label}. Arraste para girar.`);
  }
  if (c === "geral") overview();
}
function overview() {
  const p = pathOf(dist);
  const box3 = new THREE.Box3();
  for (let s = 0; s < p.length; s += 20) {
    const a = p.at(s);
    box3.expandByPoint(new THREE.Vector3(a.x, height(a.x, a.z), a.z));
  }
  const c = box3.getCenter(new THREE.Vector3()), size = box3.getSize(new THREE.Vector3());
  const hf = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  const L = Math.max(size.x, size.z);
  if (camera.aspect < 1) {
    // celular em pé: olha ao longo do percurso, de trás da ponta oeste
    flyTo(c, new THREE.Vector3(-L * 0.62, L * 0.34, L * 0.2));
    return;
  }
  const dd = (L * 0.62) / Math.tan(hf / 2);
  flyTo(c, new THREE.Vector3(-dd * 0.18, dd * 0.62, dd * 0.78));
}
/** Ponto seguido: você, ou o líder da distância escolhida, ou o pelotão antes da largada. */
function followPoint() {
  if (me.on && me.d === dist) {
    pathOf(me.d).at(Math.min(me.s, pathOf(me.d).length), P);
    return followTarget.set(me.x, height(me.x, me.z) + 0.6, me.z);
  }
  let best: Runner | null = null;
  for (const r of runners) if (r.d === dist && r.fin < 0 && (!best || r.s > best.s)) best = r;
  if (!best) best = runners.find((r) => r.d === dist) ?? runners[0];
  pathOf(best.d).at(best.s, P);
  return followTarget.set(best.x, height(best.x, best.z) + 0.6, best.z);
}

function updateCamera(dtReal: number, now: number) {
  if (fly) {
    fly.t = Math.min(1, fly.t + dtReal / 1.3);
    const k = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
    if (cam === "seguir") {
      const t = followPoint();
      fly.tTo.copy(t);
      fly.to.copy(t).add(new THREE.Vector3(-P.dx * 8, 3.6, -P.dz * 8));
    }
    camera.position.lerpVectors(fly.from, fly.to, k);
    controls.target.lerpVectors(fly.tFrom, fly.tTo, k);
    if (fly.t >= 1) fly = null;
  } else if (cam === "seguir") {
    const prev = controls.target.clone();
    const t = followPoint();
    const delta = t.clone().sub(prev);
    controls.target.copy(t);
    camera.position.add(delta);
    if (now - lastTouch > 1.6) {
      // volta devagar para trás do corredor
      const want = t.clone().add(new THREE.Vector3(-P.dx * 8, 3.6, -P.dz * 8));
      camera.position.lerp(want, 1 - Math.exp(-dtReal * 1.6));
    }
  } else if (cam === "voo") {
    const p = pathOf(dist);
    vooS = (vooS + dtReal * 34) % p.length;
    const a = p.at(vooS), b = p.at(vooS + 70);
    const want = new THREE.Vector3(a.x - a.dx * 30, height(a.x, a.z) + 22, a.z - a.dz * 30);
    camera.position.lerp(want, 1 - Math.exp(-dtReal * 2));
    controls.target.lerp(new THREE.Vector3(b.x, height(b.x, b.z) + 2, b.z), 1 - Math.exp(-dtReal * 2));
    $("race").textContent = state === "race" ? $("race").textContent : `sobrevoo · km ${kmTxt(dist, vooS)}`;
  }
  controls.update();
}

// ---------- interface
const hintEl = $("hint");
let hintTimer = 0;
function hint(t: string, ms = 3200) {
  hintEl.textContent = t;
  hintEl.classList.add("on");
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => hintEl.classList.remove("on"), ms);
}

let audio: AudioContext | null = null;
function beep(freq: number, dur: number, vol = 0.18, type: OscillatorType = "sine") {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur);
  } catch {
    /* sem som */
  }
}

function startRace() {
  resetRace();
  state = "count";
  const el = $("count");
  el.hidden = false;
  let n = 3;
  const tick = () => {
    if (n > 0) {
      el.textContent = String(n);
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
      beep(660, 0.25);
      n--;
      window.setTimeout(tick, 800);
    } else {
      el.textContent = "VAI!";
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
      beep(330, 0.9, 0.22, "sawtooth");
      beep(495, 0.9, 0.12, "square");
      state = "race";
      $("go").textContent = "⟲ Reiniciar";
      window.setTimeout(() => (el.hidden = true), 900);
    }
  };
  tick();
}

$("go").addEventListener("click", () => {
  if (state === "idle") {
    if (cam === "geral" && !fly) {
      const s = pathOf(ev.distances[0]).at(-8);
      flyTo(new THREE.Vector3(s.x + 6, height(s.x, s.z) + 1, s.z), new THREE.Vector3(-26, 13, 30));
    }
    startRace();
  } else {
    resetRace();
    hint("Pronto para uma nova largada.");
  }
});
$("cams").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b?.dataset.c) setCam(b.dataset.c as Cam);
});
$("speeds").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b?.dataset.s) return;
  speed = Number(b.dataset.s);
  document.querySelectorAll<HTMLButtonElement>("#speeds button").forEach((x) => x.classList.toggle("on", x === b));
  hint(`1 segundo na tela = ${speed} segundos de prova`);
});

function setDist(d: Distance) {
  dist = d;
  world.setDistance(d.id);
  renderSheet();
}

// ---------- painel de baixo
let tab = "";
const sheet = $("sheet"), body = $("sheetBody");
const distChips = () =>
  `<div class="r3-chips">${ev.distances.map((d) => `<button data-d="${d.id}" class="${d === dist ? "on" : ""}" style="--c:${d.color}">${d.label}</button>`).join("")}</div>`;
function stats(d: Distance) {
  const p = pathOf(d);
  let min = Infinity, max = -Infinity, gain = 0, prev = 0;
  for (let s = 0; s <= p.length; s += 5) {
    const a = p.at(s), h = ev.altitude + height(a.x, a.z) * 5;
    min = Math.min(min, h);
    max = Math.max(max, h);
    if (s > 0 && h > prev) gain += h - prev;
    prev = h;
  }
  return { min: Math.round(min), max: Math.round(max), gain: Math.round(gain) };
}

function renderSheet() {
  document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
  sheet.hidden = !tab;
  document.body.classList.toggle("sheet-open", !!tab);
  if (!tab) return;
  if (tab === "percurso") {
    const st = stats(dist);
    body.innerHTML = `<h3>Percurso</h3>${distChips()}
      <div class="r3-facts"><div><b>${dist.km} km</b><span>distância</span></div><div><b>${st.max - st.min} m</b><span>desnível</span></div><div><b>+${st.gain} m</b><span>subida total</span></div><div><b>${dist.water.length}</b><span>postos de água</span></div></div>
      <canvas class="r3-prof" id="prof"></canvas>
      <p class="r3-small">Toque no gráfico para ver aquele trecho. Água no km ${dist.water.map((w) => String(w).replace(".", ",")).join(" · ")}. Largada ${dist.wave ? `${dist.wave} min depois do ${ev.distances[0].label}` : `às ${ev.start}h`}.</p>
      <button class="r3-btn" id="sobrevoo">✈️ Sobrevoar o percurso</button>`;
    $("sobrevoo").addEventListener("click", () => {
      setCam("voo");
      closeSheet();
      hint(`Sobrevoando o ${dist.label}. Toque em Geral para sair.`);
    });
    const prof = $<HTMLCanvasElement>("prof");
    prof.addEventListener("click", (e) => {
      const r = prof.getBoundingClientRect();
      const s = ((e.clientX - r.left - 40) / (r.width - 48)) * pathOf(dist).length;
      const a = pathOf(dist).at(Math.max(0, Math.min(pathOf(dist).length, s)));
      setCam("geral");
      fly = null;
      flyTo(new THREE.Vector3(a.x, height(a.x, a.z), a.z), new THREE.Vector3(-a.dx * 40 + 25, 30, -a.dz * 40 + 25));
      hint(`km ${kmTxt(dist, s)}`);
    });
    drawProfile();
  } else if (tab === "simular") {
    const pr = predict(dist, me.pace);
    body.innerHTML = `<h3>Simule a sua prova</h3>${distChips()}
      <label class="r3-pace">Seu ritmo <b id="paceV">${fmtPace(me.pace)} /km</b><input type="range" id="pace" min="3" max="10" step="0.05" value="${me.pace}"></label>
      <div class="r3-facts"><div><b id="predT">${fmt(pr.total)}</b><span>tempo previsto</span></div><div><b id="predC">${clockAt(dist.wave * 60 + pr.total)}</b><span>você chega</span></div></div>
      <div class="r3-splits" id="splits">${pr.splits.map((t, i) => `<span>km ${i + 1}<b>${fmt(t)}</b></span>`).join("")}</div>
      <p class="r3-small">Já conta as subidas e descidas do percurso. Seu bonequinho larga no pelotão do seu ritmo.</p>
      <button class="r3-btn hot" id="runMe">▶ Correr com o meu ritmo</button>`;
    const pace = $<HTMLInputElement>("pace");
    pace.addEventListener("input", () => {
      me.pace = Number(pace.value);
      const p = predict(dist, me.pace);
      $("paceV").textContent = `${fmtPace(me.pace)} /km`;
      $("predT").textContent = fmt(p.total);
      $("predC").textContent = clockAt(dist.wave * 60 + p.total);
      $("splits").innerHTML = p.splits.map((t, i) => `<span>km ${i + 1}<b>${fmt(t)}</b></span>`).join("");
    });
    $("runMe").addEventListener("click", () => {
      me.on = true;
      me.d = dist;
      const mates = runners.filter((r) => r.d === dist);
      const ahead = mates.filter((r) => r.pace < me.pace).length;
      const row = Math.floor(ahead / 7);
      const first = mates[0];
      me.s0 = first.s0 - row * 0.6 - 0.3;
      me.lat = 0.3;
      me.t0 = dist.wave * 60 + row * 1.6;
      closeSheet();
      speedTo(30);
      setCam("seguir");
      startRace();
    });
  } else if (tab === "arena") {
    body.innerHTML = `<h3>Arena</h3><div class="r3-list">${ev.arena
      .map((a) => `<button data-a="${a.id}"><i>${a.icon}</i><span><b>${a.name}</b><small>${a.info}</small></span></button>`)
      .join("")}</div>`;
    body.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) => b.addEventListener("click", () => focusSpot(b.dataset.a!)));
  } else if (tab === "inscricao") {
    body.innerHTML = `<h3>Inscrição</h3>
      <div class="r3-lots">${ev.lots.map((l) => `<div class="${l.status.replace(" ", "")}"><span>${l.name}</span><b>${l.price}</b><em>${l.status}</em></div>`).join("")}</div>
      <p class="r3-small">Kit: ${ev.kit.join(" · ")}.${ev.demo ? " Valores de exemplo." : ""}</p>
      <button class="r3-btn hot" id="signup">Inscreva-se</button>
      ${ev.demo ? `<div class="r3-pitch"><b>Quer isso no seu evento?</b><span>Percurso real, seus lotes, link de inscrição e a marca dos patrocinadores.</span><a class="r3-btn wa" target="_blank" rel="noopener" href="https://wa.me/${ev.whatsapp}?text=${encodeURIComponent("Olá, Bruno! Vi o percurso 3D de corrida (demonstração) e quero para o meu evento.")}">Falar com a PáginasPro no WhatsApp</a></div>` : ""}`;
    $("signup").addEventListener("click", () => {
      if (ev.signup) window.open(ev.signup, "_blank", "noopener");
      else hint("Na versão do seu evento, este botão abre a página de inscrição (Ticket Sports, Sympla…).", 4200);
    });
  }
  body.querySelectorAll<HTMLButtonElement>("[data-d]").forEach((b) =>
    b.addEventListener("click", () => {
      setDist(ev.distances.find((d) => d.id === b.dataset.d)!);
      if (cam === "geral") overview();
    }),
  );
}
function closeSheet() {
  tab = "";
  renderSheet();
}
function speedTo(s: number) {
  speed = s;
  document.querySelectorAll<HTMLButtonElement>("#speeds button").forEach((x) => x.classList.toggle("on", Number(x.dataset.s) === s));
}
$("tabs").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b?.dataset.t) return;
  tab = tab === b.dataset.t ? "" : b.dataset.t;
  renderSheet();
});
$("sheetX").addEventListener("click", closeSheet);

function focusSpot(id: string) {
  const a = ev.arena.find((x) => x.id === id);
  if (!a) return;
  setCam("geral");
  fly = null;
  flyTo(new THREE.Vector3(a.x, height(a.x, a.z) + 1, a.z), new THREE.Vector3(-20, 18, 30));
  if (innerWidth < 700) closeSheet();
  hint(`${a.icon} ${a.name}: ${a.info}`, 5000);
}

function drawProfile() {
  const c = document.getElementById("prof") as HTMLCanvasElement | null;
  if (!c) return;
  const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
  c.width = r.width * dpr;
  c.height = r.height * dpr;
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  const W = r.width, H = r.height, L = pathOf(dist).length, st = stats(dist);
  const lo = st.min - 6, hi = st.max + 6;
  const X = (s: number) => 40 + (s / L) * (W - 48), Y = (h: number) => 8 + (1 - (h - lo) / (hi - lo)) * (H - 28);
  const alt = (s: number) => {
    const a = pathOf(dist).at(s);
    return ev.altitude + height(a.x, a.z) * 5;
  };
  g.clearRect(0, 0, W, H);
  g.beginPath();
  g.moveTo(X(0), H - 20);
  for (let s = 0; s <= L; s += L / 160) g.lineTo(X(s), Y(alt(s)));
  g.lineTo(X(L), H - 20);
  g.closePath();
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, dist.color + "cc");
  grad.addColorStop(1, dist.color + "22");
  g.fillStyle = grad;
  g.fill();
  g.fillStyle = "#5b6470";
  g.font = "10px Jost, sans-serif";
  g.textAlign = "center";
  for (let k = 0; k <= dist.km; k++) g.fillText(String(k), X((k / dist.km) * L), H - 6);
  g.textAlign = "right";
  g.fillText(`${st.max} m`, 36, Y(st.max) + 3);
  g.fillText(`${st.min} m`, 36, Y(st.min) + 3);
  for (const w of dist.water) {
    const s = (w / dist.km) * L;
    g.font = "12px sans-serif";
    g.textAlign = "center";
    g.fillText("💧", X(s), Y(alt(s)) - 6);
  }
  const dot = (s: number, color: string) => {
    if (s <= 0 || s > L) return;
    g.beginPath();
    g.arc(X(s), Y(alt(s)), 5, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.stroke();
  };
  const lead = runners.filter((x) => x.d === dist && x.fin < 0).reduce((m, x) => Math.max(m, x.s), 0);
  dot(lead, ev.colors.dark);
  if (me.on && me.d === dist) dot(me.s, "#ffd400");
}

function finished() {
  const mates = runners.filter((r) => r.d === me.d);
  const pos = mates.filter((r) => r.fin >= 0 && r.fin < me.fin).length + 1;
  const done = $("done");
  done.hidden = false;
  done.innerHTML = `<b>🏅 Você completou os ${me.d.label}!</b><span>${fmt(me.fin)} · ${pos}º de ${mates.length + 1} (simulação)</span>
    <div><button class="r3-btn hot" id="doneSign">Quero me inscrever</button><button class="r3-btn" id="doneX">Fechar</button></div>`;
  beep(880, 0.15);
  window.setTimeout(() => beep(1175, 0.3), 160);
  $("doneSign").addEventListener("click", () => {
    done.hidden = true;
    tab = "inscricao";
    renderSheet();
  });
  $("doneX").addEventListener("click", () => (done.hidden = true));
}

function hud() {
  if (state === "race") {
    $("clock").textContent = clockAt(T);
    $("race").textContent = `prova ${fmt(T)}`;
  }
  const parts: string[] = [];
  for (const d of ev.distances) {
    const mates = runners.filter((r) => r.d === d);
    const lead = mates.filter((r) => r.fin < 0).reduce((m, r) => Math.max(m, r.s), -1);
    const fin = mates.filter((r) => r.fin >= 0).length;
    if (state !== "race" || T < d.wave * 60) parts.push(`<span style="--c:${d.color}">${d.label} ${state === "race" ? `larga em ${fmt(d.wave * 60 - T)}` : "no pelotão"}</span>`);
    else if (fin === mates.length) parts.push(`<span style="--c:${d.color}">${d.label} · todos chegaram</span>`);
    else parts.push(`<span style="--c:${d.color}">${d.label} líder km ${kmTxt(d, lead)}${fin ? ` · ${fin} chegaram` : ""}</span>`);
  }
  if (me.on) {
    const mates = runners.filter((r) => r.d === me.d);
    const ahead = mates.filter((r) => (r.fin >= 0 && (me.fin < 0 || r.fin < me.fin)) || (r.fin < 0 && me.fin < 0 && r.s > me.s)).length;
    parts.unshift(`<span class="me">Você · ${me.fin >= 0 ? `chegou em ${fmt(me.fin)}` : `km ${kmTxt(me.d, me.s)}`} · ${ahead + 1}º</span>`);
  }
  $("lead").innerHTML = parts.join("");
}

// ---------- laço
const clock = new THREE.Clock();
let hudT = 0, profT = 0;
const focus = new THREE.Vector3();
function frame() {
  const dtReal = Math.min(0.05, clock.getDelta()), now = clock.elapsedTime;
  const dt = state === "race" ? dtReal * speed : 0;
  T += dt;
  stepRunners(dt, dtReal, now);
  for (const [i, d] of ev.distances.entries()) {
    let best: Runner | null = null;
    for (const r of runners) if (r.d === d && r.fin < 0 && r.s > 0 && (!best || r.s > best.s)) best = r;
    const l = leadLabels[i];
    if (best && state === "race") l.pos.set(best.x, height(best.x, best.z) + 1.4, best.z);
    else l.pos.set(0, -999, 0);
  }
  if (me.on) meLabel.pos.set(me.x, height(me.x, me.z) + 1, me.z);
  updateCamera(dtReal, now);
  focus.copy(controls.target);
  world.setFar(camera.position.distanceTo(controls.target) > 220);
  world.update(now, focus);
  renderer.render(scene, camera);
  drawLabels();
  if ((hudT += dtReal) > 0.25) {
    hudT = 0;
    hud();
  }
  if (tab === "percurso" && (profT += dtReal) > 0.5) {
    profT = 0;
    drawProfile();
  }
  requestAnimationFrame(frame);
}

resetRace();
const s0 = pathOf(ev.distances[0]).at(-6);
controls.target.set(s0.x + 10, height(s0.x, s0.z), s0.z + 8);
camera.position.set(s0.x - 70, 45, s0.z + 95);
flyTo(new THREE.Vector3(s0.x + 10, height(s0.x, s0.z), s0.z + 8), new THREE.Vector3(-46, 24, 58));
frame();
window.setTimeout(() => hint("Toque em ▶ Dar a largada. Arraste para girar, pinça para zoom.", 4500), 900);
