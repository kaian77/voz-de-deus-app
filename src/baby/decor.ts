// Decoração do quartinho 3D feita por código, pelo que a IA viu nas fotos do quarto (até 6): nome na parede, papel de
// parede, berço com móbile, poltrona, janela com cortina, quadros, prateleira, nuvens, balões, luminária, cesto, pelúcia,
// planta e trocador. Cada peça é montada com formas simples nas cores da foto; o que não apareceu não entra.
import * as THREE from "three";
import type { DecorKind, Wardrobe } from "./store";

const WZ = -0.325; // parede (um pouco à frente dela)
type Ext = { minX: number; maxX: number; dresserX: number | null; dresserTop: number; hasW: boolean };

const mat = (c: string | number, rough = 0.8, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, ...extra });
function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  p.add(o);
  return o;
}
function cyl(r: number, h: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D, seg = 14) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  p.add(o);
  return o;
}
function ball(r: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  p.add(o);
  return o;
}

/** papel de parede (listras, bolinhas, xadrez) numa textura que repete */
export function wallTexture(w: Wardrobe) {
  if (!w.pattern || w.pattern === "lisa" || w.pattern === "meia" || !w.wall2) return null;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = w.wall || "#f4e3e4";
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = w.wall2;
  if (w.pattern === "listras") x.fillRect(0, 0, 64, 128);
  if (w.pattern === "poa") for (const [px, py] of [[32, 32], [96, 96]]) {
    x.beginPath();
    x.arc(px, py, 11, 0, Math.PI * 2);
    x.fill();
  }
  if (w.pattern === "xadrez") {
    x.globalAlpha = 0.5;
    x.fillRect(0, 0, 64, 128);
    x.fillRect(0, 0, 128, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w.pattern === "listras" ? 48 : 64, w.pattern === "listras" ? 1 : 13);
  return t;
}

/** monta a decoração e devolve até onde a cena vai (para a câmera enquadrar) */
export function buildDecor(scene: THREE.Scene, w: Wardrobe, e: Ext) {
  const g = new THREE.Group();
  scene.add(g);
  const has = new Map<DecorKind, string>((w.decor ?? []).map((d) => [d.kind, d.color]));
  const col = (k: DecorKind, def: string) => has.get(k) || def;
  let lo = e.minX, hi = e.maxX;
  const leftX = e.minX - 0.8, rightX = e.maxX + 0.8;

  // meia parede (boiserie) embaixo
  if (w.pattern === "meia" && w.wall2) {
    box(16, 1.0, 0.012, mat(w.wall2, 0.9), 0, 0.5, WZ + 0.002, g).castShadow = false;
    box(16, 0.03, 0.03, mat(0xffffff, 0.6), 0, 1.0, WZ + 0.01, g);
  }

  // nome na parede (letras recortadas, com sombrinha)
  if (w.wallText) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 256;
    const x = c.getContext("2d")!;
    x.font = "italic 700 170px 'Playfair Display', Georgia, serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillStyle = w.textColor || "#d6b98c";
    x.fillText(w.wallText, 512, 132, 980);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const ww = Math.min(1.9, 0.32 * w.wallText.length + 0.3);
    const y = e.hasW ? 2.45 : 1.62;
    const cx = e.hasW ? (e.minX + e.maxX) / 2 : e.dresserX ?? 0;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(ww, ww / 4), new THREE.MeshBasicMaterial({ map: t, transparent: true, color: 0x000000, opacity: 0.12, depthWrite: false }));
    shadow.position.set(cx + 0.012, y - 0.015, WZ + 0.004);
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(ww, ww / 4), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5, depthWrite: false }));
    txt.position.set(cx, y, WZ + 0.012);
    g.add(shadow, txt);
  }

  // berço encostado na parede, à esquerda (grades, colchão, lençol), com móbile
  if (has.has("berco")) {
    const m = mat(col("berco", "#f7f5f0"), 0.5), cx = leftX - 0.1, L = 1.25, Dp = 0.66, zc = WZ + Dp / 2 + 0.04;
    for (const sx of [-1, 1]) {
      box(0.05, 1.0, Dp, m, cx + (sx * L) / 2, 0.5, zc, g); // cabeceiras
      for (const sz of [-1, 1]) cyl(0.025, 1.0, m, cx + (sx * L) / 2, 0.5, zc + (sz * Dp) / 2, g);
    }
    for (const sz of [-1, 1]) {
      box(L, 0.04, 0.04, m, cx, 0.93, zc + (sz * Dp) / 2, g); // corrimão
      box(L, 0.04, 0.04, m, cx, 0.32, zc + (sz * Dp) / 2, g);
      for (let i = 1; i < 14; i++) cyl(0.009, 0.6, m, cx - L / 2 + (i * L) / 14, 0.62, zc + (sz * Dp) / 2, g, 6);
    }
    box(L - 0.06, 0.12, Dp - 0.06, mat(0xffffff, 0.9), cx, 0.4, zc, g); // colchão
    box(L * 0.45, 0.02, Dp - 0.1, mat(col("berco", "#f7f5f0") === "#ffffff" ? "#f4d8dc" : "#fbe9ec", 1), cx + L * 0.2, 0.47, zc, g); // mantinha
    lo = Math.min(lo, cx - L / 2 - 0.1);
    if (has.has("mobile")) {
      const mc = col("mobile", "#f2c4cf");
      cyl(0.008, 0.9, mat(0xffffff, 0.4), cx + L / 2 - 0.02, 1.35, zc, g, 6);
      const arm = box(0.32, 0.012, 0.012, mat(0xffffff, 0.4), cx + L / 2 - 0.18, 1.8, zc, g);
      arm.castShadow = false;
      const ring = new THREE.Group();
      ring.position.set(cx + L / 2 - 0.34, 1.62, zc);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const lx = Math.cos(a) * 0.14, lz = Math.sin(a) * 0.14;
        cyl(0.002, 0.16, mat(0xdddddd), lx, 0.08, lz, ring, 4);
        const toy = i % 2 ? ball(0.035, mat(mc, 0.9), lx, -0.02, lz, ring) : box(0.06, 0.05, 0.02, mat(i % 4 ? "#f6dd8a" : "#bcd8ee", 0.9), lx, -0.02, lz, ring);
        toy.castShadow = false;
      }
      ring.userData.spin = true;
      g.add(ring);
    }
  }

  // poltrona de amamentação, de frente para o quarto
  if (has.has("poltrona")) {
    const p = new THREE.Group(), m = mat(col("poltrona", "#e6d6bf"), 0.95), wood = mat("#c9a57a", 0.6);
    box(0.7, 0.16, 0.66, m, 0, 0.36, 0, p); // assento
    box(0.7, 0.62, 0.16, m, 0, 0.72, -0.27, p); // encosto
    for (const s of [-1, 1]) box(0.13, 0.38, 0.66, m, s * 0.37, 0.48, 0, p); // braços
    for (const [fx, fz] of [[-0.36, 0.28], [0.36, 0.28], [-0.36, -0.28], [0.36, -0.28]]) cyl(0.02, 0.28, wood, fx, 0.14, fz, p, 8);
    box(0.32, 0.22, 0.08, mat("#ffffff", 0.95), 0.08, 0.6, -0.15, p).rotation.z = 0.15; // almofada
    p.position.set(rightX + 0.05, 0, 0.45);
    p.rotation.y = -0.55;
    g.add(p);
    hi = Math.max(hi, rightX + 0.5);
  }

  // janela com cortina na parede da direita
  if (has.has("janela")) {
    const cx = rightX + 0.05, y = 1.45;
    box(0.86, 1.06, 0.04, mat(0xffffff, 0.5), cx, y, WZ + 0.02, g);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.98), new THREE.MeshBasicMaterial({ color: 0xcfe6f7 }));
    sky.position.set(cx, y, WZ + 0.042);
    g.add(sky);
    box(0.78, 0.02, 0.02, mat(0xffffff, 0.5), cx, y, WZ + 0.05, g);
    box(0.02, 0.98, 0.02, mat(0xffffff, 0.5), cx, y, WZ + 0.05, g);
    cyl(0.012, 1.4, mat("#d6b98c", 0.3, { metalness: 0.8 }), cx, y + 0.66, WZ + 0.1, g).rotation.z = Math.PI / 2;
    const cm = mat(col("janela", "#f7f1e8"), 1, { side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      // cortina com ondas (cilindro achatado e ondulado)
      const geo = new THREE.PlaneGeometry(0.34, 1.55, 16, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 55) * 0.025);
      geo.computeVertexNormals();
      const cur = new THREE.Mesh(geo, cm);
      cur.position.set(cx + s * 0.56, y - 0.1, WZ + 0.1);
      cur.castShadow = true;
      g.add(cur);
    }
    hi = Math.max(hi, cx + 0.75);
  }

  // quadros: em cima da cômoda (ou em cima do berço)
  if (has.has("quadros")) {
    const over = e.dresserX !== null && !(w.wallText && !e.hasW) ? e.dresserX : leftX - 0.1;
    const y = e.dresserX !== null && over === e.dresserX ? e.dresserTop + 0.55 : 1.45;
    const fc = col("quadros", "#ffffff"), pics = ["#f2c4cf", "#bcd8ee", "#f5e2b8"];
    [[-0.32, 0, 0.26, 0.34], [0, 0.06, 0.24, 0.24], [0.3, -0.02, 0.26, 0.32]].forEach(([dx, dy, fw, fh], i) => {
      box(fw, fh, 0.025, mat(fc, 0.5), over + dx, y + dy, WZ + 0.013, g);
      const art = new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.06, fh - 0.06), mat(pics[i], 0.9));
      art.position.set(over + dx, y + dy, WZ + 0.027);
      g.add(art);
      ball(0.035, mat(pics[(i + 1) % 3], 0.9), over + dx, y + dy, WZ + 0.03, g).scale.z = 0.2;
    });
  }

  // prateleira de parede com bichinhos
  if (has.has("prateleira")) {
    const x0 = leftX - 0.1, y = 1.95, m = mat(col("prateleira", "#c9a57a"), 0.6);
    box(0.8, 0.03, 0.18, m, x0, y, WZ + 0.09, g);
    ball(0.05, mat("#f2c4cf", 0.9), x0 - 0.25, y + 0.065, WZ + 0.09, g);
    box(0.08, 0.14, 0.12, mat("#bcd8ee", 0.9), x0 - 0.05, y + 0.085, WZ + 0.09, g);
    box(0.08, 0.1, 0.12, mat("#f5e2b8", 0.9), x0 + 0.05, y + 0.065, WZ + 0.09, g);
    cyl(0.04, 0.1, mat("#cfe3cf", 0.9), x0 + 0.25, y + 0.065, WZ + 0.09, g);
  }

  // nuvens na parede
  if (has.has("nuvens")) {
    const m = mat(col("nuvens", "#ffffff"), 0.9);
    for (const [x, y, s] of [[e.minX - 0.3, 2.35, 1], [e.maxX + 0.25, 2.5, 0.8], [(e.minX + e.maxX) / 2 + 0.9, 2.7, 0.6], [e.minX + 0.4, 2.75, 0.55]]) {
      const c = new THREE.Group();
      for (const [bx, by, r] of [[-0.12, 0, 0.09], [0, 0.05, 0.12], [0.13, 0, 0.09]]) ball(r, m, bx, by, 0, c).scale.z = 0.25;
      c.position.set(x, y, WZ + 0.02);
      c.scale.setScalar(s);
      g.add(c);
    }
  }

  // balões presos no chão, ao lado do móvel
  if (has.has("baloes")) {
    const bc = col("baloes", "#f2c4cf");
    [[0, 1.75, 0], [0.16, 1.9, 0.05], [-0.12, 1.95, -0.06]].forEach(([dx, y, dz], i) => {
      const x = e.maxX + 0.3 + dx, z = 0.25 + dz;
      const b = ball(0.13, mat(i === 1 ? "#ffffff" : bc, 0.35), x, y, z, g);
      b.scale.y = 1.15;
      const pts = [new THREE.Vector3(x, y - 0.15, z), new THREE.Vector3(e.maxX + 0.3, 0.05, 0.25)];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xbbbbbb })));
    });
    box(0.06, 0.05, 0.06, mat("#d6b98c", 0.4, { metalness: 0.6 }), e.maxX + 0.3, 0.025, 0.25, g);
  }

  // luminária pendente no meio do quarto
  if (has.has("luminaria")) {
    const lc = col("luminaria", "#f7f1e8");
    cyl(0.004, 0.7, mat(0x333333), 0, 2.85, 0.9, g, 4);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.2, 24, 1, true), mat(lc, 0.8, { side: THREE.DoubleSide, emissive: new THREE.Color(0xfff1d6), emissiveIntensity: 0.25 }));
    shade.position.set(0, 2.42, 0.9);
    g.add(shade);
    ball(0.05, new THREE.MeshBasicMaterial({ color: 0xfff6e0 }), 0, 2.36, 0.9, g).castShadow = false;
  }

  // cesto de roupa ao lado do móvel
  if (has.has("cesto")) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.32, 24, 1, true), mat(col("cesto", "#e6d6bf"), 1, { side: THREE.DoubleSide }));
    c.position.set(e.minX - (has.has("berco") ? 0.05 : 0.25), 0.16, 0.55);
    c.castShadow = true;
    g.add(c);
    box(0.3, 0.02, 0.3, mat("#ffffff", 1), c.position.x, 0.3, 0.55, g).rotation.y = 0.4;
  }

  // pelúcia: no berço, ou sentada no tapete
  if (has.has("pelucia")) {
    const m = mat(col("pelucia", "#c9a57a"), 1), t = new THREE.Group();
    ball(0.11, m, 0, 0.11, 0, t).scale.set(1, 1.1, 0.85); // corpo
    ball(0.085, m, 0, 0.29, 0.01, t); // cabeça
    for (const s of [-1, 1]) {
      ball(0.035, m, s * 0.07, 0.36, 0, t); // orelhas
      ball(0.04, m, s * 0.1, 0.03, 0.07, t); // pés
      ball(0.035, m, s * 0.11, 0.15, 0.04, t); // braços
    }
    ball(0.03, mat("#f7efe6", 1), 0, 0.27, 0.08, t); // focinho
    for (const s of [-1, 1]) ball(0.012, mat("#222", 0.3), s * 0.03, 0.31, 0.08, t);
    if (has.has("berco")) t.position.set(leftX - 0.4, 0.46, WZ + 0.37);
    else t.position.set(0.55, 0.005, 1.15);
    t.rotation.y = has.has("berco") ? 0.2 : -0.4;
    g.add(t);
  }

  // planta no canto
  if (has.has("planta")) {
    const px = hi + 0.35;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.24, 20), mat(col("planta", "#f7f5f0"), 0.6));
    pot.position.set(px, 0.12, WZ + 0.2);
    pot.castShadow = true;
    g.add(pot);
    const leaf = mat("#6f9a6a", 0.8);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const l = ball(0.09, leaf, px + Math.cos(a) * 0.08, 0.42 + (i % 3) * 0.08, WZ + 0.2 + Math.sin(a) * 0.08, g);
      l.scale.set(0.5, 1.5, 0.25);
      l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
    }
    hi = Math.max(hi, px + 0.2);
  }

  // trocador em cima da cômoda
  if (has.has("trocador") && e.dresserX !== null) {
    const m = mat(col("trocador", "#f4d8dc"), 0.9), y = e.dresserTop + 0.05;
    box(0.62, 0.08, 0.4, m, e.dresserX, y, 0, g);
    for (const s of [-1, 1]) box(0.05, 0.1, 0.4, m, e.dresserX + s * 0.3, y + 0.06, 0, g);
  }

  return { lo, hi, spin: g.children.filter((c) => c.userData.spin) };
}
