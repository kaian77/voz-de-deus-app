// IA do Cantinho do bebê (chave da Anthropic fica no servidor, função `bebe`):
// - nota fiscal lida pela IA → mesma tela de revisão da leitura do celular;
// - BabyBot: responde só com os dados da família; para adicionar peças pede confirmação.
import * as C from "./cloud";
import { baby, db, esc, save, today, uid, type Cat, type DecorKind, type Wardrobe } from "./store";
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
type Room = {
  pieces: "guarda" | "comoda" | "ambos" | "nenhum"; finish: Wardrobe["finish"]; wall: string; wall2: string; pattern: NonNullable<Wardrobe["pattern"]>;
  wall_text: string; text_color: string; floor: "madeira" | "clara" | "escura"; rug: string; light: "quente" | "fria"; decor: { kind: DecorKind; color: string }[]; note: string;
};
const DECOR_NAME: Record<DecorKind, string> = {
  berco: "berço", poltrona: "poltrona", janela: "janela com cortina", quadros: "quadros", prateleira: "prateleira", nuvens: "nuvens", estrelas: "estrelas",
  baloes: "balões", luminaria: "luminária", mobile: "móbile", cesto: "cesto", pelucia: "pelúcia", planta: "planta", trocador: "trocador",
};
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
    <h2>📷 Ou copie o seu quarto pelas fotos</h2>
    <p class="fine">Tire até 6 fotos de cantos diferentes do quarto. A IA vê os móveis, as cores (madeira, parede, chão, tapete), o nome na parede, berço, poltrona, cortina, quadros, nuvens, balões e o resto, e o quartinho 3D fica igual. As gavetas e portas continuam as do app.</p>
    <div class="thumbs" id="thumbs"></div>
    <button class="btn big" id="go" hidden></button>
    <div id="res"></div>`;
  const choose = (p: Wardrobe["pieces"]) => {
    save((d) => (d.wardrobe.pieces = p));
    done();
  };
  v.querySelectorAll<HTMLButtonElement>("[data-p]").forEach((b) => (b.onclick = () => choose(b.dataset.p as Wardrobe["pieces"])));
  // até 6 fotos (de cantos diferentes): a IA junta tudo numa descrição só
  const shots: { blob: Blob; url: string }[] = [];
  const res = v.querySelector("#res") as HTMLElement;
  const thumbs = v.querySelector("#thumbs") as HTMLElement;
  const drawThumbs = () => {
    thumbs.innerHTML = shots.map((x, k) => `<div class="th" style="background-image:url(${x.url})"><button class="x" data-rm="${k}">✕</button></div>`).join("")
      + (shots.length < 6 ? `<label class="th add">＋<br><small>${shots.length ? "mais um canto" : "1ª foto"}</small><input type="file" accept="image/*" multiple id="rf"></label>` : "");
    (v.querySelector("#go") as HTMLButtonElement).hidden = !shots.length;
    (v.querySelector("#go") as HTMLButtonElement).textContent = `🔎 Montar meu quarto (${shots.length} ${shots.length === 1 ? "foto" : "fotos"})`;
    thumbs.querySelectorAll<HTMLButtonElement>("[data-rm]").forEach((b) => (b.onclick = () => {
      URL.revokeObjectURL(shots[Number(b.dataset.rm)].url);
      shots.splice(Number(b.dataset.rm), 1);
      drawThumbs();
    }));
    const inp = thumbs.querySelector("#rf") as HTMLInputElement | null;
    if (inp) inp.onchange = async () => {
      for (const f of [...(inp.files ?? [])].slice(0, 6 - shots.length)) {
        const blob = await shrink(f, 1024);
        shots.push({ blob, url: URL.createObjectURL(blob) });
      }
      drawThumbs();
    };
  };
  drawThumbs();
  (v.querySelector("#go") as HTMLButtonElement).onclick = async () => {
    if (!C.account()) {
      res.innerHTML = `<div class="alert">A leitura das fotos usa a IA e precisa da conta. <a href="#conta">Criar conta</a> ou escolha os móveis acima.</div>`;
      return;
    }
    res.innerHTML = `<p class="note">🔎 Olhando o seu quarto (${shots.length} ${shots.length === 1 ? "foto" : "fotos"})…</p>`;
    try {
      const images = await Promise.all(shots.map((x) => new Promise<string>((ok, bad) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result));
        fr.onerror = () => bad(fr.error);
        fr.readAsDataURL(x.blob);
      })));
      const { room: r } = await C.api<{ room: Room }>("room_ai", { images });
      if (r.pieces === "nenhum") {
        res.innerHTML = `<div class="alert">${esc(r.note || "Não achei guarda-roupa nem cômoda nas fotos.")} Tente fotos mostrando os móveis, ou escolha acima.</div>`;
        return;
      }
      const sw = (c: string) => (c ? `<i class="sw" style="background:${c}"></i>` : "");
      res.innerHTML = `<div class="card-form roomres"><p>🤖 ${esc(r.note)}</p>
        <ul><li>Móveis: <b>${PIECES.find((p) => p.id === r.pieces)?.name}</b></li><li>Cor dos móveis: <b>${FIN[r.finish]}</b></li>
        <li>Parede: ${sw(r.wall)}${r.pattern !== "lisa" && r.wall2 ? ` ${{ listras: "listrada", poa: "de bolinhas", xadrez: "xadrez", meia: "meia parede", lisa: "" }[r.pattern]} ${sw(r.wall2)}` : ""}</li>
        ${r.wall_text ? `<li>Nome na parede: <b style="color:${r.text_color || "inherit"}">${esc(r.wall_text)}</b></li>` : ""}
        <li>Chão: <b>${{ madeira: "madeira", clara: "claro", escura: "escuro" }[r.floor]}</b>${r.rug ? ` · tapete ${sw(r.rug)}` : ""}</li>
        ${r.decor.length ? `<li>Também: ${r.decor.map((d) => `${sw(d.color)} ${DECOR_NAME[d.kind]}`).join(", ")}</li>` : ""}</ul>
        <button class="btn big" id="use">Montar meu quarto assim</button></div>`;
      (v.querySelector("#use") as HTMLButtonElement).onclick = () => {
        save((d) => Object.assign(d.wardrobe, {
          pieces: r.pieces, finish: r.finish, wall: r.wall, floor: r.floor, rug: r.rug, light: r.light,
          wall2: r.wall2, pattern: r.pattern, wallText: r.wall_text, textColor: r.text_color, decor: r.decor,
        }));
        toast("Quartinho montado 💗");
        done();
      };
    } catch (err) {
      res.innerHTML = `<div class="alert">⚠️ ${esc((err as Error).message)}</div>`;
    }
  };
}
