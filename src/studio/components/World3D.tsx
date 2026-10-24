// "Mundo da Brax" em 3D na Visão geral: a loja, o pin gigante, o armazém com as caixas para enviar,
// as vans de entrega (uma por pedido de hoje, até 3), o quiosque do Instagram com balões de conversa
// e a barraca do Mercado Livre. Tocar num prédio abre um cartão com os números e o atalho; a loja dá
// para "entrar": parede com os pins de verdade da Nuvemshop, balcão com as vendas do dia, TV com o
// próximo post e celular com as conversas. Dia/noite pelo horário de Brasília. three.js feito à mão.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type WorldStats = {
  ordersToday: number; revenueToday: number; toShip: number; waiting: number; scheduled: number; pending: number;
  nextPost?: { title: string; at: string } | null;
  products?: { name: string; image: string | null; url?: string }[];
};

/** Para onde cada parte do mundo leva ao clicar. */
export const WORLD_LINKS = {
  loja: "/studio/pedidos",
  armazem: "/studio/pedidos",
  pin: "/studio/aprovacoes",
  instagram: "/studio/mensagens",
  ml: "/studio/contas",
} as const;

const RED = 0xe3262e, BLACK = 0x161616, GOLD = 0xffc72c, WHITE = 0xf5f2ea;

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true, ...extra });

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Placa com texto (canvas → textura). */
function sign(text: string, bg: string, fg: string, w = 2.4, h = 0.6, font = "bold 84px Anton, Impact, sans-serif") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = Math.round(512 * (h / w));
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + 4, c.width - 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

/** Etiqueta que sempre olha para a câmera (nome + número). */
function label(text: string, color = "#111") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.beginPath();
  g.roundRect(8, 8, 496, 112, 56);
  g.fill();
  g.fillStyle = color;
  g.font = "600 56px Inter, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 66, 470);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(3.2, 0.8, 1);
  s.renderOrder = 10;
  return s;
}

function shop() {
  const g = new THREE.Group();
  g.add(box(3, 1.8, 2.2, RED));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1, 4), mat(BLACK));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.75);
  roof.position.y = 2.3;
  roof.castShadow = true;
  g.add(roof);
  g.add(box(0.7, 1.1, 0.05, BLACK, 0, 0, 1.11)); // porta
  g.add(box(0.8, 0.6, 0.05, 0x8fd3ff, -1, 0.7, 1.11), box(0.8, 0.6, 0.05, 0x8fd3ff, 1, 0.7, 1.11)); // vitrines
  const s = sign("BRAX PINS", "#111111", "#FFC72C");
  s.position.set(0, 1.55, 1.13);
  g.add(s);
  return g;
}

/** Pin gigante girando em cima de um pedestal. */
function bigPin() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.6, 0.5, BLACK));
  const pin = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 40), mat(GOLD, { metalness: 0.6, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.18, 40), mat(RED));
  face.rotation.x = Math.PI / 2;
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), mat(WHITE));
  drop.scale.set(1, 1.25, 0.5);
  drop.position.z = 0.1;
  pin.add(rim, face, drop);
  pin.position.y = 1.45;
  pin.castShadow = true;
  g.add(pin);
  return { group: g, pin };
}

function warehouse(boxes: number) {
  const g = new THREE.Group();
  g.add(box(3, 1.6, 2.4, 0x9aa1a8));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 3, 16, 1, false, 0, Math.PI), mat(0x6b7178));
  roof.rotation.z = Math.PI / 2;
  roof.position.y = 1.6;
  roof.castShadow = true;
  g.add(roof);
  g.add(box(1.4, 1.1, 0.05, 0x3a3f45, 0, 0, 1.21)); // portão
  const s = sign("ARMAZÉM", "#ffffff", "#111111", 1.6, 0.36, "bold 90px Inter, system-ui, sans-serif");
  s.position.set(0, 1.35, 1.22);
  g.add(s);
  // Caixas para enviar empilhadas na frente
  for (let i = 0; i < Math.min(boxes, 12); i++) {
    const col = i % 4, row = Math.floor(i / 4) % 2, lay = Math.floor(i / 8);
    g.add(box(0.36, 0.3, 0.36, 0xc8955a, -1.2 + col * 0.42 + (col > 1 ? 1.2 : 0), lay * 0.3, 1.55 + row * 0.42));
  }
  return g;
}

function van(color = WHITE) {
  const g = new THREE.Group();
  g.add(box(1.1, 0.55, 0.6, color, 0, 0.12, 0));
  g.add(box(0.4, 0.42, 0.56, color, 0.72, 0.12, 0));
  g.add(box(0.05, 0.25, 0.5, 0x8fd3ff, 0.93, 0.32, 0)); // para-brisa
  g.add(box(1.12, 0.12, 0.62, RED, 0, 0.42, 0)); // faixa da marca
  for (const [x, z] of [[-0.35, 0.3], [0.55, 0.3], [-0.35, -0.3], [0.55, -0.3]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 14), mat(BLACK));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.14, z);
    g.add(w);
  }
  return g;
}

function instaKiosk(bubbles: number) {
  const g = new THREE.Group();
  g.add(box(1.4, 1.3, 1.4, 0xd62976));
  g.add(box(1.5, 0.12, 1.5, 0x962fbf, 0, 1.3, 0));
  const lens = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 10, 30), mat(WHITE));
  lens.position.set(0, 0.7, 0.71);
  g.add(lens);
  const items: THREE.Mesh[] = [];
  for (let i = 0; i < Math.min(bubbles, 6); i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), mat(i % 2 ? GOLD : WHITE));
    b.scale.set(1.4, 1, 0.6);
    b.position.set(-0.5 + (i % 3) * 0.5, 1.8 + Math.floor(i / 3) * 0.45, 0);
    g.add(b);
    items.push(b);
  }
  return { group: g, bubbles: items };
}

function mlStall() {
  const g = new THREE.Group();
  g.add(box(1.4, 0.7, 0.9, 0xffe600));
  for (const x of [-0.65, 0.65]) g.add(box(0.08, 1.4, 0.08, 0x2d3277, x, 0, -0.4), box(0.08, 1.4, 0.08, 0x2d3277, x, 0, 0.4));
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.6, 4), mat(0x2d3277));
  tent.rotation.y = Math.PI / 4;
  tent.position.y = 1.7;
  g.add(tent);
  return g;
}

function tree(x: number, z: number, s = 1) {
  const g = new THREE.Group();
  g.add(box(0.15 * s, 0.5 * s, 0.15 * s, 0x7a5230));
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.45 * s, 1 * s, 7), mat(0x3f8f4a));
  top.position.y = 0.95 * s;
  top.castShadow = true;
  g.add(top);
  g.position.set(x, 0, z);
  return g;
}


const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Tela (TV, caixa, celular) com linhas de texto desenhadas num canvas. */
function screen(lines: { text: string; size: number; color: string }[], w: number, h: number, bg = "#0f1115") {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = Math.round(768 * (h / w));
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  let y = c.height * 0.2;
  for (const l of lines) {
    g.fillStyle = l.color;
    g.font = `700 ${l.size}px Inter, system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillText(l.text, c.width / 2, y, c.width - 50);
    y += l.size * 1.35;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

/** Pin de verdade: disco com a foto do produto e borda dourada (a foto vem da Nuvemshop; sem foto, vermelho). */
function productPin(image: string | null, loader: THREE.TextureLoader) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 32), mat(GOLD, { metalness: 0.7, roughness: 0.25 }));
  rim.rotation.x = Math.PI / 2;
  const faceMat = new THREE.MeshStandardMaterial({ color: image ? 0xffffff : RED, roughness: 0.5 });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.26, 32), faceMat);
  face.position.z = 0.035;
  if (image) {
    loader.load(image, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      faceMat.map = t;
      faceMat.needsUpdate = true;
    }, undefined, () => faceMat.color.set(RED));
  }
  g.add(rim, face);
  return g;
}

/** Interior da loja: piso de madeira, paredes da marca, parede de pins, balcão com caixa, TV e celular. */
function interior(stats: WorldStats, link: (o: THREE.Object3D, to: string, info: Info) => void) {
  const g = new THREE.Group();
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 8), mat(0xb7874f));
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  g.add(floor);
  for (let i = -4; i <= 4; i++) g.add(box(0.03, 0.01, 8, 0x9c7040, i * 1.1, 0, 0));
  g.add(box(10, 4, 0.2, WHITE, 0, 0, -4)); // fundo
  g.add(box(0.2, 4, 8, RED, -5, 0, 0)); // esquerda
  g.add(box(0.2, 4, 8, RED, 5, 0, 0)); // direita
  g.add(box(10, 0.35, 0.22, BLACK, 0, 3.65, -3.9)); // faixa preta no alto
  const logo = sign("BRAX PINS MANIA", "#111111", "#FFC72C", 4, 0.5);
  logo.position.set(0, 3.82, -3.78);
  g.add(logo);

  // Parede de pins (produtos de verdade)
  const board = box(5.6, 2.4, 0.12, BLACK, -1.2, 0.9, -3.84);
  g.add(board);
  const items = (stats.products ?? []).slice(0, 15);
  const pins = new THREE.Group();
  (items.length ? items : Array.from({ length: 10 }, () => ({ name: "Pin", image: null as string | null }))).forEach((p, i) => {
    const pin = productPin(p.image, loader);
    pin.position.set(-3.6 + (i % 5) * 1.2, 2.85 - Math.floor(i / 5) * 0.75, -3.72);
    link(pin, "/studio/produtos", { title: p.name, lines: ["Toque em Abrir para ver os produtos"], to: "/studio/produtos", action: "Abrir produtos" });
    pins.add(pin);
  });
  g.add(pins);

  // Balcão com o caixa (vendas do dia)
  const counter = new THREE.Group();
  counter.add(box(3.2, 1.05, 1, 0x3b2a1e), box(3.3, 0.08, 1.1, 0xe9e2d4, 0, 1.05, 0), box(3.2, 0.25, 0.04, RED, 0, 0.6, 0.51));
  const register = new THREE.Group();
  register.add(box(0.8, 0.35, 0.55, 0x2b2f36));
  const reg = screen([
    { text: brl(stats.revenueToday), size: 110, color: "#FFC72C" },
    { text: `${stats.ordersToday} ${stats.ordersToday === 1 ? "pedido" : "pedidos"} hoje`, size: 64, color: "#ffffff" },
  ], 0.75, 0.42);
  reg.position.set(0, 0.62, 0.05);
  reg.rotation.x = -0.35;
  register.add(reg);
  register.position.set(0.7, 1.13, 0);
  counter.add(register);
  counter.position.set(2.2, 0, 0.6);
  g.add(counter);
  link(counter, "/studio/pedidos", { title: "Caixa", lines: [`${brl(stats.revenueToday)} hoje`, `${stats.ordersToday} pedidos hoje`], to: "/studio/pedidos", action: "Ver pedidos" });

  // Caixas para enviar ao lado do balcão
  const parcels = new THREE.Group();
  for (let i = 0; i < Math.min(stats.toShip, 9); i++) parcels.add(box(0.5, 0.4, 0.5, 0xc8955a, (i % 3) * 0.55, Math.floor(i / 3) * 0.4, 0));
  parcels.position.set(3.4, 0, -2.6);
  g.add(parcels);
  link(parcels, "/studio/pedidos", { title: "Para enviar", lines: [`${stats.toShip} ${stats.toShip === 1 ? "pedido esperando" : "pedidos esperando"} envio`], to: "/studio/pedidos", action: "Ver pedidos" });

  // Celular no balcão com as conversas
  const phone = new THREE.Group();
  phone.add(box(0.36, 0.04, 0.7, 0x111111));
  const ph = screen([
    { text: String(stats.waiting), size: 220, color: stats.waiting ? "#ff4fa3" : "#9aa0a6" },
    { text: stats.waiting === 1 ? "conversa" : "conversas", size: 70, color: "#ffffff" },
    { text: "esperando você", size: 70, color: "#ffffff" },
  ], 0.32, 0.64);
  ph.rotation.x = -Math.PI / 2;
  ph.position.y = 0.025;
  phone.add(ph);
  phone.position.set(1.3, 1.1, 0.7);
  phone.rotation.y = 0.3;
  g.add(phone);
  link(phone, "/studio/mensagens", { title: "Mensagens", lines: [`${stats.waiting} esperando resposta sua`], to: "/studio/mensagens", action: "Abrir mensagens" });

  // TV na parede: próximo post e aprovações
  const tv = new THREE.Group();
  tv.add(box(2.4, 1.45, 0.1, 0x111111));
  const next = stats.nextPost;
  const when = next ? new Date(next.at).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const tvs = screen([
    { text: "PRÓXIMO POST", size: 54, color: "#FFC72C" },
    { text: next ? next.title.slice(0, 34) : "Nada agendado", size: 58, color: "#ffffff" },
    { text: when, size: 50, color: "#9fb3c8" },
    { text: `${stats.pending} para aprovar`, size: 58, color: stats.pending ? "#E3262E" : "#9aa0a6" },
  ], 2.25, 1.3);
  tvs.position.set(0, 0.72, 0.06);
  tv.add(tvs);
  tv.position.set(4.88, 1.6, -0.6);
  tv.rotation.y = -Math.PI / 2;
  g.add(tv);
  link(tv, stats.pending ? "/studio/aprovacoes" : "/studio/calendario", {
    title: "Posts", lines: [next ? `Próximo: ${next.title} (${when})` : "Nada agendado", `${stats.pending} para aprovar`],
    to: stats.pending ? "/studio/aprovacoes" : "/studio/calendario", action: stats.pending ? "Aprovar posts" : "Abrir calendário",
  });

  // Planta e luminárias
  const plant = new THREE.Group();
  plant.add(box(0.5, 0.5, 0.5, 0xe9e2d4));
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(0x3f8f4a));
  leaves.position.y = 0.95;
  plant.add(leaves);
  plant.position.set(-4.3, 0, 2.6);
  g.add(plant);
  for (const x of [-2.5, 0, 2.5]) {
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 16, 1, true), mat(BLACK, { side: THREE.DoubleSide }));
    lamp.position.set(x, 3.2, -0.5);
    g.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }));
    bulb.position.set(x, 3.08, -0.5);
    g.add(bulb);
    const light = new THREE.PointLight(0xfff1c4, 6, 7);
    light.position.set(x, 3, -0.5);
    g.add(light);
  }
  return { group: g, pins };
}

type Info = { title: string; lines: string[]; to: string; action: string; enter?: boolean };

export default function World3D({ stats, className, onOpen }: { stats: WorldStats; className?: string; onOpen?: (to: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<Info | null>(null);
  const [inside, setInside] = useState(false);
  const api = useRef<{ enter: () => void; leave: () => void } | null>(null);
  const productKey = (stats.products ?? []).map((p) => p.image).join("|");

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
    const night = hour < 6 || hour >= 18;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    const el = renderer.domElement;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const clickable: THREE.Object3D[] = [];
    const link = (obj: THREE.Object3D, to: string, info: Info) => {
      obj.userData.to = to;
      obj.userData.info = info;
      clickable.push(obj);
    };

    // ---------------------------------------------------------------- mundo (de fora)
    const world = new THREE.Scene();
    world.add(new THREE.HemisphereLight(night ? 0x8899cc : 0xffffff, night ? 0x223044 : 0xb9c4a0, night ? 0.55 : 1.1));
    const sun = new THREE.DirectionalLight(night ? 0x9fb4ff : 0xffffff, night ? 0.5 : 1.6);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    world.add(sun);

    const island = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.6, 0.6, 48), mat(night ? 0x4f7f47 : 0x7cbf6a));
    island.position.y = -0.3;
    island.receiveShadow = true;
    world.add(island);
    const road = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.6, 64), mat(0x3b3f45));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    world.add(road);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const dash = box(0.35, 0.01, 0.06, 0xffffff, Math.cos(a) * 6.1, 0.012, Math.sin(a) * 6.1);
      dash.rotation.y = -a + Math.PI / 2;
      world.add(dash);
    }
    // Postes acesos à noite
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * 7.1, z = Math.sin(a) * 7.1;
      world.add(box(0.08, 1.4, 0.08, 0x30343a, x, 0, z));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: night ? 0xffe39a : 0xdddddd }));
      bulb.position.set(x, 1.45, z);
      world.add(bulb);
      if (night) {
        const l = new THREE.PointLight(0xffd98a, 4, 4);
        l.position.set(x, 1.4, z);
        world.add(l);
      }
    }
    // Nuvens
    const clouds = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + j * 0.15, 0), mat(night ? 0x6b7486 : 0xffffff));
        puff.position.set(j * 0.55, (j % 2) * 0.15, 0);
        c.add(puff);
      }
      c.position.set(-7 + i * 4.5, 7.5 + (i % 2) * 0.8, -7 + (i % 3) * 1.5);
      clouds.add(c);
    }
    world.add(clouds);

    const store = shop();
    store.position.set(-1.6, 0, 0.4);
    world.add(store);
    if (night) {
      store.traverse((o) => {
        const m = o as THREE.Mesh;
        const mm = m.material as THREE.MeshStandardMaterial | undefined;
        if (mm && "color" in mm && mm.color?.getHex() === 0x8fd3ff) {
          mm.emissive = new THREE.Color(0xffd27a);
          mm.emissiveIntensity = 1.2;
        }
      });
    }
    const { group: pinGroup, pin } = bigPin();
    pinGroup.position.set(1.4, 0, 2.6);
    world.add(pinGroup);
    const wh = warehouse(stats.toShip);
    wh.position.set(2.2, 0, -2.3);
    wh.rotation.y = -0.35;
    world.add(wh);
    const { group: kiosk, bubbles } = instaKiosk(stats.waiting);
    kiosk.position.set(-3.6, 0, -2.6);
    world.add(kiosk);
    const ml = mlStall();
    ml.position.set(-4.2, 0, 2.6);
    ml.rotation.y = 0.5;
    world.add(ml);
    [[4.6, 1.6], [3.8, 3.6], [-0.4, -4.4], [0.9, 4.6], [-4.8, 0.1], [4.4, -4.2], [-2, 4.4]].forEach(([x, z], i) => world.add(tree(x, z, 0.8 + (i % 3) * 0.15)));

    const next = stats.nextPost;
    const infos: [THREE.Object3D, Info][] = [
      [store, { title: "Loja Brax Pins", lines: [`${brl(stats.revenueToday)} hoje`, `${stats.ordersToday} pedidos hoje`], to: "/studio/pedidos", action: "Ver pedidos", enter: true }],
      [wh, { title: "Armazém", lines: [`${stats.toShip} ${stats.toShip === 1 ? "pedido" : "pedidos"} para enviar`], to: "/studio/pedidos", action: "Ver pedidos" }],
      [pinGroup, {
        title: "Posts", lines: [`${stats.scheduled} agendados nos próximos 7 dias`, `${stats.pending} para aprovar`, ...(next ? [`Próximo: ${next.title}`] : [])],
        to: stats.pending ? "/studio/aprovacoes" : "/studio/calendario", action: stats.pending ? "Aprovar posts" : "Abrir calendário",
      }],
      [kiosk, { title: "Instagram", lines: [`${stats.waiting} ${stats.waiting === 1 ? "conversa esperando" : "conversas esperando"} você`], to: "/studio/mensagens", action: "Abrir mensagens" }],
      [ml, { title: "Mercado Livre", lines: ["Anúncios, sincronização e vitrine"], to: "/studio/contas", action: "Abrir contas" }],
    ];
    for (const [o, info] of infos) link(o, info.to, info);
    const lbl = (text: string, obj: THREE.Object3D, y: number, color?: string) => {
      const s = label(text, color);
      s.position.set(obj.position.x, y, obj.position.z);
      world.add(s);
      link(s, obj.userData.to, obj.userData.info);
    };
    lbl(`${stats.ordersToday} ${stats.ordersToday === 1 ? "venda" : "vendas"} hoje`, store, 3.5, "#E3262E");
    lbl(`${stats.toShip} para enviar`, wh, 3.3);
    lbl(`${stats.waiting} esperando você`, kiosk, stats.waiting ? 3.3 : 2.3, "#962fbf");
    lbl(`${stats.scheduled} posts · ${stats.pending} p/ aprovar`, pinGroup, 3.1);

    const vans = Array.from({ length: Math.max(1, Math.min(3, stats.ordersToday)) }, (_, i) => {
      const v = van(i === 0 ? WHITE : i === 1 ? GOLD : 0xdedede);
      if (night) {
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }));
        hl.position.set(0.95, 0.25, 0.18);
        const hr = hl.clone();
        hr.position.z = -0.18;
        v.add(hl, hr);
      }
      world.add(v);
      link(v, "/studio/pedidos", infos[0][1]);
      return v;
    });
    const parked = stats.ordersToday === 0;

    // ---------------------------------------------------------------- dentro da loja
    const shopScene = new THREE.Scene();
    shopScene.background = new THREE.Color(0x1d1a17);
    shopScene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4636, 0.9));
    const inner = interior(stats, link);
    shopScene.add(inner.group);

    // ---------------------------------------------------------------- câmera, controles e transição
    const controls = new OrbitControls(camera, el);
    controls.enableDamping = true;
    controls.enablePan = false;
    const touch = window.innerWidth < 768;
    let mode: "world" | "shop" = "world";
    const setWorldView = () => {
      camera.position.set(10, 7.5, 12).setLength(host.clientWidth < 520 ? 19.5 : 15.5);
      controls.target.set(0, 0.2, 0);
      controls.minDistance = 9;
      controls.maxDistance = 26;
      controls.maxPolarAngle = Math.PI / 2.25;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      controls.autoRotate = !reduce;
      controls.autoRotateSpeed = 0.6;
      controls.enabled = !touch;
    };
    const setShopView = () => {
      camera.position.set(0, 2.2, host.clientWidth < 520 ? 7.5 : 6.2);
      controls.target.set(0, 1.5, -1);
      controls.minDistance = 3;
      controls.maxDistance = 8;
      controls.maxPolarAngle = Math.PI / 1.9;
      controls.minAzimuthAngle = -0.9;
      controls.maxAzimuthAngle = 0.9;
      controls.autoRotate = false;
      controls.enabled = true; // dentro da loja dá para girar até no celular
    };
    setWorldView();
    el.style.touchAction = touch ? "pan-y" : "none";

    // Voo até a porta da loja → fade → interior (e o caminho de volta)
    let fly: { from: THREE.Vector3; to: THREE.Vector3; target: THREE.Vector3; start: number; then: () => void } | null = null;
    let fade = 0, fadeTo = 0;
    const enter = () => {
      if (mode === "shop" || fly) return;
      setCard(null);
      controls.autoRotate = false;
      const door = new THREE.Vector3(store.position.x, 1, store.position.z + 1.1);
      fly = { from: camera.position.clone(), to: door.clone().add(new THREE.Vector3(0, 0.6, 2.4)), target: door, start: performance.now(), then: () => {
        mode = "shop";
        setShopView();
        el.style.touchAction = "none";
        fadeTo = 0;
        setInside(true);
      } };
      fadeTo = 1;
    };
    const leave = () => {
      if (mode === "world") return;
      setCard(null);
      fade = 1;
      fadeTo = 0;
      mode = "world";
      setWorldView();
      el.style.touchAction = touch ? "pan-y" : "none";
      setInside(false);
    };
    api.current = { enter, leave };

    // ---------------------------------------------------------------- clique / toque
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hit = (e: PointerEvent): THREE.Object3D | null => {
      const rect = el.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const scene = mode === "world" ? world : shopScene;
      const targets = clickable.filter((o) => {
        let p: THREE.Object3D | null = o;
        while (p && p !== scene) p = p.parent;
        return p === scene;
      });
      for (const h of ray.intersectObjects(targets, true)) {
        let o: THREE.Object3D | null = h.object;
        while (o && !o.userData.info) o = o.parent;
        if (o) return o;
      }
      return null;
    };
    let down: { x: number; y: number; t: number } | null = null;
    let hovered: THREE.Object3D | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY, t: performance.now() });
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 600) {
        const o = hit(e);
        setCard(o ? (o.userData.info as Info) : null);
      }
      down = null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const o = hit(e);
      if (o === hovered) return;
      if (hovered && !(hovered instanceof THREE.Sprite)) hovered.scale.setScalar(1);
      hovered = o;
      if (o && !(o instanceof THREE.Sprite)) o.scale.setScalar(1.06);
      el.style.cursor = o ? "pointer" : "grab";
      if (mode === "world") controls.autoRotate = !reduce && !o;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);

    // ---------------------------------------------------------------- tamanho, visibilidade e animação
    const veil = document.createElement("div");
    Object.assign(veil.style, { position: "absolute", inset: "0", background: "#fff", opacity: "0", pointerEvents: "none" });
    host.appendChild(veil);
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(host);

    const clock = new THREE.Clock();
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      const t = clock.getElapsedTime();
      if (fly) {
        const k = Math.min(1, (performance.now() - fly.start) / 900);
        const e = k * k * (3 - 2 * k);
        camera.position.lerpVectors(fly.from, fly.to, e);
        controls.target.lerp(fly.target, e * 0.25);
        if (k >= 1) {
          const done = fly.then;
          fly = null;
          done();
        }
      }
      fade += (fadeTo - fade) * 0.12;
      veil.style.opacity = String(fade.toFixed(3));
      if (!reduce) {
        pin.rotation.y = t * 1.2;
        pin.position.y = 1.45 + Math.sin(t * 2) * 0.08;
        bubbles.forEach((b, i) => (b.position.y = 1.8 + Math.floor(i / 3) * 0.45 + Math.sin(t * 2.5 + i) * 0.12));
        clouds.children.forEach((c, i) => (c.position.x = ((c.position.x + 0.004 * (1 + i * 0.3) + 9) % 18) - 9));
        inner.pins.children.forEach((p, i) => (p.rotation.y = Math.sin(t * 1.5 + i) * 0.25));
        vans.forEach((v, i) => {
          if (parked) {
            v.position.set(3.4, 0, -0.4);
            v.rotation.y = -0.35;
            return;
          }
          const a = t * 0.35 + (i * Math.PI * 2) / vans.length;
          v.position.set(Math.cos(a) * 6.1, 0, Math.sin(a) * 6.1);
          v.rotation.y = -a - Math.PI;
        });
      }
      controls.update();
      renderer.render(mode === "world" ? world : shopScene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      api.current = null;
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      for (const scene of [world, shopScene]) {
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
          mats.forEach((x) => {
            (x as THREE.MeshBasicMaterial).map?.dispose();
            x.dispose();
          });
        });
      }
      renderer.dispose();
      el.remove();
      veil.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.ordersToday, stats.revenueToday, stats.toShip, stats.waiting, stats.scheduled, stats.pending, stats.nextPost?.title, productKey]);

  return (
    <div className={className} style={{ position: "relative" }}>
      <div ref={ref} className="absolute inset-0" aria-label="Mundo 3D da loja" />
      {inside && (
        <button
          type="button"
          onClick={() => api.current?.leave()}
          className="absolute left-3 top-8 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black"
        >
          ← Sair da loja
        </button>
      )}
      {card && (
        <div className="absolute bottom-3 left-3 right-3 mx-auto max-w-sm rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:left-auto sm:right-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">{card.title}</p>
            <button type="button" onClick={() => setCard(null)} className="text-xs text-muted-foreground hover:text-foreground" aria-label="Fechar">✕</button>
          </div>
          {card.lines.map((l) => <p key={l} className="truncate text-xs text-muted-foreground">{l}</p>)}
          <div className="mt-2 flex gap-2">
            {card.enter && !inside && (
              <button type="button" onClick={() => api.current?.enter()} className="flex-1 rounded-md bg-[#E3262E] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                Entrar na loja
              </button>
            )}
            <button type="button" onClick={() => onOpen?.(card.to)} className="flex-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90">
              {card.action}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
