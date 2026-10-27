// Percurso 3D de corrida: cada evento é um arquivo em events/ (registrar em EVENTS no main.ts).
import type { L } from "../i18n3d";

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
  /** Nome do grupo (ex.: "Sobreviventes"), aparece junto do km. */
  name?: L;
  /** Texto da medalha no lugar de FINISHER. */
  title?: L;
  /** Cores das camisetas do pelotão (senão, a cor da distância). */
  shirts?: number[];
  /** Pelotão de zumbis: pele cinza-esverdeada, braços para a frente e sem lanterna. */
  zombie?: boolean;
};

export type Spot = { id: string; icon: string; name: L; info: L; x: number; z: number; /** tamanho (estacionamento) */ w?: number; d?: number };

export type RaceEvent = {
  slug: string;
  name: L;
  subtitle: L;
  date: L;
  /** Hora da largada (ex.: 6 = 6h00, 18.5 = 18h30). */
  start: number;
  /** Cenário: "eixo" (padrão, Eixo Monumental estilizado) ou "autodromo" (pista fechada, percurso em voltas). */
  venue?: "eixo" | "autodromo";
  /** Prova à noite: céu escuro, postes acesos e lanterna de cabeça nos corredores. */
  night?: boolean;
  /** Fonte do nome do evento (Google Fonts). */
  font?: string;
  /** Texto do "VAI!" da largada. */
  go?: L;
  /** Faixa da arquibancada / pórtico. */
  slogan?: L;
  /** Onde os corredores ficam depois da chegada (centro x, z). */
  after?: [number, number];
  /** Observação do percurso (ex.: traçado aproximado). */
  routeNote?: L;
  /** Observação dos valores (no lugar de "Valores de exemplo."). */
  lotsNote?: L;
  colors: { primary: string; dark: string; accent: string };
  distances: Distance[];
  arena: Spot[];
  /** Pontos de referência desenhados na cena (ids conhecidos pelo world.ts). */
  landmarks: { kind: "torre" | "congresso" | "catedral" | "esplanada" | "lago" | "estadio"; x: number; z: number; name?: L }[];
  /** Altitude (m) no x = 0 e quanto cai por unidade de x (o Eixo desce até o Congresso). */
  altitude: number;
  lots: { name: L; price: L; status: "esgotado" | "aberto" | "em breve"; items?: L }[];
  kit: L[];
  signup: string;
  /** Foto da frente da medalha de verdade (PNG quadrado com fundo transparente), em public/race3d/<slug>/. */
  medal?: string;
  whatsapp: string;
  demo: boolean;
};
