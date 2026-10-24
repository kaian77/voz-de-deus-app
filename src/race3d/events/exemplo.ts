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
  name: "Corrida Exemplo",
  subtitle: "Percurso fictício · Brasília",
  date: "Domingo",
  start: 6,
  colors: { primary: "#ff5a1f", dark: "#0f2238", accent: "#c6ff3d" },
  distances: [
    { id: "10k", label: "10K", km: 10, color: "#2f8cff", wave: 0, runners: 190, pace: [3.3, 8.6], water: [2.5, 5, 7.5], points: loop(620, -342) },
    { id: "5k", label: "5K", km: 5, color: "#ff5a1f", wave: 4, runners: 150, pace: [3.6, 9.4], water: [2.5], points: loop(300, -162) },
  ],
  arena: [
    { id: "largada", icon: "🏁", name: "Largada e chegada", info: "Pórtico na pista sul do Eixo. Os pelotões ficam atrás, separados por ritmo.", x: 0, z: 12 },
    { id: "kits", icon: "🎽", name: "Entrega de kits", info: "Sábado das 9h às 18h e no dia, até 5h30. Leve documento com foto.", x: -42, z: 46 },
    { id: "guarda", icon: "🎒", name: "Guarda-volumes", info: "Gratuito, com etiqueta pelo número de peito.", x: -18, z: 46 },
    { id: "banheiros", icon: "🚻", name: "Banheiros", info: "Banheiros químicos na arena e no km 5.", x: 6, z: 46 },
    { id: "pos", icon: "🍌", name: "Pós-prova", info: "Água, isotônico, frutas e medalha logo depois da chegada.", x: 30, z: 46 },
    { id: "podio", icon: "🏆", name: "Pódio", info: "Premiação às 7h30 para os 3 primeiros de cada distância.", x: 56, z: 46 },
    { id: "estac", icon: "🅿️", name: "Estacionamento", info: "Estacionamento gratuito ao lado da arena (vagas limitadas).", x: 10, z: 92 },
  ],
  landmarks: [
    { kind: "torre", x: -400, z: 0, name: "Torre de TV" },
    { kind: "esplanada", x: 470, z: 0, name: "Esplanada" },
    { kind: "catedral", x: 330, z: 70, name: "Catedral" },
    { kind: "congresso", x: 720, z: 0, name: "Congresso" },
    { kind: "lago", x: 900, z: 0 },
  ],
  altitude: 1095,
  lots: [
    { name: "1º lote", price: "R$ 89,90", status: "esgotado" },
    { name: "2º lote", price: "R$ 109,90", status: "aberto" },
    { name: "3º lote", price: "R$ 129,90", status: "em breve" },
  ],
  kit: ["Camiseta", "Número de peito com chip", "Medalha", "Sacola"],
  signup: "",
  whatsapp: "5561992372216",
  demo: true,
};
