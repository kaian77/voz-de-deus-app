// GTA 6 em números (sai em 19/11/2026). 1º trailer (dez/2023): ~93 milhões de views no YouTube em 24 h, recorde de
// vídeo não musical na época; 2º trailer (mai/2025): 475 milhões de views somando as plataformas em 24 h (Rockstar);
// GTA 5: mais de 200 milhões de cópias (Take-Two, relatórios de 2025) e US$ 1 bilhão em 3 dias (Guinness World
// Records, 2013). GTA 5 saiu em set/2013 → 13 anos até o 6. Cena nossa: telão, torres de views, pilhas de jogos e
// moedas, calendário; nada do jogo aparece.
let THREE, phone, t93, t475, crown, cases, coins, cal, calCtx, calTex, lastYear = 0, fan;
const H93 = 7.5, H475 = 38;

export const SHOTS = [
  [[0, 9, 30], [0, 10, 24], [0, 9, -14], [0, 9.5, -14]],
  [[-2, 6, 22], [-4, 7, 18], [-7, 4, 0], [-7, 5, 0]],
  [[-17, 14, 24], [-15, 15, 21], [-7, 8, 0], [-7, 9, 0]],
  [[16, 8, 34], [18, 12, 46], [5, 8, 0], [5, 22, 0]],
  [[-30, 9, 18], [-27, 8, 15], [-18, 2.5, -8], [-18, 3, -8]],
  [[-28, 8, 26], [-25, 7, 23], [-18, 2, 8], [-18, 2.5, 8]],
  [[29, 7, 28], [27, 7, 25], [16, 5, 6], [16, 5, 6]],
  [[0, 16, 50], [0, 26, 70], [0, 10, 0], [0, 12, 0]],
];

function canvasTex(w, h, draw) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d"); draw(g, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return [t, g];
}

function tower(c, x, color) {
  const g = new THREE.Group(); g.position.set(x, 0, 0); c.scene.add(g);
  const tex = c.stripes(color, "#ffffff66", 4); tex.repeat.set(1, 1);
  const m = c.box(6, 1, 6, new THREE.MeshLambertMaterial({ map: tex, flatShading: true })); m.position.y = 0.5; g.add(m);
  const top = c.box(6.6, 0.5, 6.6, c.mat("#1d2433")); top.position.y = 1.25; g.add(top);
  g.userData = { m, top, tex }; return g;
}
function setH(tw, h) {
  const { m, top, tex } = tw.userData; h = Math.max(0.01, h);
  m.scale.y = h; m.position.y = h / 2; top.position.y = h + 0.25; tex.repeat.set(1, Math.max(1, Math.round(h / 2)));
}

export function build(c) {
  THREE = c.THREE;
  const { scene, mat, box, rnd } = c;
  c.ground("#7cc35a");
  const plaza = box(70, 0.2, 50, mat("#d9d4c8")); plaza.position.set(0, 0.1, 0); scene.add(plaza);
  c.city(40, 50, 130);
  for (let k = 0; k < 14; k++) c.palm(-34 + rnd() * 68, -24 - rnd() * 6, 0.9 + rnd() * 0.4);
  c.sky();
  // telão em forma de celular com o "play"
  phone = new THREE.Group(); phone.position.set(0, 0, -14); scene.add(phone);
  const bodyP = box(11, 20, 1, mat("#1d1d1d")); bodyP.position.y = 10.5; phone.add(bodyP);
  const [scr] = canvasTex(256, 460, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#ff7a59"); gr.addColorStop(0.5, "#e3262e"); gr.addColorStop(1, "#7b2ff7");
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#ffffffee"; g.beginPath(); g.arc(w / 2, h / 2, 54, 0, 7); g.fill();
    g.fillStyle = "#e3262e"; g.beginPath(); g.moveTo(w / 2 - 18, h / 2 - 30); g.lineTo(w / 2 + 32, h / 2); g.lineTo(w / 2 - 18, h / 2 + 30); g.fill();
    g.fillStyle = "#fff"; g.font = "bold 34px sans-serif"; g.textAlign = "center"; g.fillText("TRAILER 1", w / 2, h - 60);
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 17.6), new THREE.MeshBasicMaterial({ map: scr })); screen.position.set(0, 10.5, 0.52); phone.add(screen);
  t93 = tower(c, -7, "#f2c14e"); t475 = tower(c, 5, "#e15554");
  crown = new THREE.Group(); scene.add(crown);
  const gold = new THREE.MeshStandardMaterial({ color: "#ffc72c", metalness: 0.7, roughness: 0.3, flatShading: true });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.4, 1, 10, 1, true), gold); crown.add(ring);
  for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 4), gold); const a = k / 5 * 6.28; sp.position.set(Math.cos(a) * 1.4, 1.1, Math.sin(a) * 1.4); crown.add(sp); }
  // pilha de jogos (caixinhas genéricas)
  const N = 220, m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  cases = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.8, 0.25), mat("#2f6fd6"), N); cases.castShadow = true;
  for (let k = 0; k < N; k++) {
    const lay = Math.floor(Math.sqrt(k / 2.2)), a = rnd() * 6.28, r = Math.max(0, 5.5 - lay * 0.9) * Math.sqrt(rnd());
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.8, rnd() * 6.28, Math.PI / 2 + (rnd() - 0.5) * 0.5));
    m4.compose(new THREE.Vector3(-18 + Math.cos(a) * r, 0.3 + lay * 0.45, -8 + Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1)); cases.setMatrixAt(k, m4);
  }
  cases.count = 0; cases.frustumCulled = false; scene.add(cases);
  coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 0.7, 0.18, 12), gold, N); coins.castShadow = true;
  for (let k = 0; k < N; k++) {
    const lay = Math.floor(Math.sqrt(k / 2.4)), a = rnd() * 6.28, r = Math.max(0, 5 - lay * 0.8) * Math.sqrt(rnd());
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6));
    m4.compose(new THREE.Vector3(-18 + Math.cos(a) * r, 0.3 + lay * 0.28, 8 + Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1)); coins.setMatrixAt(k, m4);
  }
  coins.count = 0; coins.frustumCulled = false; scene.add(coins);
  // calendário
  cal = new THREE.Group(); cal.position.set(16, 0, 6); cal.rotation.y = -0.5; scene.add(cal);
  const stand = box(0.5, 3, 0.5, mat("#8a929c")); stand.position.y = 1.5; cal.add(stand);
  const [ct, cg] = canvasTex(256, 256, () => {}); calTex = ct; calCtx = cg;
  const board = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 0.4), [mat("#fff"), mat("#fff"), mat("#fff"), mat("#fff"), new THREE.MeshBasicMaterial({ map: calTex }), mat("#fff")]);
  board.position.y = 6.5; board.castShadow = true; cal.add(board);
  fan = c.person(0, 7, Math.PI, "#e3262e");
}

function drawYear(y) {
  if (y === lastYear) return; lastYear = y;
  const g = calCtx; g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 256); g.fillStyle = "#e3262e"; g.fillRect(0, 0, 256, 70);
  g.fillStyle = "#fff"; g.font = "bold 40px sans-serif"; g.textAlign = "center"; g.fillText(y === 2026 ? "NOV 19" : "YEAR", 128, 50);
  g.fillStyle = "#1d2433"; g.font = "bold 92px sans-serif"; g.fillText(String(y), 128, 190); calTex.needsUpdate = true;
}

export function frame(c, t, i, k, TL) {
  const { ease, pill, world } = c, S = (n) => TL.lines[Math.min(n, TL.lines.length - 1)].start;
  const g1 = i < 1 ? 0 : ease((t - S(1)) / 2.5), g2 = i < 3 ? 0 : ease((t - S(3)) / 3.5);
  setH(t93, g1 * H93); setH(t475, g2 * H475);
  crown.visible = i >= 2; crown.position.set(-7, H93 + 1.6 + Math.sin(t * 2) * 0.2, 0); crown.rotation.y = t * 0.8;
  crown.scale.setScalar(i === 2 ? ease(k * 4) : 1);
  cases.count = i < 4 ? 0 : Math.floor(220 * ease((t - S(4)) / 2.5));
  coins.count = i < 5 ? 0 : Math.floor(220 * ease((t - S(5)) / 2.5));
  drawYear(i < 6 ? 2013 : Math.round(c.lerp(2013, 2026, ease((t - S(6) - 0.3) / 2.2))));
  fan.rotation.y = Math.PI + (i === 3 ? 0.3 : 0);

  let html = "";
  if (i === 0) html += pill("NOT EVEN OUT YET", new THREE.Vector3(0, 21.5, -13.5), ease((k - 0.25) * 4));
  if (i >= 1 && i <= 3) html += pill("93M VIEWS · 24H", new THREE.Vector3(-7, g1 * H93 + (i >= 2 ? 3.8 : 1.6), 3), ease((t - S(1) - 0.6) * 3), "g");
  if (i === 2) html += pill("#1 NON-MUSIC VIDEO (2023)", new THREE.Vector3(-7, H93 + 5.6, 3), ease((k - 0.25) * 4));
  if (i === 3) html += pill("475M VIEWS · 1 DAY", new THREE.Vector3(5, g2 * H475 + 2, 3), ease((k - 0.15) * 4));
  if (i === 4) html += pill("GTA 5: 200M+ COPIES", new THREE.Vector3(-18, 6.5, -8), ease((k - 0.3) * 4), "b");
  if (i === 5) {
    html += pill("$1 BILLION", new THREE.Vector3(-18, 5.2, 8), ease((k - 0.25) * 4), "g");
    html += pill("IN 3 DAYS", new THREE.Vector3(-18, 3.6, 8), ease((k - 0.5) * 4));
  }
  if (i === 6) html += pill("13 YEARS", world(cal, new THREE.Vector3(0, 10.3, 0)), ease((k - 0.5) * 4), "g");
  return { html, title: i === 7 ? "NOV 19<br>DAY ONE?" : "", titleOpacity: ease(k * 4) };
}
