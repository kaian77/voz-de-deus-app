// Rodas de trem cônicas: o rodeiro é preso no mesmo eixo; na curva o trem desliza para fora, a roda de fora roda
// na parte larga e a de dentro na estreita, e o trem vira sozinho (o friso só é segurança). Explicação clássica
// (Feynman; conicidade da roda ferroviária). Tamanhos e inclinação do cone exagerados para aparecer.
let THREE, set, wheels = [], rings = [], railIn, railOut, cars = [], outArrow;
const R = 30, G = 6, RIN = R - G / 2, ROUT = R + G / 2, RAIL_Y = 0.55;
const BIG = 1.9, SMALL = 1.35, WW = 1.5; // raio da roda nas duas pontas do cone e largura da pista de rolamento

export const SHOTS = [
  [[10, 46, 78], [28, 38, 66], [0, 0, 6], [0, 0, 10]],
  [[15, 8, 43], [11, 7, 41], [0, 2, 30], [0, 2, 30]],
  [[0, 72, 46], [0, 64, 40], [0, 0, 14], [0, 0, 14]],
  [[12, 9, 37], [10, 7.5, 35], [0, 2, 30], [0, 2, 30]],
  [[16, 10, 41], [16, 10, 41.6], [0, 2, 30.3], [0, 2, 30.6]],
  [[9, 5, 39], [9, 5, 36], [0, 2, 31], [0, 2, 30.4]],
  [[0, 70, 44], [0, 60, 50], [0, 0, 14], [0, 0, 18]],
  [[30, 30, 70], [40, 36, 74], [0, 0, 6], [0, 0, 8]],
];

function wheel(c, x, bigToPlus) {
  const { mat } = c;
  const g = new THREE.Group();
  const rT = bigToPlus ? BIG : SMALL, rB = bigToPlus ? SMALL : BIG; // top (+Y) vira +X depois de girar
  const tread = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, WW, 28), mat("#9aa3ad"));
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(BIG + 0.35, BIG + 0.35, 0.25, 28), mat("#7d858f"));
  flange.position.y = (bigToPlus ? 1 : -1) * (WW / 2 + 0.12);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, WW + 0.4, 12), mat("#e2463b"));
  [tread, flange, hub].forEach((m) => { m.castShadow = true; g.add(m); });
  // raios pintados para ver a roda girar
  for (let s = 0; s < 3; s++) { const b = c.box(0.25, WW + 0.02, 2.4, mat("#5b636d")); b.rotation.y = s * Math.PI / 3; g.add(b); }
  g.rotation.order = "ZYX"; g.rotation.z = -Math.PI / 2; g.position.x = x; // giro da roda = rotation.y
  const holder = new THREE.Group(); holder.add(g); holder.userData.spin = g; return holder;
}

export function build(c) {
  THREE = c.THREE;
  const { scene, mat, box, rnd } = c;
  c.ground("#86c75f"); c.sky(12, 70);
  const bed = new THREE.Mesh(new THREE.RingGeometry(RIN - 2.5, ROUT + 2.5, 160), mat("#b9a68a"));
  bed.rotation.x = -Math.PI / 2; bed.position.y = 0.04; bed.receiveShadow = true; scene.add(bed);
  for (let a = 0; a < 140; a++) {
    const t = (a / 140) * Math.PI * 2, s = box(0.9, 0.3, G + 2.2, mat("#7a5a3c"));
    s.position.set(Math.sin(t) * R, 0.2, Math.cos(t) * R); s.rotation.y = t; scene.add(s);
  }
  const rail = (r) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 6, 220), mat("#c8ced6")); m.rotation.x = Math.PI / 2; m.position.y = RAIL_Y; m.castShadow = true; scene.add(m); return m; };
  railIn = rail(RIN); railOut = rail(ROUT);
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() < 0.5 ? 8 + rnd() * 14 : 42 + rnd() * 60;
    c.tree(Math.sin(a) * r, Math.cos(a) * r, 0.8 + rnd() * 0.7);
  }
  // vagões
  const body = c.stripes("#e15554", "#ffffffaa", 3, true);
  for (let n = 0; n < 3; n++) {
    const g = new THREE.Group();
    const car = box(G + 0.6, 4.2, 11, new THREE.MeshLambertMaterial({ map: body, flatShading: true, transparent: true })); car.position.y = 4.4; g.add(car);
    const roof = box(G + 0.9, 0.5, 11.3, mat("#3c3f46", { transparent: true })); roof.position.y = 6.7; g.add(roof);
    for (const z of [-3.6, 3.6]) { const b = box(G, 1.4, 2.6, mat("#2d3138", { transparent: true })); b.position.set(0, 1.6, z); g.add(b); }
    scene.add(g); cars.push(g);
  }
  // rodeiro grande em destaque, no ponto (0, y, R): para fora = +Z
  set = new THREE.Group(); set.position.set(0, 0, R); set.rotation.y = -Math.PI / 2; scene.add(set);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, G + 1, 12), mat("#5b636d")); axle.rotation.z = Math.PI / 2; axle.castShadow = true;
  const inner = wheel(c, -G / 2, true), outer = wheel(c, G / 2, false);
  const spinner = new THREE.Group(); spinner.add(axle, inner, outer); set.add(spinner);
  wheels = [inner, outer]; set.userData.spinner = spinner;
  for (const col of ["#e2463b", "#2bb673"]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 6, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthTest: false }));
    r.rotation.y = Math.PI / 2; r.renderOrder = 9; set.add(r); rings.push(r);
  }
  outArrow = c.arrow("#ffd23f", 2.4, 0.2);
}

// raio da roda no ponto que encosta no trilho, com o rodeiro deslocado `s` para fora
const contact = (s) => {
  const u = Math.min(1, Math.max(0, 0.5 + s / WW)); // 0 = ponta estreita, 1 = larga (relativo ao trilho)
  return { inner: SMALL + (BIG - SMALL) * (1 - u), outer: SMALL + (BIG - SMALL) * u };
};

export function frame(c, t, i, k) {
  const { ease, pill, world } = c;
  // trem rodando na volta (só nas vistas de longe)
  const far = i === 0 || i === 7;
  cars.forEach((g, n) => {
    const a = -0.95 + n * 0.42 + 0.25 * k;
    g.position.set(Math.sin(a) * R, 0, Math.cos(a) * R); g.rotation.y = a;
    g.visible = far;
  });
  set.visible = !far;
  // desliza para fora a partir da fala 4
  const s = i < 4 ? 0 : i === 4 ? 0.55 * ease((k - 0.2) / 0.6) : 0.55;
  const cr = contact(s);
  const roll = Math.atan2(cr.outer - cr.inner, G);
  set.position.set(0, RAIL_Y + 0.22 + (cr.inner + cr.outer) / 2, R + s);
  set.rotation.z = roll; // fora mais alto (rodando na parte larga)
  const spin = -t * 2.2;
  wheels.forEach((w) => (w.userData.spin.rotation.y = spin));
  // anéis no ponto de contato (vermelho = estreito, verde = largo)
  const show = i === 5 ? ease(k * 3) : 0;
  rings[0].position.set(-G / 2 - s, 0, 0); rings[0].scale.setScalar(cr.inner); rings[0].material.opacity = show;
  rings[1].position.set(G / 2 - s, 0, 0); rings[1].scale.setScalar(cr.outer); rings[1].material.opacity = show;
  // trilhos coloridos nas vistas de cima
  const top = i === 2 || i === 6, o = top ? ease((k - 0.1) * 3) : 0;
  railOut.material.color.set(o > 0 ? "#2bb673" : "#c8ced6"); railIn.material.color.set(o > 0 ? "#e2463b" : "#c8ced6");
  railOut.material.emissive?.set(o > 0 ? "#1d7a4d" : "#000000");
  const ao = i === 4 ? ease((k - 0.1) * 4) * (1 - ease((k - 0.85) * 6)) : 0;
  outArrow.userData.m.opacity = ao;
  outArrow.position.set(0, RAIL_Y + 5.2, R + 1.4 + s); outArrow.rotation.y = -Math.PI / 2;

  let html = "";
  set.updateMatrixWorld(true);
  if (i === 1) html += pill("ONE SOLID AXLE", world(set, new THREE.Vector3(0, 1.2, 0)), ease((k - 0.2) * 4));
  if (top) {
    html += pill(i === 2 ? "OUTER RAIL: LONGER" : "OUTER WHEEL: MORE DISTANCE", new THREE.Vector3(0, 1, ROUT + 4), o, "g");
    html += pill(i === 2 ? "INNER RAIL: SHORTER" : "INNER WHEEL: LESS", new THREE.Vector3(0, 1, RIN - 5), o);
  }
  if (i === 3) {
    html += pill("WIDE", world(set, new THREE.Vector3(-G / 2 + WW / 2, BIG + 0.7, 0)), ease((k - 0.25) * 4), "g");
    html += pill("NARROW", world(set, new THREE.Vector3(-G / 2 - WW / 2 - 0.4, -BIG - 0.6, 0)), ease((k - 0.45) * 4));
  }
  if (i === 4) html += pill("SLIDES OUT", outArrow.position.clone().add(new THREE.Vector3(0, 1.3, 0)), ao, "b");
  if (i === 5) {
    html += pill("BIG", world(set, new THREE.Vector3(G / 2 - s, cr.outer + 0.9, 0)), show, "g");
    html += pill("SMALL", world(set, new THREE.Vector3(-G / 2 - s, cr.inner + 0.9, 0)), show);
  }
  return { html, title: i === 7 ? "CONE-SHAPED<br>WHEELS" : "", titleOpacity: ease(k * 4) };
}
