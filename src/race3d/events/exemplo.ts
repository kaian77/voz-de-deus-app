// Corrida fictícia para demonstração: ida e volta pelo "Eixo" (estilizado, lembra o Eixo Monumental),
// com retorno perto do Congresso e da Torre de TV. Pistas: sul (z = +12, sentido leste) e norte (z = -12).
import type { RaceEvent } from "../types";

const R = 12;
/** Largada em x = 0 na pista sul → retorno leste em `e` → pista norte → retorno oeste em `w` → chegada em x = 0. */
function loop(e: number, w: number): [number, number][] {
  const p: [number, number][] = [];
  for (let x = 0; x < e; x += 60) p.push([x, R]);
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 - (i / 8) * Math.PI;
    p.push([e + Math.cos(a) * R, Math.sin(a) * R]);
  }
  for (let x = e - 60; x > w; x -= 60) p.push([x, -R]);
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 - (i / 8) * Math.PI;
    p.push([w + Math.cos(a) * R, Math.sin(a) * R]);
  }
  for (let x = w + 60; x < 0; x += 60) p.push([x, R]);
  p.push([0, R]);
  return p;
}

export const exemplo: RaceEvent = {
  slug: "exemplo",
  name: { pt: "Corrida Exemplo", en: "Sample Run", es: "Carrera Ejemplo" },
  subtitle: { pt: "Percurso fictício · Brasília", en: "Fictional course · Brasília", es: "Recorrido ficticio · Brasilia" },
  date: { pt: "Domingo", en: "Sunday", es: "Domingo" },
  start: 6,
  colors: { primary: "#ff5a1f", dark: "#0f2238", accent: "#c6ff3d" },
  distances: [
    { id: "10k", label: "10K", km: 10, color: "#2f8cff", wave: 0, runners: 190, pace: [3.3, 8.6], water: [2.5, 5, 7.5], points: loop(620, -342) },
    { id: "5k", label: "5K", km: 5, color: "#ff5a1f", wave: 4, runners: 150, pace: [3.6, 9.4], water: [2.5], points: loop(300, -162) },
  ],
  arena: [
    { id: "largada", icon: "🏁", name: { pt: "Largada e chegada", en: "Start and finish", es: "Largada y llegada" }, info: { pt: "Pórtico na pista sul do Eixo. Os pelotões ficam atrás, separados por ritmo.", en: "Arch on the south lane. Corrals line up behind it, sorted by pace.", es: "Pórtico en el carril sur. Los corrales quedan detrás, separados por ritmo." }, x: 0, z: 12 },
    { id: "kits", icon: "🎽", name: { pt: "Entrega de kits", en: "Packet pickup", es: "Entrega de kits" }, info: { pt: "Sábado das 9h às 18h e no dia, até 5h30. Leve documento com foto.", en: "Saturday 9 am to 6 pm and race day until 5:30 am. Bring a photo ID.", es: "Sábado de 9 a 18 h y el día de la carrera hasta las 5:30. Lleva documento con foto." }, x: -42, z: 46 },
    { id: "guarda", icon: "🎒", name: { pt: "Guarda-volumes", en: "Bag check", es: "Guardarropa" }, info: { pt: "Gratuito, com etiqueta pelo número de peito.", en: "Free, tagged with your bib number.", es: "Gratis, con etiqueta por número de dorsal." }, x: -18, z: 46 },
    { id: "banheiros", icon: "🚻", name: { pt: "Banheiros", en: "Restrooms", es: "Baños" }, info: { pt: "Banheiros químicos na arena e no km 5.", en: "Portable toilets at the venue and at km 5.", es: "Baños químicos en la arena y en el km 5." }, x: 6, z: 46 },
    { id: "pos", icon: "🍌", name: { pt: "Pós-prova", en: "Post-race", es: "Post-carrera" }, info: { pt: "Água, isotônico, frutas e medalha logo depois da chegada.", en: "Water, sports drink, fruit and your medal right after the finish.", es: "Agua, isotónico, frutas y medalla justo después de la llegada." }, x: 30, z: 46 },
    { id: "podio", icon: "🏆", name: { pt: "Pódio", en: "Podium", es: "Podio" }, info: { pt: "Premiação às 7h30 para os 3 primeiros de cada distância.", en: "Awards at 7:30 am for the top 3 of each distance.", es: "Premiación a las 7:30 para los 3 primeros de cada distancia." }, x: 56, z: 46 },
    { id: "estac", icon: "🅿️", name: { pt: "Estacionamento", en: "Parking", es: "Estacionamiento" }, info: { pt: "Estacionamento gratuito ao lado da arena (vagas limitadas).", en: "Free parking next to the venue (limited spots).", es: "Estacionamiento gratis al lado de la arena (lugares limitados)." }, x: 10, z: 92 },
  ],
  landmarks: [
    { kind: "torre", x: -400, z: 0, name: { pt: "Torre de TV", en: "TV Tower", es: "Torre de TV" } },
    { kind: "esplanada", x: 470, z: 0, name: "Esplanada" },
    { kind: "catedral", x: 330, z: 70, name: { pt: "Catedral", en: "Cathedral", es: "Catedral" } },
    { kind: "congresso", x: 720, z: 0, name: { pt: "Congresso", en: "Congress", es: "Congreso" } },
    { kind: "lago", x: 900, z: 0 },
  ],
  altitude: 1095,
  lots: [
    { name: { pt: "1º lote", en: "Early bird", es: "1ª etapa" }, price: { pt: "R$ 89,90", en: "US$ 29", es: "US$ 29" }, status: "esgotado" },
    { name: { pt: "2º lote", en: "Regular", es: "2ª etapa" }, price: { pt: "R$ 109,90", en: "US$ 39", es: "US$ 39" }, status: "aberto" },
    { name: { pt: "3º lote", en: "Late", es: "3ª etapa" }, price: { pt: "R$ 129,90", en: "US$ 49", es: "US$ 49" }, status: "em breve" },
  ],
  kit: [{ pt: "Camiseta", en: "T-shirt", es: "Camiseta" }, { pt: "Número de peito com chip", en: "Bib with timing chip", es: "Dorsal con chip" }, { pt: "Medalha", en: "Medal", es: "Medalla" }, { pt: "Sacola", en: "Bag", es: "Bolsa" }],
  signup: "",
  whatsapp: "5561992372216",
  demo: true,
};
