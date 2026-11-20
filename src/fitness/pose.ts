// Leitura do corpo pela câmera: MediaPipe Pose (Google, grátis, roda no próprio celular).
// 33 pontos por quadro; aqui só carregamos o modelo, suavizamos e damos as contas de ângulo.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Arquivos do MediaPipe 0.10.14 servidos pelo próprio site (public/treino/mp), versão com SIMD (todo celular atual).
const WASM = { wasmLoaderPath: "/treino/mp/vision_wasm_internal.js", wasmBinaryPath: "/treino/mp/vision_wasm_internal.wasm" };
const MODELS = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
};

export interface Pt { x: number; y: number; v: number }

/** Pontos do MediaPipe que usamos. */
export const P = {
  nose: 0, lEar: 7, rEar: 8, mouthL: 9, mouthR: 10,
  lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
  lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28,
  lHeel: 29, rHeel: 30, lFoot: 31, rFoot: 32,
};

/** Linhas do esqueleto desenhado (sem o rosto). */
export const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
  [15, 19], [16, 20],
];

let landmarker: PoseLandmarker | null = null;

export async function loadPose(onStatus?: (s: string) => void): Promise<PoseLandmarker> {
  if (landmarker) return landmarker;
  onStatus?.("Carregando a visão do corpo…");
  void FilesetResolver;
  const fileset = WASM;
  const make = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODELS.full, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  try {
    landmarker = await make("GPU");
  } catch {
    landmarker = await make("CPU");
  }
  return landmarker;
}

/** Suaviza os pontos entre quadros (tira o tremido sem atrasar muito). */
export class Smoother {
  private prev: Pt[] | null = null;
  constructor(private a = 0.55) {}
  push(pts: Pt[]): Pt[] {
    if (!this.prev || this.prev.length !== pts.length) return (this.prev = pts.map((p) => ({ ...p })));
    const a = this.a;
    this.prev = pts.map((p, i) => {
      const q = this.prev![i];
      return { x: q.x + (p.x - q.x) * a, y: q.y + (p.y - q.y) * a, v: p.v };
    });
    return this.prev;
  }
  reset() { this.prev = null; }
}

/** Ângulo em graus no ponto b (entre b→a e b→c). */
export function angle(a: Pt, b: Pt, c: Pt): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (!d) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d))) * 180) / Math.PI;
}

/** Inclinação da linha a→b em relação à vertical, em graus (0 = em pé). */
export function fromVertical(a: Pt, b: Pt): number {
  return (Math.atan2(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 180) / Math.PI;
}

export function dist(a: Pt, b: Pt) { return Math.hypot(a.x - b.x, a.y - b.y); }

export function mid(a: Pt, b: Pt): Pt { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) }; }

/** Lado do corpo mais visível para a câmera (exercício de lado). */
export function side(p: Pt[]): "l" | "r" {
  const l = [11, 13, 15, 23, 25, 27].reduce((s, i) => s + p[i].v, 0);
  const r = [12, 14, 16, 24, 26, 28].reduce((s, i) => s + p[i].v, 0);
  return l >= r ? "l" : "r";
}

/** Índices de um lado: ombro, cotovelo, punho, quadril, joelho, tornozelo, calcanhar, pé. */
export function limbs(s: "l" | "r") {
  return s === "l"
    ? { sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27, heel: 29, foot: 31 }
    : { sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28, heel: 30, foot: 32 };
}
