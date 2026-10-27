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
  subtitle: { pt: "Autódromo Internacional de Brasília", en: "Brasília International Racetrack", es: "Autódromo Internacional de Brasilia" },
  date: { pt: "Sáb, 7 nov 2026", en: "Sat, Nov 7 2026", es: "Sáb, 7 nov 2026" },
  start: 18.5,
  venue: "autodromo",
  night: true,
  font: "Creepster",
  go: { pt: "CORRA!", en: "RUN!", es: "¡CORRE!" },
  slogan: { pt: "BRASÍLIA RESISTE ATÉ O FIM", en: "BRASÍLIA HOLDS ON TO THE END", es: "BRASILIA RESISTE HASTA EL FIN" },
  after: [-30, -42],
  colors: { primary: "#e3262e", dark: "#140a0b", accent: "#f2e6d0" },
  distances: [
    {
      id: "10k", label: "10K", name: { pt: "Sobreviventes", en: "Survivors", es: "Sobrevivientes" }, title: { pt: "SOBREVIVENTE", en: "SURVIVOR", es: "SOBREVIVIENTE" }, km: 10, color: "#f2e6d0", wave: 0, runners: 180, pace: [3.4, 8.8],
      water: [2.5, 5, 7.5], points: laps(2), shirts: [0x161616, 0x161616, 0x161616, 0x8c1016, 0x2a2a2a],
    },
    {
      id: "5k", label: "5K", name: { pt: "Infectados", en: "Infected", es: "Infectados" }, title: { pt: "INFECTADO", en: "INFECTED", es: "INFECTADO" }, km: 5, color: "#7dff4a", wave: 2, runners: 160, pace: [3.8, 9.6],
      water: [2.5], points: laps(1), shirts: [0x6d6a5f, 0x4b3b33, 0x7a1d1d, 0x3a3a35, 0x8a8270], zombie: true,
    },
  ],
  arena: [
    { id: "largada", icon: "🏁", name: { pt: "Largada e chegada", en: "Start and finish", es: "Largada y llegada" }, info: { pt: "Na Reta Principal, em frente à arquibancada. Neste exemplo, os Sobreviventes largam primeiro e a horda dos Infectados sai 2 min depois.", en: "On the main straight, in front of the grandstand. In this demo the Survivors start first and the Infected horde leaves 2 min later.", es: "En la recta principal, frente a la tribuna. En este ejemplo los Sobrevivientes largan primero y la horda de Infectados sale 2 min después." }, x: 5.9, z: -59.5 },
    { id: "medalhas", icon: "🏅", name: { pt: "Entrega de medalhas", en: "Medals", es: "Entrega de medallas" }, info: { pt: "Logo depois da chegada, entre a Reta Principal e a Reta Oposta.", en: "Right after the finish, between the main and back straights.", es: "Justo después de la llegada, entre la recta principal y la opuesta." }, x: -36, z: -41 },
    { id: "banheiros", icon: "🚻", name: { pt: "Banheiros", en: "Restrooms", es: "Baños" }, info: { pt: "Na área entre as retas, perto da entrega de medalhas.", en: "Between the straights, next to the medals tent.", es: "Entre las rectas, cerca de la entrega de medallas." }, x: -20, z: -44 },
    { id: "guarda", icon: "🎒", name: { pt: "Guarda-volumes", en: "Bag check", es: "Guardarropa" }, info: { pt: "No paddock, entre a Reta Principal e a Reta Oposta.", en: "In the paddock, between the main and back straights.", es: "En el paddock, entre la recta principal y la opuesta." }, x: -4, z: -46 },
    { id: "podio", icon: "🏆", name: { pt: "Pódio", en: "Podium", es: "Podio" }, info: { pt: "Premiação dos 3 primeiros de cada distância.", en: "Awards for the top 3 of each distance.", es: "Premiación de los 3 primeros de cada distancia." }, x: 21, z: -50 },
    { id: "food", icon: "🍔", name: "Food trucks", info: { pt: "Perto da Curva 01, para depois da prova.", en: "Near Turn 1, for after the race.", es: "Cerca de la Curva 1, para después de la carrera." }, x: 42, z: -55 },
    { id: "estac", icon: "🅿️", name: { pt: "Estacionamento", en: "Parking", es: "Estacionamiento" }, info: { pt: "Área de exemplo dentro do autódromo; a organização confirma o acesso.", en: "Sample area inside the circuit; the organizers confirm access.", es: "Área de ejemplo dentro del autódromo; la organización confirma el acceso." }, x: 52, z: 43, w: 24, d: 30 },
  ],
  landmarks: [
    { kind: "estadio", x: -300, z: -230, name: { pt: "Estádio Mané Garrincha", en: "Mané Garrincha Stadium", es: "Estadio Mané Garrincha" } },
    { kind: "torre", x: -560, z: -60, name: { pt: "Torre de TV", en: "TV Tower", es: "Torre de TV" } },
  ],
  altitude: 1070,
  lots: [
    { name: "Kit 1", price: { pt: "R$ 139,90 + taxas", en: "R$ 139.90 + fees", es: "R$ 139,90 + tasas" }, status: "aberto", items: { pt: "Camisa, número de peito, chip, lanterna de cabeça, medalha e hidratação pós-prova", en: "Shirt, bib, chip, headlamp, medal and post-race drinks", es: "Camiseta, dorsal, chip, linterna frontal, medalla e hidratación post-carrera" } },
    { name: "Kit 2", price: { pt: "R$ 159,90 + taxas", en: "R$ 159.90 + fees", es: "R$ 159,90 + tasas" }, status: "aberto", items: { pt: "Tudo do Kit 1 + pochete", en: "Everything in Kit 1 + waist pack", es: "Todo el Kit 1 + riñonera" } },
    { name: "Kit 3", price: { pt: "R$ 199,90 + taxas", en: "R$ 199.90 + fees", es: "R$ 199,90 + tasas" }, status: "aberto", items: { pt: "Tudo do Kit 2 + jaqueta corta-vento", en: "Everything in Kit 2 + windbreaker", es: "Todo el Kit 2 + rompevientos" } },
  ],
  kit: [{ pt: "Camisa oficial", en: "Official shirt", es: "Camiseta oficial" }, { pt: "Número de peito", en: "Bib", es: "Dorsal" }, { pt: "Chip de cronometragem", en: "Timing chip", es: "Chip de cronometraje" }, { pt: "Lanterna de cabeça", en: "Headlamp", es: "Linterna frontal" }, { pt: "Medalha", en: "Medal", es: "Medalla" }, { pt: "Hidratação pós-prova", en: "Post-race drinks", es: "Hidratación post-carrera" }],
  signup: "https://www.thezombierun.com.br/",
  medal: "/race3d/zombie-run/medalha.png",
  routeNote: { pt: "Traçado aproximado do mapa divulgado pelo evento (5K = 1 volta, 10K = 2 voltas). Postos de água de exemplo.", en: "Approximate layout from the event's published map (5K = 1 lap, 10K = 2 laps). Sample water stations.", es: "Trazado aproximado del mapa publicado por el evento (5K = 1 vuelta, 10K = 2 vueltas). Puestos de agua de ejemplo." },
  lotsNote: { pt: "Kits e valores do post do evento; confira na inscrição oficial.", en: "Kits and prices from the event's post; check the official registration.", es: "Kits y precios del post del evento; confirma en la inscripción oficial." },
  whatsapp: "5561992372216",
  demo: true,
};
