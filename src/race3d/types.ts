// Percurso 3D de corrida: cada evento é um arquivo em events/ (registrar em EVENTS no main.ts).
// Unidade da cena: 1 = 5 m. Percurso = pontos (x, z) por onde a linha passa; o comprimento real vem de `km`.

export type Distance = {
  id: string;
  label: string;
  km: number;
  color: string;
  /** Largada desta distância, em minutos depois da primeira. */
  wave: number;
  runners: number;
  /** Ritmo (min/km) do mais rápido e do mais lento. */
  pace: [number, number];
  /** Postos de hidratação (km). */
  water: number[];
  points: [number, number][];
};

export type Spot = { id: string; icon: string; name: string; info: string; x: number; z: number };

export type RaceEvent = {
  slug: string;
  name: string;
  subtitle: string;
  date: string;
  /** Hora da largada (ex.: 6 = 6h00). */
  start: number;
  colors: { primary: string; dark: string; accent: string };
  distances: Distance[];
  arena: Spot[];
  /** Pontos de referência desenhados na cena (ids conhecidos pelo world.ts). */
  landmarks: { kind: "torre" | "congresso" | "catedral" | "esplanada" | "lago"; x: number; z: number; name?: string }[];
  /** Altitude (m) no x = 0 e quanto cai por unidade de x (o Eixo desce até o Congresso). */
  altitude: number;
  lots: { name: string; price: string; status: "esgotado" | "aberto" | "em breve" }[];
  kit: string[];
  signup: string;
  whatsapp: string;
  demo: boolean;
};
