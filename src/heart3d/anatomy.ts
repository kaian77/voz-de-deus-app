// Anatomia do coração em formas simples (elipsoides = câmaras, tubos = vasos), normal e com tetralogia de Fallot.
// O desenho é didático (proporções aproximadas de um coração de criança/adulto jovem), para o médico explicar ao paciente.
// Eixos: x = esquerda do paciente (direita de quem olha de frente), y = para cima, z = para a frente (peito).
import { Ellipsoid, far, smin, Tube, type Shape, type V3 } from "./sdf";

export type Kind = "normal" | "tof";
/** Partes (para a cor da superfície e o nome no toque). */
export type Part = "lv" | "rv" | "ra" | "la" | "aorta" | "pa" | "vc" | "pv";

type Item = { s: Shape; part: Part };
export type Heart = {
  kind: Kind;
  /** Distância até a parede (negativo = dentro do músculo/parede do vaso). */
  wall: (x: number, y: number, z: number) => number;
  /** Distância até a superfície de fora (para saber se o ponto é de fora ou de dentro e de qual parte). */
  outer: (x: number, y: number, z: number) => number;
  cavity: (x: number, y: number, z: number) => number;
  partAt: (x: number, y: number, z: number) => Part;
  /** Distância até cada parte (a menor de cada uma), para achar os sulcos entre câmaras. */
  partDists: (x: number, y: number, z: number) => Partial<Record<Part, number>>;
  bounds: [V3, V3];
};

const K = 0.55; // suavidade das emendas por fora

/** Tubo com a luz (por dentro) passando um pouco da ponta: o vaso fica aberto na extremidade. */
function vessel(pts: V3[], rOut: number | number[], rIn: number | number[], openEnd = true, openStart = false) {
  const ext = (a: V3, b: V3, k: number): V3 => [b[0] + (b[0] - a[0]) * k, b[1] + (b[1] - a[1]) * k, b[2] + (b[2] - a[2]) * k];
  const n = pts.length;
  const inner = [...pts];
  const rIns = Array.isArray(rIn) ? [...rIn] : pts.map(() => rIn);
  if (openEnd) {
    inner.push(ext(pts[n - 2], pts[n - 1], 0.25));
    rIns.push(rIns[rIns.length - 1]);
  }
  if (openStart) {
    inner.unshift(ext(pts[1], pts[0], 0.25));
    rIns.unshift(rIns[0]);
  }
  return { out: new Tube(pts, rOut), lumen: new Tube(inner, rIns) };
}

export function buildHeart(kind: Kind): Heart {
  const tof = kind === "tof";
  const outer: Item[] = [];
  const cav: Shape[] = [];
  const add = (part: Part, o: Shape, c?: Shape) => {
    outer.push({ s: o, part });
    if (c) cav.push(c);
  };

  // ---------- Ventrículos (a ponta aponta para baixo, à esquerda e para a frente)
  const lvAxis: V3 = [0.45, -0.8, 0.38];
  add("lv", new Ellipsoid([1.25, -0.7, -0.55], lvAxis, tof ? [3.7, 2.4, 2.3] : [3.9, 2.6, 2.5]), new Ellipsoid([1.4, -0.95, -0.55], lvAxis, tof ? [2.75, 1.4, 1.3] : [2.95, 1.55, 1.45]));
  // VD: na frente e à direita, abraçando o VE. Na tetralogia a parede engrossa (hipertrofia) e a ponta sobe ("coração em bota").
  const rvAxis: V3 = tof ? [0.75, -0.55, 0.3] : [0.55, -0.75, 0.32];
  add("rv", new Ellipsoid(tof ? [-0.55, -0.55, 1.15] : [-0.6, -0.85, 1.0], rvAxis, tof ? [3.7, 2.75, 2.15] : [3.6, 2.45, 1.6]),
    new Ellipsoid(tof ? [-0.75, -0.45, 1.45] : [-0.8, -0.7, 1.4], rvAxis, tof ? [2.6, 1.55, 0.72] : [3.0, 2.0, 0.95]));

  // ---------- Átrios
  add("ra", new Ellipsoid([-2.65, 0.95, 0.05], [0, 1, 0.2], [1.95, 1.8, 1.75]), new Ellipsoid([-2.6, 0.95, 0.05], [0, 1, 0.2], [1.6, 1.45, 1.4]));
  add("ra", new Ellipsoid([-1.85, 2.15, 1.35], [0.6, 0.5, 0.6], [1.15, 0.7, 0.6]), new Ellipsoid([-1.85, 2.15, 1.35], [0.6, 0.5, 0.6], [0.85, 0.45, 0.38])); // aurícula direita
  add("la", new Ellipsoid([0.85, 1.55, -2.45], [1, 0, 0], [2.0, 1.35, 1.45]), new Ellipsoid([0.85, 1.55, -2.45], [1, 0, 0], [1.65, 1.0, 1.1]));
  add("la", new Ellipsoid([2.55, 2.0, -1.05], [0.3, 0.4, 0.9], [1.1, 0.55, 0.5]), new Ellipsoid([2.55, 2.0, -1.05], [0.3, 0.4, 0.9], [0.8, 0.32, 0.3])); // aurícula esquerda

  // ---------- Valvas (passagens entre câmaras: só por dentro)
  cav.push(new Tube([[-2.2, 0.35, 0.35], [-1.3, -0.45, 0.95]], 0.95)); // tricúspide (AD → VD)
  cav.push(new Tube([[0.9, 0.85, -1.95], [1.1, 0.0, -1.2]], 0.95)); // mitral (AE → VE)

  // ---------- Saída do VE e aorta. Na tetralogia a aorta é mais larga e nasce mais à direita, "a cavalo" sobre o septo.
  const ao: V3 = tof ? [-0.45, 1.95, 0.6] : [0.0, 1.95, 0.1]; // valva aórtica
  cav.push(new Tube([[0.7, -0.2, -0.55], ao], tof ? 1.0 : 0.95)); // via de saída do VE
  const aoR = tof ? 1.55 : 1.3, aoL = tof ? 1.32 : 1.08;
  const aorta = vessel(
    [ao, [ao[0] - 0.3, 3.4, ao[2] + 0.4], [-0.15, 5.0, 0.2], [0.6, 6.05, -0.8], [1.6, 5.85, -2.0], [2.0, 4.5, -2.65], [2.1, 1.5, -2.95], [2.1, -2.2, -3.0]],
    [aoR, aoR, aoR * 0.95, 1.2, 1.1, 1.05, 1.0, 1.0], [aoL, aoL, aoL * 0.95, 0.98, 0.9, 0.85, 0.8, 0.8], true,
  );
  add("aorta", aorta.out, aorta.lumen);
  for (const [pts, r] of [
    [[[0.15, 5.95, -0.25], [-0.25, 7.0, -0.1], [-0.7, 8.1, 0.05]], 0.62],
    [[[0.85, 6.15, -1.0], [0.95, 7.2, -0.95], [1.05, 8.1, -0.9]], 0.45],
    [[[1.5, 6.0, -1.75], [2.0, 6.9, -1.85], [2.5, 7.8, -1.9]], 0.5],
  ] as [V3[], number][]) {
    const b = vessel(pts, r, r * 0.72, true);
    add("aorta", b.out, b.lumen);
  }

  // ---------- Saída do VD (infundíbulo) e artéria pulmonar. Na tetralogia: saída estreita (estenose) e pulmonar fina.
  const pv: V3 = tof ? [0.3, 2.55, 2.05] : [0.35, 2.6, 1.95]; // valva pulmonar
  add("rv", new Tube([[-0.45, 0.55, 1.65], pv], tof ? [1.25, 1.1] : [1.2, 1.1]), new Tube([[-0.5, 0.35, 1.55], [-0.2, 1.3, 1.75], pv], tof ? [0.85, 0.42, 0.3] : [0.9, 0.85, 0.85]));
  const paR = tof ? 0.72 : 1.1, paL = tof ? 0.5 : 0.9;
  const trunk = vessel([pv, [0.9, 3.75, 1.45], [1.3, 4.45, 0.35]], [paR, paR, paR * 0.95], [paL, paL, paL * 0.95], false);
  add("pa", trunk.out, trunk.lumen);
  const brR = tof ? 0.55 : 0.82, brL = tof ? 0.38 : 0.64;
  const lpa = vessel([[1.3, 4.45, 0.35], [2.6, 4.6, -0.55], [3.75, 4.3, -1.0]], brR, brL);
  const rpa = vessel([[1.3, 4.45, 0.35], [0.0, 4.35, -1.25], [-2.3, 4.15, -1.45]], brR, brL);
  add("pa", lpa.out, lpa.lumen);
  add("pa", rpa.out, rpa.lumen);

  // ---------- Veias cavas (chegam ao AD) e veias pulmonares (chegam ao AE)
  const svc = vessel([[-2.45, 6.6, -0.45], [-2.55, 4.2, -0.25], [-2.6, 2.3, -0.05]], 0.9, 0.74, false, true);
  const ivc = vessel([[-2.5, -3.6, -0.55], [-2.55, -1.8, -0.35], [-2.6, -0.4, -0.1]], 1.0, 0.82, false, true);
  add("vc", svc.out, svc.lumen);
  add("vc", ivc.out, ivc.lumen);
  for (const [a, b] of [
    [[3.05, 2.25, -3.75], [1.75, 1.85, -2.85]],
    [[3.05, 1.0, -3.7], [1.75, 1.2, -2.9]],
    [[-1.3, 2.25, -3.75], [-0.05, 1.85, -2.85]],
    [[-1.3, 1.0, -3.7], [-0.05, 1.2, -2.9]],
  ] as [V3, V3][]) {
    const v = vessel([a, b], 0.52, 0.38, false, true);
    add("pv", v.out, v.lumen);
  }

  // ---------- Tetralogia: CIV (buraco no septo, logo abaixo da aorta)
  if (tof) cav.push(new Ellipsoid([0.05, 0.55, 0.55], [0.3, 1, 0.4], [0.95, 0.8, 0.7]));

  const outerD = (x: number, y: number, z: number) => {
    let d = 1e9;
    for (const it of outer) {
      const f = far(it.s, x, y, z, K);
      d = smin(d, f >= 0 ? f : it.s.d(x, y, z), K);
    }
    return d;
  };
  const cavD = (x: number, y: number, z: number) => {
    let d = 1e9;
    for (const s of cav) {
      const f = far(s, x, y, z, 0.3);
      d = smin(d, f >= 0 ? f : s.d(x, y, z), 0.3);
    }
    return d;
  };
  return {
    kind,
    outer: outerD,
    cavity: cavD,
    wall: (x, y, z) => Math.max(outerD(x, y, z), -cavD(x, y, z)),
    partAt: (x, y, z) => {
      let best = Infinity, part: Part = "lv";
      for (const it of outer) {
        const f = far(it.s, x, y, z, 0.5);
        const d = f >= 0 ? f : it.s.d(x, y, z);
        if (d < best) {
          best = d;
          part = it.part;
        }
      }
      return part;
    },
    partDists: (x, y, z) => {
      const out: Partial<Record<Part, number>> = {};
      for (const it of outer) {
        const f = far(it.s, x, y, z, 1.5);
        const d = f >= 0 ? f : it.s.d(x, y, z);
        if (out[it.part] === undefined || d < out[it.part]!) out[it.part] = d;
      }
      return out;
    },
    bounds: [[-5.0, -5.4, -4.8], [5.0, 9.0, 4.4]],
  };
}

/** Caminhos do sangue (para as bolinhas do fluxo). blue = sangue sem oxigênio, red = com oxigênio, mix = misturado (tetralogia). */
export function flowPaths(kind: Kind): { pts: V3[]; color: "blue" | "red" | "mix"; weight: number; r: number }[] {
  const tof = kind === "tof";
  const toLungs: V3[] = tof
    ? [[-0.3, -0.6, 1.5], [-0.35, 0.6, 1.6], [-0.1, 1.5, 1.8], [0.3, 2.55, 2.05], [0.9, 3.75, 1.45], [1.3, 4.45, 0.35]]
    : [[-0.4, -1.4, 1.5], [-0.4, 0.4, 1.6], [0.0, 1.5, 1.8], [0.35, 2.6, 1.95], [0.9, 3.75, 1.45], [1.3, 4.45, 0.35]];
  const ao: V3 = tof ? [-0.45, 1.95, 0.6] : [0.0, 1.95, 0.1];
  const aortaPath: V3[] = [ao, [ao[0] - 0.3, 3.4, ao[2] + 0.4], [-0.15, 5.0, 0.2], [0.6, 6.05, -0.8], [1.6, 5.85, -2.0], [2.0, 4.5, -2.65], [2.1, 1.5, -2.95], [2.1, -2.6, -3.0]];
  const veinsIn = (start: V3[]): V3[] => [...start, [-2.55, 0.9, 0.1], [-1.75, -0.1, 0.7], [-0.9, -1.2, 1.3]];
  const paths: { pts: V3[]; color: "blue" | "red" | "mix"; weight: number; r: number }[] = [];
  for (const branch of [[[2.6, 4.6, -0.55], [3.9, 4.25, -1.05]], [[0.0, 4.35, -1.25], [-2.5, 4.1, -1.45]]] as V3[][]) {
    const lungW = tof ? 0.35 : 1;
    paths.push({ pts: [...veinsIn([[-2.45, 6.9, -0.45], [-2.55, 4.2, -0.25]]), ...toLungs, ...branch], color: "blue", weight: lungW, r: tof ? 0.25 : 0.55 });
    paths.push({ pts: [...veinsIn([[-2.5, -3.9, -0.55], [-2.55, -1.8, -0.35]]), ...toLungs, ...branch], color: "blue", weight: lungW, r: tof ? 0.25 : 0.55 });
  }
  if (tof) {
    // Sangue azul do VD atravessa a CIV e sai direto pela aorta (por isso a criança fica arroxeada)
    paths.push({ pts: [...veinsIn([[-2.45, 6.9, -0.45], [-2.55, 4.2, -0.25]]), [-0.5, -0.6, 1.3], [-0.2, 0.4, 0.9], [0.05, 0.6, 0.5], [ao[0], 1.2, ao[2] - 0.1], ...aortaPath], color: "mix", weight: 1.3, r: 0.6 });
    paths.push({ pts: [...veinsIn([[-2.5, -3.9, -0.55], [-2.55, -1.8, -0.35]]), [-0.5, -0.6, 1.3], [-0.2, 0.4, 0.9], [0.05, 0.6, 0.5], [ao[0], 1.2, ao[2] - 0.1], ...aortaPath], color: "mix", weight: 1.0, r: 0.6 });
  }
  for (const pv of [[3.3, 2.3, -3.9], [3.3, 1.0, -3.85], [-1.55, 2.3, -3.9], [-1.55, 1.0, -3.85]] as V3[]) {
    paths.push({
      pts: [pv, [pv[0] > 0 ? 1.75 : -0.05, pv[1] * 0.8 + 0.3, -2.85], [0.9, 1.4, -2.4], [1.0, 0.5, -1.6], [1.6, -0.9, -0.6], [2.1, -2.0, 0.1], [1.4, -1.2, -0.2], [0.7, -0.2, -0.5], [ao[0] + 0.2, 1.1, ao[2] - 0.2], ...aortaPath],
      color: tof ? "mix" : "red",
      weight: tof ? 0.45 : 0.5,
      r: 0.5,
    });
  }
  return paths;
}
