// Programa "Perder barriga em casa" (pedido do dono em 24/11/2026): 4 semanas, sem aparelho, 6 dias por semana.
// Treino intervalado (descanso curto, gasta mais) + abdômen e pernas. A cada semana as repetições sobem ~12%, a
// prancha ganha 10 s e o descanso cai 5 s. O app troca o treino da semana sozinho (syncProgram, ao abrir).
import { store, type DayPlan, type PlanItem, type WeekPlan } from "./data";

export const PROGRAM_WEEKS = 4;

type Base = [PlanItem["ex"], number, number, number]; // exercício, séries, reps (ou segundos), descanso
const B = (name: string, items: Base[]): { name: string; items: Base[] } => ({ name, items });

const BASE: ({ name: string; items: Base[] } | null)[] = [
  null, // domingo: descanso
  B("Queima total", [["jack", 3, 40, 25], ["squat", 3, 15, 25], ["burpee", 3, 8, 30], ["situp", 3, 15, 25], ["plank", 3, 30, 25]]),
  B("Abdômen e pernas", [["lunge", 3, 10, 30], ["bridge", 3, 15, 25], ["situp", 3, 18, 25], ["plank", 3, 35, 25]]),
  B("Cardio leve", [["jack", 4, 50, 25], ["squat", 3, 20, 30], ["bridge", 3, 15, 25]]),
  B("Queima total 2", [["burpee", 4, 8, 30], ["squat", 4, 15, 25], ["pushup", 3, 8, 30], ["plank", 3, 30, 25]]),
  B("Abdômen forte", [["situp", 4, 15, 25], ["bridge", 3, 15, 25], ["plank", 3, 40, 25], ["jack", 3, 40, 25]]),
  B("Desafio do sábado", [["burpee", 3, 10, 30], ["jack", 3, 50, 25], ["squat", 3, 20, 25], ["situp", 3, 20, 25], ["plank", 2, 45, 30]]),
];

/** Treino da semana `w` (1 a 4). Semana 5+ = fase 2 (continua subindo devagar). */
export function programPlan(w: number): WeekPlan {
  const k = Math.max(0, w - 1);
  return BASE.map((d): DayPlan | null => d && {
    name: `${d.name} · sem. ${w}`,
    items: d.items.map(([ex, sets, reps, rest]) => ({
      ex, sets,
      reps: ex === "plank" ? reps + 10 * k : Math.round(reps * (1 + 0.12 * k)),
      rest: Math.max(15, rest - 5 * k),
    })),
  });
}

export function programWeek(start: string): number {
  const [y, m, d] = start.split("-").map(Number);
  const days = Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

/** Ao abrir o app: se virou a semana do programa, troca o treino da semana sozinho. */
export function syncProgram(): boolean {
  const g = store.goals();
  if (!g.program) return false;
  const w = programWeek(g.program.start);
  if (w === g.program.week) return false;
  store.setPlan(programPlan(w));
  store.setGoals({ ...g, program: { ...g.program, week: w } });
  return true;
}

export function startProgram(today: string) {
  const g = store.goals();
  store.setPlan(programPlan(1));
  store.setGoals({ ...g, perWeek: 6, program: { id: "barriga", start: today, week: 1 } });
}

export function stopProgram() {
  const g = store.goals();
  store.setGoals({ ...g, program: undefined });
}

/** Dicas honestas: barriga sai com gasto de energia + comida; treino de abdômen sozinho não queima a gordura dali. */
export const BELLY_TIPS = [
  "Abdominal sozinho não tira barriga. O que queima a gordura é gastar mais do que você come: o treino ajuda a gastar, a comida decide.",
  "Corte refrigerante e suco de caixinha. É açúcar líquido que não mata a fome.",
  "Proteína em toda refeição (ovo, frango, carne, feijão, iogurte) segura a fome por mais tempo.",
  "Monte o prato assim: metade salada e legumes, um quarto proteína, um quarto arroz/batata/macarrão.",
  "Beba 2 a 3 litros de água por dia. Muita gente confunde sede com fome.",
  "Durma 7 a 8 horas. Dormir pouco aumenta a fome e a vontade de doce.",
  "Caminhe todo dia. 7 a 8 mil passos somam muito no fim da semana.",
  "Meça a cintura uma vez por semana, no mesmo dia, de manhã, na altura do umbigo.",
  "Bebida alcoólica atrapalha: além das calorias, dá mais fome e piora o sono.",
  "Não pule o café da manhã se isso te faz exagerar à noite. O total do dia é o que conta.",
  "Mastigue devagar e pare quando estiver satisfeito, não cheio.",
  "Fim de semana conta: exagerar sábado e domingo desfaz a semana.",
  "Prefira comida de verdade a produto de pacote. Quanto menos ingredientes no rótulo, melhor.",
  "A barriga é dos últimos lugares a secar. Se a cintura está caindo, você está no caminho certo.",
];

export function tipOfDay(d = new Date()) {
  const n = Math.floor(d.getTime() / 86400000);
  return BELLY_TIPS[n % BELLY_TIPS.length];
}
