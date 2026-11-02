// Rota em arco (ortodromia): no mapa plano (equirretangular) a rota Nova York–Tóquio parece curva e longa, mas no
// globo o caminho mais curto entre dois pontos é o arco de círculo máximo, que passa perto do polo (sobre o Alasca).
// O mapa plano estica tudo perto dos polos. Geometria esférica básica; rotas reais NY–Tóquio passam pelo Alasca.
let THREE, globe, geo, uv, routeGC, routeFlat, dots = [], blobs = [], plane;
const R = 8, MW = 36, MH = 18, LON0 = -140;
const NY = [-74.0, 40.7], TK = [139.7, 35.7];

export const SHOTS = [
  [[0, -3, 34], [0, -2, 30], [0, 1, 0], [0, 1, 0]],
  [[4, -1, 28], [-4, -1, 28], [0, 2, 0], [0, 2, 0]],
  [[0, -2, 30], [0, 10, 22], [0, 1, 0], [0, 3, 0]],
  [[0, 2, 32], [0, 0, 30], [0, 1, 0], [0, 1, 0]],
  [[2, 14, 18], [-2, 15, 16], [0, 4, 0], [0, 4, 0]],
  [[-8, 15, 14], [-10, 13, 15], [0, 4, 0], [0, 4, 0]],
  [[0, 0, 31], [0, 1, 29], [0, 1.5, 0], [0, 1.5, 0]],
  [[0, -4, 33], [0, -3, 31], [0, 1, 0], [0, 1, 0]],
];

const rad = (d) => (d * Math.PI) / 180;
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
// ponto na superfície que vira de mapa (m = 0) para globo (m = 1)
function surf(lon, lat, m, lift = 0) { return surfRaw(wrap(lon - LON0), lat, m, lift); }
// lo já relativo ao centro do mapa (-180..180, sem dar a volta: a borda direita não pode virar a esquerda)
function surfRaw(lo, lat, m, lift = 0) {
  const fx = (lo / 360) * MW, fy = (lat / 180) * MH;
  const a = rad(lo), b = rad(lat), r = R + lift;
  const sx = r * Math.cos(b) * Math.sin(a), sy = r * Math.sin(b), sz = r * Math.cos(b) * Math.cos(a);
  return new THREE.Vector3(fx + (sx - fx) * m, fy + (sy - fy) * m, lift + (sz - lift) * m);
}
function slerpLL(p, q, f) { // círculo máximo entre dois pontos (lon, lat)
  const v = ([lo, la]) => new THREE.Vector3(Math.cos(rad(la)) * Math.cos(rad(lo)), Math.cos(rad(la)) * Math.sin(rad(lo)), Math.sin(rad(la)));
  const a = v(p), b = v(q), w = Math.acos(a.dot(b));
  const r = a.clone().multiplyScalar(Math.sin((1 - f) * w)).add(b.clone().multiplyScalar(Math.sin(f * w))).divideScalar(Math.sin(w));
  return [(Math.atan2(r.y, r.x) * 180) / Math.PI, (Math.asin(r.z) * 180) / Math.PI];
}
function mapTex() {
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 512;
  const g = cv.getContext("2d"); const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, "#2e6fb5"); grd.addColorStop(0.5, "#3b8bd6"); grd.addColorStop(1, "#2e6fb5");
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = "rgba(255,255,255,.28)"; g.lineWidth = 2;
  for (let x = 0; x <= 1024; x += 1024 / 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  for (let y = 0; y <= 512; y += 512 / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
  // terras estilizadas (só para dar noção de continente, não é mapa exato)
  const land = (pts) => { g.beginPath(); pts.forEach(([lo, la], n) => { const x = ((wrap(lo - LON0) + 180) / 360) * 1024, y = ((90 - la) / 180) * 512; n ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); };
  g.fillStyle = "#6cbf5a";
  land([[-168, 66], [-140, 70], [-95, 72], [-75, 62], [-55, 52], [-70, 44], [-80, 30], [-97, 26], [-105, 20], [-118, 33], [-125, 48], [-150, 60], [-165, 60]]); // América do Norte
  land([[-80, 10], [-60, 8], [-35, -6], [-40, -22], [-58, -38], [-70, -52], [-75, -40], [-72, -18], [-81, -5]]); // América do Sul
  land([[100, 70], [140, 72], [175, 66], [160, 55], [140, 48], [130, 40], [122, 30], [108, 20], [100, 10], [80, 25], [60, 40], [40, 55], [60, 70]]); // Ásia
  land([[130, 44], [142, 46], [146, 43], [140, 35], [131, 32]]); // Japão
  land([[114, -22], [130, -12], [146, -16], [153, -28], [146, -39], [128, -32], [116, -34]]); // Austrália
  land([[-55, 60], [-30, 70], [-20, 82], [-60, 82], [-72, 76]]); // Groenlândia
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function build(c) {
  THREE = c.THREE;
  const { scene } = c;
  scene.background = new THREE.Color("#0b1530"); scene.fog = null;
  scene.traverse((o) => { if (o.isHemisphereLight) { o.color.set("#ffffff"); o.groundColor.set("#8aa0c8"); o.intensity = 1.6; } });
  c.sun.position.set(10, 20, 40);
  // estrelas
  const sg = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 700; i++) sp.push((c.rnd() - 0.5) * 300, (c.rnd() - 0.5) * 300, -60 - c.rnd() * 80);
  sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 0.35 })));
  geo = new THREE.PlaneGeometry(MW, MH, 120, 60);
  uv = geo.attributes.uv.array.slice();
  globe = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: mapTex(), roughness: 0.9, side: THREE.DoubleSide }));
  scene.add(globe);
  const tube = (col) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: col })); scene.add(m); return m; };
  routeGC = tube("#2bd67b"); routeFlat = tube("#ff4d4d");
  for (const col of ["#ffd23f", "#ffd23f"]) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: col })); scene.add(d); dots.push(d); }
  // "bolinhas" iguais na Terra que o mapa estica perto do polo
  for (const lat of [0, 45, 68]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.85, side: THREE.DoubleSide })); b.userData.lat = lat; scene.add(b); blobs.push(b); }
  plane = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 10), new THREE.MeshBasicMaterial({ color: "#ffffff" })); scene.add(plane);
}

function morphAt(i, k, ease) {
  if (i <= 1) return 0;
  if (i === 2) return ease((k - 0.25) / 0.6);
  if (i === 3) return 1 - ease((k - 0.1) / 0.5);
  if (i === 4 || i === 5) return i === 4 ? ease(k / 0.4) : 1;
  return i === 6 ? 1 - ease(k / 0.4) : 0;
}
function setTube(mesh, pts) {
  mesh.geometry.dispose();
  mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.13, 8, false);
}

export function frame(c, t, i, k) {
  const { ease, pill } = c;
  const m = morphAt(i, k, ease);
  const pos = geo.attributes.position;
  for (let n = 0; n < pos.count; n++) {
    const u = uv[n * 2], v = uv[n * 2 + 1];
    const p = surfRaw((u - 0.5) * 360, (v - 0.5) * 180, m);
    pos.setXYZ(n, p.x, p.y, p.z);
  }
  pos.needsUpdate = true; geo.computeVertexNormals();
  globe.rotation.y = m * (i === 5 ? -0.15 : 0);
  // rotas: verde = círculo máximo (a de verdade), vermelha = "reta" no mapa (mesma latitude, ~não é a mais curta)
  const N = 90, gc = [], fl = [];
  for (let s = 0; s <= N; s++) {
    const f = s / N;
    const [glo, gla] = slerpLL(NY, TK, f);
    gc.push(surf(glo, gla, m, 0.12).applyMatrix4(globe.matrixWorld));
    const flo = NY[0] + (wrap(TK[0] - NY[0])) * f, fla = NY[1] + (TK[1] - NY[1]) * f;
    fl.push(surf(flo, fla, m, 0.1).applyMatrix4(globe.matrixWorld));
  }
  globe.updateMatrixWorld(true);
  const showFlat = i <= 1 || i >= 6 ? 1 : 0;
  setTube(routeGC, gc); setTube(routeFlat, fl);
  routeFlat.visible = showFlat > 0; routeGC.visible = i !== 3;
  dots[0].position.copy(surf(NY[0], NY[1], m, 0.2)); dots[1].position.copy(surf(TK[0], TK[1], m, 0.2));
  // avião andando na rota verde
  const pf = ((t * 0.12) % 1), [plo, pla] = slerpLL(NY, TK, pf), [plo2, pla2] = slerpLL(NY, TK, Math.min(1, pf + 0.01));
  const a = surf(plo, pla, m, 0.45), b = surf(plo2, pla2, m, 0.45);
  plane.position.copy(a); plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  plane.visible = i >= 4 && i <= 6;
  // bolinhas: no globo todas iguais; no mapa esticadas de lado (1/cos da latitude)
  blobs.forEach((bl, n) => {
    const lat = bl.userData.lat, lon = -150 + n * 6;
    bl.visible = i === 2 || i === 3;
    const p = surf(lon, lat, m, 0.08), stretch = 1 / Math.cos(rad(lat));
    bl.position.copy(p);
    const normal = surf(lon, lat, m, 1).sub(surf(lon, lat, m, 0)).normalize();
    bl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.lengthSq() > 0 ? normal : new THREE.Vector3(0, 0, 1));
    bl.scale.set(1 + (stretch - 1) * (1 - m), 1, 1);
  });

  let html = "";
  const v = (x) => x;
  if (i === 0) html += pill("NEW YORK", dots[0].position.clone().add(new THREE.Vector3(0, -1.2, 0)), ease(k * 4)) + pill("TOKYO", dots[1].position.clone().add(new THREE.Vector3(0, -1.2, 0)), ease(k * 4)) + pill("ACTUAL FLIGHT PATH", gc[45].clone().add(new THREE.Vector3(0, 1, 0)), ease((k - 0.4) * 4), "g");
  if (i === 1) html += pill("STRAIGHT LINE?", fl[50].clone().add(new THREE.Vector3(0, -1, 0)), ease((k - 0.1) * 4));
  if (i === 3) {
    html += pill("SAME SIZE ON EARTH", new THREE.Vector3(0, -6, 0), ease((k - 0.05) * 5));
    html += pill("STRETCHED NEAR THE POLE", blobs[2].position.clone().add(new THREE.Vector3(0, 1.8, 0)), ease((k - 0.55) * 4));
  }
  if (i === 4) html += pill("SHORTEST PATH", gc[45].clone().add(new THREE.Vector3(0, 1.2, 0)), ease((k - 0.45) * 4), "g");
  if (i === 5) html += pill("GREAT CIRCLE ROUTE", gc[50].clone().add(new THREE.Vector3(0, 1.4, 0)), ease((k - 0.15) * 4), "g");
  if (i === 6) html += pill("SHORTER", gc[45].clone().add(new THREE.Vector3(0, 1, 0)), ease((k - 0.45) * 4), "g") + pill("LONGER", fl[50].clone().add(new THREE.Vector3(0, -1, 0)), ease((k - 0.45) * 4));
  void v;
  return { html, title: i === 7 ? "THE CURVE IS<br>THE SHORTCUT" : "", titleOpacity: ease(k * 4) };
}
