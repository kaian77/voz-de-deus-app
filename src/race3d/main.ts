// Percurso 3D de corrida (PáginasPro): largada animada com os pelotões, câmeras (geral, seguir, sobrevoo),
// altimetria, simulação do ritmo do corredor ("Você"), arena e inscrição. Página: /corrida/<slug>.
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildWorld, height, HALF, PODIUM } from "./world";
import { BODY, Crowd, Pose, SKIN, ZOMBIE_SKIN } from "./crowd";
import { exemplo } from "./events/exemplo";
import { zombieRun } from "./events/zombie-run";
import type { Distance, RaceEvent } from "./types";

const EVENTS: Record<string, RaceEvent> = { exemplo, "zombie-run": zombieRun };
const slug = location.pathname.split("/").filter(Boolean)[1] || new URLSearchParams(location.search).get("e") || "exemplo";
const ev = EVENTS[slug] ?? exemplo;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

document.title = `${ev.name} · percurso 3D${ev.demo ? " (demonstração)" : ""}`;
const root = document.documentElement.style;
root.setProperty("--p", ev.colors.primary);
root.setProperty("--d", ev.colors.dark);
root.setProperty("--a", ev.colors.accent);
document.body.classList.toggle("night", !!ev.night);
if (ev.font) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(ev.font)}&display=swap`;
  document.head.appendChild(link);
  root.setProperty("--brand", `"${ev.font}", var(--font)`);
}
const startTxt = `${Math.floor(ev.start)}h${ev.start % 1 ? String(Math.round((ev.start % 1) * 60)).padStart(2, "0") : ""}`;
const distName = (d: Distance) => (d.name ? `${d.label} · ${d.name}` : d.label);

$("app").innerHTML = `
<div class="r3-canvas" id="canvas"></div>
<div class="r3-labels" id="labels"></div>
<header class="r3-top">
  <div class="r3-brand"><b>${ev.name}</b><span>${ev.subtitle} · ${ev.date}, ${startTxt}</span></div>
  ${ev.demo ? `<a class="r3-demo" href="https://paginaspro.app.br/inicio" target="_blank" rel="noopener">Demonstração<small>PáginasPro</small></a>` : ""}
</header>
<div class="r3-hud">
  <div class="r3-clock"><b id="clock">--:--</b><span id="race">antes da largada</span></div>
  <div class="r3-lead" id="lead"></div>
</div>
<div class="r3-cams">
  <div class="r3-seg" id="cams"><button data-c="seguir">🎥 Seguir</button><button data-c="voo">✈️ Sobrevoo</button></div>
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
const P = { x: 0, z: 0, dx: 1, dz: 0 };

// ---------- corredores
type Runner = {
  d: Distance; di: number; pace: number; lat: number; s0: number; s: number; t0: number;
  fin: number; phase: number; ax: number; az: number; x: number; z: number; yaw: number; wob: number; away?: boolean;
};
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const runners: Runner[] = [];
const SHIRT_ALT = [0xffffff, 0x1b1b1b, 0xffc72c, 0x14a37f, 0xe04e8a];
// depois da chegada os corredores ficam juntos nesta área (pós-prova)
const after = ev.after ?? [27, 32.5];
const [afterW, afterD] = ev.after ? [20, 6] : [46, 11];
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
      fin: -1, phase: rand() * 6, ax: after[0] + (rand() - 0.5) * afterW, az: after[1] + (rand() - 0.5) * afterD, x: 0, z: 0, yaw: 0, wob: rand() * 6,
    });
  });
});
// bonecos um pouco maiores que a escala real para aparecerem bem no celular (no pódio voltam ao tamanho do palco)
const RUN_SCALE = 0.42;
const gore = ev.distances.some((d) => d.zombie);
const crowd = new Crowd(runners.length, RUN_SCALE, { lamps: ev.night, gore });
runners.forEach((r, i) => {
  const base = new THREE.Color(r.d.color).getHex();
  const shirt = r.d.shirts ? r.d.shirts[i % r.d.shirts.length] : rand() < 0.75 ? base : SHIRT_ALT[i % SHIRT_ALT.length];
  crowd.paint(i, shirt, (r.d.zombie ? ZOMBIE_SKIN : SKIN)[i % 4], [0x1f2733, 0x2d2d2d, 0x3a4a5e][i % 3]);
  crowd.lamp(i, !r.d.zombie);
  crowd.zombie(i, !!r.d.zombie);
});
/** Pose de corrida: zumbi corre de braços esticados. */
const runPose = (d: Distance) => (d.zombie ? Pose.Zombie : Pose.Run);
scene.add(crowd.group);

// torcida nas grades da largada/chegada
type Fan = { x: number; y: number; z: number; yaw: number; ph: number };
const fans: Fan[] = [];
const startPt = pathOf(ev.distances[0]).at(0);
const auto = ev.venue === "autodromo";
for (let s = auto ? -44 : -64; s <= (auto ? 24 : 38); s += 1.3) for (const side of [-1, 1]) {
  if (rand() < (auto ? 0.55 : 0.35)) continue;
  const p = place(pathOf(ev.distances[0]), s + rand() * 0.6, side * (HALF + 1.1 + rand() * 1.6));
  // de frente para a pista
  fans.push({ x: p.x, y: 0, z: p.z, yaw: side > 0 ? Math.atan2(P.dz, -P.dx) : Math.atan2(-P.dz, P.dx), ph: rand() * 6 });
}
for (const st of world.seats) fans.push({ x: st.x, y: st.y - height(st.x, st.z), z: st.z, yaw: st.yaw, ph: rand() * 6 });
const fanCrowd = new Crowd(fans.length, RUN_SCALE);
fans.forEach((_, i) => fanCrowd.paint(i, [0xe3735e, 0x4e5a40, 0xf2c14e, 0x5b8fb9, 0xf5f3ec, 0xc96f9e, 0x7fb069][i % 7], SKIN[(i * 3) % 4], [0x2f3a4a, 0x4a3f35, 0x6c757d][i % 3]));
scene.add(fanCrowd.group);

// "Você"
const qs = new URLSearchParams(location.search);
const me = {
  on: false, pace: 6, d: ev.distances.find((d) => d.id === qs.get("d")) ?? ev.distances[0], s: 0, s0: 0, t0: 0, fin: -1, phase: 0, x: 0, z: 0, yaw: 0, lat: 0,
  name: (qs.get("nome") ?? "").slice(0, 18), shirt: 0xffd400, champ: qs.get("campeao") === "1", podium: false, passed: false, medal: false,
};
const SHIRTS = [0xffd400, 0xff5a1f, 0x2f8cff, 0x14a37f, 0xe04e8a, 0x111111];
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const meName = () => me.name.trim() || "Você";
const ME_SCALE = RUN_SCALE * 1.1;
const meCrowd = new Crowd(1, ME_SCALE, { lamps: ev.night, gore });
const paintMe = () => {
  meCrowd.paint(0, me.shirt, me.d.zombie ? ZOMBIE_SKIN[1] : SKIN[1], 0x111111);
  meCrowd.lamp(0, !me.d.zombie);
  meCrowd.zombie(0, !!me.d.zombie);
};
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

/** Velocidade (unidades/s de prova) no ponto s: ritmo base, mais lento na subida e mais rápido na descida. */
/** Ritmo de campeão: um pouco atrás do líder até 70% da prova e depois arranca para vencer. */
function champPace(d: Distance, s: number) {
  const fastest = Math.min(...runners.filter((r) => r.d === d).map((r) => r.pace));
  return s < pathOf(d).length * 0.7 ? fastest + 0.04 : fastest - 0.45;
}
const myPace = (s: number) => (me.champ ? champPace(me.d, s) : me.pace);

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
  me.podium = false;
  me.passed = false;
  me.medal = false;
  winHint = "";
  cer.on = false;
  for (const r of runners) r.away = false;
  for (let i = 0; i < 3; i++) podiumCrowd.hide(i);
  podiumCrowd.commit();
  medals.me.visible = medals.second.visible = medals.third.visible = false;
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
    if (r.away) return crowd.hide(i);
    const path = pathOf(r.d);
    const L = path.length;
    if (r.fin < 0) {
      if (racing && T >= r.t0) {
        if (r.s === r.s0) r.s += waitShift(r.di);
        const ramp = Math.min(1, (T - r.t0) / 8);
        // zumbi anda aos trancos (acelera e freia, mas na média vai no ritmo dele)
        const lurch = r.d.zombie ? 1 + 0.3 * Math.sin(T * 0.9 + r.wob * 3) : 1;
        r.s += vel(r.d, r.pace, r.s) * dt * (0.35 + 0.65 * ramp) * lurch;
        if (r.s >= L) r.fin = T - r.d.wave * 60;
        const lat = r.lat * (r.s < 30 ? 1 : 0.9) + Math.sin(r.s * 0.05 + r.wob) * (r.d.zombie ? 0.5 : 0.25);
        const p = place(path, r.s, lat);
        r.x = p.x; r.z = p.z; r.yaw = p.yaw;
        r.phase += dtReal * 14;
        crowd.pose(i, r.x, height(r.x, r.z), r.z, r.yaw, r.phase, runPose(r.d));
      } else {
        // esperando no pelotão: o 5K anda até a faixa depois que o 10K sai
        const moved = waitShift(r.di);
        const p = place(path, r.s0 + moved, r.lat);
        r.x = p.x; r.z = p.z; r.yaw = p.yaw;
        const walking = moved > 0 && moved < shiftMax[r.di] - 0.01;
        r.phase += dtReal * (walking ? 6 : 2);
        crowd.pose(i, r.x, height(r.x, r.z), r.z, r.yaw, r.phase, r.d.zombie ? Pose.Zombie : walking ? Pose.Walk : Pose.Stand);
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
        crowd.pose(i, r.x, height(r.x, r.z), r.z, r.yaw, r.phase, r.d.zombie ? Pose.Zombie : Pose.Walk);
      } else {
        r.phase += dtReal * 3;
        const cheer = !r.d.zombie && (i + Math.floor(now / 3)) % 9 === 0;
        crowd.pose(i, r.x, height(r.x, r.z), r.z, r.yaw + Math.sin(now * 0.3 + i) * 0.6, r.d.zombie ? r.phase * 0.3 : r.phase, r.d.zombie ? Pose.Zombie : cheer ? Pose.Cheer : Pose.Stand);
      }
    }
  });
  crowd.commit();

  // torcida: vibra quando tem corredor perto
  const busy = racing;
  fans.forEach((f, i) => {
    f.ph += dtReal * (busy ? 9 : 2);
    fanCrowd.pose(i, f.x, height(f.x, f.z) + f.y, f.z, f.yaw, f.ph, busy && (i + Math.floor(now * 0.7)) % 3 !== 0 ? Pose.Cheer : Pose.Stand);
  });
  fanCrowd.commit();

  if (me.on) {
    const path = pathOf(me.d), L = path.length;
    let pose = Pose.Stand;
    if (me.fin < 0 && racing && T >= me.t0) {
      if (me.s === me.s0) me.s += waitShift(ev.distances.indexOf(me.d));
      const ramp = Math.min(1, (T - me.t0) / 8);
      me.s += vel(me.d, myPace(me.s), me.s) * dt * (0.35 + 0.65 * ramp);
      if (me.champ && !me.passed && me.s > pathOf(me.d).length * 0.72) {
        const lead = runners.filter((r) => r.d === me.d).reduce((m, r) => Math.max(m, r.s), 0);
        if (me.s > lead) {
          me.passed = true;
          hint(`🔥 ${meName()} passou o líder! Faltam ${kmTxt(me.d, pathOf(me.d).length - me.s)} km`, 3500);
          beep(990, 0.12);
        }
      }
      pose = runPose(me.d);
      me.phase += dtReal * 14;
      if (me.s >= L) {
        me.s = L + 4;
        me.fin = T - me.t0;
        me.medal = true;
        finished();
      }
    } else me.phase += dtReal * 2;
    const p = place(path, me.fin >= 0 ? L + 4 : me.s + (T < me.t0 ? waitShift(ev.distances.indexOf(me.d)) : 0), me.lat);
    me.x = p.x; me.z = p.z; me.yaw = p.yaw;
    let lift = 0;
    if (me.podium && podium) {
      me.x = podium.x; me.z = podium.z; me.yaw = 0;
      lift = PODIUM.deck + PODIUM.steps[0].h;
    }
    if (me.fin >= 0) {
      pose = me.podium && !me.medal ? Pose.Stand : Math.sin(now * 2) > -0.2 ? Pose.Cheer : Pose.Stand;
      if (me.d.zombie && !me.podium) pose = Pose.Zombie;
      me.phase += dtReal * 6;
    }
    meCrowd.scale = me.podium ? 0.33 : ME_SCALE;
    meCrowd.pose(0, me.x, height(me.x, me.z) + lift, me.z, me.yaw, me.phase, pose);
    meCrowd.commit();
    ring.visible = !me.podium;
    ring.position.set(me.x, height(me.x, me.z) + lift + 0.08, me.z);
    ring.scale.setScalar(1 + Math.sin(now * 5) * 0.12);
    if (me.medal) wearMedal(medals.me, me.x, height(me.x, me.z) + lift, me.z, me.yaw, meCrowd.scale, Math.sin(now * 4) * 0.2);
    else if (!cer.on) medals.me.visible = false;
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
const meLabel = addLabel(meName().toUpperCase(), new THREE.Vector3(), "me", 1e9);
const podium = ev.arena.find((a) => a.id === "podio");
const leadLabels = ev.distances.map((d) => addLabel(`Líder ${d.label}`, new THREE.Vector3(), "leader", 900, d.id));
const v3 = new THREE.Vector3();
function drawLabels() {
  const w = innerWidth, h = innerHeight;
  for (const l of labels) {
    let show = true;
    if (l.dist && l.dist !== dist.id) show = false;
    if (l === meLabel) show = me.on;
    if (l.kind === "land" && cam === "seguir") show = false;
    if (cer.on && l.kind !== "me") show = false;
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
    const off = new THREE.Vector3(-P.dx * 6.5, 3, -P.dz * 6.5);
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
  if (camera.aspect < 1 && auto) {
    // pista fechada: de cima e um pouco de frente, para caber a volta inteira
    flyTo(c, new THREE.Vector3(0, L * 1.1, L * 0.75));
    return;
  }
  if (camera.aspect < 1) {
    // celular em pé: olha ao longo do percurso, de trás da ponta oeste
    flyTo(c, new THREE.Vector3(-L * 0.62, L * 0.34, L * 0.2));
    return;
  }
  const dd = (L * 0.62) / Math.tan(hf / 2);
  flyTo(c, new THREE.Vector3(-dd * 0.18, dd * 0.62, dd * 0.78));
}
/** Ponto seguido: você, ou o líder da distância escolhida, ou o pelotão antes da largada. */
/** Quem venceu a distância (o primeiro a cruzar a chegada), ou null. */
function winner(d: Distance) {
  let w: Runner | null = null;
  for (const r of runners) if (r.d === d && r.fin >= 0 && (!w || r.fin < w.fin)) w = r;
  return w;
}
let winHint = "";
function followPoint() {
  if (me.on && me.d === dist) {
    pathOf(me.d).at(Math.min(me.s, pathOf(me.d).length), P);
    return followTarget.set(me.x, height(me.x, me.z) + 0.6, me.z);
  }
  // depois que alguém chega, a câmera fica com o vencedor (antes ela pulava de corredor em corredor na chegada)
  let best: Runner | null = winner(dist);
  if (best && cam === "seguir" && winHint !== dist.id) {
    winHint = dist.id;
    hint(`🏆 O vencedor dos ${dist.label} chegou em ${fmt(best.fin)}! Toque em Sobrevoo para ver o percurso.`, 4500);
  }
  if (!best) for (const r of runners) if (r.d === dist && r.fin < 0 && (!best || r.s > best.s)) best = r;
  if (!best) best = runners.find((r) => r.d === dist) ?? runners[0];
  pathOf(best.d).at(Math.min(best.s, pathOf(best.d).length), P);
  return followTarget.set(best.x, height(best.x, best.z) + 0.6, best.z);
}

function updateCamera(dtReal: number, now: number) {
  if (fly) {
    fly.t = Math.min(1, fly.t + dtReal / 1.3);
    const k = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
    if (cam === "seguir") {
      const t = followPoint();
      fly.tTo.copy(t);
      fly.to.copy(t).add(new THREE.Vector3(-P.dx * 6.5, 3, -P.dz * 6.5));
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
      const want = t.clone().add(new THREE.Vector3(-P.dx * 6.5, 3, -P.dz * 6.5));
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

/** Rosnado da horda (som sintetizado, grave e tremido). */
function growl() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime, o = audio.createOscillator(), lfo = audio.createOscillator(), lg = audio.createGain(), g = audio.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 1.6);
    lfo.frequency.value = 18;
    lg.gain.value = 25;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    o.connect(g).connect(audio.destination);
    o.start(t + 0.5);
    lfo.start(t + 0.5);
    o.stop(t + 2.3);
    lfo.stop(t + 2.3);
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
      el.textContent = ev.go ?? "VAI!";
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
      beep(330, 0.9, 0.22, "sawtooth");
      beep(495, 0.9, 0.12, "square");
      if (ev.distances.some((d) => d.zombie)) growl();
      state = "race";
      $("go").textContent = "⟲ Reiniciar";
      window.setTimeout(() => (el.hidden = true), 900);
    }
  };
  tick();
}

// confete
const CONF = 900;
const confGeo = new THREE.BufferGeometry();
const confPos = new Float32Array(CONF * 3), confVel = new Float32Array(CONF * 3), confCol = new Float32Array(CONF * 3);
const confLife = new Float32Array(CONF), confSpread = new Float32Array(CONF).fill(1);
confGeo.setAttribute("position", new THREE.BufferAttribute(confPos, 3));
confGeo.setAttribute("color", new THREE.BufferAttribute(confCol, 3));
const confPts = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false }));
confPts.frustumCulled = false;
scene.add(confPts);
let confNext = 0;
function confetti(n: number, at?: THREE.Vector3, spread = 1) {
  const o = at ?? new THREE.Vector3(startPt.x + 2, height(startPt.x, startPt.z) + 10, startPt.z);
  const c = new THREE.Color();
  confPts.material.size = spread < 1 ? 0.045 : 0.16;
  for (let k = 0; k < n; k++) {
    const i = confNext++ % CONF;
    confPos.set([o.x + (rand() - 0.5) * 4 * spread, o.y, o.z + (rand() - 0.5) * 6 * spread], i * 3);
    confVel.set([(rand() - 0.5) * 9 * spread, (2 + rand() * 7) * spread, (rand() - 0.5) * 9 * spread], i * 3);
    c.setHSL(rand(), 0.9, 0.6);
    confCol.set([c.r, c.g, c.b], i * 3);
    confLife[i] = 4 + rand() * 3;
    confSpread[i] = spread;
  }
  confGeo.attributes.color.needsUpdate = true;
}
function stepConfetti(dt: number) {
  let any = false;
  for (let i = 0; i < CONF; i++) {
    if (confLife[i] <= 0) {
      confPos[i * 3 + 1] = -999;
      continue;
    }
    any = true;
    confLife[i] -= dt;
    confVel[i * 3 + 1] = Math.max(-2.2 * confSpread[i], confVel[i * 3 + 1] - dt * 6 * confSpread[i]);
    confVel[i * 3] *= 1 - dt * 0.8;
    confVel[i * 3 + 2] *= 1 - dt * 0.8;
    confPos[i * 3] += (confVel[i * 3] + Math.sin(confLife[i] * 5 + i) * 0.8 * confSpread[i]) * dt;
    confPos[i * 3 + 1] += confVel[i * 3 + 1] * dt;
    confPos[i * 3 + 2] += confVel[i * 3 + 2] * dt;
  }
  confPts.visible = any;
  if (any) confGeo.attributes.position.needsUpdate = true;
}

$("go").addEventListener("click", () => {
  if (state === "idle" && me.name && !me.on) {
    launchMe(me.d);
    return;
  }
  if (state === "idle") {
    // ao dar a largada a câmera já acompanha a prova
    startRace();
    setCam("seguir");
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
  `<div class="r3-chips">${ev.distances.map((d) => `<button data-d="${d.id}" class="${d === dist ? "on" : ""}" style="--c:${d.color}">${distName(d)}</button>`).join("")}</div>`;
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

function predictChamp(d: Distance) {
  const L = pathOf(d).length, per = unitsPerKm(d), splits: number[] = [];
  let s = 0, t = 0, next = per;
  while (s < L) {
    s += vel(d, champPace(d, s), s) * 2;
    t += 2;
    if (s >= next) {
      splits.push(t);
      next += per;
    }
  }
  return { total: t, splits };
}

/** Coloca o bonequinho do corredor no pelotão certo e dá a largada seguindo ele. */
function launchMe(d: Distance) {
  me.on = true;
  me.d = d;
  me.podium = false;
  me.passed = false;
  if (dist !== d) setDist(d);
  paintMe();
  meLabel.el.textContent = meName().toUpperCase();
  refreshMedals();
  const mates = runners.filter((r) => r.d === d);
  const ahead = me.champ ? 0 : mates.filter((r) => r.pace < me.pace).length;
  const row = Math.floor(ahead / 7);
  me.s0 = mates[0].s0 - row * 0.6 + (me.champ ? 0.5 : -0.3);
  me.lat = me.champ ? 0 : 0.3;
  me.t0 = d.wave * 60 + row * 1.6;
  closeSheet();
  speedTo(30);
  setCam("seguir");
  startRace();
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
      <p class="r3-small">Toque no gráfico para ver aquele trecho. Água no km ${dist.water.map((w) => String(w).replace(".", ",")).join(" · ")}. Largada ${dist.wave ? `${dist.wave} min depois do ${ev.distances[0].label}` : `às ${startTxt}`}.${ev.routeNote ? ` ${ev.routeNote}` : ""}</p>
      <button class="r3-btn" id="sobrevoo">✈️ Sobrevoar o percurso</button>`;
    $("sobrevoo").addEventListener("click", () => {
      setCam("voo");
      closeSheet();
      hint(`Sobrevoando o ${dist.label}. Toque em Seguir para voltar à prova.`);
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
    const pr = me.champ ? predictChamp(dist) : predict(dist, me.pace);
    body.innerHTML = `<h3>Simule a sua prova</h3>${distChips()}
      <div class="r3-me"><input id="meName" maxlength="18" placeholder="Seu nome" value="${esc(me.name)}" autocomplete="given-name">
        <div class="r3-shirts">${SHIRTS.map((c) => `<button data-shirt="${c}" class="${c === me.shirt ? "on" : ""}" style="--c:#${c.toString(16).padStart(6, "0")}" aria-label="Cor da camiseta"></button>`).join("")}</div></div>
      <label class="r3-champ"><input type="checkbox" id="champ" ${me.champ ? "checked" : ""}><span><b>🏆 Quero chegar em 1º</b><small>Seu bonequinho vem atrás do líder e arranca no fim.</small></span></label>
      <label class="r3-pace${me.champ ? " off" : ""}" id="paceBox">Seu ritmo <b id="paceV">${fmtPace(me.pace)} /km</b><input type="range" id="pace" min="3" max="10" step="0.05" value="${me.pace}"></label>
      <div class="r3-facts"><div><b id="predT">${fmt(pr.total)}</b><span>tempo previsto</span></div><div><b id="predC">${clockAt(dist.wave * 60 + pr.total)}</b><span>você chega</span></div></div>
      <div class="r3-splits" id="splits">${pr.splits.map((t, i) => `<span>km ${i + 1}<b>${fmt(t)}</b></span>`).join("")}</div>
      <p class="r3-small">Já conta as subidas e descidas do percurso. Seu bonequinho larga no pelotão do seu ritmo.</p>
      <button class="r3-btn hot" id="runMe">▶ ${me.champ ? "Correr para vencer" : "Correr com o meu ritmo"}</button>`;
    $<HTMLInputElement>("meName").addEventListener("input", (e) => {
      me.name = (e.target as HTMLInputElement).value.slice(0, 18);
      meLabel.el.textContent = meName().toUpperCase();
    });
    body.querySelectorAll<HTMLButtonElement>("[data-shirt]").forEach((b) =>
      b.addEventListener("click", () => {
        me.shirt = Number(b.dataset.shirt);
        paintMe();
        body.querySelectorAll("[data-shirt]").forEach((x) => x.classList.toggle("on", x === b));
      }),
    );
    $<HTMLInputElement>("champ").addEventListener("change", (e) => {
      me.champ = (e.target as HTMLInputElement).checked;
      renderSheet();
    });
    const pace = $<HTMLInputElement>("pace");
    pace.addEventListener("input", () => {
      me.pace = Number(pace.value);
      const p = predict(dist, me.pace);
      $("paceV").textContent = `${fmtPace(me.pace)} /km`;
      $("predT").textContent = fmt(p.total);
      $("predC").textContent = clockAt(dist.wave * 60 + p.total);
      $("splits").innerHTML = p.splits.map((t, i) => `<span>km ${i + 1}<b>${fmt(t)}</b></span>`).join("");
    });
    $("runMe").addEventListener("click", () => launchMe(dist));
  } else if (tab === "arena") {
    body.innerHTML = `<h3>Arena</h3><div class="r3-list">${ev.arena
      .map((a) => `<button data-a="${a.id}"><i>${a.icon}</i><span><b>${a.name}</b><small>${a.info}</small></span></button>`)
      .join("")}</div>`;
    body.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) => b.addEventListener("click", () => focusSpot(b.dataset.a!)));
  } else if (tab === "inscricao") {
    body.innerHTML = `<h3>Inscrição</h3>
      <div class="r3-lots">${ev.lots.map((l) => `<div class="${l.status.replace(" ", "")}"><span>${l.name}</span><b>${l.price}</b><em>${l.status}</em>${l.items ? `<small>${l.items}</small>` : ""}</div>`).join("")}</div>
      <p class="r3-small">Kit: ${ev.kit.join(" · ")}.${ev.lotsNote ? ` ${ev.lotsNote}` : ev.demo ? " Valores de exemplo." : ""}</p>
      <button class="r3-btn hot" id="signup">Inscreva-se</button>
      ${ev.demo ? `<div class="r3-pitch"><b>Quer isso no seu evento?</b><span>Percurso real, seus lotes, link de inscrição e a marca dos patrocinadores.</span><a class="r3-btn wa" target="_blank" rel="noopener" href="https://wa.me/${ev.whatsapp}?text=${encodeURIComponent(`Olá, Bruno! Vi o percurso 3D (demonstração) da ${ev.name} e quero saber mais.`)}">Falar com a PáginasPro no WhatsApp</a></div>` : ""}`;
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

async function shareMe(win: boolean) {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("nome", meName());
  url.searchParams.set("d", me.d.id);
  if (me.champ) url.searchParams.set("campeao", "1");
  if (!location.pathname.startsWith("/corrida/")) url.searchParams.set("e", ev.slug);
  const text = win ? `${meName()} venceu os ${me.d.label} da ${ev.name} e ganhou medalha de ouro! Veja a corrida:` : `${meName()} fez os ${me.d.label} da ${ev.name} em ${fmt(me.fin)}. Veja:`;
  try {
    if (navigator.share) await navigator.share({ title: ev.name, text, url: url.toString() });
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      hint("Link copiado. É só colar no WhatsApp.");
    }
  } catch {
    /* cancelou */
  }
}

// ---------- cerimônia do pódio: staff entrega bronze, prata e ouro; o campeão ergue os braços com a medalha
type Tone = "ouro" | "prata" | "bronze";
const TONES: Record<Tone, { metal: number; light: string; mid: string; dark: string }> = {
  ouro: { metal: 0xffc72c, light: "#fff1a8", mid: "#f2b81f", dark: "#a8740b" },
  prata: { metal: 0xd7dbe0, light: "#ffffff", mid: "#c9ced6", dark: "#7d8590" },
  bronze: { metal: 0xcd8a4e, light: "#ffd2a6", mid: "#cd8a4e", dark: "#7c4a22" },
};
/** Arte da medalha (enquanto não tem a foto da medalha de verdade do evento). */
function medalCanvas(d: Distance, tone: Tone) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const T = TONES[tone];
  const rg = g.createRadialGradient(200, 170, 30, 256, 256, 256);
  rg.addColorStop(0, T.light);
  rg.addColorStop(0.55, T.mid);
  rg.addColorStop(1, T.dark);
  g.fillStyle = rg;
  g.beginPath();
  g.arc(256, 256, 254, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = T.dark;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(256, 256, 214, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = T.light;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(256, 256, 200, 0, Math.PI * 2);
  g.stroke();
  // nome do evento em volta
  g.fillStyle = T.dark;
  g.font = "600 34px Jost, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const name = ev.name.toUpperCase();
  const arc = Math.min(Math.PI * 1.1, name.length * 0.17);
  [...name].forEach((ch, i) => {
    const a = -Math.PI / 2 - arc / 2 + (arc * (i + 0.5)) / name.length;
    g.save();
    g.translate(256 + Math.cos(a) * 234, 256 + Math.sin(a) * 234);
    g.rotate(a + Math.PI / 2);
    g.fillText(ch, 0, 0);
    g.restore();
  });
  // corredor estilizado + distância
  g.fillStyle = T.dark;
  g.font = "700 150px Jost, sans-serif";
  g.fillText(d.label, 256, 270);
  g.font = "600 38px Jost, sans-serif";
  g.fillText(tone === "ouro" && me.champ ? "CAMPEÃO" : tone === "ouro" ? d.title ?? "FINISHER" : tone === "prata" ? "2º LUGAR" : "3º LUGAR", 256, 368);
  const top = "★ " + ev.subtitle.split("·").pop()!.trim().toUpperCase() + " ★";
  g.font = "500 30px Jost, sans-serif";
  g.font = `500 ${Math.min(30, Math.floor((30 * 330) / g.measureText(top).width))}px Jost, sans-serif`;
  g.fillText(top, 256, 150);
  return c;
}
const loader = new THREE.TextureLoader();
function medalFace(d: Distance, tone: Tone) {
  if (ev.medal && tone === "ouro") {
    const tex = loader.load(ev.medal);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const tex = new THREE.CanvasTexture(medalCanvas(d, tone));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function makeMedal(tone: Tone) {
  const g = new THREE.Group();
  const ribbon = new THREE.MeshStandardMaterial({ map: ribbonTexture(), roughness: 0.6 });
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.006), ribbon);
    r.position.set(sx * 0.05, 0.19, -0.025);
    r.rotation.set(-0.12, 0, -sx * 0.22);
    g.add(r);
  }
  const metal = new THREE.MeshStandardMaterial({ color: TONES[tone].metal, metalness: 0.8, roughness: 0.3 });
  const face = new THREE.MeshStandardMaterial({ map: medalFace(me.d, tone), metalness: 0.55, roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0.08 });
  if (ev.medal && tone === "ouro") {
    // foto da medalha de verdade (recortada, fundo transparente): placa no formato dela, frente e verso
    face.alphaTest = 0.5;
    face.side = THREE.DoubleSide;
    face.metalness = 0.3;
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), face));
  } else g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.018, 32).rotateX(Math.PI / 2), [metal, face, metal]));
  g.userData = { tone, face };
  g.visible = false;
  scene.add(g);
  return g;
}
function ribbonTexture() {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 4;
  const g = c.getContext("2d")!;
  g.fillStyle = ev.colors.primary;
  g.fillRect(0, 0, 32, 4);
  g.fillStyle = ev.colors.dark;
  g.fillRect(12, 0, 8, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const medals = { me: makeMedal("ouro"), second: makeMedal("prata"), third: makeMedal("bronze") };
/** Refaz a arte das medalhas para a distância de quem correu. */
function refreshMedals() {
  for (const md of Object.values(medals)) {
    const face = md.userData.face as THREE.MeshStandardMaterial;
    face.map?.dispose();
    face.map = medalFace(me.d, md.userData.tone as Tone);
    face.needsUpdate = true;
  }
}
const MEDAL = 1; // medidas da medalha já estão no tamanho do boneco (um pouco maior que a real)
/** Medalha no peito de quem está em (x, y, z) olhando para yaw. */
function wearMedal(m: THREE.Group, x: number, y: number, z: number, yaw: number, s: number, swing: number) {
  m.visible = true;
  m.scale.setScalar(s * MEDAL);
  const f = (BODY.chestFront + 0.035) * s;
  m.position.set(x + Math.sin(yaw) * f, y + (BODY.chest - 0.1) * s, z + Math.cos(yaw) * f);
  m.rotation.set(swing, yaw, 0);
}
const podiumCrowd = new Crowd(3);
scene.add(podiumCrowd.group);
for (let i = 0; i < 3; i++) podiumCrowd.hide(i);
podiumCrowd.commit();
const cer = { on: false, t: 0, others: [] as Runner[] };
function startCeremony() {
  if (!podium) return;
  me.podium = true;
  me.medal = false;
  cer.on = true;
  cer.t = 0;
  const mates = runners.filter((r) => r.d === me.d);
  cer.others = mates.sort((a, b) => (a.fin < 0 ? 1e9 - a.s : a.fin) - (b.fin < 0 ? 1e9 - b.s : b.fin)).slice(0, 2);
  cer.others.forEach((r, i) => {
    r.away = true;
    podiumCrowd.paint(i, r.d.shirts?.[0] ?? new THREE.Color(r.d.color).getHex(), (r.d.zombie ? ZOMBIE_SKIN : SKIN)[(i + 2) % 4], 0x1f2733);
  });
  podiumCrowd.paint(2, 0x0f2238, SKIN[0], 0x0f2238);
  medals.second.visible = medals.third.visible = medals.me.visible = false;
  setCam("geral");
  fly = null;
  flyTo(new THREE.Vector3(podium.x, height(podium.x, podium.z) + 0.85, podium.z), new THREE.Vector3(0.9, 0.75, 5.2));
  hint(`Cerimônia de premiação dos ${me.d.label}`, 3000);
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
function stepCeremony(dt: number, now: number) {
  if (!cer.on || !podium) return;
  cer.t += dt;
  const t = cer.t, px = podium.x, pz = podium.z, gy = height(px, pz), S = 0.3;
  // degraus: 2º à esquerda (1,5), 3º à direita (1,0), 1º no meio (2,2)
  const top = PODIUM.deck + PODIUM.steps[0].h;
  const steps = [PODIUM.steps[1], PODIUM.steps[2]].map((st) => ({ x: px + st.x, h: PODIUM.deck + st.h }));
  const gave = [t > 6, t > 3.4]; // prata, bronze
  steps.forEach((st, i) => {
    const cheer = gave[i] && t < (i ? 5 : 7.6);
    podiumCrowd.pose(i, st.x, gy + st.h, pz, 0, now * 8 + i, cheer ? Pose.Cheer : Pose.Stand);
    const m = i ? medals.third : medals.second;
    if (gave[i]) wearMedal(m, st.x, gy + st.h, pz, 0, S, Math.sin(now * 3 + i) * 0.15);
  });
  // staff: entra pela direita, para na frente do 3º, do 2º e do 1º
  const front = pz + 0.95;
  const stops: [number, number, number][] = [[2.2, steps[1].x, 3.4], [5, steps[0].x, 6], [7, px, 8.4]];
  const legs: [number, number, number, number][] = [[0, 2.2, px + 4, steps[1].x], [3.4, 5, steps[1].x, steps[0].x], [6, 7, steps[0].x, px], [8.8, 11.2, px, px - 5]];
  let ox = px + 4, walking = false, yaw = Math.PI;
  for (const [t0, t1, x0, x1] of legs) {
    if (t >= t0) ox = lerp(x0, x1, (t - t0) / (t1 - t0));
    if (t >= t0 && t < t1) {
      walking = true;
      yaw = x1 > x0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
  if (t < 11.2) podiumCrowd.pose(2, ox, gy + PODIUM.deck, front, yaw, now * 9, walking ? Pose.Walk : Pose.Stand);
  else podiumCrowd.hide(2);
  podiumCrowd.commit();
  // medalha voando da mão do staff para o pescoço
  for (const [i, [, x, at]] of stops.entries()) {
    const m = i === 0 ? medals.third : i === 1 ? medals.second : medals.me;
    const k = (t - (at - 0.7)) / 0.7;
    if (k > 0 && k < 1) {
      const h = i === 0 ? steps[1].h : i === 1 ? steps[0].h : top;
      m.visible = true;
      m.scale.setScalar(S * MEDAL);
      m.position.set(x, lerp(gy + PODIUM.deck + 0.4, gy + h + (BODY.chest - 0.1) * S, k) + Math.sin(k * Math.PI) * 0.25, lerp(front - 0.15, pz + (BODY.chestFront + 0.035) * S, k));
      m.rotation.set(0, 0, 0);
    }
  }
  if (t > 8.4 && !me.medal) {
    me.medal = true;
    confetti(500, new THREE.Vector3(px, gy + 2.2, pz - 0.3), 0.22);
    beep(523, 0.18);
    window.setTimeout(() => beep(659, 0.18), 180);
    window.setTimeout(() => beep(784, 0.18), 360);
    window.setTimeout(() => beep(1047, 0.7), 540);
    hint(`🥇 Medalha de ouro para ${meName()}!`, 4000);
  }
  if (t > 11 && t - dt <= 11) {
    const done = $("done");
    done.hidden = false;
    done.classList.add("win");
    done.innerHTML = `${medalImg()}<b>${esc(meName())}, campeão dos ${me.d.label}!</b><span>${fmt(me.fin)} · ${ev.name}</span>
      <div><button class="r3-btn hot" id="share2">Compartilhar</button><button class="r3-btn" id="doneX2">Fechar</button></div>`;
    $("share2").addEventListener("click", () => shareMe(true));
    $("doneX2").addEventListener("click", () => (done.hidden = true));
  }
}

const medalImg = () => `<img class="r3-medal" alt="Medalha" src="${ev.medal ?? medalCanvas(me.d, "ouro").toDataURL()}">`;

function finished() {
  const mates = runners.filter((r) => r.d === me.d);
  const pos = mates.filter((r) => r.fin >= 0 && r.fin < me.fin).length + 1;
  const done = $("done");
  done.hidden = false;
  const who = esc(meName());
  const win = pos === 1;
  done.classList.toggle("win", win);
  done.innerHTML = win
    ? `${medalImg()}<b>${who} venceu os ${me.d.label}!</b><span>${fmt(me.fin)} · 1º de ${mates.length + 1} · ${ev.name}</span>
      <div><button class="r3-btn hot" id="podiumGo">🏆 Subir no pódio</button><button class="r3-btn" id="share">Compartilhar</button></div>
      <div><button class="r3-btn" id="doneSign">Quero me inscrever</button><button class="r3-btn" id="doneX">Fechar</button></div>`
    : `${medalImg()}<b>${who} completou os ${me.d.label}!</b><span>${fmt(me.fin)} · ${pos}º de ${mates.length + 1} (simulação)</span>
      <div><button class="r3-btn hot" id="doneSign">Quero me inscrever</button><button class="r3-btn" id="share">Compartilhar</button></div>
      <div><button class="r3-btn" id="doneX">Fechar</button></div>`;
  confetti(win ? 700 : 250);
  if (win) {
    beep(523, 0.18);
    window.setTimeout(() => beep(659, 0.18), 180);
    window.setTimeout(() => beep(784, 0.18), 360);
    window.setTimeout(() => beep(1047, 0.5), 540);
  }
  document.getElementById("podiumGo")?.addEventListener("click", () => {
    done.hidden = true;
    startCeremony();
  });
  $("share").addEventListener("click", () => shareMe(win));
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
    else if (fin) parts.push(`<span style="--c:${d.color}">${d.label} · 1º em ${fmt(winner(d)!.fin)} · ${fin} de ${mates.length} chegaram</span>`);
    else parts.push(`<span style="--c:${d.color}">${d.label} líder km ${kmTxt(d, lead)}</span>`);
  }
  if (me.on) {
    const mates = runners.filter((r) => r.d === me.d);
    const ahead = mates.filter((r) => (r.fin >= 0 && (me.fin < 0 || r.fin < me.fin)) || (r.fin < 0 && me.fin < 0 && r.s > me.s)).length;
    parts.unshift(`<span class="me">${esc(meName())} · ${me.fin >= 0 ? `chegou em ${fmt(me.fin)}` : `km ${kmTxt(me.d, me.s)}`} · ${ahead + 1}º</span>`);
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
    let best: Runner | null = winner(d);
    const l = leadLabels[i];
    const txt = best ? `🏆 1º ${d.label}` : `Líder ${d.label}`;
    if (l.el.textContent !== txt) l.el.textContent = txt;
    if (!best) for (const r of runners) if (r.d === d && r.fin < 0 && r.s > 0 && (!best || r.s > best.s)) best = r;
    if (best && state === "race") l.pos.set(best.x, height(best.x, best.z) + 1.6, best.z);
    else l.pos.set(0, -999, 0);
  }
  if (me.on) meLabel.pos.set(me.x, height(me.x, me.z) + (me.podium ? PODIUM.deck + PODIUM.steps[0].h + 0.8 : 1.2), me.z);
  stepConfetti(dtReal);
  stepCeremony(dtReal, now);
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
if (me.name) {
  $("go").textContent = `▶ Ver ${meName()} correr`;
  window.setTimeout(() => hint(`${meName()} está no pelotão dos ${me.d.label}. Toque para ver a corrida!`, 4500), 900);
} else window.setTimeout(() => hint("Toque em ▶ Dar a largada. Arraste para girar, pinça para zoom.", 4500), 900);
