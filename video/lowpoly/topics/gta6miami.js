// Vice City (GTA 6, 19/11/2026) é inspirada em Miami. Miami de verdade: elevação média ~1,8 m (6 ft) acima do mar;
// nas marés mais altas do ano ("king tides") a água do mar alaga ruas mesmo com sol (NOAA, "sunny day flooding");
// a cidade fica sobre calcário poroso (aquífero de Biscayne), então a água sobe por baixo e um muro não resolve
// (USGS, Miami-Dade County); Miami Beach gasta centenas de milhões de dólares em bombas e em subir ruas (programa de
// resiliência da cidade, desde 2014). Cena nossa (prédios pastel, palmeiras, corte do solo); nada do jogo aparece.
let THREE, sea, under, wall, road, puddles = [], pumps = [], ups = [], walker;
const FACE = 16, BASE = -1.8;

export const SHOTS = [
  [[-5, 26, 72], [-10, 21, 62], [-15, 6, -10], [-15, 6, -10]],
  [[12, 11, 42], [7, 9, 34], [-8, 4, 0], [-8, 3, 0]],
  [[16, 1.5, 34], [15, 1.2, 29], [9, -0.8, 12], [9, -0.8, 12]],
  [[10, 10, 34], [0, 9, 28], [-6, 0, 4], [-10, 0, 4]],
  [[28, 3, 42], [24, 2, 38], [7, -2.5, 14], [7, -2.5, 14]],
  [[2, 1, 42], [-1, 1.5, 39], [-4, -3, 16], [-4, -2, 16]],
  [[16, 13, 36], [8, 11, 31], [-6, 0, 6], [-6, 0.5, 6]],
  [[-5, 26, 72], [-10, 34, 84], [-15, 8, -10], [-15, 9, -10]],
];

function holes() {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
  const g = cv.getContext("2d"); g.fillStyle = "#d8c39a"; g.fillRect(0, 0, 512, 128);
  for (let k = 0; k < 260; k++) { g.fillStyle = k % 3 ? "#8a7550" : "#6b5a3c"; const r = 1.5 + Math.random() * 5; g.beginPath(); g.ellipse(Math.random() * 512, Math.random() * 128, r * 1.4, r, 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function build(c) {
  THREE = c.THREE;
  const { scene, mat, box, rnd } = c;
  scene.fog = new THREE.Fog("#bfe6ff", 140, 360);
  const lime = holes(); lime.repeat.set(3, 1); lime.wrapS = THREE.RepeatWrapping;
  const side = mat("#d8c39a");
  const land = new THREE.Mesh(new THREE.BoxGeometry(60, 8, 76), [side, side, mat("#7cc35a"), side, new THREE.MeshLambertMaterial({ map: lime, flatShading: true }), side]);
  land.position.set(-20, -4, FACE - 38); land.receiveShadow = true; scene.add(land);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat("#7cc35a")); far.rotation.x = -Math.PI / 2; far.position.set(-300 + 10 - 50, -0.01, -200); scene.add(far);
  const bed = box(260, 0.5, 266, mat("#c9b98f")); bed.position.set(140, -8.2, FACE - 133); scene.add(bed);
  const sand = box(4, 0.4, 76, mat("#f1e3b5")); sand.position.set(8, -0.1, FACE - 38); scene.add(sand);
  sea = new THREE.Mesh(new THREE.BoxGeometry(260, 1, 266), new THREE.MeshLambertMaterial({ color: "#2a9fd6", transparent: true, opacity: 0.82 }));
  scene.add(sea);
  under = new THREE.Mesh(new THREE.BoxGeometry(58, 1, 0.4), new THREE.MeshLambertMaterial({ color: "#2a9fd6", transparent: true, opacity: 0.6 }));
  scene.add(under);
  road = box(58, 0.12, 6, mat("#5d6168")); road.position.set(-21, 0.06, 4); scene.add(road);
  for (let k = 0; k < 10; k++) { const l = box(2.5, 0.02, 0.25, mat("#ffd23f")); l.position.set(-46 + k * 5.5, 0.07, 0); road.add(l); l.position.set(-25 + k * 5.5, 0.07, 0); }
  const deco = ["#f7c6a3", "#9ad1d4", "#f4a6c8", "#fff1b8", "#c3b5f0", "#a8e6b8"];
  for (let k = 0; k < 16; k++) {
    const h = 6 + rnd() * 16, w = 5 + rnd() * 3, x = -46 + k * 3.4 + rnd() * 1.5, z = -6 - (k % 2) * 9 - rnd() * 4;
    const tex = c.stripes(deco[k % deco.length], "#ffffff88", 3); tex.repeat.set(1, Math.round(h / 3));
    const b = box(w, h, 6, new THREE.MeshLambertMaterial({ map: tex, flatShading: true })); b.position.set(x, h / 2, z); scene.add(b);
    const cap = box(w * 0.6, 1.2, 4, mat("#ffffff")); cap.position.set(x, h + 0.6, z); scene.add(cap);
  }
  for (let k = 0; k < 9; k++) c.palm(-44 + k * 6, 8.5, 0.9);
  for (let k = 0; k < 6; k++) c.palm(5.5, -30 + k * 8, 0.8);
  c.sky(12, 75, 400);
  for (const [x, z, s] of [[-30, 3, 2.2], [-20, 5, 3], [-9, 4, 2.6], [-1, 4.6, 2]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(s, 14), new THREE.MeshLambertMaterial({ color: "#2a9fd6", transparent: true, opacity: 0.85 }));
    p.rotation.x = -Math.PI / 2; p.position.set(x, 0.16, z); p.userData.s = s; scene.add(p); puddles.push(p);
  }
  wall = box(1, 1, 76, mat("#9aa3ad")); wall.position.set(9.6, 0, FACE - 38); scene.add(wall);
  for (const x of [-16, 1]) {
    const g = new THREE.Group(); g.position.set(x, 0, 9.5); scene.add(g);
    const b = box(3, 2.4, 2.4, mat("#3b82f6")); b.position.y = 1.2; g.add(b);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 10.5 - x, 8), mat("#8a929c")); pipe.rotation.z = Math.PI / 2; pipe.position.set((10.5 - x) / 2, 2, 0); g.add(pipe);
    pumps.push(g);
  }
  for (let k = 0; k < 6; k++) { const a = c.arrow("#2b7bd6", 2.2, 0.2); a.rotation.z = Math.PI / 2; ups.push(a); }
  walker = c.person(-8, 6.5, 0.4, "#e3262e");
}

export function frame(c, t, i, k, TL) {
  const { ease, pill, lerp, proj } = c, S = (n) => TL.lines[Math.min(n, TL.lines.length - 1)].start;
  let sy = BASE, uy = -7.6, pud = 0, wh = 0, raise = 0;
  if (i === 3) { sy = lerp(BASE, 0.15, ease(k * 2)); pud = ease((k - 0.25) * 3); }
  if (i === 4) { sy = lerp(0.15, -0.5, ease(k * 2)); wh = ease(k * 2) * 2.6; pud = 1 - ease(k * 3) * 0.6; uy = lerp(-7.6, -4, ease(k)); }
  if (i === 5) { sy = -0.5; wh = 2.6; uy = lerp(-4, 0.05, ease(k * 1.4)); pud = ease((k - 0.45) * 3); }
  if (i >= 6) { sy = i === 6 ? -0.6 : BASE; wh = 2.6; uy = i === 6 ? lerp(0.05, -5, ease(k * 1.5)) : -7.6; pud = i === 6 ? 1 - ease((k - 0.2) * 2.5) : 0; raise = i === 6 ? ease((k - 0.35) * 3) * 0.9 : 0.9; }
  sy += Math.sin(t * 1.3) * 0.08;
  sea.scale.y = sy + 8; sea.position.set(140, (sy - 8) / 2, FACE - 133);
  under.scale.y = uy + 8; under.position.set(-21, (uy - 8) / 2, FACE + 0.25);
  wall.scale.y = Math.max(0.01, wh); wall.position.y = wh / 2;
  road.position.y = 0.06 + raise;
  puddles.forEach((p) => { p.scale.setScalar(Math.max(0.01, pud)); p.position.y = 0.16 + raise; });
  pumps.forEach((p) => { p.visible = i >= 6; p.scale.setScalar(i === 6 ? ease(k * 4) : 1); });
  ups.forEach((a, n) => { a.userData.m.opacity = i === 5 ? ease(k * 3) * 0.95 : 0; a.position.set(-40 + n * 7, -6 + ((t * 2 + n * 0.9) % 5), FACE + 1); });
  walker.position.y = 0.3 + raise;

  let html = "", svg = "";
  if (i === 0) html += pill("REAL MIAMI", new THREE.Vector3(-15, 26, -8), ease((k - 0.2) * 4), "g");
  if (i === 1) html += pill("THE PROBLEM?", new THREE.Vector3(-6, 8, 4), ease((k - 0.3) * 4));
  if (i === 2) {
    const a = proj(new THREE.Vector3(9.9, BASE, FACE)), b = proj(new THREE.Vector3(9.9, 0, FACE)), o = ease((k - 0.15) * 4);
    svg += `<g opacity="${o}" stroke="#fff" stroke-width="3"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>` +
      `<line x1="${a[0] - 10}" y1="${a[1]}" x2="${a[0] + 10}" y2="${a[1]}"/><line x1="${b[0] - 10}" y1="${b[1]}" x2="${b[0] + 10}" y2="${b[1]}"/></g>`;
    html += pill("~6 FT (1.8 M)", new THREE.Vector3(11.5, -0.9, FACE), o, "g");
    html += pill("SEA LEVEL", new THREE.Vector3(16, BASE + 0.4, FACE), o, "b");
  }
  if (i === 3) { html += pill("KING TIDE", new THREE.Vector3(14, 2, 6), ease((k - 0.1) * 4), "b"); html += pill("FLOODED STREETS ☀️", new THREE.Vector3(-14, 3.5, 4), ease((k - 0.45) * 4)); }
  if (i === 4) { html += pill("SEA WALL", new THREE.Vector3(9.6, 4, 10), ease((k - 0.2) * 4)); html += pill("LIMESTONE = SPONGE", new THREE.Vector3(2, -5, FACE + 0.5), ease((k - 0.55) * 4), "g"); }
  if (i === 5) html += pill("WATER COMES FROM BELOW", new THREE.Vector3(-4, 2.5, FACE), ease((k - 0.2) * 4), "b");
  if (i === 6) {
    html += pill("PUMPS", new THREE.Vector3(1, 4.2, 9.5), ease((k - 0.1) * 4), "b");
    html += pill("RAISED STREETS", new THREE.Vector3(-22, 2.6, 4), ease((k - 0.45) * 4), "g");
  }
  return { html, svg, title: i === 7 ? "VICE CITY<br>STAYS DRY" : "", titleOpacity: ease(k * 4) };
}
