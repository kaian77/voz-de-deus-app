// IA do Cantinho do bebê (chave da Anthropic fica no servidor, função `bebe`):
// - nota fiscal lida pela IA → mesma tela de revisão da leitura do celular;
// - BabyBot: responde só com os dados da família; para adicionar peças pede confirmação.
import * as C from "./cloud";
import { baby, db, esc, save, today, uid, type Cat, type Wardrobe } from "./store";
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

// ---------- móveis do quarto: a família escolhe (só guarda-roupa, só cômoda ou os dois) ou tira foto e a IA copia o quarto
type Room = { pieces: "guarda" | "comoda" | "ambos" | "nenhum"; finish: Wardrobe["finish"]; wall: string; floor: "madeira" | "clara" | "escura"; rug: string; light: "quente" | "fria"; note: string };
const PIECES = [
  { id: "guarda", icon: "🚪", name: "Só guarda-roupa", sub: "cabideiro, prateleiras, 3 gavetas e sapateira" },
  { id: "comoda", icon: "🗄️", name: "Só cômoda", sub: "4 gavetas e porta com cabideiro" },
  { id: "ambos", icon: "🏠", name: "Guarda-roupa e cômoda", sub: "os dois, lado a lado" },
] as const;
const FIN: Record<Wardrobe["finish"], string> = { branco: "Branco", carvalho: "Madeira clara", nogueira: "Madeira escura", rosa: "Rosa antigo", salvia: "Verde sálvia" };

export function roomSetup(v: HTMLElement, head: (t: string, back?: string) => string, toast: (m: string) => void, shrink: (f: Blob, max: number) => Promise<Blob>) {
  const cur = db().wardrobe.pieces;
  const done = () => {
    if (location.hash === "#quarto") window.dispatchEvent(new HashChangeEvent("hashchange"));
    else location.hash = "#quarto";
  };
  v.innerHTML = `${head("Móveis do quarto", cur ? "#quarto" : "#inicio")}
    <p class="lead">O que tem no quarto do bebê? O app monta só o que você tem.</p>
    <div class="pieces">${PIECES.map((p) => `<button class="pc ${cur === p.id ? "on" : ""}" data-p="${p.id}"><span>${p.icon}</span><b>${p.name}</b><small>${p.sub}</small></button>`).join("")}</div>
    <h2>📷 Ou copie o seu quarto pela foto</h2>
    <p class="fine">Tire uma foto do quarto inteiro: a IA vê quais móveis tem, a cor da madeira, da parede, do chão e do tapete, e o quartinho 3D fica parecido. As gavetas e portas continuam as do app.</p>
    <label class="btn big file">📷 Tirar foto do quarto<input type="file" accept="image/*" capture="environment" id="rf"></label>
    <div id="res"></div>`;
  const choose = (p: Wardrobe["pieces"]) => {
    save((d) => (d.wardrobe.pieces = p));
    done();
  };
  v.querySelectorAll<HTMLButtonElement>("[data-p]").forEach((b) => (b.onclick = () => choose(b.dataset.p as Wardrobe["pieces"])));
  (v.querySelector("#rf") as HTMLInputElement).onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const res = v.querySelector("#res") as HTMLElement;
    if (!C.account()) {
      res.innerHTML = `<div class="alert">A leitura da foto usa a IA e precisa da conta. <a href="#conta">Criar conta</a> ou escolha os móveis acima.</div>`;
      return;
    }
    res.innerHTML = `<p class="note">🔎 Olhando o seu quarto…</p>`;
    try {
      const small = await shrink(f, 1280);
      const image = await new Promise<string>((ok, bad) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result));
        fr.onerror = () => bad(fr.error);
        fr.readAsDataURL(small);
      });
      const { room: r } = await C.api<{ room: Room }>("room_ai", { image });
      if (r.pieces === "nenhum") {
        res.innerHTML = `<div class="alert">${esc(r.note || "Não achei guarda-roupa nem cômoda na foto.")} Tente outra foto mostrando os móveis, ou escolha acima.</div>`;
        return;
      }
      const sw = (c: string) => (c ? `<i class="sw" style="background:${c}"></i>` : "");
      res.innerHTML = `<div class="card-form roomres"><p>🤖 ${esc(r.note)}</p>
        <ul><li>Móveis: <b>${PIECES.find((p) => p.id === r.pieces)?.name}</b></li><li>Cor dos móveis: <b>${FIN[r.finish]}</b></li>
        <li>Parede: ${sw(r.wall)}</li><li>Chão: <b>${{ madeira: "madeira", clara: "claro", escura: "escuro" }[r.floor]}</b></li>${r.rug ? `<li>Tapete: ${sw(r.rug)}</li>` : ""}</ul>
        <button class="btn big" id="use">Montar meu quarto assim</button></div>`;
      (v.querySelector("#use") as HTMLButtonElement).onclick = () => {
        save((d) => Object.assign(d.wardrobe, { pieces: r.pieces, finish: r.finish, wall: r.wall, floor: r.floor, rug: r.rug, light: r.light }));
        toast("Quartinho montado 💗");
        done();
      };
    } catch (err) {
      res.innerHTML = `<div class="alert">⚠️ ${esc((err as Error).message)}</div>`;
    }
  };
}
