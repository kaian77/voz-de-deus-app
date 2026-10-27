// Montagem 3D (PáginasPro): o manual de montagem de um móvel virado passo a passo em 3D.
// Cada produto é um arquivo em products/ (registrar em PRODUCTS no main.ts). Unidade da cena: 1 = 1 metro.
import type * as THREE from "three";
import type { L } from "../i18n3d";

export type Hardware = { id: string; name: L; size?: string; qty: number };

export type Step = {
  /** Número do passo no manual ("01"); vazio = antes de começar / final. */
  n: string;
  title: L;
  text: L;
  /** Recorte da página do manual (em public/montagem/<slug>/). */
  img: string;
  /** Ferragens usadas neste passo (id → quantidade). */
  uses: Record<string, number>;
  /** Ferramentas que aparecem (ex.: "Cola", "Chave Phillips"). */
  tools?: L[];
  /** Peças com o número em destaque. */
  pieces: string[];
  cam: { target: [number, number, number]; offset: [number, number, number] };
  /** Duração da animação (s). */
  dur: number;
};

export type Built = {
  /** Põe tudo na posição do passo `s` com a animação em `t` (0 a 1). Passos anteriores ficam prontos. */
  pose: (s: number, t: number) => void;
  /** Onde fica o número de cada peça (para o rótulo). */
  badges: { id: string; label: string; at: () => THREE.Vector3 }[];
  /** Ferragem em uso agora (para o rótulo com a letra). */
  active: () => { label: string; at: THREE.Vector3 } | null;
};

export type Product = {
  slug: string;
  name: L;
  subtitle: L;
  /** Medidas do móvel montado (texto). */
  size: string;
  pieces: { id: string; name: L; qty: number }[];
  hardware: Hardware[];
  steps: Step[];
  build: (scene: THREE.Scene) => Built;
  whatsapp: string;
  demo: boolean;
};
