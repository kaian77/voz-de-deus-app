// "Mundo da Brax" em 3D na Visão geral: a loja, o pin gigante, o armazém com as caixas para enviar,
// as vans de entrega (uma por pedido de hoje, até 3), o quiosque do Instagram com balões de conversa
// e a barraca do Mercado Livre. Low-poly feito à mão com three.js (carregado só nesta tela).
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type WorldStats = { ordersToday: number; toShip: number; waiting: number; scheduled: number; pending: number };

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

export default function World3D({ stats, className, onOpen }: { stats: WorldStats; className?: string; onOpen?: (to: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(10, 7.5, 12);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c4a0, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    scene.add(sun);

    // Chão: ilha redonda com grama, rua em volta e calçada
    const island = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.6, 0.6, 48), mat(0x7cbf6a));
    island.position.y = -0.3;
    island.receiveShadow = true;
    scene.add(island);
    const road = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.6, 64), mat(0x3b3f45));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    scene.add(road);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const dash = box(0.35, 0.01, 0.06, 0xffffff, Math.cos(a) * 6.1, 0.012, Math.sin(a) * 6.1);
      dash.rotation.y = -a + Math.PI / 2;
      scene.add(dash);
    }

    const store = shop();
    store.position.set(-1.6, 0, 0.4);
    scene.add(store);
    const { group: pinGroup, pin } = bigPin();
    pinGroup.position.set(1.4, 0, 2.6);
    scene.add(pinGroup);
    const wh = warehouse(stats.toShip);
    wh.position.set(2.2, 0, -2.3);
    wh.rotation.y = -0.35;
    scene.add(wh);
    const { group: kiosk, bubbles } = instaKiosk(stats.waiting);
    kiosk.position.set(-3.6, 0, -2.6);
    scene.add(kiosk);
    const ml = mlStall();
    ml.position.set(-4.2, 0, 2.6);
    ml.rotation.y = 0.5;
    scene.add(ml);
    [[4.6, 1.6], [3.8, 3.6], [-0.4, -4.4], [0.9, 4.6], [-4.8, 0.1], [4.4, -4.2], [-2, 4.4]].forEach(([x, z], i) => scene.add(tree(x, z, 0.8 + (i % 3) * 0.15)));

    // Cada prédio (e a etiqueta dele) leva a uma tela do Studio
    const clickable: THREE.Object3D[] = [];
    const link = (obj: THREE.Object3D, to: string) => {
      obj.userData.to = to;
      clickable.push(obj);
    };
    link(store, WORLD_LINKS.loja);
    link(wh, WORLD_LINKS.armazem);
    link(pinGroup, stats.pending ? WORLD_LINKS.pin : "/studio/calendario");
    link(kiosk, WORLD_LINKS.instagram);
    link(ml, WORLD_LINKS.ml);
    const lbl = (text: string, obj: THREE.Object3D, y: number, color?: string) => {
      const s = label(text, color);
      s.position.set(obj.position.x, y, obj.position.z);
      scene.add(s);
      link(s, obj.userData.to);
    };
    lbl(`${stats.ordersToday} ${stats.ordersToday === 1 ? "venda" : "vendas"} hoje`, store, 3.5, "#E3262E");
    lbl(`${stats.toShip} para enviar`, wh, 3.3);
    lbl(`${stats.waiting} esperando você`, kiosk, stats.waiting ? 3.3 : 2.3, "#962fbf");
    lbl(`${stats.scheduled} posts · ${stats.pending} p/ aprovar`, pinGroup, 3.1);

    // Vans de entrega rodando na rua (uma por venda de hoje, até 3; sem venda, uma parada)
    const vans = Array.from({ length: Math.max(1, Math.min(3, stats.ordersToday)) }, (_, i) => {
      const v = van(i === 0 ? WHITE : i === 1 ? GOLD : 0xdedede);
      scene.add(v);
      return v;
    });
    const parked = stats.ordersToday === 0;
    vans.forEach((v) => link(v, WORLD_LINKS.loja));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 9;
    controls.maxDistance = 26;
    controls.maxPolarAngle = Math.PI / 2.25;
    controls.autoRotate = !reduce;
    controls.autoRotateSpeed = 0.6;
    controls.target.set(0, 0.2, 0);
    // Celular: não arrasta para girar (o dedo tem que rolar a página), mas o toque abre o prédio
    const touch = window.innerWidth < 768;
    if (touch) {
      controls.enabled = false;
      renderer.domElement.style.touchAction = "pan-y";
    }

    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hit = (e: PointerEvent): THREE.Object3D | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      for (const h of ray.intersectObjects(clickable, true)) {
        let o: THREE.Object3D | null = h.object;
        while (o && !o.userData.to) o = o.parent;
        if (o) return o;
      }
      return null;
    };
    let down: { x: number; y: number; t: number } | null = null;
    let hovered: THREE.Object3D | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY, t: performance.now() });
    const onUp = (e: PointerEvent) => {
      // Clique/toque (não arrasto): abre a tela do prédio
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 600) {
        const o = hit(e);
        if (o) openRef.current?.(o.userData.to);
      }
      down = null;
    };
    const onMove = (e: PointerEvent) => {
      if (touch || e.pointerType !== "mouse") return;
      const o = hit(e);
      if (o === hovered) return;
      if (hovered && !(hovered instanceof THREE.Sprite)) hovered.scale.setScalar(1);
      hovered = o;
      if (o && !(o instanceof THREE.Sprite)) o.scale.setScalar(1.06);
      renderer.domElement.style.cursor = o ? "pointer" : "grab";
      controls.autoRotate = !reduce && !o;
    };
    const el = renderer.domElement;
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // Celular (estreito): afasta para caber a ilha inteira
      camera.position.setLength(w < 520 ? 19.5 : 15.5);
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
      if (!reduce) {
        pin.rotation.y = t * 1.2;
        pin.position.y = 1.45 + Math.sin(t * 2) * 0.08;
        bubbles.forEach((b, i) => (b.position.y = 1.8 + Math.floor(i / 3) * 0.45 + Math.sin(t * 2.5 + i) * 0.12));
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
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
        mats.forEach((x) => {
          (x as THREE.MeshBasicMaterial).map?.dispose();
          x.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [stats.ordersToday, stats.toShip, stats.waiting, stats.scheduled, stats.pending]);

  return <div ref={ref} className={className} aria-label="Mundo 3D da loja" />;
}
