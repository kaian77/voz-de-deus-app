// O furinho da janela do avião ("breather hole"): a janela tem 3 camadas; o furo na do meio iguala a pressão
// entre a cabine e o vão, então só a de fora segura a pressão e a do meio fica de reserva se a de fora trincar;
// o furo também deixa sair a umidade (não embaça). Fontes: fabricantes (GKN/Boeing) e explicações de pilotos.
let THREE, panes = [], wallM, hole, holeRing, air, outerArrows = [], crack, fog, glowMid;
const W = 3, H = 4, R = 1.25, HOLE = [0, -1.35];

export const SHOTS = [
  [[0.3, 0.2, 9], [0.1, -0.8, 4.2], [0, 0, 0.6], [0, -1.2, 0.6]],
  [[0.2, -1.1, 3.4], [0.1, -1.25, 2.4], [0, -1.35, 0.6], [0, -1.35, 0.6]],
  [[2, 1, 11], [9, 3, 7], [0, 0, 1.2], [0, 0, 1.6]],
  [[10, 2.5, 5], [10, 2, 3], [0, 0, 1.6], [0, 0, 1.4]],
  [[7, -0.5, 6.5], [6, -1, 5.5], [0, -1.2, 1.6], [0, -1.2, 1.6]],
  [[9, 2, 6], [9.5, 2.5, 4.5], [0, 0, 1.6], [0, 0, 1.4]],
  [[1.2, -0.4, 8], [0.6, -0.6, 6.5], [0, -0.4, 1.6], [0, -0.6, 1.6]],
  [[3, 1, 13], [0, 0.6, 12], [0, 0, 1.2], [0, 0, 1.2]],
];

function rrect(w, h, r, holes = []) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  holes.forEach((p) => s.holes.push(p));
  return s;
}

export function build(c) {
  THREE = c.THREE;
  const { scene } = c;
  scene.background = new THREE.Color("#6fb6f2"); scene.fog = null;
  scene.traverse((o) => { if (o.isHemisphereLight) o.groundColor.set("#c9dcef"); });
  c.sun.position.set(6, 10, 14);
  // céu lá fora com nuvens (atrás da janela)
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + c.rnd() * 1.4, 0), c.mat("#ffffff")));
    g.children.forEach((m, k) => m.position.set(k * 1.8 - 2.7, c.rnd(), c.rnd()));
    g.position.set(-14 + c.rnd() * 28, -6 + c.rnd() * 12, -30 - c.rnd() * 10); scene.add(g);
  }
  // parede da cabine com a abertura da janela
  const open = new THREE.Path(rrect(W + 0.5, H + 0.5, R + 0.25).getPoints(40));
  const wall = new THREE.Mesh(new THREE.ShapeGeometry(rrect(16, 14, 0.1, [open]), 32), new THREE.MeshStandardMaterial({ color: "#efeae1", roughness: 0.8, transparent: true }));
  wall.position.z = 1.9; scene.add(wall); wallM = wall.material;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 64), new THREE.MeshStandardMaterial({ color: "#d7d1c6", transparent: true }));
  bezel.scale.set((W + 0.5) / 2, (H + 0.5) / 2, 1); bezel.position.z = 1.9; scene.add(bezel); bezel.userData.fade = true;
  // as 3 camadas (de fora para dentro: outer, middle com o furo, inner)
  const glass = (col, op) => new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: op, roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const holePath = new THREE.Path(); holePath.absarc(HOLE[0], HOLE[1], 0.07, 0, Math.PI * 2, true);
  [["#9fd3ff", 0.38, []], ["#bfe3ff", 0.34, [holePath]], ["#e3f3ff", 0.28, []]].forEach(([col, op, hs], n) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(rrect(W - n * 0.15, H - n * 0.15, R, hs), 48), glass(col, op));
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rrect(W - n * 0.15, H - n * 0.15, R).getPoints(60)), new THREE.LineBasicMaterial({ color: "#ffffff" }));
    g.add(m, edge); scene.add(g); panes.push(g); g.userData.m = m;
  });
  hole = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color: "#1d2a3a" }));
  panes[1].add(hole); hole.position.set(HOLE[0], HOLE[1], 0.005);
  holeRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 40), new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0, depthTest: false }));
  holeRing.renderOrder = 9; panes[1].add(holeRing); holeRing.position.set(HOLE[0], HOLE[1], 0.02);
  glowMid = new THREE.Mesh(new THREE.ShapeGeometry(rrect(W + 0.1, H + 0.1, R), 48), new THREE.MeshBasicMaterial({ color: "#2bd67b", transparent: true, opacity: 0, depthWrite: false }));
  panes[1].add(glowMid); glowMid.position.z = -0.01;
  // ar passando pelo furo
  air = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: "#4fa3ff" }), 40);
  scene.add(air);
  for (let i = 0; i < 6; i++) { const a = c.arrow("#e2463b", 0.9, 0.08); outerArrows.push(a); }
  crack = new THREE.Group(); panes[0].add(crack);
  for (const [x, y, l, r] of [[0.3, 0.6, 1.2, 0.6], [0.9, 1.0, 0.8, -0.5], [0.0, 0.2, 0.9, 2.3], [0.5, 1.1, 0.6, 1.4]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(l, 0.025, 0.01), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    b.position.set(x, y, 0.01); b.rotation.z = r; crack.add(b);
  }
  fog = new THREE.InstancedMesh(new THREE.CircleGeometry(0.06, 10), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false }), 260);
  panes[1].add(fog);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 260; i++) {
    const x = (c.rnd() - 0.5) * (W - 0.6), y = (c.rnd() - 0.5) * (H - 0.6), s = 0.5 + c.rnd();
    mtx.makeScale(s, s, 1).setPosition(x, y, -0.02); fog.setMatrixAt(i, mtx);
  }
}

export function frame(c, t, i, k) {
  const { ease, pill, lerp } = c;
  // separa as camadas (vista explodida) a partir da fala 2
  const ex = i < 2 ? 0 : i === 2 ? ease((k - 0.15) / 0.6) : 1;
  const gap = lerp(0.35, 1.6, ex);
  panes.forEach((g, n) => g.position.set(0, 0, n * gap));
  wallM.opacity = 1 - ex; wallM.visible = ex < 0.98;
  c.scene.traverse((o) => { if (o.userData.fade) { o.material.opacity = 1 - ex; o.visible = ex < 0.98; } });
  holeRing.material.opacity = (i === 0 && k > 0.5) || i === 1 || i === 4 ? 0.6 + 0.4 * Math.sin(t * 6) : 0;
  // ar: do vão de dentro, pelo furo, para o vão de fora (fala 4)
  const mtx = new THREE.Matrix4(), on = i === 4 ? 1 : 0;
  for (let n = 0; n < 40; n++) {
    const u = ((t * 0.5 + n / 40) % 1);
    const z = lerp(2 * gap - 0.3, 0.3, u), spread = Math.abs(u - 0.5) * 2;
    const p = new THREE.Vector3(HOLE[0] + Math.sin(n * 7.1) * 0.6 * spread, HOLE[1] + Math.cos(n * 3.3) * 0.5 * spread, z);
    mtx.makeScale(on, on, on).setPosition(p); air.setMatrixAt(n, mtx);
  }
  air.instanceMatrix.needsUpdate = true;
  // pressão empurrando a camada de fora
  const pr = i === 3 ? ease((k - 0.2) * 3) : i === 4 ? 1 : 0;
  outerArrows.forEach((a, n) => {
    const x = ((n % 3) - 1) * 0.9, y = n < 3 ? 0.8 : -0.4;
    a.userData.m.opacity = pr; a.position.set(x, y, 0.55 + 0.1 * Math.sin(t * 5 + n)); a.rotation.y = Math.PI / 2; // aponta para fora (-z)
  });
  crack.visible = i === 5 && k > 0.2;
  crack.scale.setScalar(i === 5 ? ease((k - 0.2) / 0.4) : 0);
  glowMid.material.opacity = i === 5 ? ease((k - 0.45) * 3) * 0.35 : 0;
  fog.material.opacity = i === 6 ? 0.85 * (1 - ease((k - 0.25) / 0.6)) : 0;
  fog.visible = i === 6;

  let html = "";
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  if (i === 1) html += pill("BREATHER HOLE", at(0.9, -0.9, 0.4), ease((k - 0.2) * 4));
  if (i >= 2 && i <= 3) {
    const o = i === 2 ? ease((k - 0.6) * 4) : 1;
    html += pill("OUTER PANE", at(0, H / 2 + 0.35, 0), o, i === 3 ? "" : "b");
    html += pill("MIDDLE PANE", at(0, H / 2 + 0.35, gap), o, "b");
    html += pill("INNER PANE", at(0, H / 2 + 0.35, 2 * gap), o, "b");
  }
  if (i === 3) html += pill("HOLDS THE PRESSURE", at(0, -H / 2 - 0.4, 0), pr);
  if (i === 4) html += pill("AIR PASSES THROUGH", at(0, -2.1, gap * 1.3), ease((k - 0.15) * 4), "b") + pill("ONLY THE OUTER PANE TAKES THE LOAD", at(0, 2.5, 0), ease((k - 0.5) * 4));
  if (i === 5) html += pill("BACKUP", at(0, H / 2 + 0.35, gap), ease((k - 0.45) * 4), "g");
  if (i === 6) html += pill("NO FOG", at(0, H / 2 + 0.35, gap), ease((k - 0.5) * 4), "g");
  return { html, title: i === 7 ? "THE TINY<br>HOLE" : "", titleOpacity: ease(k * 4) };
}
