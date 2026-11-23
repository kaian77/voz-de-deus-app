// IA do Cantinho do bebê (chave da Anthropic fica no servidor, função `bebe`):
// - nota fiscal lida pela IA → mesma tela de revisão da leitura do celular;
// - BabyBot: responde só com os dados da família; para adicionar peças pede confirmação.
import * as C from "./cloud";
import { baby, esc, save, today, uid, type Cat } from "./store";
import type { Parsed } from "./receipt";

export type AiReceipt = {
  store: string; cnpj: string; date: string; number: string; key: string; total: number; discount: number; warnings: string[];
  items: { desc: string; name: string; cat: Cat; size: string; qty: number; units: number | null; unit: number; total: number; brand: string; unsure: string[] }[];
};
export function fromAi(r: AiReceipt): Parsed {
  return {
    store: r.store,
    cnpj: r.cnpj.replace(/\D/g, ""),
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : "",
    number: r.number,
    key: /^\d{44}$/.test(r.key) ? r.key : "",
    total: r.total || 0,
    discount: r.discount || 0,
    warnings: r.warnings,
    lines: r.items.map((i) => ({
      desc: i.desc, name: i.name, cat: i.cat, size: i.size, qty: Math.max(1, Math.round(i.qty) || 1), units: i.units ?? undefined,
      unit: i.unit || 0, total: i.total || 0, brand: i.brand, low: i.unsure,
    })),
  };
}
/** Manda a foto (reduzida) para a IA ler. */
export async function readReceiptAi(file: Blob, shrink: (f: Blob, max: number) => Promise<Blob>) {
  const small = await shrink(file, 1600);
  const image = await new Promise<string>((ok, bad) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.onerror = () => bad(fr.error);
    fr.readAsDataURL(small);
  });
  const { receipt } = await C.api<{ receipt: AiReceipt }>("receipt_ai", { image });
  return fromAi(receipt);
}

type Add = { name: string; cat: Cat; size: string; color: string; qty: number };
type BotMsg = { q: string; a: string; add?: Add[] };
const botLog: BotMsg[] = [];
const TIPS = ["Onde estão os bodies tamanho M?", "Quantas fraldas eu tenho?", "Quanto gastei este mês?", "Quais roupas podem estar pequenas?", "Monte uma mala para 3 dias", "O que falta no enxoval?"];

export function babybotPage(v: HTMLElement, head: (t: string, back?: string) => string, toast: (m: string) => void) {
  const a = C.account();
  if (!a?.family) {
    v.innerHTML = `${head("BabyBot", "#inicio")}<div class="bot-hero">🤖</div>
      <p class="lead center">Pergunte "onde estão os bodies M?", "quanto gastei este mês?", "monte uma mala para 3 dias"…</p>
      <div class="alert">O BabyBot usa os dados da família na nuvem. <a href="#conta">Crie a conta e a família</a> para usar.</div>`;
    return;
  }
  const fam = a.family;
  const draw = () => {
    const name = baby()?.nick || baby()?.name || "bebê";
    v.innerHTML = `${head("BabyBot", "#inicio")}
      <div class="chat" id="chat">${botLog.length ? "" : `<div class="msg bot">Oi! 💗 Eu conheço tudo que está cadastrado do(a) ${esc(name)}. Pergunte o que quiser.</div>`}
      ${botLog.map((m, i) => `<div class="msg me">${esc(m.q)}</div><div class="msg bot">${esc(m.a).split("\n").join("<br>")}${m.add?.length ? `<div class="add">${m.add.map((x) => `<span>${x.qty}× ${esc(x.name)}${x.size ? ` ${esc(x.size)}` : ""}${x.color ? ` · ${esc(x.color)}` : ""}</span>`).join("")}<button class="btn" data-add="${i}">✓ Confirmar e adicionar</button></div>` : ""}</div>`).join("")}</div>
      ${botLog.length ? "" : `<div class="tips">${TIPS.map((t) => `<button data-tip="${esc(t)}">${esc(t)}</button>`).join("")}</div>`}
      <form class="ask" id="ask"><input id="q" placeholder="Pergunte ao BabyBot…" maxlength="500" autocomplete="off"><button aria-label="Enviar">➤</button></form>
      <p class="fine center">O BabyBot só usa o que está no app e não dá orientação médica.</p>`;
    window.scrollTo(0, document.body.scrollHeight);
    v.querySelectorAll<HTMLButtonElement>("[data-tip]").forEach((x) => (x.onclick = () => ask(x.dataset.tip!)));
    v.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((x) => (x.onclick = () => {
      const m = botLog[Number(x.dataset.add)];
      const b = baby()!;
      save((d) => {
        for (const it of m.add ?? [])
          d.items.push({ id: uid(), babyId: b.id, name: it.name, cat: it.cat, size: it.size.toUpperCase(), color: it.color.toLowerCase(), brand: "", qty: Math.max(1, Math.round(it.qty)), price: 0, date: today(), state: "uso", loc: "", notes: "" });
      });
      m.add = [];
      m.a += "\n\n✓ Adicionado!";
      toast("Adicionado ao inventário 💗");
      draw();
    }));
    (v.querySelector("#ask") as HTMLFormElement).onsubmit = (e) => {
      e.preventDefault();
      const q = (v.querySelector("#q") as HTMLInputElement).value.trim();
      if (q) void ask(q);
    };
  };
  const ask = async (q: string) => {
    botLog.push({ q, a: "…" });
    draw();
    try {
      await C.sync(); // a nuvem precisa ter o que acabou de ser anotado
      const r = await C.api<{ answer: string; add: Add[] }>("babybot", { family: fam.id, baby: baby()?.id, question: q, history: botLog.slice(0, -1).map(({ q: qq, a: aa }) => ({ q: qq, a: aa })) });
      botLog[botLog.length - 1] = { q, a: r.answer, add: r.add };
    } catch (err) {
      botLog[botLog.length - 1] = { q, a: `⚠️ ${(err as Error).message}` };
    }
    draw();
  };
  draw();
}
