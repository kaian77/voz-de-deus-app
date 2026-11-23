// Cantinho do bebê: dados salvos no próprio aparelho (localStorage para os registros, IndexedDB para as fotos).
// Tudo passa por aqui; as telas só leem/gravam por estas funções. Backup = exportar/importar JSON.

export type Sex = "" | "menina" | "menino";
export type Baby = {
  id: string; name: string; nick: string; birth: string; sex: Sex;
  weight?: number; length?: number; head?: number; // ao nascer (kg, cm, cm)
  premature: boolean; gaWeeks?: number; notes: string; theme: Theme;
};
export type Theme = "rosa" | "azul" | "salvia" | "lavanda" | "bege";
export type Cat = "roupa" | "sapato" | "fralda" | "higiene" | "brinquedo" | "utensilio" | "remedio" | "movel" | "outro";
export type ItemState = "uso" | "pequeno" | "guardado" | "doacao" | "venda" | "emprestado" | "lembranca";
/** compartimentos do guarda-roupa 3D (cada um ligado aos itens pelo campo `loc`) */
export const COMPARTMENTS = [
  { id: "cabide", name: "Cabideiro", hint: "vestidos, casacos, macacões" },
  { id: "prat1", name: "Prateleira de cima", hint: "cobertores, toalhas" },
  { id: "prat2", name: "Prateleira de baixo", hint: "conjuntos, pijamas" },
  { id: "g1", name: "Gaveta 1", hint: "bodies" },
  { id: "g2", name: "Gaveta 2", hint: "macacões e calças" },
  { id: "g3", name: "Gaveta 3", hint: "meias e acessórios" },
  { id: "sapateira", name: "Sapateira", hint: "sapatinhos" },
] as const;
export type CompId = (typeof COMPARTMENTS)[number]["id"];
export type Item = {
  id: string; babyId: string; name: string; cat: Cat; size: string; color: string; brand: string;
  qty: number; price: number; date: string; state: ItemState; loc: CompId | ""; notes: string;
  photo?: string; // id da foto no IndexedDB
  purchaseId?: string; barcode?: string;
  /** sapato: comprimento interno (cm) */ innerCm?: number;
};
export type PurchaseLine = { desc: string; name: string; cat: Cat; size: string; qty: number; unit: number; total: number; units?: number; itemId?: string; barcode?: string; brand?: string };
export type Purchase = {
  id: string; store: string; cnpj: string; date: string; number: string; key: string; total: number;
  discount: number; lines: PurchaseLine[]; source: "xml" | "foto" | "texto" | "manual" | "qr"; createdAt: string;
  returned?: { date: string; value: number; note: string }[];
};
export type Sleep = { id: string; babyId: string; start: string; end?: string; night?: boolean; wakes?: number };
export type Measure = { id: string; babyId: string; date: string; weight?: number; length?: number; head?: number; foot?: number; notes?: string };
export type DiaperLog = { id: string; babyId: string; date: string; qty: number };
export type Event = { id: string; babyId: string; date: string; time: string; title: string; kind: "consulta" | "vacina" | "remedio" | "compra" | "outro"; notes: string };
export type Med = { id: string; babyId: string; name: string; dose: string; times: string[]; until: string; notes: string; given: string[] };
export type Wardrobe = { finish: "branco" | "carvalho" | "nogueira" | "rosa" | "salvia"; light: "quente" | "fria" };
export type Data = {
  v: 1; babies: Baby[]; current: string; items: Item[]; purchases: Purchase[]; sleeps: Sleep[];
  measures: Measure[]; diapers: DiaperLog[]; events: Event[]; meds: Med[]; wardrobe: Wardrobe; budget: number;
  barcodes: Record<string, { name: string; cat: Cat; brand: string; size: string }>;
};

const KEY = "cb_data";
const empty = (): Data => ({
  v: 1, babies: [], current: "", items: [], purchases: [], sleeps: [], measures: [], diapers: [], events: [], meds: [],
  wardrobe: { finish: "branco", light: "quente" }, budget: 0, barcodes: {},
});
let data: Data = load();
const subs = new Set<() => void>();

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Data) };
  } catch {
    /* sem armazenamento: começa vazio */
  }
  return empty();
}
export const db = () => data;
export function save(mut?: (d: Data) => void) {
  if (mut) mut(data);
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    alert("Não consegui salvar no aparelho (memória cheia?). Faça um backup em Mais → Backup.");
  }
  subs.forEach((f) => f());
}
export const onChange = (f: () => void) => (subs.add(f), () => subs.delete(f));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const baby = () => data.babies.find((b) => b.id === data.current) ?? data.babies[0];
export const today = () => new Date().toISOString().slice(0, 10);
export const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ---------- idade
export function age(birth: string, at = new Date()) {
  const b = new Date(birth + "T12:00:00");
  let m = (at.getFullYear() - b.getFullYear()) * 12 + at.getMonth() - b.getMonth();
  let anchor = new Date(b.getFullYear(), b.getMonth() + m, b.getDate(), 12);
  if (anchor > at) {
    m--;
    anchor = new Date(b.getFullYear(), b.getMonth() + m, b.getDate(), 12);
  }
  const days = Math.floor((at.getTime() - anchor.getTime()) / 864e5);
  const totalDays = Math.floor((at.getTime() - b.getTime()) / 864e5);
  const next = new Date(b.getFullYear(), b.getMonth() + m + 1, b.getDate(), 12);
  return { months: m, days, totalDays, weeks: Math.floor(totalDays / 7), nextMonthversary: next, toNext: Math.ceil((next.getTime() - at.getTime()) / 864e5) };
}
export function ageText(birth: string) {
  const a = age(birth);
  if (a.totalDays < 0) return "ainda vai nascer";
  if (a.months === 0) return `${a.totalDays} ${a.totalDays === 1 ? "dia" : "dias"}`;
  const y = Math.floor(a.months / 12), m = a.months % 12;
  const parts = [];
  if (y) parts.push(`${y} ${y === 1 ? "ano" : "anos"}`);
  if (m) parts.push(`${m} ${m === 1 ? "mês" : "meses"}`);
  if (a.days) parts.push(`${a.days} ${a.days === 1 ? "dia" : "dias"}`);
  return parts.join(", ").replace(/, ([^,]*)$/, " e $1");
}

// ---------- fraldas: estoque e quanto dura
export function diaperStock(babyId: string) {
  const stock = data.items.filter((i) => i.babyId === babyId && i.cat === "fralda").reduce((s, i) => s + i.qty, 0);
  const since = Date.now() - 7 * 864e5;
  const used = data.diapers.filter((d) => d.babyId === babyId && new Date(d.date).getTime() >= since);
  const days = used.length ? Math.max(1, Math.min(7, Math.ceil((Date.now() - Math.min(...used.map((u) => new Date(u.date).getTime()))) / 864e5))) : 0;
  const perDay = days ? used.reduce((s, u) => s + u.qty, 0) / days : 0;
  return { stock, perDay, daysLeft: perDay ? Math.floor(stock / perDay) : null };
}
/** gasta fraldas do estoque (das de tamanho mais usado primeiro) */
export function spendDiapers(babyId: string, qty: number) {
  save((d) => {
    d.diapers.push({ id: uid(), babyId, date: new Date().toISOString(), qty });
    let left = qty;
    for (const it of d.items.filter((i) => i.babyId === babyId && i.cat === "fralda" && i.qty > 0).sort((a, b) => a.date.localeCompare(b.date))) {
      const take = Math.min(it.qty, left);
      it.qty -= take;
      left -= take;
      if (!left) break;
    }
  });
}

// ---------- tamanhos: alerta para conferir (nunca afirma que não serve; usa idade E medida mais recente)
const SIZE_HINT: Record<string, { months: number; kg: number }> = { RN: { months: 1, kg: 4 }, P: { months: 3, kg: 6 }, M: { months: 6, kg: 8.5 }, G: { months: 9, kg: 11 }, GG: { months: 12, kg: 12.5 } };
export function sizeAlerts(b: Baby) {
  const a = age(b.birth);
  const last = data.measures.filter((m) => m.babyId === b.id && m.weight).sort((x, y) => y.date.localeCompare(x.date))[0];
  const kg = last?.weight;
  return data.items.filter((i) => {
    if (i.babyId !== b.id || i.cat !== "roupa" || i.state !== "uso") return false;
    const h = SIZE_HINT[i.size.toUpperCase()];
    if (!h) return false;
    return a.months >= h.months || (kg !== undefined && kg >= h.kg);
  });
}
export function shoeAlerts(b: Baby) {
  const foot = data.measures.filter((m) => m.babyId === b.id && m.foot).sort((x, y) => y.date.localeCompare(x.date))[0]?.foot;
  if (!foot) return [];
  // folga de menos de 1 cm entre o pé e o sapato = hora de conferir
  return data.items.filter((i) => i.babyId === b.id && i.cat === "sapato" && i.state === "uso" && i.innerCm && i.innerCm - foot < 1);
}

// ---------- sono
export function sleepToday(babyId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return data.sleeps.filter((s) => s.babyId === babyId && s.end).reduce((sum, s) => {
    const a = Math.max(new Date(s.start).getTime(), start.getTime()), z = new Date(s.end!).getTime();
    return sum + Math.max(0, z - a);
  }, 0);
}
export const dur = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
};

// ---------- gastos
export function spent(from: string, to: string) {
  return data.purchases.filter((p) => p.date >= from && p.date <= to).reduce((s, p) => s + p.total - (p.returned ?? []).reduce((r, x) => r + x.value, 0), 0);
}

// ---------- fotos (IndexedDB)
function idb(): Promise<IDBDatabase> {
  return new Promise((ok, bad) => {
    const r = indexedDB.open("cantinho", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("fotos");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
}
export async function putPhoto(blob: Blob) {
  const id = uid();
  const d = await idb();
  await new Promise((ok, bad) => {
    const t = d.transaction("fotos", "readwrite");
    t.objectStore("fotos").put(blob, id);
    t.oncomplete = ok;
    t.onerror = () => bad(t.error);
  });
  return id;
}
const urls = new Map<string, string>();
export async function photoUrl(id: string) {
  if (urls.has(id)) return urls.get(id)!;
  const d = await idb();
  const blob = await new Promise<Blob | undefined>((ok) => {
    const r = d.transaction("fotos").objectStore("fotos").get(id);
    r.onsuccess = () => ok(r.result as Blob | undefined);
    r.onerror = () => ok(undefined);
  });
  if (!blob) return "";
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}
/** reduz a foto (lado maior 900 px, JPEG) antes de guardar */
export function shrink(file: Blob, max = 900): Promise<Blob> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.82);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => ok(file);
    img.src = URL.createObjectURL(file);
  });
}

// ---------- backup
export function exportJson() {
  return new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
}
export function importJson(text: string) {
  const d = JSON.parse(text) as Data;
  if (d.v !== 1 || !Array.isArray(d.babies)) throw new Error("Arquivo não é um backup do Cantinho do bebê.");
  data = { ...empty(), ...d };
  save();
}
export function resetAll() {
  data = empty();
  save();
}
