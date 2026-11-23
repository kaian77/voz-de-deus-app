// Guarda-roupa 3D do Cantinho do bebê (three.js, feito por código: abre em qualquer celular sem baixar modelo).
// Em cima: cabideiro à esquerda e 2 prateleiras à direita, atrás de duas portas que giram ~105° nas dobradiças.
// Embaixo: 3 gavetas que deslizam e a sapateira aberta. O que aparece dentro de cada parte são os itens do inventário
// guardados nela (cor de cada peça). Plaquinha com o nome do bebê em cima.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { CompId, Item, Wardrobe } from "./store";

const FINISH: Record<Wardrobe["finish"], { base: string; grain: string; rough: number }> = {
  branco: { base: "#f4f0ea", grain: "rgba(150,130,110,0.10)", rough: 0.55 },
  carvalho: { base: "#c9a57a", grain: "rgba(90,60,30,0.28)", rough: 0.6 },
  nogueira: { base: "#7a5539", grain: "rgba(40,22,10,0.35)", rough: 0.55 },
  rosa: { base: "#ecd0d4", grain: "rgba(140,90,95,0.10)", rough: 0.5 },
  salvia: { base: "#cfdccf", grain: "rgba(80,105,85,0.12)", rough: 0.5 },
};
const COLORS: Record<string, string> = {
  rosa: "#f2b8c6", azul: "#a9cde8", branco: "#f7f5f0", amarelo: "#f6dd8a", verde: "#b9d8b4", lilas: "#cdb8e6", lilás: "#cdb8e6", roxo: "#a98bd0",
  cinza: "#c3c6cb", bege: "#e6d6bf", vermelho: "#e07a7a", preto: "#3a3a3d", laranja: "#f3b47e", marrom: "#9c7458", estampado: "#e8c9a8", listrado: "#cfe0f0",
};
export function colorOf(it: Pick<Item, "color" | "name">) {
  const c = it.color.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const k of Object.keys(COLORS)) if (c.includes(k.normalize("NFD").replace(/[̀-ͯ]/g, ""))) return COLORS[k];
  const pastel = ["#f2c4cf", "#bcd8ee", "#cfe3cf", "#ddd0ef", "#f5e2b8", "#f0d9c4"];
  let h = 0;
  for (const ch of it.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pastel[h % pastel.length];
}

function woodTex(f: (typeof FINISH)[keyof typeof FINISH]) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const x = c.getContext("2d")!;
  x.fillStyle = f.base;
  x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 90; i++) {
    x.strokeStyle = f.grain;
    x.lineWidth = 0.6 + Math.random() * 1.6;
    x.beginPath();
    let px = Math.random() * 256;
    x.moveTo(px, 0);
    for (let y = 0; y <= 512; y += 32) {
      px += (Math.random() - 0.5) * 6;
      x.lineTo(px, y);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function plateTex(name: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = "#fffcf8";
  x.beginPath();
  x.roundRect(4, 4, 504, 120, 56);
  x.fill();
  x.strokeStyle = "#d6b98c";
  x.lineWidth = 6;
  x.stroke();
  x.fillStyle = "#8a6d4a";
  x.font = "italic 600 62px 'Playfair Display', Georgia, serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(name || "Meu bebê", 256, 68, 440);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const W = 1.6, H = 1.86, D = 0.55, T = 0.022; // medidas (m) e espessura da chapa
const LEFT = 1.0; // largura do lado do cabideiro/gavetas
const LOW = 0.72; // altura onde começa a parte de cima
const XL = -W / 2, XM = XL + LEFT, XR = W / 2;

export class Wardrobe3D {
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam: THREE.PerspectiveCamera;
  private ctl: OrbitControls;
  private wood!: THREE.MeshStandardMaterial;
  private inner = new THREE.MeshStandardMaterial({ color: 0xf6f1ea, roughness: 0.8 });
  private metal = new THREE.MeshStandardMaterial({ color: 0xd6b98c, roughness: 0.3, metalness: 0.9 });
  private doors: { g: THREE.Group; open: number; want: number; sign: 1 | -1 }[] = [];
  private drawers: { g: THREE.Group; out: number; want: number; id: CompId; box: THREE.Group }[] = [];
  private hits: { mesh: THREE.Object3D; id: CompId | "door0" | "door1" }[] = [];
  private contents = new Map<CompId, THREE.Group>();
  private plate!: THREE.Mesh;
  private key!: THREE.DirectionalLight;
  private lamp!: THREE.PointLight;
  private raf = 0;
  private clock = new THREE.Clock();
  private alive = true;
  private started = false;
  onSelect: (id: CompId) => void = () => {};

  constructor(private el: HTMLElement, w: Wardrobe, name: string) {
    this.r = new THREE.WebGLRenderer({ antialias: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.r.domElement);
    const pm = new THREE.PMREMGenerator(this.r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.background = new THREE.Color(0xf3e9df);
    this.cam = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
    this.cam.position.set(1.7, 1.55, 3.6);
    this.ctl = new OrbitControls(this.cam, this.r.domElement);
    this.ctl.target.set(0, 0.95, 0);
    this.ctl.enableDamping = true;
    this.ctl.enablePan = false;
    this.ctl.minDistance = 1.3;
    this.ctl.maxDistance = 5.5;
    this.ctl.maxPolarAngle = Math.PI * 0.55;
    this.ctl.minAzimuthAngle = -1.2;
    this.ctl.maxAzimuthAngle = 1.2;
    this.room();
    this.build(w.finish);
    this.setName(name);
    this.setLight(w.light);
    this.bindTap();
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    this.loop();
  }

  // ---------- quarto em volta (chão de madeira, parede com rodapé, tapete, luz)
  private room() {
    const fl = document.createElement("canvas");
    fl.width = fl.height = 512;
    const x = fl.getContext("2d")!;
    for (let i = 0; i < 8; i++) {
      x.fillStyle = ["#d9c2a5", "#d3b998", "#dcc7ab", "#cfb593"][i % 4];
      x.fillRect(0, i * 64, 512, 64);
      x.fillStyle = "rgba(90,60,30,0.18)";
      x.fillRect(0, i * 64, 512, 2);
      x.fillRect(((i * 197) % 400) + 40, i * 64, 2, 64);
    }
    const ft = new THREE.CanvasTexture(fl);
    ft.colorSpace = THREE.SRGBColorSpace;
    ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    ft.repeat.set(3, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.2), new THREE.MeshStandardMaterial({ color: 0xf4e3e4, roughness: 0.95 }));
    wall.position.set(0, 1.6, -D / 2 - 0.06);
    wall.receiveShadow = true;
    this.scene.add(wall);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    skirt.position.set(0, 0.05, -D / 2 - 0.05);
    this.scene.add(skirt);
    // estrelinhas na parede
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 0.045 : 0.1;
      if (i) star.lineTo(Math.cos(a) * rr, -Math.sin(a) * rr);
      else star.moveTo(Math.cos(a) * rr, -Math.sin(a) * rr);
    }
    const sg = new THREE.ShapeGeometry(star);
    for (const [sx, sy, s] of [[-1.35, 2.15, 1], [-1.1, 2.45, 0.6], [1.25, 2.3, 0.8], [1.5, 2.0, 0.5]]) {
      const m = new THREE.Mesh(sg, this.metal);
      m.position.set(sx, sy, -D / 2 - 0.05);
      m.scale.setScalar(s);
      this.scene.add(m);
    }
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.05, 48), new THREE.MeshStandardMaterial({ color: 0xf7efe6, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.004, 0.95);
    rug.receiveShadow = true;
    this.scene.add(rug);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.95, 64), new THREE.MeshStandardMaterial({ color: 0xdde9df, roughness: 1 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.006, 0.95);
    this.scene.add(ring);
    this.scene.add(new THREE.HemisphereLight(0xfff7ef, 0xcdb9a2, 0.9));
    this.key = new THREE.DirectionalLight(0xfff0dc, 1.9);
    this.key.position.set(2.2, 3.2, 2.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    Object.assign(this.key.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -0.5, near: 0.5, far: 8 });
    this.key.shadow.radius = 4;
    this.key.shadow.bias = -0.0006;
    this.scene.add(this.key);
    // luzinha dentro do móvel (acende com a porta aberta)
    this.lamp = new THREE.PointLight(0xfff1d6, 0, 1.6, 1.5);
    this.lamp.position.set(-0.3, 1.7, 0.05);
    this.scene.add(this.lamp);
  }

  private panel(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = this.wood, parent: THREE.Object3D = this.scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // ---------- o móvel
  private body = new THREE.Group();
  private build(finish: Wardrobe["finish"]) {
    const f = FINISH[finish];
    this.wood = new THREE.MeshStandardMaterial({ map: woodTex(f), roughness: f.rough });
    const b = this.body;
    this.scene.add(b);
    const zf = D / 2;
    this.panel(T, H, D, XL + T / 2, H / 2, 0, this.wood, b); // laterais
    this.panel(T, H, D, XR - T / 2, H / 2, 0, this.wood, b);
    this.panel(W, T, D, 0, H - T / 2, 0, this.wood, b); // tampo
    this.panel(W + 0.04, 0.03, D + 0.03, 0, H + 0.015, 0.0, this.wood, b); // moldura do tampo
    this.panel(W, 0.07, D - 0.03, 0, 0.035, -0.015, this.wood, b); // rodapé
    this.panel(W - 2 * T, T, D, 0, 0.07 + T / 2, 0, this.inner, b); // fundo de baixo
    this.panel(W, H, 0.01, 0, H / 2, -zf + 0.005, this.inner, b); // costas
    this.panel(W - 2 * T, T, D, 0, LOW, 0, this.wood, b); // divisão cima/baixo
    this.panel(T, H - LOW - T, D, XM, (H + LOW) / 2, 0, this.inner, b); // divisória de cima
    this.panel(T, LOW - 0.07, D, XM, (LOW + 0.07) / 2, 0, this.wood, b); // divisória de baixo
    // cabideiro (tubo dourado)
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, LEFT - 2 * T, 16).rotateZ(Math.PI / 2), this.metal);
    rod.position.set((XL + XM) / 2, H - 0.12, 0);
    b.add(rod);
    // prateleiras da direita
    this.panel(XR - XM - 2 * T, T, D - 0.03, (XM + XR) / 2, 1.38, -0.015, this.inner, b);
    this.panel(XR - XM - 2 * T, T, D - 0.03, (XM + XR) / 2, 1.05, -0.015, this.inner, b);
    // sapateira (direita de baixo, aberta, prateleira inclinada)
    const sh = this.panel(XR - XM - 2 * T, T, D - 0.06, (XM + XR) / 2, 0.36, -0.01, this.inner, b);
    sh.rotation.x = 0.18;
    // áreas de toque (invisíveis) do cabideiro, prateleiras e sapateira
    const hit = (id: CompId, w: number, h: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), new THREE.MeshBasicMaterial({ visible: false }));
      m.position.set(x, y, zf - 0.08);
      b.add(m);
      this.hits.push({ mesh: m, id });
    };
    hit("cabide", LEFT - 0.06, H - LOW - 0.1, (XL + XM) / 2, (H + LOW) / 2);
    hit("prat1", XR - XM - 0.06, 0.36, (XM + XR) / 2, 1.58);
    hit("prat2", XR - XM - 0.06, 0.3, (XM + XR) / 2, 1.22);
    hit("sapateira", XR - XM - 0.06, LOW - 0.12, (XM + XR) / 2, (LOW + 0.08) / 2);
    // portas: o grupo fica na dobradiça e a porta gira em volta dela
    const door = (x0: number, w: number, sign: 1 | -1, idx: 0 | 1) => {
      const g = new THREE.Group();
      g.position.set(x0, 0, zf);
      const p = this.panel(w - 0.004, H - LOW - 0.02, 0.02, sign * (w / 2), (H + LOW) / 2, 0.01, this.wood, g);
      // moldura em relevo (almofada) e puxador
      this.panel(w - 0.12, H - LOW - 0.16, 0.008, sign * (w / 2), (H + LOW) / 2, 0.024, this.wood, g);
      const pull = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.16, 4, 10), this.metal);
      pull.position.set(sign * (w - 0.05), (H + LOW) / 2 - 0.05, 0.045);
      g.add(pull);
      for (const y of [LOW + 0.12, H - 0.14]) {
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 10), this.metal);
        hinge.position.set(0, y, 0.0);
        g.add(hinge);
      }
      b.add(g);
      this.doors.push({ g, open: 0, want: 0, sign });
      this.hits.push({ mesh: p, id: idx ? "door1" : "door0" });
    };
    door(XL, LEFT, 1, 0);
    door(XR, XR - XM, -1, 1);
    // gavetas: frente + caixa que desliza junto
    const dh = (LOW - 0.1) / 3;
    (["g1", "g2", "g3"] as CompId[]).forEach((id, i) => {
      const y = LOW - 0.015 - dh * (i + 0.5);
      const g = new THREE.Group();
      g.position.set((XL + XM) / 2, 0, 0);
      const front = this.panel(LEFT - 0.01, dh - 0.012, 0.02, 0, y, zf + 0.01, this.wood, g);
      this.panel(LEFT - 0.1, dh - 0.07, 0.006, 0, y, zf + 0.022, this.wood, g);
      const pull = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.12, 4, 10).rotateZ(Math.PI / 2), this.metal);
      pull.position.set(0, y, zf + 0.045);
      g.add(pull);
      const box = new THREE.Group();
      const bw = LEFT - 0.08, bd = D - 0.08, bh = dh - 0.05, by = y - dh / 2 + 0.03;
      this.panel(bw, 0.01, bd, 0, by, zf - bd / 2, this.inner, box);
      this.panel(0.012, bh, bd, -bw / 2, by + bh / 2, zf - bd / 2, this.inner, box);
      this.panel(0.012, bh, bd, bw / 2, by + bh / 2, zf - bd / 2, this.inner, box);
      this.panel(bw, bh, 0.012, 0, by + bh / 2, zf - bd, this.inner, box);
      box.userData = { y: by + 0.005, bw, bd };
      g.add(box);
      b.add(g);
      this.drawers.push({ g, out: 0, want: 0, id, box });
      this.hits.push({ mesh: front, id });
    });
    // plaquinha com o nome em cima
    this.plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), new THREE.MeshStandardMaterial({ roughness: 0.4 }));
    this.plate.position.set(0, H + 0.13, 0.02);
    b.add(this.plate);
    const stand = this.panel(0.66, 0.012, 0.06, 0, H + 0.036, 0.02, this.metal, b);
    stand.castShadow = false;
  }

  setName(name: string) {
    const m = this.plate.material as THREE.MeshStandardMaterial;
    m.map?.dispose();
    m.map = plateTex(name);
    m.needsUpdate = true;
  }
  setFinish(finish: Wardrobe["finish"]) {
    const f = FINISH[finish];
    this.wood.map?.dispose();
    this.wood.map = woodTex(f);
    this.wood.roughness = f.rough;
    this.wood.needsUpdate = true;
  }
  setLight(l: Wardrobe["light"]) {
    this.key.color.set(l === "quente" ? 0xffe8cc : 0xeef4ff);
    this.key.intensity = l === "quente" ? 1.9 : 2.1;
    this.lamp.color.set(l === "quente" ? 0xffe2b8 : 0xf0f6ff);
  }

  // ---------- o que tem dentro (itens do inventário guardados em cada parte)
  setItems(items: Item[]) {
    for (const g of this.contents.values()) g.removeFromParent();
    this.contents.clear();
    const by = (id: CompId) => items.filter((i) => i.loc === id && i.qty > 0);
    const expand = (list: Item[], max: number) => list.flatMap((i) => Array(Math.min(i.qty, 6)).fill(i) as Item[]).slice(0, max);
    // cabideiro: cabides com a roupa
    const cab = new THREE.Group();
    const hang = expand(by("cabide"), 12);
    hang.forEach((it, i) => {
      const x = XL + 0.08 + (i * (LEFT - 0.16)) / Math.max(1, hang.length - 1 || 1);
      cab.add(this.hanger(it, hang.length === 1 ? (XL + XM) / 2 : x));
    });
    this.add("cabide", cab);
    // prateleiras: pilhas de roupa dobrada
    (["prat1", "prat2"] as CompId[]).forEach((id) => {
      const g = new THREE.Group();
      const y0 = id === "prat1" ? 1.38 + T / 2 : 1.05 + T / 2;
      const list = expand(by(id), 10);
      list.forEach((it, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        g.add(this.folded(it, XM + 0.16 + col * 0.26, y0 + 0.02 + row * 0.042, 0.02, 0.22, 0.2));
      });
      this.add(id, g);
    });
    // gavetas: peças dobradas deitadas lado a lado
    for (const d of this.drawers) {
      const g = new THREE.Group();
      const { y, bw } = d.box.userData as { y: number; bw: number };
      const list = expand(by(d.id), 12);
      list.forEach((it, i) => {
        const col = i % 4, row = Math.floor(i / 4) % 2, layer = Math.floor(i / 8);
        g.add(this.folded(it, -bw / 2 + 0.13 + col * ((bw - 0.2) / 3), y + 0.016 + layer * 0.03, D / 2 - 0.13 - row * 0.21, 0.2, 0.18));
      });
      d.box.add(g);
      this.contents.set(d.id, g);
    }
    // sapateira: pares de sapatinho
    const sg = new THREE.Group();
    const shoes = expand(by("sapateira"), 6);
    shoes.forEach((it, i) => {
      const x = XM + 0.14 + (i % 3) * 0.16, y = i < 3 ? 0.4 : 0.11;
      sg.add(this.shoePair(it, x, y, i < 3 ? 0.02 : 0.06));
    });
    this.add("sapateira", sg);
  }
  private add(id: CompId, g: THREE.Group) {
    this.body.add(g);
    this.contents.set(id, g);
  }
  private cloth(it: Item) {
    return new THREE.MeshStandardMaterial({ color: colorOf(it), roughness: 0.95 });
  }
  private folded(it: Item, x: number, y: number, z: number, w: number, d: number) {
    const h = 0.035;
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), this.cloth(it));
    m.castShadow = true;
    g.add(m);
    // dobra arredondada na frente
    const fold = new THREE.Mesh(new THREE.CylinderGeometry(h / 2, h / 2, w, 12).rotateZ(Math.PI / 2), this.cloth(it));
    fold.position.set(0, 0, d / 2);
    g.add(fold);
    g.position.set(x, y + h / 2, z);
    g.rotation.y = (Math.random() - 0.5) * 0.06;
    return g;
  }
  private hanger(it: Item, x: number) {
    const g = new THREE.Group();
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, 6, 16, Math.PI * 1.3), this.metal);
    hook.position.set(0, H - 0.115, 0);
    hook.rotation.y = Math.PI / 2;
    g.add(hook);
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.26, 4, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    bar.position.set(0, H - 0.17, 0);
    bar.rotation.y = Math.PI / 2;
    g.add(bar);
    // roupinha (perfil de body/vestido extrudado fininho), de lado para o cabideiro
    const isDress = /vestid/i.test(it.name), isCoat = /casac|jaquet/i.test(it.name);
    const s = new THREE.Shape();
    const len = isDress ? 0.5 : isCoat ? 0.38 : 0.42;
    s.moveTo(-0.07, 0);
    s.lineTo(-0.15, -0.04);
    s.lineTo(-0.17, -0.12);
    s.lineTo(-0.1, -0.1);
    s.lineTo(isDress ? -0.17 : -0.1, -len);
    s.lineTo(isDress ? 0.17 : 0.1, -len);
    s.lineTo(0.1, -0.1);
    s.lineTo(0.17, -0.12);
    s.lineTo(0.15, -0.04);
    s.lineTo(0.07, 0);
    s.quadraticCurveTo(0, -0.04, -0.07, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3 });
    geo.translate(0, 0, -0.015);
    const m = new THREE.Mesh(geo, this.cloth(it));
    m.castShadow = true;
    m.position.set(0, H - 0.175, 0);
    m.rotation.y = Math.PI / 2;
    g.add(m);
    g.position.x = x;
    return g;
  }
  private shoePair(it: Item, x: number, y: number, z: number) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.06, 4, 10).rotateX(Math.PI / 2), this.cloth(it));
      shoe.scale.set(1, 0.75, 1);
      shoe.position.set(s * 0.028, y + 0.02, z);
      shoe.castShadow = true;
      g.add(shoe);
    }
    g.rotation.x = y > 0.3 ? 0.18 : 0;
    g.position.x = x;
    return g;
  }

  // ---------- abrir e fechar
  open(id: CompId, on = true) {
    const d = this.drawers.find((x) => x.id === id);
    if (d) {
      for (const o of this.drawers) o.want = o === d && on ? 0.36 : 0;
      // de cima e da frente, para ver dentro da gaveta aberta
      this.focus(new THREE.Vector3((XL + XM) / 2, d.box.userData.y as number, 0.45), new THREE.Vector3(0.35, 1.05, 1.15));
      return;
    }
    if (id === "cabide") this.doors[0].want = on ? 1 : 0;
    if (id === "prat1" || id === "prat2") this.doors[1].want = on ? 1 : 0;
    if (id === "cabide") this.focus(new THREE.Vector3(-0.3, 1.3, 0), new THREE.Vector3(0.9, 0.25, 2.1));
    if (id === "prat1" || id === "prat2") this.focus(new THREE.Vector3(0.5, 1.3, 0), new THREE.Vector3(-0.6, 0.25, 1.9));
    if (id === "sapateira") this.focus(new THREE.Vector3(0.5, 0.3, 0.2), new THREE.Vector3(0.2, 0.7, 1.4));
  }
  closeAll() {
    for (const d of this.doors) d.want = 0;
    for (const d of this.drawers) d.want = 0;
    this.focus(new THREE.Vector3(0, 1.0, 0), this.home());
  }
  toggleDoor(i: 0 | 1) {
    this.doors[i].want = this.doors[i].want ? 0 : 1;
  }
  private flyTo: { target: THREE.Vector3; pos: THREE.Vector3 } | null = null;
  /** câmera vai para alvo + deslocamento (celular em pé afasta mais) */
  private focus(target: THREE.Vector3, off: THREE.Vector3) {
    const k = this.cam.aspect < 1 ? 1.35 : 1;
    this.flyTo = { target, pos: target.clone().addScaledVector(off, k) };
  }
  private home() {
    return new THREE.Vector3(1.4, 0.55, 3.4);
  }

  private bindTap() {
    const ray = new THREE.Raycaster(), v = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    const c = this.r.domElement;
    c.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
    c.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      const r = c.getBoundingClientRect();
      v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, this.cam);
      const hits = ray.intersectObjects(this.hits.map((h) => h.mesh), false);
      const h = hits[0] && this.hits.find((x) => x.mesh === hits[0].object);
      if (!h) return;
      if (h.id === "door0" || h.id === "door1") {
        const i = h.id === "door0" ? 0 : 1;
        this.toggleDoor(i);
        if (this.doors[i].want) this.onSelect(i === 0 ? "cabide" : "prat1");
        return;
      }
      const d = this.drawers.find((x) => x.id === h.id);
      if (d && d.want) {
        d.want = 0;
        return;
      }
      this.open(h.id);
      this.onSelect(h.id);
    });
  }

  private resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.r.setSize(w, h);
    this.cam.aspect = w / h;
    // celular em pé: afasta para caber o móvel inteiro
    this.cam.fov = w < h ? 50 : 40;
    this.cam.updateProjectionMatrix();
    if (!this.started) {
      // primeira vista: o móvel inteiro com a plaquinha
      this.started = true;
      this.ctl.target.set(0, 1.0, 0);
      this.cam.position.copy(this.ctl.target).addScaledVector(this.home(), w < h ? 1.45 : 1);
    }
  }
  private loop = () => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const k = 1 - Math.exp(-dt * 6);
    let lit = 0;
    for (const d of this.doors) {
      d.open += (d.want - d.open) * k;
      d.g.rotation.y = -d.sign * d.open * THREE.MathUtils.degToRad(105);
      lit = Math.max(lit, d.open);
    }
    for (const d of this.drawers) {
      // desliza com freio no fim (limite 36 cm)
      d.out += (d.want - d.out) * k;
      d.g.position.z = d.out;
    }
    this.lamp.intensity = lit * 1.2;
    if (this.flyTo) {
      this.ctl.target.lerp(this.flyTo.target, k * 0.8);
      this.cam.position.lerp(this.flyTo.pos, k * 0.7);
      if (this.cam.position.distanceTo(this.flyTo.pos) < 0.01) this.flyTo = null;
    }
    this.ctl.update();
    this.r.render(this.scene, this.cam);
  };
  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ctl.dispose();
    this.r.dispose();
    this.r.domElement.remove();
  }
}

export function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
