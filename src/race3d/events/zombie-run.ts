// The Zombie Run (demonstração para prospectar): à noite no Autódromo Internacional de Brasília.
// Traçado aproximado, copiado à mão do mapa "Percurso para a sobrevivência" do post do evento (5 km = 1 volta; 10 km = 2 voltas).
// Kits, data e horário do post. Água, pódio e o atraso da largada da horda são exemplos.
import type { RaceEvent } from "../types";

/** Uma volta, saindo do meio da Reta Principal: Curva 01, Reta do Militar, Curva 2, Piscina, Curva da Junção,
 *  Mergulho da Bruxa, Curva da Bruxa, Reta Oposta, Descida do Placar, Curva do Placar, Subida do Placar, Curva "S", Curva da Vitória. */
const LAP: [number, number][] = [
  [5.9, -59.5], [27.4, -64.5], [48.9, -69.6], [62.6, -72.4], [70.4, -70.0], [75.5, -62.6], [77.1, -48.9], [77.4, -21.5], [77.4, 5.9],
  [77.1, 33.2], [75.9, 52.8], [73.3, 65.5], [67.5, 71.4], [56.7, 72.4], [35.2, 68.8], [11.7, 64.9], [-11.7, 62.2], [-35.2, 60.2],
  [-52.8, 57.1], [-66.5, 52.8], [-74.7, 46.5], [-76.7, 39.1], [-73.1, 32.9], [-64.5, 30.1], [-46.9, 30.9], [-23.5, 32.1], [-2.0, 32.9],
  [13.7, 31.3], [29.3, 25.4], [45.0, 15.6], [56.7, 5.9], [63.6, -5.9], [65.5, -17.6], [63.6, -28.4], [57.7, -36.2], [48.9, -39.9],
  [31.3, -39.5], [11.7, -37.2], [-7.8, -34.8], [-25.4, -31.7], [-37.2, -27.8], [-41.5, -21.9], [-39.1, -15.6], [-29.3, -9.8], [-15.6, -3.9],
  [-2.0, -0.4], [3.3, -2.0], [15.6, -12.1], [25.6, -20.9], [37.9, -22.1], [41.3, -12.1], [37.9, -2.0], [25.6, 4.7], [9.0, 12.5],
  [-7.8, 16.0], [-27.4, 16.8], [-43.0, 17.6], [-54.8, 16.8], [-61.0, 11.7], [-62.2, 3.9], [-61.0, -5.9], [-60.2, -17.6], [-61.0, -27.4],
  [-58.7, -37.2], [-50.9, -44.0], [-39.1, -48.5], [-21.5, -53.2], [-7.8, -56.3],
];
const laps = (n: number): [number, number][] => [...Array.from({ length: n }, () => LAP).flat(), LAP[0]];

export const zombieRun: RaceEvent = {
  slug: "zombie-run",
  name: "The Zombie Run",
  subtitle: "Autódromo Internacional de Brasília",
  date: "Sáb, 7 nov 2026",
  start: 18.5,
  venue: "autodromo",
  night: true,
  font: "Creepster",
  go: "CORRA!",
  slogan: "BRASÍLIA RESISTE ATÉ O FIM",
  after: [-30, -42],
  colors: { primary: "#e3262e", dark: "#140a0b", accent: "#f2e6d0" },
  distances: [
    {
      id: "10k", label: "10K", name: "Sobreviventes", title: "SOBREVIVENTE", km: 10, color: "#f2e6d0", wave: 0, runners: 180, pace: [3.4, 8.8],
      water: [2.5, 5, 7.5], points: laps(2), shirts: [0x161616, 0x161616, 0x161616, 0x8c1016, 0x2a2a2a],
    },
    {
      id: "5k", label: "5K", name: "Infectados", title: "INFECTADO", km: 5, color: "#7dff4a", wave: 2, runners: 160, pace: [3.8, 9.6],
      water: [2.5], points: laps(1), shirts: [0x6d6a5f, 0x4b3b33, 0x7a1d1d, 0x3a3a35, 0x8a8270], zombie: true,
    },
  ],
  arena: [
    { id: "largada", icon: "🏁", name: "Largada e chegada", info: "Na Reta Principal, em frente à arquibancada. Neste exemplo, os Sobreviventes largam primeiro e a horda dos Infectados sai 2 min depois.", x: 5.9, z: -59.5 },
    { id: "medalhas", icon: "🏅", name: "Entrega de medalhas", info: "Logo depois da chegada, entre a Reta Principal e a Reta Oposta.", x: -36, z: -41 },
    { id: "banheiros", icon: "🚻", name: "Banheiros", info: "Na área entre as retas, perto da entrega de medalhas.", x: -20, z: -44 },
    { id: "guarda", icon: "🎒", name: "Guarda-volumes", info: "No paddock, entre a Reta Principal e a Reta Oposta.", x: -4, z: -46 },
    { id: "podio", icon: "🏆", name: "Pódio", info: "Premiação dos 3 primeiros de cada distância.", x: 21, z: -50 },
    { id: "food", icon: "🍔", name: "Food trucks", info: "Perto da Curva 01, para depois da prova.", x: 42, z: -55 },
    { id: "estac", icon: "🅿️", name: "Estacionamento", info: "Área de exemplo dentro do autódromo; a organização confirma o acesso.", x: 52, z: 43, w: 24, d: 30 },
  ],
  landmarks: [
    { kind: "estadio", x: -300, z: -230, name: "Estádio Mané Garrincha" },
    { kind: "torre", x: -560, z: -60, name: "Torre de TV" },
  ],
  altitude: 1070,
  lots: [
    { name: "Kit 1", price: "R$ 139,90 + taxas", status: "aberto", items: "Camisa, número de peito, chip, lanterna de cabeça, medalha e hidratação pós-prova" },
    { name: "Kit 2", price: "R$ 159,90 + taxas", status: "aberto", items: "Tudo do Kit 1 + pochete" },
    { name: "Kit 3", price: "R$ 199,90 + taxas", status: "aberto", items: "Tudo do Kit 2 + jaqueta corta-vento" },
  ],
  kit: ["Camisa oficial", "Número de peito", "Chip de cronometragem", "Lanterna de cabeça", "Medalha", "Hidratação pós-prova"],
  signup: "https://www.thezombierun.com.br/",
  routeNote: "Traçado aproximado do mapa divulgado pelo evento (5K = 1 volta, 10K = 2 voltas). Postos de água de exemplo.",
  lotsNote: "Kits e valores do post do evento; confira na inscrição oficial.",
  whatsapp: "5561992372216",
  demo: true,
};
