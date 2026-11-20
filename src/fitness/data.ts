// Dados do app de treino: exercícios, treinos por dia da semana, histórico, metas e peso.
// Tudo fica neste aparelho (localStorage); as gravações ficam no IndexedDB (rec.ts).

export type ExId =
  | "squat" | "pushup" | "pullup" | "curl" | "press" | "lunge" | "plank" | "lateral" | "bridge" | "jack"
  | "stiff" | "row" | "burpee" | "situp";

export interface ExerciseInfo {
  id: ExId;
  name: string;
  /** Posição do celular para a câmera ler direito. */
  view: "lado" | "frente";
  /** Exercício contado em segundos (prancha) em vez de repetições. */
  timed?: boolean;
  muscles: string;
  tips: string[];
  emoji: string;
}

export const EXERCISES: Record<ExId, ExerciseInfo> = {
  squat: { id: "squat", name: "Agachamento", view: "lado", muscles: "Pernas e glúteo", emoji: "🦵",
    tips: ["Desça até a coxa ficar paralela ao chão", "Peito para cima, costas retas", "Joelhos na linha dos pés", "Peso no calcanhar"] },
  pushup: { id: "pushup", name: "Flexão", view: "lado", muscles: "Peito, ombro e tríceps", emoji: "💪",
    tips: ["Corpo reto da cabeça ao pé", "Desça até o cotovelo passar de 90°", "Estique os braços lá em cima"] },
  pullup: { id: "pullup", name: "Barra fixa", view: "frente", muscles: "Costas e bíceps", emoji: "🏋️",
    tips: ["Queixo passa da barra em toda repetição", "Estique os braços embaixo", "Sem balançar o corpo"] },
  curl: { id: "curl", name: "Rosca direta", view: "lado", muscles: "Bíceps", emoji: "💪",
    tips: ["Cotovelo colado no corpo", "Suba até o fim e desça devagar", "Não jogue o tronco"] },
  press: { id: "press", name: "Desenvolvimento", view: "frente", muscles: "Ombro e tríceps", emoji: "🙌",
    tips: ["Estique os braços em cima da cabeça", "Desça até a altura das orelhas", "Os dois braços juntos"] },
  lunge: { id: "lunge", name: "Afundo", view: "lado", muscles: "Pernas e glúteo", emoji: "🚶",
    tips: ["Joelho da frente a 90°", "Tronco reto", "Joelho de trás quase no chão"] },
  plank: { id: "plank", name: "Prancha", view: "lado", timed: true, muscles: "Abdômen", emoji: "🧱",
    tips: ["Corpo reto como uma tábua", "Não deixe o quadril cair", "Não empine o bumbum"] },
  lateral: { id: "lateral", name: "Elevação lateral", view: "frente", muscles: "Ombro", emoji: "🕊️",
    tips: ["Suba até a linha do ombro", "Não passe muito do ombro", "Cotovelo levemente dobrado"] },
  bridge: { id: "bridge", name: "Elevação de quadril", view: "lado", muscles: "Glúteo", emoji: "🍑",
    tips: ["Suba até o corpo ficar reto do ombro ao joelho", "Aperte o glúteo lá em cima"] },
  stiff: { id: "stiff", name: "Stiff", view: "lado", muscles: "Posterior de coxa e glúteo", emoji: "🏋️",
    tips: ["Quadril vai para trás", "Joelho quase esticado", "Costas retas, peso perto da perna", "Desça até o tronco ficar quase paralelo ao chão"] },
  row: { id: "row", name: "Remada curvada", view: "lado", muscles: "Costas", emoji: "🚣",
    tips: ["Tronco inclinado à frente e parado", "Puxe o peso até a barriga", "Cotovelo passa do corpo", "Estique o braço embaixo"] },
  burpee: { id: "burpee", name: "Burpee", view: "lado", muscles: "Corpo todo e cardio", emoji: "🔥",
    tips: ["Agacha e põe as mãos no chão", "Joga as pernas para trás até a prancha", "Volta e levanta com um pulo"] },
  situp: { id: "situp", name: "Abdominal", view: "lado", muscles: "Abdômen", emoji: "🧘",
    tips: ["Deitado, joelhos dobrados", "Suba o tronco até perto dos joelhos", "Desça devagar até as costas no chão", "Não puxe a cabeça com as mãos"] },
  jack: { id: "jack", name: "Polichinelo", view: "frente", muscles: "Cardio", emoji: "⭐",
    tips: ["Mãos se encontram em cima da cabeça", "Pés abrem mais que o ombro"] },
};

export interface PlanItem {
  ex: ExId;
  sets: number;
  /** Repetições (ou segundos, no exercício de tempo). */
  reps: number;
  rest: number;
  /** Carga em kg (opcional, só para anotar). */
  kg?: number;
}

export interface DayPlan { name: string; items: PlanItem[] }

/** 0 = domingo … 6 = sábado. Dia sem treino = null. */
export type WeekPlan = (DayPlan | null)[];

export interface SetLog { reps: number; good: number; secs?: number; issues: string[] }
export interface ExLog { ex: ExId; target: number; kg?: number; sets: SetLog[] }
export interface Session {
  id: string;
  date: string; // AAAA-MM-DD
  started: number;
  ended: number;
  name: string;
  exercises: ExLog[];
}

export interface Goals { perWeek: number; targetKg?: number; monthlyReps: number }
export interface WeightLog { date: string; kg: number }

export const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];

const DEFAULT_PLAN: WeekPlan = [
  null,
  { name: "Pernas", items: [
    { ex: "squat", sets: 4, reps: 12, rest: 60 },
    { ex: "lunge", sets: 3, reps: 10, rest: 45 },
    { ex: "bridge", sets: 3, reps: 15, rest: 45 },
  ] },
  { name: "Peito e ombro", items: [
    { ex: "pushup", sets: 4, reps: 10, rest: 60 },
    { ex: "press", sets: 3, reps: 12, rest: 60 },
    { ex: "lateral", sets: 3, reps: 12, rest: 45 },
  ] },
  { name: "Costas e bíceps", items: [
    { ex: "pullup", sets: 4, reps: 6, rest: 90 },
    { ex: "curl", sets: 3, reps: 12, rest: 60 },
  ] },
  { name: "Abdômen e cardio", items: [
    { ex: "jack", sets: 3, reps: 30, rest: 30 },
    { ex: "plank", sets: 3, reps: 40, rest: 30 },
  ] },
  { name: "Corpo todo", items: [
    { ex: "squat", sets: 3, reps: 15, rest: 45 },
    { ex: "pushup", sets: 3, reps: 12, rest: 45 },
    { ex: "pullup", sets: 3, reps: 5, rest: 60 },
    { ex: "plank", sets: 2, reps: 45, rest: 30 },
  ] },
  null,
];

const K = { plan: "forma_plan", hist: "forma_hist", goals: "forma_goals", weight: "forma_weight", prefs: "forma_prefs" };

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
/** Avisado a cada gravação (a nuvem sobe as mudanças). */
export const onSave: { fn: ((key: string) => void) | null } = { fn: null };

function save(key: string, v: unknown, silent = false) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sem espaço ou bloqueado */ }
  if (!silent) onSave.fn?.(key);
}

export const store = {
  plan: (): WeekPlan => load(K.plan, DEFAULT_PLAN),
  setPlan: (p: WeekPlan) => save(K.plan, p),
  history: (): Session[] => load(K.hist, [] as Session[]),
  addSession: (s: Session) => save(K.hist, [s, ...store.history()].slice(0, 1000)),
  removeSession: (id: string) => save(K.hist, store.history().filter((s) => s.id !== id)),
  goals: (): Goals => load(K.goals, { perWeek: 4, monthlyReps: 1500 } as Goals),
  setGoals: (g: Goals) => save(K.goals, g),
  weights: (): WeightLog[] => load(K.weight, [] as WeightLog[]),
  addWeight: (w: WeightLog) => save(K.weight, [...store.weights().filter((x) => x.date !== w.date), w].sort((a, b) => a.date.localeCompare(b.date))),
  prefs: (): Prefs => ({ ...DEFAULT_PREFS, ...load(K.prefs, {}) }),
  setPrefs: (p: Prefs) => save(K.prefs, p),
  /** Grava o que veio da nuvem sem disparar outro envio. */
  replace: (d: { plan?: WeekPlan; goals?: Goals; weights?: WeightLog[]; prefs?: Partial<Prefs>; history?: Session[] }) => {
    if (d.plan) save(K.plan, d.plan, true);
    if (d.goals) save(K.goals, d.goals, true);
    if (d.weights) save(K.weight, d.weights, true);
    if (d.prefs) save(K.prefs, { ...store.prefs(), ...d.prefs }, true);
    if (d.history) save(K.hist, d.history.slice(0, 1000), true);
  },
};

export interface Prefs { voice: boolean; record: boolean; strictPullup: boolean; countdown: number; name: string; laugh: boolean }
const DEFAULT_PREFS: Prefs = { voice: true, record: true, strictPullup: true, countdown: 5, name: "", laugh: true };

export function today(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function parseDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Início da semana (segunda-feira). */
export function weekStart(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function totalReps(s: Session) {
  return s.exercises.reduce((a, e) => a + (EXERCISES[e.ex].timed ? 0 : e.sets.reduce((b, x) => b + x.reps, 0)), 0);
}

export function formScore(s: Session) {
  let all = 0, good = 0;
  for (const e of s.exercises) for (const x of e.sets) { all += x.reps; good += x.good; }
  return all ? Math.round((good / all) * 100) : 0;
}

/** Dias seguidos (contando hoje ou ontem) com treino feito. */
export function streak(hist: Session[]): number {
  const days = new Set(hist.map((s) => s.date));
  const d = new Date();
  if (!days.has(today(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(today(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** Recorde de cada exercício: mais repetições boas numa série (ou mais segundos). */
export function records(hist: Session[]): Partial<Record<ExId, number>> {
  const r: Partial<Record<ExId, number>> = {};
  for (const s of hist) for (const e of s.exercises) for (const x of e.sets) {
    const v = EXERCISES[e.ex].timed ? x.secs ?? 0 : x.good;
    if (v > (r[e.ex] ?? 0)) r[e.ex] = v;
  }
  return r;
}

/** Sugestão de progressão: se as últimas 2 vezes bateram a meta com boa forma, sobe. */
export function suggestion(hist: Session[], item: PlanItem): string | null {
  const last = hist.filter((s) => s.exercises.some((e) => e.ex === item.ex)).slice(0, 2);
  if (last.length < 2) return null;
  const ok = last.every((s) => {
    const e = s.exercises.find((x) => x.ex === item.ex)!;
    return e.sets.length >= item.sets && e.sets.every((x) => (EXERCISES[item.ex].timed ? (x.secs ?? 0) : x.good) >= item.reps);
  });
  if (!ok) return null;
  if (EXERCISES[item.ex].timed) return `Você está mandando bem: tente ${item.reps + 10}s`;
  if (item.kg) return `Você está mandando bem: tente ${item.kg + 2} kg`;
  return `Você está mandando bem: tente ${item.reps + 2} repetições`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
