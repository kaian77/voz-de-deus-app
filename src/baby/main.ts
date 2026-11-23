// Cantinho do bebê (/bebe): app instalável para organizar tudo do bebê. Dados no próprio aparelho (store.ts),
// guarda-roupa 3D ligado ao inventário (wardrobe3d.ts) e cadastro de compras pela nota fiscal (receipt.ts).
import "./style.css";
import {
  COMPARTMENTS, comps, age, ageText, isDrawer, slotFor, slotNames, slotOf, baby, db, diaperStock, dur, esc, exportJson, importJson, money, onChange, photoUrl, putPhoto,
  resetAll, save, shoeAlerts, shrink, sizeAlerts, sleepToday, spent, today, uid, spendDiapers,
  type Baby, type Cat, type CompId, type Item, type ItemState, type Purchase, type Theme,
} from "./store";
import { keyInfo, ocr, parseQr, parseText, parseXml, type Line, type Parsed } from "./receipt";
import { Wardrobe3D, colorOf, webglOk } from "./wardrobe3d";
import * as C from "./cloud";
import { babybotPage, readReceiptAi, roomSetup } from "./bot";
import { labels, memories, paywall, report, shopping } from "./extras";

const $ = <E extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as E;
const $$ = <E extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as E[];
const CATS: { id: Cat; name: string; icon: string }[] = [
  { id: "roupa", name: "Roupas", icon: "👕" }, { id: "sapato", name: "Sapatos", icon: "👟" }, { id: "fralda", name: "Fraldas", icon: "🧷" },
  { id: "higiene", name: "Higiene", icon: "🧴" }, { id: "brinquedo", name: "Brinquedos", icon: "🧸" }, { id: "utensilio", name: "Utensílios", icon: "🍼" },
  { id: "remedio", name: "Remédios", icon: "💊" }, { id: "movel", name: "Móveis", icon: "🛏️" }, { id: "outro", name: "Outros", icon: "📦" },
];
const STATES: { id: ItemState; name: string }[] = [
  { id: "uso", name: "Em uso" }, { id: "pequeno", name: "Ficou pequeno" }, { id: "guardado", name: "Guardado" }, { id: "doacao", name: "Para doação" },
  { id: "venda", name: "Para venda" }, { id: "emprestado", name: "Emprestado" }, { id: "lembranca", name: "Lembrança" },
];
const SIZES = ["RN", "P", "M", "G", "GG", "XG", "1", "2", "3"];
const THEMES: Record<Theme, string> = { rosa: "#F4D8DC", azul: "#DCECF7", salvia: "#DDE9DF", lavanda: "#E8E1F4", bege: "#F5EDE3" };
const catName = (c: Cat) => CATS.find((x) => x.id === c)?.name ?? c;
const catIcon = (c: Cat) => CATS.find((x) => x.id === c)?.icon ?? "📦";
const compName = (id: string) => COMPARTMENTS.find((c) => c.id === id)?.name ?? "Sem lugar";
const fmtDate = (d: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

document.body.innerHTML = `<div id="app"><main id="view"></main><nav class="tabs" id="tabs">
  <a href="#inicio" data-t="inicio"><span>🏠</span>Início</a><a href="#quarto" data-t="quarto"><span>🚪</span>Quarto</a>
  <a href="#nota" data-t="nota" class="mid"><span>🧾</span>Nota fiscal</a><a href="#itens" data-t="itens"><span>👕</span>Itens</a>
  <a href="#mais" data-t="mais"><span>☰</span>Mais</a></nav><div class="toast" id="toast" hidden></div></div>`;

function toast(msg: string) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout((toast as unknown as { t: number }).t);
  (toast as unknown as { t: number }).t = window.setTimeout(() => (t.hidden = true), 2800);
}
function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const head = (title: string, back = "#inicio", extra = "") => `<header class="hd"><a class="back" href="${back}" aria-label="Voltar">‹</a><h1>${title}</h1>${extra}</header>`;

// ---------- roteador por #hash
let wardrobe: Wardrobe3D | null = null;
let cleanup: (() => void) | null = null;
function route() {
  cleanup?.();
  cleanup = null;
  if (wardrobe) {
    wardrobe.dispose();
    wardrobe = null;
  }
  const [page, arg] = location.hash.slice(1).split("/");
  const b = baby();
  document.documentElement.style.setProperty("--theme", THEMES[b?.theme ?? "rosa"]);
  $$("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.t === (page || "inicio")));
  $("#tabs").hidden = !b;
  const v = $("#view");
  v.scrollTop = 0;
  window.scrollTo(0, 0);
  if (!b && page !== "bebe" && page !== "conta" && page !== "nova-senha") return welcome(v);
  // quem só pode ver: aviso fixo no alto
  const ro = C.account()?.family?.role === "ve";
  document.body.classList.toggle("readonly", ro);
  // teste grátis acabou e sem assinatura: só a tela de assinar, conta, backup e privacidade
  const ctx = { head, toast, route };
  if (C.access().status === "expired" && !["assinar", "conta", "backup", "privacidade", "nova-senha"].includes(page)) {
    $$("#tabs a").forEach((a) => a.classList.remove("on"));
    return paywall(v, ctx);
  }
  const pages: Record<string, (v: HTMLElement, arg?: string) => void> = {
    inicio: home, quarto: room, itens: items, item: itemForm, nota: receipt, compras: purchases, compra: purchase, gastos: money_,
    sono: sleep, crescimento: growth, fraldas: diapers, agenda: agenda, enxoval: layette, bebe: babyForm, bebes: babies, mais: more,
    backup: backup, privacidade: privacy, remedios: meds, mala: trip, conta: accountPage, babybot: (el) => babybotPage(el, head, toast), avisos: alertsPage, "nova-senha": newPass,
    assinar: (el) => paywall(el, ctx), lista: (el) => shopping(el, ctx), memorias: (el) => memories(el, ctx),
    etiquetas: (el) => void labels(el, ctx), relatorio: (el) => report(el, ctx),
  };
  (pages[page] ?? home)(v, arg);
}
addEventListener("hashchange", route);
onChange(() => {
  // telas que mostram números ao vivo se atualizam sozinhas; formulários não (para não perder o que está sendo digitado)
  const p = location.hash.slice(1).split("/")[0] || "inicio";
  if (["inicio", "itens", "compras", "gastos", "fraldas", "sono", "crescimento", "agenda", "enxoval", "bebes", "remedios", "lista", "memorias"].includes(p)) route();
});

// ---------- boas-vindas
function welcome(v: HTMLElement) {
  v.innerHTML = `<section class="welcome">
    <div class="logo">🧸</div><h1>Cantinho do bebê</h1><p class="slogan">O mundinho do seu bebê, organizado com amor.</p>
    <ul class="perks"><li>🚪 Guarda-roupa 3D com as roupinhas de verdade</li><li>🧾 Compras cadastradas pela nota fiscal</li>
    <li>🧷 Estoque de fraldas que avisa antes de acabar</li><li>🌙 Sono, 📏 crescimento e 💰 gastos num lugar só</li></ul>
    <a class="btn big" href="#bebe">Cadastrar meu bebê</a>
    <button class="btn ghost" id="demo">Explorar com um bebê de exemplo</button>
    <a class="btn ghost" href="#conta">Já tenho conta · Recebi um convite</a>
    <p class="fine">Tudo fica salvo só neste celular. Nada é enviado para a internet.</p></section>`;
  $("#demo").onclick = demo;
}
function demo() {
  const id = uid();
  const birth = new Date(Date.now() - (5 * 30.4 + 12) * 864e5).toISOString().slice(0, 10);
  save((d) => {
    d.babies.push({ id, name: "Helena", nick: "Lena", birth, sex: "menina", weight: 3.2, length: 49, head: 34, premature: false, notes: "Bebê de exemplo (pode apagar em Mais → Bebês).", theme: "rosa" });
    d.current = id;
    const it = (name: string, cat: Cat, size: string, color: string, qty: number, price: number, loc: CompId | "") =>
      d.items.push({ id: uid(), babyId: id, name, cat, size, color, brand: "", qty, price, date: today(), state: "uso", loc, notes: "" });
    it("Body manga curta", "roupa", "M", "rosa", 6, 29.9, "g1");
    it("Body manga longa", "roupa", "P", "branco", 5, 34.9, "g1");
    it("Body RN", "roupa", "RN", "amarelo", 4, 24.9, "g1");
    it("Body manga curta", "roupa", "G", "azul", 5, 32.9, "g1");
    it("Body regata", "roupa", "GG", "verde", 3, 29.9, "g1");
    it("Macacão plush", "roupa", "M", "azul", 4, 59.9, "g2");
    it("Calça mijão", "roupa", "P", "bege", 5, 24.9, "g2");
    it("Calça mijão", "roupa", "G", "cinza", 4, 26.9, "g2");
    it("Macacão", "roupa", "GG", "lilás", 2, 64.9, "g2");
    it("Meia antiderrapante", "roupa", "M", "amarelo", 6, 9.9, "g3");
    it("Meia", "roupa", "P", "branco", 6, 7.9, "g3");
    it("Touca", "roupa", "RN", "rosa", 3, 19.9, "g3");
    it("Babador", "roupa", "G", "azul", 5, 12.9, "g3");
    it("Vestido de festa", "roupa", "M", "lilás", 1, 89.9, "cabide");
    it("Casaco de tricô", "roupa", "M", "verde", 1, 79.9, "cabide");
    it("Macacão longo", "roupa", "M", "rosa", 2, 64.9, "cabide");
    it("Cobertor", "utensilio", "", "branco", 2, 69.9, "prat1");
    it("Pijama", "roupa", "M", "azul", 3, 39.9, "prat2");
    it("Sapatinho de tricô", "sapato", "15", "rosa", 1, 39.9, "sapateira");
    it("Tênis", "sapato", "16", "branco", 1, 79.9, "sapateira");
    it("Fralda Pampers G", "fralda", "G", "", 42, 1.2, "");
    for (let i = 0; i < 7; i++) d.diapers.push({ id: uid(), babyId: id, date: new Date(Date.now() - i * 864e5).toISOString(), qty: 6 });
    const n = Date.now();
    d.sleeps.push({ id: uid(), babyId: id, start: new Date(n - 3 * 36e5).toISOString(), end: new Date(n - 3 * 36e5 + 80 * 6e4).toISOString() });
    d.measures.push({ id: uid(), babyId: id, date: birth, weight: 3.2, length: 49, head: 34 }, { id: uid(), babyId: id, date: today(), weight: 7.1, length: 64, head: 41.5 });
    d.purchases.push({ id: uid(), store: "Loja de exemplo", cnpj: "", date: today(), number: "", key: "", total: 289.4, discount: 0, lines: [], source: "manual", createdAt: new Date().toISOString() });
  });
  location.hash = "#inicio";
  route();
}

// ---------- início (painel)
function home(v: HTMLElement) {
  const b = baby()!;
  const a = age(b.birth);
  const its = db().items.filter((i) => i.babyId === b.id);
  const clothes = its.filter((i) => i.cat === "roupa").reduce((s, i) => s + i.qty, 0);
  const ds = diaperStock(b.id);
  const lastSleep = db().sleeps.filter((s) => s.babyId === b.id && s.end).sort((x, y) => y.end!.localeCompare(x.end!))[0];
  const running = db().sleeps.find((s) => s.babyId === b.id && !s.end);
  const m0 = today().slice(0, 8) + "01";
  const sa = sizeAlerts(b), sh = shoeAlerts(b);
  const unplaced = its.filter((i) => (i.cat === "roupa" || i.cat === "sapato") && !i.loc && i.state === "uso").length;
  const evs = db().events.filter((e) => e.babyId === b.id && e.date >= today()).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)).slice(0, 3);
  const last = db().purchases.slice().sort((x, y) => y.date.localeCompare(x.date)).slice(0, 3);
  const meas = db().measures.filter((m) => m.babyId === b.id).sort((x, y) => y.date.localeCompare(x.date))[0];
  v.innerHTML = `
  <section class="hero">
    <div class="hero-top"><button class="avatar" id="who" aria-label="Trocar bebê">${b.name[0]}</button>
      <div class="grow"><small>${greet()}!${syncBadge()}</small><h1>${a.totalDays < 0 ? `${esc(b.name)} chega em breve 💗` : `${esc(b.nick || b.name)} está com ${ageText(b.birth)} 💗`}</h1></div></div>
    ${a.totalDays >= 0 ? `<div class="mv"><span>🎂</span><div><b>${a.months + 1}º mêsversário</b> em ${a.toNext === 0 ? "hoje!" : `${a.toNext} ${a.toNext === 1 ? "dia" : "dias"}`}<small>${a.nextMonthversary.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</small></div></div>` : ""}
  </section>
  <a class="cta" href="#nota"><span>🧾</span><div><b>Cadastrar compras pela nota fiscal</b><small>foto, XML, QR Code ou texto</small></div><i>›</i></a>
  ${trialBanner()}
  <a class="cta bot" href="#babybot"><span>🤖</span><div><b>Pergunte ao BabyBot</b><small>"onde estão os bodies M?" · "quanto gastei?"</small></div><i>›</i></a>
  <div class="grid">
    <a class="card" href="#itens?cat=roupa"><span>👕</span><b>${clothes}</b><small>roupinhas cadastradas</small></a>
    <a class="card ${ds.daysLeft !== null && ds.daysLeft < 5 ? "warn" : ""}" href="#fraldas"><span>🧷</span><b>${ds.stock}</b><small>fraldas · ${ds.daysLeft === null ? "registre o uso" : `dá para ~${ds.daysLeft} dias`}</small></a>
    <a class="card" href="#sono"><span>🌙</span><b>${running ? "dormindo" : lastSleep ? dur(new Date(lastSleep.end!).getTime() - new Date(lastSleep.start).getTime()) : "—"}</b><small>${running ? `desde ${new Date(running.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : `última soneca · hoje ${dur(sleepToday(b.id))}`}</small></a>
    <a class="card" href="#gastos"><span>💰</span><b>${money(spent(m0, today()))}</b><small>gastos do mês</small></a>
    <a class="card" href="#crescimento"><span>📏</span><b>${meas?.weight ? `${String(meas.weight).replace(".", ",")} kg` : "—"}</b><small>${meas?.length ? `${String(meas.length).replace(".", ",")} cm · ` : ""}crescimento</small></a>
    <a class="card" href="#quarto"><span>🚪</span><b>3D</b><small>abrir ${roomTitle() === "Cômoda" ? "a cômoda" : roomTitle() === "Guarda-roupa" ? "o guarda-roupa" : "o quartinho"}</small></a>
  </div>
  ${sa.length || sh.length || unplaced || (ds.daysLeft !== null && ds.daysLeft < 5) ? `<h2>Avisos</h2><div class="alerts">
    ${sa.length ? `<a href="#itens?alerta=1" class="alert">💗 Seu bebê está crescendo! <b>${sa.length}</b> ${sa.length === 1 ? "roupinha precisa" : "roupinhas precisam"} de uma conferida no tamanho.</a>` : ""}
    ${sh.length ? `<a href="#itens?cat=sapato" class="alert">👟 ${sh.length} sapatinho(s) com menos de 1 cm de folga para o pé.</a>` : ""}
    ${ds.daysLeft !== null && ds.daysLeft < 5 ? `<a href="#fraldas" class="alert">🧷 O estoque de fraldas pode acabar em ~${ds.daysLeft} dias.</a>` : ""}
    ${unplaced ? `<a href="#quarto" class="alert">🧺 ${unplaced} ${unplaced === 1 ? "peça está" : "peças estão"} sem lugar nos móveis. Vamos guardar?</a>` : ""}
  </div>` : ""}
  ${evs.length ? `<h2>Próximos compromissos</h2><div class="list">${evs.map((e) => `<a class="row" href="#agenda"><span>${{ consulta: "🩺", vacina: "💉", remedio: "💊", compra: "🛍️", outro: "📌" }[e.kind]}</span><div><b>${esc(e.title)}</b><small>${fmtDate(e.date)} ${e.time}</small></div></a>`).join("")}</div>` : ""}
  ${last.length ? `<h2>Últimas compras</h2><div class="list">${last.map((p) => `<a class="row" href="#compra/${p.id}"><span>🛍️</span><div><b>${esc(p.store || "Compra")}</b><small>${fmtDate(p.date)} · ${p.lines.length} itens</small></div><em>${money(p.total)}</em></a>`).join("")}</div>` : ""}
  <p class="fine center">O acompanhamento não substitui a avaliação do pediatra.</p>`;
  $("#who").onclick = () => (location.hash = "#bebes");
}

// ---------- guarda-roupa 3D
function room(v: HTMLElement, arg?: string) {
  const b = baby()!;
  const w = db().wardrobe;
  if (!w.pieces || arg === "moveis") return roomSetup(v, head, toast, shrink);
  const has3d = webglOk() && localStorage.getItem("cb_2d") !== "1";
  v.innerHTML = `<section class="room">
    <div class="room-top">${head(roomTitle(), "#inicio", `<button class="chip" id="mode">${has3d ? "Modo simples" : "Ver em 3D"}</button>`)}</div>
    ${has3d ? `<div class="stage" id="stage"><p class="hint" id="hint">Toque numa porta ou gaveta para abrir · toque numa roupinha para ver</p></div>` : `<div class="flat" id="flat"></div>`}
    <div class="sheet" id="sheet"></div></section>`;
  $("#mode").onclick = () => {
    localStorage.setItem("cb_2d", has3d ? "1" : "0");
    route();
  };
  const mine = () => db().items.filter((i) => i.babyId === b.id);
  let sel: CompId | null = null, slot: number | null = null, focus: string | null = null;
  const pcs = (list: Item[]) => list.reduce((s, i) => s + i.qty, 0);
  const sheet = () => {
    const el = $("#sheet");
    const names = slotNames();
    // roupinha tocada: cartão da peça
    const it = focus ? mine().find((i) => i.id === focus) : null;
    if (it) {
      el.innerHTML = `<div class="sel-hd"><button class="back" id="close">‹</button><div><b>${esc(it.name)}</b><small>${compName(it.loc)}${isDrawer(it.loc) ? ` · ${esc(names[slotOf(it)])}` : ""}</small></div></div>
        <div class="piece"><div class="ph" id="pph" style="background:${colorOf(it)}"></div><div>
          <p><b>${it.qty}</b> ${it.qty === 1 ? "peça" : "peças"}${it.size ? ` · tamanho <b>${esc(it.size)}</b>` : ""}${it.color ? ` · ${esc(it.color)}` : ""}</p>
          <p class="fine">${[it.brand, it.price ? money(it.price) + " cada" : "", it.date ? `comprado em ${fmtDate(it.date)}` : "", STATES.find((x) => x.id === it.state)?.name].filter(Boolean).map(esc).join(" · ")}</p></div></div>
        ${isDrawer(it.loc) ? `<label class="mini">Divisão da gaveta<select id="slotSel">${names.map((n, k) => `<option value="${k}" ${slotOf(it) === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>` : ""}
        <div class="row3"><button class="btn ghost" data-st="pequeno">Ficou pequena</button><button class="btn ghost" data-st="doacao">Doação</button><a class="btn" href="#item/${it.id}">Editar</a></div>`;
      if (it.photo) photoUrl(it.photo).then((u) => u && ($("#pph").style.background = `center/cover url(${u})`));
      $("#close", el).onclick = () => {
        focus = null;
        wardrobe?.highlight(null);
        sheet();
      };
      const ss = $<HTMLSelectElement>("#slotSel", el);
      if (ss) ss.onchange = () => {
        save((d) => (d.items.find((x) => x.id === it.id)!.slot = Number(ss.value)));
        wardrobe?.setItems(mine());
        wardrobe?.highlight(it.id);
        toast(`Movida para ${names[Number(ss.value)]}`);
        sheet();
      };
      $$("[data-st]", el).forEach((x) => (x.onclick = () => {
        const st = x.dataset.st as ItemState;
        if (!confirm(st === "pequeno" ? "Marcar como pequena e tirar do guarda-roupa?" : "Separar para doação e tirar do guarda-roupa?")) return;
        save((d) => {
          const y = d.items.find((z) => z.id === it.id)!;
          y.state = st;
          y.loc = "";
        });
        wardrobe?.setItems(mine());
        focus = null;
        toast(st === "pequeno" ? "Separada como pequena 💗" : "Separada para doação 💗");
        sheet();
      }));
      return;
    }
    if (!sel) {
      const here = comps().map((c) => c.id as string);
      const loose = mine().filter((i) => (!i.loc || !here.includes(i.loc)) && (i.cat === "roupa" || i.cat === "sapato") && i.state === "uso");
      el.innerHTML = `<div class="pills">${comps().map((c) => `<button data-c="${c.id}"><b>${c.name}</b><small>${pcs(mine().filter((i) => i.loc === c.id))} peças</small></button>`).join("")}</div>
        ${loose.length ? `<p class="note">🧺 ${loose.length} ${loose.length === 1 ? "peça sem lugar" : "peças sem lugar"}. Toque num compartimento e em "Guardar aqui".</p>` : ""}
        <details class="custom"><summary>🎨 Personalizar o móvel</summary>
          <a class="btn ghost" href="#quarto/moveis">🏠 Trocar os móveis · 📷 copiar pela foto</a>
          <div class="row2"><label>Acabamento<select id="fin">${(["branco", "carvalho", "nogueira", "rosa", "salvia"] as const).map((f) => `<option ${w.finish === f ? "selected" : ""} value="${f}">${{ branco: "Branco", carvalho: "Carvalho", nogueira: "Nogueira", rosa: "Rosa antigo", salvia: "Verde sálvia" }[f]}</option>`).join("")}</select></label>
          <label>Luz<select id="lgt"><option value="quente" ${w.light === "quente" ? "selected" : ""}>Aconchegante</option><option value="fria" ${w.light === "fria" ? "selected" : ""}>Clara</option></select></label></div>
          <p class="fine">Nomes das 4 divisões de cada gaveta:</p>
          <div class="row2 slotnames">${slotNames().map((n, k) => `<input data-sn="${k}" value="${esc(n)}" maxlength="18">`).join("")}</div></details>`;
      $$("[data-c]", el).forEach((x) => (x.onclick = () => pick(x.dataset.c as CompId)));
      $<HTMLSelectElement>("#fin", el).onchange = (e) => {
        save((d) => (d.wardrobe.finish = (e.target as HTMLSelectElement).value as typeof w.finish));
        wardrobe?.setFinish(db().wardrobe.finish);
      };
      $<HTMLSelectElement>("#lgt", el).onchange = (e) => {
        save((d) => (d.wardrobe.light = (e.target as HTMLSelectElement).value as typeof w.light));
        wardrobe?.setLight(db().wardrobe.light);
      };
      $$<HTMLInputElement>("[data-sn]", el).forEach((x) => (x.onchange = () => {
        const list = $$<HTMLInputElement>("[data-sn]", el).map((y) => y.value.trim() || "—");
        save((d) => (d.wardrobe.slots = list));
        wardrobe?.setSlots(list);
      }));
      return;
    }
    const c = COMPARTMENTS.find((x) => x.id === sel)!;
    const drawer = isDrawer(sel);
    const inComp = mine().filter((i) => i.loc === sel);
    const here = drawer && slot !== null ? inComp.filter((i) => slotOf(i) === slot) : inComp;
    const loose = mine().filter((i) => i.loc !== sel && (i.cat === "roupa" || i.cat === "sapato" || i.cat === "utensilio") && i.state !== "doacao" && i.state !== "pequeno");
    el.innerHTML = `<div class="sel-hd"><button class="back" id="close">‹</button><div><b>${c.name}</b><small>${drawer ? "3 divisórias · toque numa divisão ou numa roupinha" : c.hint}</small></div></div>
      ${drawer ? `<div class="slots"><button data-slot="" class="${slot === null ? "on" : ""}">Tudo<small>${pcs(inComp)}</small></button>${slotNames().map((n, k) => `<button data-slot="${k}" class="${slot === k ? "on" : ""}">${esc(n)}<small>${pcs(inComp.filter((i) => slotOf(i) === k))}</small></button>`).join("")}</div>` : ""}
      ${here.length ? `<div class="list">${here.map((i) => itemRow(i, true)).join("")}</div>` : `<p class="note">Vazio por enquanto.</p>`}
      ${loose.length ? `<details class="move"><summary>➕ Guardar aqui${drawer && slot !== null ? ` (${esc(slotNames()[slot])})` : ""}</summary>
        ${drawer && slot === null ? `<p class="fine">Cada peça vai para a divisão do tamanho dela (RN/P = 0-3, M = 3-6, G = 6-9, GG = 9-12). Toque numa divisão antes para escolher.</p>` : ""}
        <div class="checks">${loose.map((i) => `<label><input type="checkbox" value="${i.id}"><span class="dot" style="background:${colorOf(i)}"></span>${esc(i.name)} ${i.size ? `<small>${esc(i.size)}</small>` : ""}<em>${i.loc ? compName(i.loc) : "sem lugar"}</em></label>`).join("")}</div><button class="btn" id="put">Guardar selecionados</button></details>` : ""}`;
    $("#close", el).onclick = () => {
      sel = null;
      slot = null;
      wardrobe?.closeAll();
      sheet();
    };
    $$("[data-slot]", el).forEach((x) => (x.onclick = () => {
      slot = x.dataset.slot === "" ? null : Number(x.dataset.slot);
      sheet();
    }));
    $$("[data-item]", el).forEach((x) => (x.onclick = (e) => {
      e.preventDefault();
      focus = x.dataset.item!;
      wardrobe?.highlight(focus);
      sheet();
    }));
    const put = $("#put", el);
    if (put) put.onclick = () => {
      const ids = $$<HTMLInputElement>("input:checked", el).map((x) => x.value);
      if (!ids.length) return toast("Marque as peças");
      save((d) => d.items.forEach((i) => {
        if (!ids.includes(i.id)) return;
        i.loc = sel!;
        if (drawer) i.slot = slot ?? slotFor(i.size);
        else delete i.slot;
      }));
      wardrobe?.setItems(mine());
      toast("Prontinho! Suas comprinhas estão organizadas. 💗");
      sheet();
    };
  };
  const pick = (id: CompId) => {
    sel = id;
    slot = null;
    focus = null;
    wardrobe?.open(id);
    sheet();
  };
  if (has3d) {
    wardrobe = new Wardrobe3D($("#stage"), w, b.nick || b.name);
    wardrobe.setSlots(slotNames());
    wardrobe.setItems(mine());
    wardrobe.onSelect = (id) => {
      $("#hint").hidden = true;
      sel = id;
      slot = null;
      focus = null;
      sheet();
    };
    wardrobe.onSlot = (id, k) => {
      sel = id;
      slot = k;
      focus = null;
      wardrobe?.highlight(null);
      sheet();
    };
    wardrobe.onItem = (itemId) => {
      $("#hint").hidden = true;
      focus = itemId;
      const it = mine().find((i) => i.id === itemId);
      if (it?.loc) sel = it.loc;
      sheet();
    };
  } else {
    // modo simples (2D): o móvel desenhado em blocos, cada bloco abre a lista
    const f = $("#flat");
    const pc = w.pieces ?? "ambos";
    f.innerHTML = `${pc === "comoda" ? "" : `<div class="w2d"><div class="plate">${esc(b.nick || b.name)}</div>
      <div class="top"><button data-c="cabide" class="tall">Cabideiro</button><div class="col"><button data-c="prat1">Prateleira de cima</button><button data-c="prat2">Prateleira de baixo</button></div></div>
      <div class="bot"><div class="col"><button data-c="g1">Gaveta 1</button><button data-c="g2">Gaveta 2</button><button data-c="g3">Gaveta 3</button></div><button data-c="sapateira" class="tall">Sapateira</button></div></div>`}
      ${pc === "guarda" ? "" : `<div class="w2d dresser"><div class="plate">${pc === "comoda" ? esc(b.nick || b.name) : "Cômoda"}</div><div class="bot"><div class="col"><button data-c="c1">Gaveta 1</button><button data-c="c2">Gaveta 2</button><button data-c="c3">Gaveta 3</button><button data-c="c4">Gaveta 4</button></div><button data-c="cporta" class="tall">Porta</button></div></div>`}`;
    $$("[data-c]", f).forEach((x) => (x.onclick = () => pick(x.dataset.c as CompId)));
  }
  sheet();
  // QR Code da etiqueta: /bebe/#quarto/g1 abre direto naquele lugar
  if (arg && COMPARTMENTS.some((c) => c.id === arg)) setTimeout(() => pick(arg as CompId), 400);
}
function itemRow(i: Item, local = false) {
  return `<a class="row" href="#item/${i.id}" ${local ? `data-item="${i.id}"` : ""}><span class="dot big" style="background:${i.cat === "roupa" || i.cat === "sapato" ? colorOf(i) : "#f3ede6"}">${i.cat === "roupa" || i.cat === "sapato" ? "" : catIcon(i.cat)}</span>
    <div><b>${esc(i.name)}</b><small>${[i.size && `tam. ${esc(i.size)}`, i.color && esc(i.color), i.loc && compName(i.loc) + (isDrawer(i.loc) ? ` · ${slotNames()[slotOf(i)]}` : ""), i.state !== "uso" && STATES.find((s) => s.id === i.state)?.name].filter(Boolean).join(" · ")}</small></div><em>${i.qty}×</em></a>`;
}

// ---------- inventário
function items(v: HTMLElement) {
  const b = baby()!;
  const q = new URLSearchParams(location.hash.split("?")[1] ?? "");
  let cat = q.get("cat") ?? "", text = "", state = "";
  const alert = q.get("alerta") === "1";
  const draw = () => {
    let list = db().items.filter((i) => i.babyId === b.id);
    if (alert) {
      const ids = new Set(sizeAlerts(b).map((i) => i.id));
      list = list.filter((i) => ids.has(i.id));
    }
    if (cat) list = list.filter((i) => i.cat === cat);
    if (state) list = list.filter((i) => i.state === state);
    if (text) {
      const t = text.toLowerCase();
      list = list.filter((i) => `${i.name} ${i.brand} ${i.size} ${i.color} ${i.notes}`.toLowerCase().includes(t));
    }
    list.sort((x, y) => x.name.localeCompare(y.name));
    $("#list").innerHTML = list.length ? list.map((i) => itemRow(i)).join("") : `<p class="note">Nada por aqui. ${alert ? "Nenhuma peça para conferir 🎉" : 'Toque em "Novo item" ou cadastre pela nota fiscal.'}</p>`;
    $("#count").textContent = `${list.reduce((s, i) => s + i.qty, 0)} peças`;
  };
  v.innerHTML = `${head(alert ? "Conferir tamanhos" : "Itens", "#inicio", `<a class="chip" href="#item/novo">+ Novo item</a>`)}
    ${alert ? `<p class="note">Pela idade e pelo último peso, estas peças podem estar ficando pequenas. Toque em cada uma e marque se ainda serve.</p>` : ""}
    <input class="search" id="q" placeholder="Buscar (ex.: body M, rosa, Hering)">
    <div class="scroller">${[{ id: "", name: "Tudo", icon: "✨" }, ...CATS].map((c) => `<button data-cat="${c.id}" class="${cat === c.id ? "on" : ""}">${c.icon} ${c.name}</button>`).join("")}</div>
    <div class="scroller small">${[{ id: "", name: "Qualquer estado" }, ...STATES].map((s) => `<button data-st="${s.id}" class="${state === s.id ? "on" : ""}">${s.name}</button>`).join("")}</div>
    <p class="count" id="count"></p><div class="list" id="list"></div>
    <div class="row2 tools"><button class="btn ghost" id="scan">📷 Ler código de barras</button><a class="btn ghost" href="#mala">🧳 Montar mala</a></div>`;
  $<HTMLInputElement>("#q").oninput = (e) => {
    text = (e.target as HTMLInputElement).value;
    draw();
  };
  $$("[data-cat]").forEach((x) => (x.onclick = () => {
    cat = x.dataset.cat!;
    $$("[data-cat]").forEach((y) => y.classList.toggle("on", y === x));
    draw();
  }));
  $$("[data-st]").forEach((x) => (x.onclick = () => {
    state = x.dataset.st!;
    $$("[data-st]").forEach((y) => y.classList.toggle("on", y === x));
    draw();
  }));
  $("#scan").onclick = async () => {
    const code = await scanCode("Aponte para o código de barras do produto");
    if (!code) return;
    const found = db().items.find((i) => i.barcode === code && i.babyId === b.id);
    if (found) location.hash = `#item/${found.id}`;
    else location.hash = `#item/novo?ean=${code}`;
  };
  draw();
}

function itemForm(v: HTMLElement, arg?: string) {
  const b = baby()!;
  const isNew = !arg || arg.startsWith("novo");
  const q = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const ean = q.get("ean") ?? "";
  const known = ean ? db().barcodes[ean] : undefined;
  const it: Item = isNew
    ? { id: uid(), babyId: b.id, name: known?.name ?? "", cat: known?.cat ?? "roupa", size: known?.size ?? "", color: "", brand: known?.brand ?? "", qty: 1, price: 0, date: today(), state: "uso", loc: "", notes: "", barcode: ean || undefined }
    : { ...db().items.find((i) => i.id === arg)! };
  if (!it.id) return (location.hash = "#itens");
  v.innerHTML = `${head(isNew ? "Novo item" : "Item", "#itens")}
  <form class="form" id="f">
    ${ean ? `<p class="note">Código ${esc(ean)} ${known ? "já conhecido: preenchi o que sei." : "ainda não cadastrado: preencha e ele fica lembrado."}</p>` : ""}
    <div class="photo" id="ph">${it.photo ? "" : "<span>📷<br>Foto (opcional)</span>"}<input type="file" accept="image/*" capture="environment" id="pf"></div>
    <label>Nome<input name="name" required value="${esc(it.name)}" placeholder="Ex.: Body manga curta"></label>
    <label>Categoria<select name="cat">${CATS.map((c) => `<option value="${c.id}" ${it.cat === c.id ? "selected" : ""}>${c.icon} ${c.name}</option>`).join("")}</select></label>
    <div class="row2"><label>Tamanho<input name="size" list="sizes" value="${esc(it.size)}" placeholder="RN, P, M, 16…"></label><label>Cor<input name="color" value="${esc(it.color)}" placeholder="rosa, azul…"></label></div>
    <datalist id="sizes">${SIZES.map((s) => `<option>${s}</option>`).join("")}</datalist>
    <div class="row2"><label>Quantidade<input name="qty" type="number" min="0" value="${it.qty}"></label><label>Preço (un.)<input name="price" type="number" step="0.01" min="0" value="${it.price || ""}"></label></div>
    <div class="row2"><label>Marca<input name="brand" value="${esc(it.brand)}"></label><label>Data da compra<input name="date" type="date" value="${it.date}"></label></div>
    <div class="row2"><label>Estado<select name="state">${STATES.map((s) => `<option value="${s.id}" ${it.state === s.id ? "selected" : ""}>${s.name}</option>`).join("")}</select></label>
    <label>Onde está<select name="loc"><option value="">Sem lugar</option>${COMPARTMENTS.filter((c) => it.loc === c.id || comps().includes(c)).map((c) => `<option value="${c.id}" ${it.loc === c.id ? "selected" : ""}>${c.name}</option>`).join("")}</select></label></div>
    <label class="slotf" ${isDrawer(it.loc) ? "" : "hidden"}>Divisão da gaveta<select name="slot"><option value="">Pelo tamanho</option>${slotNames().map((n, k) => `<option value="${k}" ${it.slot === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
    <label class="shoe" ${it.cat === "sapato" ? "" : "hidden"}>Comprimento interno do sapato (cm)<input name="innerCm" type="number" step="0.1" value="${it.innerCm ?? ""}"></label>
    <label>Observações<textarea name="notes" rows="2">${esc(it.notes)}</textarea></label>
    <button class="btn big">Salvar</button>
    ${isNew ? "" : `<div class="row2"><button type="button" class="btn ghost" id="dup">Duplicar</button><button type="button" class="btn danger" id="del">Apagar</button></div>`}
  </form>`;
  const f = $<HTMLFormElement>("#f");
  let photo = it.photo;
  if (photo) photoUrl(photo).then((u) => u && ($("#ph").style.backgroundImage = `url(${u})`));
  $<HTMLSelectElement>("[name=loc]", f).onchange = (e) => ($("label.slotf", f).hidden = !isDrawer((e.target as HTMLSelectElement).value));
  $<HTMLSelectElement>("[name=cat]", f).onchange = (e) => ($("label.shoe", f).hidden = (e.target as HTMLSelectElement).value !== "sapato");
  $<HTMLInputElement>("#pf").onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const small = await shrink(file);
    photo = await putPhoto(small);
    $("#ph").innerHTML = "";
    $("#ph").appendChild($<HTMLInputElement>("#pf") ?? document.createElement("input"));
    $("#ph").style.backgroundImage = `url(${URL.createObjectURL(small)})`;
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const next: Item = {
      ...it, name: g("name"), cat: g("cat") as Cat, size: g("size").toUpperCase().replace(/MESES?/, "meses"), color: g("color").toLowerCase(), brand: g("brand"),
      qty: Math.max(0, parseInt(g("qty")) || 0), price: parseFloat(g("price")) || 0, date: g("date") || today(), state: g("state") as ItemState,
      loc: g("loc") as CompId | "", notes: g("notes"), photo, innerCm: parseFloat(g("innerCm")) || undefined,
      slot: isDrawer(g("loc")) && g("slot") !== "" ? Number(g("slot")) : undefined,
    };
    if (!next.name) return toast("Dê um nome ao item");
    save((d) => {
      const i = d.items.findIndex((x) => x.id === next.id);
      if (i >= 0) d.items[i] = next;
      else d.items.push(next);
      if (next.barcode) d.barcodes[next.barcode] = { name: next.name, cat: next.cat, brand: next.brand, size: next.size };
    });
    toast("Salvo 💗");
    location.hash = "#itens";
  };
  if (!isNew) {
    $("#del").onclick = () => {
      if (!confirm(`Apagar "${it.name}"?`)) return;
      save((d) => (d.items = d.items.filter((x) => x.id !== it.id)));
      location.hash = "#itens";
    };
    $("#dup").onclick = () => {
      save((d) => d.items.push({ ...it, id: uid(), photo: undefined }));
      toast("Duplicado");
      location.hash = "#itens";
    };
  }
}

// ---------- leitor de código (câmera do celular; usa o leitor nativo do navegador quando existe)
type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
async function scanCode(title: string): Promise<string | null> {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (!BD || !navigator.mediaDevices?.getUserMedia) {
    const typed = prompt(`${title}\n\nEste navegador não lê código pela câmera. Digite o número:`);
    return typed?.replace(/\s/g, "") || null;
  }
  const det = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"] });
  const box = document.createElement("div");
  box.className = "scanner";
  box.innerHTML = `<video playsinline muted></video><div class="frame"></div><p>${title}</p><button class="btn ghost" data-x>Cancelar</button><button class="btn ghost" data-t>Digitar</button>`;
  document.body.appendChild(box);
  const video = $<HTMLVideoElement>("video", box);
  let stream: MediaStream | null = null;
  return new Promise((ok) => {
    let done = false;
    const end = (v: string | null) => {
      if (done) return;
      done = true;
      stream?.getTracks().forEach((t) => t.stop());
      box.remove();
      ok(v);
    };
    $("[data-x]", box).onclick = () => end(null);
    $("[data-t]", box).onclick = () => end(prompt("Número do código:")?.replace(/\s/g, "") || null);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((s) => {
      stream = s;
      video.srcObject = s;
      video.play();
      const tick = async () => {
        if (done) return;
        try {
          const r = await det.detect(video);
          if (r[0]?.rawValue) return end(r[0].rawValue);
        } catch {
          /* quadro ainda não pronto */
        }
        setTimeout(tick, 250);
      };
      tick();
    }).catch(() => {
      toast("Sem acesso à câmera");
      end(null);
    });
  });
}

// ---------- nota fiscal
let pending: (Parsed & { source: Purchase["source"]; qrUrl?: string }) | null = null;
function receipt(v: HTMLElement) {
  if (pending) return review(v);
  v.innerHTML = `${head("Cadastrar compras", "#inicio")}
  <p class="lead">Escolha como quer cadastrar. Antes de salvar você confere tudo numa tela de revisão.</p>
  <div class="opts">
    <label class="opt"><span>📸</span><div><b>Tirar foto da nota</b><small>${C.account() ? "🤖 a IA lê a nota inteira" : "o celular lê o texto · com conta, a IA lê melhor"}</small></div><input type="file" accept="image/*" capture="environment" id="foto"></label>
    <label class="opt"><span>🖼️</span><div><b>Foto ou PDF da galeria</b><small>imagem da nota impressa</small></div><input type="file" accept="image/*" id="gal"></label>
    <label class="opt"><span>📄</span><div><b>Importar XML da nota</b><small>o arquivo .xml que a loja manda por e-mail (mais preciso)</small></div><input type="file" accept=".xml,text/xml,application/xml" id="xml"></label>
    <button class="opt" id="qr"><span>🔳</span><div><b>Ler o QR Code da NFC-e</b><small>pega a chave e abre a nota no site da Fazenda</small></div></button>
    <button class="opt" id="txt"><span>📋</span><div><b>Colar o texto da nota</b><small>copiado do site da Fazenda ou do e-mail</small></div></button>
    <button class="opt" id="man"><span>✍️</span><div><b>Digitar a compra</b><small>loja, data e itens à mão</small></div></button>
  </div>
  <div class="ocr" id="ocr" hidden><p>Lendo a nota… <b id="pct">0%</b></p><div class="bar"><i id="bar"></i></div><small>Na primeira vez o leitor (português) é baixado.</small></div>
  <p class="fine">A leitura por foto pode errar letras: tudo que não foi entendido aparece destacado para você corrigir. Nada é cadastrado sem a sua confirmação.</p>`;
  const go = (p: Parsed, source: Purchase["source"], qrUrl?: string) => {
    pending = { ...p, source, qrUrl };
    review(v);
  };
  const photo = async (file?: File) => {
    if (!file) return;
    if (file.type === "application/pdf") return toast("Para PDF, abra o PDF e tire um print da nota, ou importe o XML.");
    $("#ocr").hidden = false;
    // com conta: a IA lê a nota (bem mais preciso); se falhar, cai no leitor do próprio celular
    if (C.account()) {
      $("#ocr p").innerHTML = "🤖 A IA está lendo a nota… <b>uns segundos</b>";
      $("#bar").style.width = "35%";
      try {
        return go(await readReceiptAi(file, shrink), "foto");
      } catch (err) {
        toast(`${(err as Error).message} Lendo pelo celular…`);
        $("#ocr p").innerHTML = 'Lendo a nota… <b id="pct">0%</b>';
      }
    }
    try {
      const text = await ocr(file, (p) => {
        $("#pct").textContent = `${Math.round(p * 100)}%`;
        $("#bar").style.width = `${p * 100}%`;
      });
      go(parseText(text), "foto");
    } catch {
      $("#ocr").hidden = true;
      toast("Não consegui ler a foto. Tente com mais luz ou cole o texto.");
    }
  };
  $<HTMLInputElement>("#foto").onchange = (e) => photo((e.target as HTMLInputElement).files?.[0]);
  $<HTMLInputElement>("#gal").onchange = (e) => photo((e.target as HTMLInputElement).files?.[0]);
  $<HTMLInputElement>("#xml").onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      go(parseXml(await f.text()), "xml");
    } catch (err) {
      toast((err as Error).message);
    }
  };
  $("#qr").onclick = async () => {
    const code = await scanCode("Aponte para o QR Code no fim da nota");
    if (!code) return;
    const { key, url } = parseQr(code);
    if (!key) return toast("Esse QR não parece de NFC-e");
    const k = keyInfo(key)!;
    go({ store: "", cnpj: k.cnpj, date: `20${k.yymm.slice(0, 2)}-${k.yymm.slice(2)}-01`, number: k.number, key, total: 0, discount: 0, lines: [], warnings: ["O QR Code traz só a chave da nota. Abra a nota no site da Fazenda, copie os itens e cole aqui, ou digite os itens."] }, "qr", url);
  };
  $("#txt").onclick = () => {
    const t = prompt("Cole aqui o texto da nota:");
    if (t) go(parseText(t), "texto");
  };
  $("#man").onclick = () => go({ store: "", cnpj: "", date: today(), number: "", key: "", total: 0, discount: 0, lines: [], warnings: [] }, "manual");
}

function dupOf(p: Parsed) {
  return db().purchases.find((x) => (p.key && x.key === p.key) || (p.cnpj && p.number && x.cnpj === p.cnpj && x.number === p.number) || (p.total && x.total === p.total && x.date === p.date && x.store && x.store === p.store));
}

function review(v: HTMLElement) {
  const p = pending!;
  const b = baby()!;
  const dup = dupOf(p);
  const lineHtml = (l: Line, i: number) => `<div class="line ${l.low.length ? "low" : ""}" data-i="${i}">
    <small class="orig">${esc(l.desc)}</small>
    <div class="row2"><input data-k="name" value="${esc(l.name)}" class="${l.low.includes("name") ? "warn" : ""}" placeholder="Nome">
    <select data-k="cat" class="${l.low.includes("cat") ? "warn" : ""}">${CATS.map((c) => `<option value="${c.id}" ${l.cat === c.id ? "selected" : ""}>${c.icon} ${c.name}</option>`).join("")}</select></div>
    <div class="row4"><label>Tam.<input data-k="size" value="${esc(l.size)}" class="${l.low.includes("size") ? "warn" : ""}"></label>
    <label>Qtd.<input data-k="qty" type="number" min="0" value="${l.qty}" class="${l.low.includes("qty") ? "warn" : ""}"></label>
    <label>${l.cat === "fralda" ? "Un./pct" : "Un./pct"}<input data-k="units" type="number" min="0" value="${l.units ?? ""}" class="${l.low.includes("units") ? "warn" : ""}" placeholder="—"></label>
    <label>Total R$<input data-k="total" type="number" step="0.01" value="${l.total ? l.total.toFixed(2) : ""}"></label></div>
    <button type="button" class="rm" data-rm="${i}">Remover</button></div>`;
  v.innerHTML = `${head("Revisar a nota", "#nota")}
  ${dup ? `<div class="alert red">⚠️ Parece que essa nota já foi cadastrada (${esc(dup.store || "compra")} de ${fmtDate(dup.date)}, ${money(dup.total)}). <a href="#compra/${dup.id}">Ver</a></div>` : ""}
  ${p.warnings.map((w) => `<div class="alert">${esc(w)}</div>`).join("")}
  ${p.qrUrl ? `<a class="btn ghost" href="${esc(p.qrUrl)}" target="_blank" rel="noopener">Abrir a nota no site da Fazenda ↗</a>` : ""}
  <form class="form" id="rf">
    <div class="row2"><label>Loja<input name="store" value="${esc(p.store)}" class="${p.store ? "" : "warn"}"></label><label>Data<input name="date" type="date" value="${p.date}" class="${p.date ? "" : "warn"}"></label></div>
    <div class="row2"><label>CNPJ<input name="cnpj" value="${esc(p.cnpj)}" inputmode="numeric"></label><label>Nº da nota<input name="number" value="${esc(p.number)}"></label></div>
    <h2>Itens <small>(${p.lines.length}) · campos em amarelo: conferir</small></h2>
    <div id="lines">${p.lines.map(lineHtml).join("")}</div>
    <button type="button" class="btn ghost" id="addl">+ Adicionar item</button>
    <div class="row2"><label>Desconto R$<input name="discount" type="number" step="0.01" value="${p.discount || ""}"></label><label>Total da nota R$<input name="total" type="number" step="0.01" value="${p.total ? p.total.toFixed(2) : ""}"></label></div>
    <label class="check"><input type="checkbox" name="toWardrobe" checked> Depois, me ajudar a guardar as roupinhas no guarda-roupa</label>
    <button class="btn big">Confirmar e cadastrar</button>
    <button type="button" class="btn ghost" id="cancel">Descartar</button>
  </form>`;
  const sync = () => {
    $$(".line", v).forEach((el) => {
      const l = p.lines[Number(el.dataset.i)];
      $$<HTMLInputElement | HTMLSelectElement>("[data-k]", el).forEach((inp) => {
        const k = inp.dataset.k!, val = inp.value;
        if (k === "qty") l.qty = parseInt(val) || 0;
        else if (k === "units") l.units = parseInt(val) || undefined;
        else if (k === "total") l.total = parseFloat(val) || 0;
        else (l as unknown as Record<string, string>)[k] = val;
      });
      l.unit = l.qty ? l.total / l.qty : l.total;
    });
  };
  $$("[data-rm]", v).forEach((x) => (x.onclick = () => {
    sync();
    p.lines.splice(Number(x.dataset.rm), 1);
    review(v);
  }));
  $("#addl").onclick = () => {
    sync();
    p.lines.push({ desc: "item digitado", name: "", cat: "roupa", size: "", qty: 1, unit: 0, total: 0, low: [] });
    review(v);
  };
  $("#cancel").onclick = () => {
    if (!confirm("Descartar esta nota?")) return;
    pending = null;
    receipt(v);
  };
  $<HTMLFormElement>("#rf").onsubmit = (e) => {
    e.preventDefault();
    sync();
    const fd = new FormData(e.target as HTMLFormElement);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const lines = p.lines.filter((l) => l.name.trim());
    if (!lines.length && !(parseFloat(g("total")) > 0)) return toast("Adicione pelo menos um item ou o total");
    if (dup && !confirm("Essa nota parece repetida. Cadastrar mesmo assim?")) return;
    const pid = uid();
    const sum = lines.reduce((s, l) => s + l.total, 0);
    save((d) => {
      for (const l of lines) {
        const isPack = l.cat === "fralda" || (l.units && l.cat === "higiene");
        const qty = isPack ? (l.units ?? 1) * l.qty : l.qty;
        const price = qty ? l.total / qty : 0;
        // mesmo produto já no estoque (fralda do mesmo tamanho e marca) soma; o resto vira item novo
        const same = isPack ? d.items.find((i) => i.babyId === b.id && i.cat === l.cat && i.name.toLowerCase() === l.name.toLowerCase() && i.size === l.size.toUpperCase()) : undefined;
        if (same) {
          same.qty += qty;
          l.itemId = same.id;
        } else {
          const it: Item = { id: uid(), babyId: b.id, name: l.name.trim(), cat: l.cat, size: l.size.toUpperCase(), color: "", brand: l.brand ?? "", qty, price, date: g("date") || today(), state: "uso", loc: "", notes: "", purchaseId: pid, barcode: l.barcode };
          d.items.push(it);
          l.itemId = it.id;
        }
        if (l.barcode) d.barcodes[l.barcode] = { name: l.name, cat: l.cat, brand: l.brand ?? "", size: l.size };
      }
      d.purchases.push({
        id: pid, store: g("store"), cnpj: g("cnpj").replace(/\D/g, ""), date: g("date") || today(), number: g("number"), key: p.key,
        total: parseFloat(g("total")) || sum - (parseFloat(g("discount")) || 0), discount: parseFloat(g("discount")) || 0,
        lines: lines.map(({ low: _low, ...l }) => (void _low, l)), source: p.source, createdAt: new Date().toISOString(),
      });
    });
    const toW = fd.get("toWardrobe") && lines.some((l) => l.cat === "roupa" || l.cat === "sapato");
    pending = null;
    toast("🛍️ Sua compra foi cadastrada com sucesso!");
    location.hash = toW ? "#quarto" : `#compra/${pid}`;
  };
}

function purchases(v: HTMLElement) {
  const list = db().purchases.slice().sort((x, y) => y.date.localeCompare(x.date));
  v.innerHTML = `${head("Histórico de compras", "#mais", `<a class="chip" href="#nota">+ Nota</a>`)}
    <div class="list">${list.map((p) => `<a class="row" href="#compra/${p.id}"><span>${{ xml: "📄", foto: "📸", texto: "📋", manual: "✍️", qr: "🔳" }[p.source]}</span><div><b>${esc(p.store || "Compra")}</b><small>${fmtDate(p.date)} · ${p.lines.length} itens${p.returned?.length ? " · com devolução" : ""}</small></div><em>${money(p.total)}</em></a>`).join("") || `<p class="note">Nenhuma compra ainda.</p>`}</div>`;
}
function purchase(v: HTMLElement, id?: string) {
  const p = db().purchases.find((x) => x.id === id);
  if (!p) return (location.hash = "#compras");
  v.innerHTML = `${head(esc(p.store || "Compra"), "#compras")}
    <div class="sum"><div><small>Data</small><b>${fmtDate(p.date)}</b></div><div><small>Total</small><b>${money(p.total)}</b></div>${p.discount ? `<div><small>Desconto</small><b>${money(p.discount)}</b></div>` : ""}</div>
    ${p.cnpj ? `<p class="fine">CNPJ ${esc(p.cnpj)}${p.number ? ` · nota ${esc(p.number)}` : ""}${p.key ? `<br>Chave ${esc(p.key)}` : ""}</p>` : ""}
    <div class="list">${p.lines.map((l) => `<a class="row" ${l.itemId ? `href="#item/${l.itemId}"` : ""}><span>${catIcon(l.cat)}</span><div><b>${esc(l.name)}</b><small>${l.qty}× ${l.size ? `tam. ${esc(l.size)} · ` : ""}${esc(l.desc)}</small></div><em>${money(l.total)}</em></a>`).join("")}</div>
    ${(p.returned ?? []).map((r) => `<div class="alert">↩️ Devolução/troca em ${fmtDate(r.date)}: ${money(r.value)} ${esc(r.note)}</div>`).join("")}
    <div class="row2"><button class="btn ghost" id="ret">↩️ Registrar troca/devolução</button><button class="btn danger" id="del">Apagar compra</button></div>`;
  $("#ret").onclick = () => {
    const val = parseFloat((prompt("Valor devolvido ou estornado (R$):") ?? "").replace(",", "."));
    if (!val) return;
    const note = prompt("O que foi trocado/devolvido?") ?? "";
    save((d) => {
      const x = d.purchases.find((y) => y.id === p.id)!;
      (x.returned ??= []).push({ date: today(), value: val, note });
    });
    purchase(v, id);
  };
  $("#del").onclick = () => {
    if (!confirm("Apagar a compra? Os itens cadastrados por ela continuam no inventário.")) return;
    save((d) => (d.purchases = d.purchases.filter((x) => x.id !== p.id)));
    location.hash = "#compras";
  };
}

// ---------- gastos
function money_(v: HTMLElement) {
  const d = db();
  const now = new Date();
  const ym = (dt: Date) => dt.toISOString().slice(0, 7);
  const m0 = ym(now) + "-01", y0 = `${now.getFullYear()}-01-01`;
  const month = spent(m0, today()), year = spent(y0, today());
  const months = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const a = ym(dt) + "-01", z = ym(dt) + "-31";
    return { label: dt.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), value: spent(a, z) };
  });
  const max = Math.max(1, ...months.map((m) => m.value));
  const byCat = new Map<Cat, number>(), byStore = new Map<string, number>();
  for (const p of d.purchases.filter((x) => x.date >= y0)) {
    byStore.set(p.store || "Sem loja", (byStore.get(p.store || "Sem loja") ?? 0) + p.total);
    for (const l of p.lines) byCat.set(l.cat, (byCat.get(l.cat) ?? 0) + l.total);
  }
  const bar = (m: Map<string, number>, name: (k: string) => string) => {
    const arr = [...m].sort((a, b) => b[1] - a[1]).slice(0, 6), top = Math.max(1, ...arr.map((x) => x[1]));
    return arr.map(([k, val]) => `<div class="hbar"><span>${esc(name(k))}</span><i style="width:${(val / top) * 100}%"></i><b>${money(val)}</b></div>`).join("") || `<p class="note">Sem dados ainda.</p>`;
  };
  v.innerHTML = `${head("Gastos do bebê", "#mais")}
    <div class="sum"><div><small>Este mês</small><b>${money(month)}</b></div><div><small>Este ano</small><b>${money(year)}</b></div>${d.budget ? `<div><small>Orçamento</small><b class="${month > d.budget ? "red" : ""}">${Math.round((month / d.budget) * 100)}%</b></div>` : ""}</div>
    <h2>Últimos 6 meses</h2><div class="vbars">${months.map((m) => `<div><i style="height:${(m.value / max) * 100}%"></i><small>${m.label}</small></div>`).join("")}</div>
    <h2>Por categoria (ano)</h2>${bar(byCat as Map<string, number>, (k) => catName(k as Cat))}
    <h2>Por loja (ano)</h2>${bar(byStore, (k) => k)}
    <div class="row2"><button class="btn ghost" id="bud">🎯 Orçamento mensal</button><button class="btn ghost" id="csv">⬇️ Planilha (CSV)</button></div>
    <a class="btn ghost" href="#compras">🧾 Histórico de compras</a>`;
  $("#bud").onclick = () => {
    const val = parseFloat((prompt("Orçamento mensal (R$):", String(d.budget || "")) ?? "").replace(",", "."));
    if (!isNaN(val)) save((x) => (x.budget = val));
  };
  $("#csv").onclick = () => {
    const rows = [["data", "loja", "cnpj", "item", "categoria", "tamanho", "qtd", "total"]];
    for (const p of d.purchases) for (const l of p.lines.length ? p.lines : [{ name: "(sem itens)", cat: "outro", size: "", qty: 1, total: p.total } as Line]) rows.push([p.date, p.store, p.cnpj, l.name, catName(l.cat), l.size, String(l.qty), l.total.toFixed(2).replace(".", ",")]);
    download("gastos-do-bebe.csv", new Blob(["﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n")], { type: "text/csv" }));
  };
}

// ---------- sono
function sleep(v: HTMLElement) {
  const b = baby()!;
  const mine = db().sleeps.filter((s) => s.babyId === b.id);
  const running = mine.find((s) => !s.end);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d0 = new Date();
    d0.setHours(0, 0, 0, 0);
    d0.setDate(d0.getDate() - 6 + i);
    const a = d0.getTime(), z = a + 864e5;
    const ms = mine.filter((s) => s.end).reduce((sum, s) => sum + Math.max(0, Math.min(z, new Date(s.end!).getTime()) - Math.max(a, new Date(s.start).getTime())), 0);
    return { label: d0.toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3), ms };
  });
  const max = Math.max(36e5, ...days.map((d) => d.ms));
  const avg = days.reduce((s, d) => s + d.ms, 0) / 7;
  v.innerHTML = `<section class="night">${head("Soninho do bebê", "#mais")}
    <div class="moon">🌙<span>✦</span><span>✧</span><span>✦</span></div>
    <div class="timer" id="tm">${running ? "" : "Acordado"}</div>
    <button class="btn big ${running ? "stop" : ""}" id="go">${running ? "☀️ Acordou" : "😴 Dormiu agora"}</button>
    <button class="btn ghost light" id="add">+ Registrar sono que já passou</button>
    <div class="sum dark"><div><small>Hoje</small><b>${dur(sleepToday(b.id))}</b></div><div><small>Média 7 dias</small><b>${dur(avg)}</b></div></div>
    <div class="vbars dark">${days.map((d) => `<div><i style="height:${(d.ms / max) * 100}%"></i><small>${d.label}</small></div>`).join("")}</div>
    <div class="list dark">${mine.filter((s) => s.end).sort((x, y) => y.start.localeCompare(x.start)).slice(0, 12).map((s) => `<div class="row"><span>${new Date(s.start).getHours() >= 19 || new Date(s.start).getHours() < 6 ? "🌙" : "☁️"}</span><div><b>${dur(new Date(s.end!).getTime() - new Date(s.start).getTime())}</b><small>${new Date(s.start).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} → ${new Date(s.end!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></div><button class="x" data-del="${s.id}">✕</button></div>`).join("")}</div>
    <p class="fine light">Os registros ajudam a ver a rotina. Não servem para diagnóstico.</p></section>`;
  if (running) {
    const t = setInterval(() => ($("#tm").textContent = dur(Date.now() - new Date(running.start).getTime()) + " dormindo"), 1000);
    $("#tm").textContent = dur(Date.now() - new Date(running.start).getTime()) + " dormindo";
    cleanup = () => clearInterval(t);
  }
  $("#go").onclick = () => save((d) => {
    const r = d.sleeps.find((s) => s.babyId === b.id && !s.end);
    if (r) r.end = new Date().toISOString();
    else d.sleeps.push({ id: uid(), babyId: b.id, start: new Date().toISOString() });
  });
  $("#add").onclick = () => {
    const a = prompt("Dormiu às (HH:MM):"), z = a && prompt("Acordou às (HH:MM):");
    if (!a || !z) return;
    const mk = (hm: string) => {
      const [h, m] = hm.split(":").map(Number), d0 = new Date();
      d0.setHours(h, m || 0, 0, 0);
      return d0;
    };
    const s = mk(a), e = mk(z);
    if (e <= s) s.setDate(s.getDate() - 1);
    save((d) => d.sleeps.push({ id: uid(), babyId: b.id, start: s.toISOString(), end: e.toISOString() }));
  };
  $$("[data-del]").forEach((x) => (x.onclick = () => confirm("Apagar este registro?") && save((d) => (d.sleeps = d.sleeps.filter((s) => s.id !== x.dataset.del)))));
}

// ---------- crescimento
function growth(v: HTMLElement) {
  const b = baby()!;
  const ms = db().measures.filter((m) => m.babyId === b.id).sort((x, y) => x.date.localeCompare(y.date));
  v.innerHTML = `${head("Crescimento", "#mais")}
    <div class="scroller"><button data-m="weight" class="on">Peso</button><button data-m="length">Comprimento</button><button data-m="head">Perímetro cefálico</button><button data-m="foot">Pé</button></div>
    <canvas id="ch" class="chart" width="700" height="360"></canvas>
    <form class="form" id="mf"><h2>Nova medida</h2>
      <div class="row2"><label>Data<input name="date" type="date" value="${today()}"></label><label>Peso (kg)<input name="weight" type="number" step="0.01"></label></div>
      <div class="row2"><label>Comprimento (cm)<input name="length" type="number" step="0.1"></label><label>Perímetro cefálico (cm)<input name="head" type="number" step="0.1"></label></div>
      <label>Pé (cm, do calcanhar ao dedão)<input name="foot" type="number" step="0.1"></label>
      <button class="btn">Salvar medida</button></form>
    <div class="list">${ms.slice().reverse().map((m) => `<div class="row"><span>📏</span><div><b>${fmtDate(m.date)}</b><small>${[m.weight && `${m.weight} kg`, m.length && `${m.length} cm`, m.head && `PC ${m.head} cm`, m.foot && `pé ${m.foot} cm`].filter(Boolean).join(" · ")}</small></div><button class="x" data-del="${m.id}">✕</button></div>`).join("")}</div>
    <p class="fine">Os percentis da OMS ainda não estão no app (vão entrar só com as tabelas oficiais conferidas). ${b.premature ? "Prematuro: o pediatra usa a idade corrigida. " : ""}O acompanhamento não substitui a avaliação pediátrica.</p>`;
  let k: "weight" | "length" | "head" | "foot" = "weight";
  const draw = () => {
    const c = $<HTMLCanvasElement>("#ch"), x = c.getContext("2d")!;
    x.clearRect(0, 0, c.width, c.height);
    const pts = ms.filter((m) => m[k]).map((m) => ({ t: (new Date(m.date).getTime() - new Date(b.birth).getTime()) / 864e5 / 30.44, y: m[k]! }));
    x.font = "22px Nunito, sans-serif";
    x.fillStyle = "#8a7f75";
    if (pts.length < 2) {
      x.fillText(pts.length ? "Registre mais uma medida para ver a linha." : "Sem medidas ainda.", 30, 180);
      return;
    }
    const tx = Math.max(...pts.map((p) => p.t), 1), y0 = Math.min(...pts.map((p) => p.y)) * 0.95, y1 = Math.max(...pts.map((p) => p.y)) * 1.03;
    const X = (t: number) => 60 + (t / tx) * (c.width - 90), Y = (y: number) => c.height - 40 - ((y - y0) / (y1 - y0)) * (c.height - 70);
    x.strokeStyle = "#eee4da";
    for (let i = 0; i <= 4; i++) {
      const yy = y0 + ((y1 - y0) * i) / 4;
      x.beginPath();
      x.moveTo(60, Y(yy));
      x.lineTo(c.width - 20, Y(yy));
      x.stroke();
      x.fillText(yy.toFixed(1).replace(".", ","), 4, Y(yy) + 7);
    }
    x.fillText("0", 56, c.height - 10);
    x.fillText(`${tx.toFixed(1).replace(".", ",")} meses`, c.width - 150, c.height - 10);
    x.strokeStyle = "#c98f9b";
    x.lineWidth = 4;
    x.beginPath();
    pts.forEach((p, i) => (i ? x.lineTo(X(p.t), Y(p.y)) : x.moveTo(X(p.t), Y(p.y))));
    x.stroke();
    x.fillStyle = "#c98f9b";
    for (const p of pts) {
      x.beginPath();
      x.arc(X(p.t), Y(p.y), 7, 0, 7);
      x.fill();
    }
  };
  $$("[data-m]").forEach((x) => (x.onclick = () => {
    k = x.dataset.m as typeof k;
    $$("[data-m]").forEach((y) => y.classList.toggle("on", y === x));
    draw();
  }));
  draw();
  $<HTMLFormElement>("#mf").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const n = (key: string) => parseFloat(String(fd.get(key) ?? "").replace(",", ".")) || undefined;
    const m = { id: uid(), babyId: b.id, date: String(fd.get("date")) || today(), weight: n("weight"), length: n("length"), head: n("head"), foot: n("foot") };
    if (!m.weight && !m.length && !m.head && !m.foot) return toast("Preencha pelo menos uma medida");
    save((d) => d.measures.push(m));
  };
  $$("[data-del]").forEach((x) => (x.onclick = () => confirm("Apagar esta medida?") && save((d) => (d.measures = d.measures.filter((m) => m.id !== x.dataset.del)))));
}

// ---------- fraldas
function diapers(v: HTMLElement) {
  const b = baby()!;
  const ds = diaperStock(b.id);
  const packs = db().items.filter((i) => i.babyId === b.id && (i.cat === "fralda" || /len[cç]o|pomada|algod/i.test(i.name)));
  const todayUse = db().diapers.filter((d) => d.babyId === b.id && d.date.slice(0, 10) === today()).reduce((s, d) => s + d.qty, 0);
  v.innerHTML = `${head("Fraldas e higiene", "#mais")}
    <div class="sum"><div><small>Fraldas em casa</small><b>${ds.stock}</b></div><div><small>Por dia</small><b>${ds.perDay ? ds.perDay.toFixed(1).replace(".", ",") : "—"}</b></div><div><small>Dura</small><b class="${ds.daysLeft !== null && ds.daysLeft < 5 ? "red" : ""}">${ds.daysLeft === null ? "—" : `~${ds.daysLeft} dias`}</b></div></div>
    <h2>Trocou agora? <small>hoje: ${todayUse}</small></h2>
    <div class="row3"><button class="btn" data-use="1">+1 fralda</button><button class="btn ghost" data-use="2">+2</button><button class="btn ghost" data-undo>Desfazer</button></div>
    <h2>Estoque</h2><div class="list">${packs.map((i) => itemRow(i)).join("") || `<p class="note">Cadastre fraldas pela nota fiscal ou em Itens.</p>`}</div>
    <a class="btn ghost" href="#item/novo">+ Cadastrar pacote</a>
    <p class="fine">A previsão usa a média de trocas registradas nos últimos 7 dias.</p>`;
  $$("[data-use]").forEach((x) => (x.onclick = () => {
    if (!ds.stock) toast("Sem fraldas no estoque: a troca fica registrada mesmo assim.");
    spendDiapers(b.id, Number(x.dataset.use));
  }));
  $("[data-undo]").onclick = () => save((d) => {
    const last = d.diapers.filter((x) => x.babyId === b.id).pop();
    if (!last) return;
    d.diapers = d.diapers.filter((x) => x !== last);
    const it = d.items.find((i) => i.babyId === b.id && i.cat === "fralda");
    if (it) it.qty += last.qty;
  });
}

// ---------- agenda (compromissos + mêsversários)
function agenda(v: HTMLElement) {
  const b = baby()!;
  const evs = db().events.filter((e) => e.babyId === b.id).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  const a = age(b.birth);
  const mvs = Array.from({ length: 3 }, (_, i) => new Date(new Date(b.birth + "T12:00").getFullYear(), new Date(b.birth + "T12:00").getMonth() + a.months + 1 + i, new Date(b.birth + "T12:00").getDate()));
  v.innerHTML = `${head("Agenda", "#mais")}
    <form class="form" id="ef"><div class="row2"><label>O quê<input name="title" required placeholder="Consulta com a pediatra"></label>
      <label>Tipo<select name="kind"><option value="consulta">🩺 Consulta</option><option value="vacina">💉 Vacina</option><option value="remedio">💊 Remédio</option><option value="compra">🛍️ Compra</option><option value="outro">📌 Outro</option></select></label></div>
      <div class="row2"><label>Dia<input name="date" type="date" required value="${today()}"></label><label>Hora<input name="time" type="time"></label></div>
      <button class="btn">Adicionar</button></form>
    <h2>Próximos</h2><div class="list">${evs.filter((e) => e.date >= today()).map((e) => `<div class="row"><span>${{ consulta: "🩺", vacina: "💉", remedio: "💊", compra: "🛍️", outro: "📌" }[e.kind]}</span><div><b>${esc(e.title)}</b><small>${fmtDate(e.date)} ${e.time}</small></div><button class="x" data-del="${e.id}">✕</button></div>`).join("")}
      ${mvs.map((d, i) => `<div class="row"><span>🎂</span><div><b>${a.months + 1 + i}º mêsversário</b><small>${d.toLocaleDateString("pt-BR")}</small></div></div>`).join("")}</div>
    ${evs.some((e) => e.date < today()) ? `<h2>Passados</h2><div class="list">${evs.filter((e) => e.date < today()).reverse().slice(0, 10).map((e) => `<div class="row past"><span>✓</span><div><b>${esc(e.title)}</b><small>${fmtDate(e.date)}</small></div></div>`).join("")}</div>` : ""}`;
  $<HTMLFormElement>("#ef").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    save((d) => d.events.push({ id: uid(), babyId: b.id, title: String(fd.get("title")), kind: fd.get("kind") as never, date: String(fd.get("date")), time: String(fd.get("time") ?? ""), notes: "" }));
  };
  $$("[data-del]").forEach((x) => (x.onclick = () => save((d) => (d.events = d.events.filter((e) => e.id !== x.dataset.del)))));
}

// ---------- remédios (só registro do que o médico receitou; o app não calcula dose)
function meds(v: HTMLElement) {
  const b = baby()!;
  const list = db().meds.filter((m) => m.babyId === b.id);
  v.innerHTML = `${head("Remédios receitados", "#mais")}
    <p class="note">Anote exatamente como o médico receitou. O app não sugere nem calcula doses.</p>
    <form class="form" id="mf"><label>Remédio<input name="name" required></label><div class="row2"><label>Dose (como na receita)<input name="dose" required></label><label>Até<input name="until" type="date"></label></div>
      <label>Horários (separe por vírgula)<input name="times" placeholder="08:00, 20:00"></label><button class="btn">Adicionar</button></form>
    <div class="list">${list.map((m) => `<div class="row"><span>💊</span><div><b>${esc(m.name)} · ${esc(m.dose)}</b><small>${m.times.join(", ")}${m.until ? ` · até ${fmtDate(m.until)}` : ""}${m.given.length ? ` · última dose ${new Date(m.given[m.given.length - 1]).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</small></div><button class="chip" data-give="${m.id}">Dei agora</button><button class="x" data-del="${m.id}">✕</button></div>`).join("")}</div>`;
  $<HTMLFormElement>("#mf").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    save((d) => d.meds.push({ id: uid(), babyId: b.id, name: String(fd.get("name")), dose: String(fd.get("dose")), until: String(fd.get("until") ?? ""), times: String(fd.get("times") ?? "").split(",").map((s) => s.trim()).filter(Boolean), notes: "", given: [] }));
  };
  $$("[data-give]").forEach((x) => (x.onclick = () => save((d) => d.meds.find((m) => m.id === x.dataset.give)!.given.push(new Date().toISOString()))));
  $$("[data-del]").forEach((x) => (x.onclick = () => confirm("Apagar?") && save((d) => (d.meds = d.meds.filter((m) => m.id !== x.dataset.del)))));
}

// ---------- enxoval: lista padrão ligada ao inventário
const LAYETTE: [string, string, number, RegExp][] = [
  ["Roupas", "Bodies", 8, /body/i], ["Roupas", "Macacões", 6, /macac/i], ["Roupas", "Calças/mijões", 6, /cal[cç]a|mij/i], ["Roupas", "Meias", 6, /meia/i],
  ["Roupas", "Casaquinhos", 2, /casac|jaquet/i], ["Roupas", "Toucas", 2, /touca/i], ["Banho", "Toalhas", 3, /toalha/i], ["Banho", "Banheira", 1, /banheira/i],
  ["Higiene", "Fraldas (pacotes)", 4, /fralda/i], ["Higiene", "Lenços umedecidos", 4, /len[cç]o/i], ["Higiene", "Pomada", 1, /pomada/i],
  ["Alimentação", "Babadores", 4, /babador/i], ["Alimentação", "Mamadeiras", 2, /mamad/i], ["Sono", "Lençóis", 3, /len[cç]ol/i], ["Sono", "Cobertores", 2, /cobert|manta/i],
  ["Passeio", "Bolsa", 1, /bolsa/i], ["Passeio", "Cadeirinha", 1, /cadeir|conforto/i], ["Passeio", "Carrinho", 1, /carrinho/i],
];
function layette(v: HTMLElement) {
  const b = baby()!;
  const its = db().items.filter((i) => i.babyId === b.id);
  const got = (re: RegExp) => its.filter((i) => re.test(i.name)).reduce((s, i) => s + (i.cat === "fralda" ? 1 : i.qty), 0);
  const groups = [...new Set(LAYETTE.map((x) => x[0]))];
  const done = LAYETTE.filter((x) => got(x[3]) >= x[2]).length;
  v.innerHTML = `${head("Enxoval", "#mais")}<div class="sum"><div><small>Completo</small><b>${Math.round((done / LAYETTE.length) * 100)}%</b></div><div><small>Faltam</small><b>${LAYETTE.length - done} itens</b></div></div>
    ${groups.map((g) => `<h2>${g}</h2><div class="list">${LAYETTE.filter((x) => x[0] === g).map(([, name, want, re]) => {
      const n = got(re);
      return `<div class="row ${n >= want ? "ok" : ""}"><span>${n >= want ? "✅" : "⬜"}</span><div><b>${name}</b><small>${n} de ${want}</small></div><i class="prog"><b style="width:${Math.min(100, (n / want) * 100)}%"></b></i></div>`;
    }).join("")}</div>`).join("")}
    <p class="fine">As quantidades são uma sugestão comum; ajuste ao seu clima e rotina. O que você cadastra (inclusive pela nota) já conta aqui.</p>`;
}

// ---------- mala de viagem (com o que já tem cadastrado)
function trip(v: HTMLElement) {
  const b = baby()!;
  v.innerHTML = `${head("Montar mala", "#itens")}<form class="form" id="tf"><div class="row2"><label>Quantos dias<input name="days" type="number" min="1" value="3"></label>
    <label>Clima<select name="clima"><option value="calor">☀️ Calor</option><option value="frio">❄️ Frio</option><option value="misto">⛅ Misto</option></select></label></div><button class="btn">Montar</button></form><div id="out"></div>`;
  $<HTMLFormElement>("#tf").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const n = Math.max(1, parseInt(String(fd.get("days"))) || 3), clima = String(fd.get("clima"));
    const its = db().items.filter((i) => i.babyId === b.id && i.state === "uso");
    const pick = (re: RegExp, k: number) => {
      const has = its.filter((i) => re.test(i.name));
      return { has, k };
    };
    const rows = [
      ["Bodies", pick(/body/i, n * 2)], ["Macacões/pijamas", pick(/macac|pijama/i, n + 1)], ["Calças/mijões", pick(/cal[cç]a|mij/i, n)], ["Meias", pick(/meia/i, n + 1)],
      ...(clima !== "calor" ? [["Casaquinho", pick(/casac/i, 2)], ["Touca", pick(/touca/i, 1)]] : []), ["Fraldas", pick(/fralda/i, Math.ceil(n * (diaperStock(b.id).perDay || 7)))],
      ["Lenços umedecidos", pick(/len[cç]o/i, 1)], ["Pomada", pick(/pomada/i, 1)], ["Toalha", pick(/toalha/i, 1)], ["Cobertor", pick(/cobert|manta/i, 1)],
    ] as [string, { has: Item[]; k: number }][];
    $("#out").innerHTML = `<div class="list">${rows.map(([name, r]) => `<label class="row"><input type="checkbox"><div><b>${r.k}× ${name}</b><small>${r.has.length ? r.has.slice(0, 3).map((i) => `${esc(i.name)}${i.size ? ` ${esc(i.size)}` : ""}${i.loc ? ` (${compName(i.loc)})` : ""}`).join(", ") : "nada cadastrado ainda"}</small></div></label>`).join("")}</div>`;
  };
}

// ---------- bebês
function babyForm(v: HTMLElement, arg?: string) {
  const ex = arg ? db().babies.find((x) => x.id === arg) : undefined;
  const b: Baby = ex ?? { id: uid(), name: "", nick: "", birth: "", sex: "", premature: false, notes: "", theme: "rosa" };
  v.innerHTML = `${db().babies.length ? head(ex ? "Editar bebê" : "Novo bebê", "#bebes") : `<header class="hd"><h1>Seu bebê</h1></header>`}
  <form class="form" id="bf">
    <div class="row2"><label>Nome<input name="name" required value="${esc(b.name)}"></label><label>Apelido<input name="nick" value="${esc(b.nick)}"></label></div>
    <div class="row2"><label>Nascimento (ou data prevista)<input name="birth" type="date" required value="${b.birth}"></label>
    <label>Sexo (opcional)<select name="sex"><option value="">—</option><option value="menina" ${b.sex === "menina" ? "selected" : ""}>Menina</option><option value="menino" ${b.sex === "menino" ? "selected" : ""}>Menino</option></select></label></div>
    <h2>Ao nascer <small>(opcional)</small></h2>
    <div class="row3"><label>Peso (kg)<input name="weight" type="number" step="0.01" value="${b.weight ?? ""}"></label><label>Compr. (cm)<input name="length" type="number" step="0.1" value="${b.length ?? ""}"></label><label>PC (cm)<input name="head" type="number" step="0.1" value="${b.head ?? ""}"></label></div>
    <label class="check"><input type="checkbox" name="premature" ${b.premature ? "checked" : ""}> Nasceu prematuro</label>
    <label>Semanas de gestação<input name="gaWeeks" type="number" min="22" max="42" value="${b.gaWeeks ?? ""}"></label>
    <label>Cor do tema</label><div class="themes">${(Object.keys(THEMES) as Theme[]).map((t) => `<label><input type="radio" name="theme" value="${t}" ${b.theme === t ? "checked" : ""}><span style="background:${THEMES[t]}"></span></label>`).join("")}</div>
    <label>Observações<textarea name="notes" rows="2">${esc(b.notes)}</textarea></label>
    <button class="btn big">Salvar</button>
    ${ex ? `<button type="button" class="btn danger" id="del">Apagar este bebê e os dados dele</button>` : ""}
  </form>`;
  $<HTMLFormElement>("#bf").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const n = (k: string) => parseFloat(g(k).replace(",", ".")) || undefined;
    const next: Baby = { ...b, name: g("name"), nick: g("nick"), birth: g("birth"), sex: g("sex") as Baby["sex"], weight: n("weight"), length: n("length"), head: n("head"), premature: !!fd.get("premature"), gaWeeks: n("gaWeeks"), notes: g("notes"), theme: (g("theme") || "rosa") as Theme };
    save((d) => {
      const i = d.babies.findIndex((x) => x.id === next.id);
      if (i >= 0) d.babies[i] = next;
      else {
        d.babies.push(next);
        // as medidas do nascimento viram o 1º ponto do crescimento
        if (next.weight || next.length || next.head) d.measures.push({ id: uid(), babyId: next.id, date: next.birth, weight: next.weight, length: next.length, head: next.head });
      }
      d.current = next.id;
    });
    location.hash = "#inicio";
  };
  if (ex) $("#del").onclick = () => {
    if (!confirm(`Apagar ${b.name} e TODOS os dados dele (roupas, sono, medidas)?`)) return;
    save((d) => {
      d.babies = d.babies.filter((x) => x.id !== b.id);
      for (const k of ["items", "sleeps", "measures", "diapers", "events", "meds"] as const) (d[k] as { babyId: string }[]) = (d[k] as { babyId: string }[]).filter((x) => x.babyId !== b.id);
      d.current = d.babies[0]?.id ?? "";
    });
    location.hash = "#inicio";
  };
}
function babies(v: HTMLElement) {
  v.innerHTML = `${head("Bebês", "#mais", `<a class="chip" href="#bebe">+ Bebê</a>`)}<div class="list">${db().babies.map((b) => `<div class="row ${b.id === baby()?.id ? "ok" : ""}"><span class="avatar sm" style="background:${THEMES[b.theme]}">${esc(b.name[0])}</span><div><b>${esc(b.name)}</b><small>${ageText(b.birth)}</small></div><button class="chip" data-use="${b.id}">${b.id === baby()?.id ? "Atual" : "Usar"}</button><a class="chip" href="#bebe/${b.id}">Editar</a></div>`).join("")}</div>`;
  $$("[data-use]").forEach((x) => (x.onclick = () => save((d) => (d.current = x.dataset.use!))));
}

// ---------- mais
function more(v: HTMLElement) {
  const links = [
    ["#sono", "🌙", "Soninho"], ["#crescimento", "📏", "Crescimento"], ["#fraldas", "🧷", "Fraldas e higiene"], ["#gastos", "💰", "Gastos"],
    ["#compras", "🧾", "Histórico de compras"], ["#agenda", "📅", "Agenda e mêsversários"], ["#remedios", "💊", "Remédios receitados"], ["#enxoval", "🎀", "Enxoval"],
    ["#babybot", "🤖", "BabyBot"], ["#lista", "🛒", "Lista de compras"], ["#memorias", "📸", "Memórias"],
    ["#relatorio", "📄", "Relatório do mês (PDF)"], ["#etiquetas", "🏷️", "Etiquetas com QR Code"], ["#assinar", "💳", "Assinatura"], ["#mala", "🧳", "Montar mala"], ["#bebes", "👶", "Bebês (irmãos, gêmeos)"], ["#conta", "👨‍👩‍👧", "Conta e família"], ["#avisos", "🔔", "Avisos no celular"],
    ["#backup", "💾", "Backup"], ["#privacidade", "🔒", "Privacidade"],
  ];
  v.innerHTML = `${head("Mais", "#inicio")}<div class="menu">${links.map(([h, i, n]) => `<a href="${h}"><span>${i}</span>${n}</a>`).join("")}</div>
    <button class="btn ghost" id="inst" hidden>📲 Instalar no celular</button><p class="fine center">Cantinho do bebê · versão 1</p>`;
  if (installEvt) {
    $("#inst").hidden = false;
    $("#inst").onclick = () => installEvt?.prompt();
  }
}
function backup(v: HTMLElement) {
  v.innerHTML = `${head("Backup", "#mais")}<p class="lead">Seus dados ficam só neste celular. Salve um backup de vez em quando (as fotos ficam fora do arquivo).</p>
    <button class="btn big" id="exp">⬇️ Baixar backup</button><label class="btn ghost">⬆️ Restaurar backup<input type="file" accept="application/json,.json" id="imp" hidden></label>
    <button class="btn danger" id="wipe">Apagar tudo deste celular</button>`;
  $("#exp").onclick = () => download(`cantinho-do-bebe-${today()}.json`, exportJson());
  $<HTMLInputElement>("#imp").onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f || !confirm("Trocar os dados deste celular pelos do backup?")) return;
    try {
      importJson(await f.text());
      toast("Backup restaurado");
      location.hash = "#inicio";
    } catch (err) {
      toast((err as Error).message);
    }
  };
  $("#wipe").onclick = () => {
    if (prompt('Para apagar tudo, digite "APAGAR"') !== "APAGAR") return;
    resetAll();
    indexedDB.deleteDatabase("cantinho");
    location.hash = "";
    route();
  };
}
function privacy(v: HTMLElement) {
  v.innerHTML = `${head("Privacidade", "#mais")}<div class="text">
    <p><b>Onde ficam os dados:</b> neste aparelho. Se você criar uma conta e uma família, os registros e as fotos das peças vão também para a nuvem (pasta privada da família, acessada só por links que vencem), e só as pessoas que você convidar veem. Sem conta, nada sai do celular.</p>
    <p><b>Avisos:</b> na tela bloqueada nunca aparece nome de remédio nem o que é o compromisso, só "lembrete que você marcou".</p>
    <p><b>Leitura da nota por foto:</b> feita no próprio celular. Na primeira vez o app baixa o leitor de texto em português; a foto não sai do aparelho.</p>
    <p><b>QR Code da NFC-e:</b> abre a nota no site da Secretaria da Fazenda do seu estado, se você tocar no link.</p>
    <p><b>Seus direitos (LGPD):</b> você pode baixar todos os dados (Backup), apagar tudo deste celular (Backup → Apagar tudo) e apagar sua conta na nuvem (Conta e família → Apagar minha conta).</p>
    <p><b>Saúde:</b> sono, medidas e remédios são só registros. O app não faz diagnóstico, não calcula dose e não substitui o pediatra.</p></div>`;
}

// ---------- instalar (PWA)
let installEvt: (Event & { prompt: () => void }) | null = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvt = e as Event & { prompt: () => void };
});
/** Pop-up "ponha o app na tela inicial" (Android: botão que instala; iPhone: o passo a passo do Safari). */
function installPopup() {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (matchMedia("(display-mode: standalone)").matches || nav.standalone) return; // já está instalado
  if (document.querySelector(".inst-pop")) return;
  try {
    localStorage.setItem("cb_inst", "1");
  } catch {
    /* sem armazenamento */
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = ios && !/crios|fxios|edgios/i.test(navigator.userAgent);
  const pop = document.createElement("div");
  pop.className = "inst-pop";
  pop.innerHTML = `<div class="inst-card" role="dialog" aria-modal="true" aria-labelledby="inst-t">
    <div class="inst-ico"><img src="/bebe/icon-192.png" alt=""></div>
    <h2 id="inst-t">Coloque o Cantinho na tela inicial 📲</h2>
    <p>Fica igual a um aplicativo: abre com um toque, em tela cheia, e os avisos (fralda, remédio, consulta) chegam no celular.</p>
    ${ios ? (safari ? `<ol class="inst-steps">
        <li><span>1</span><div>Toque em <b>Compartilhar</b> <i class="ios-share">⬆︎</i> na barra de baixo do Safari</div></li>
        <li><span>2</span><div>Role e toque em <b>Adicionar à Tela de Início</b> ➕</div></li>
        <li><span>3</span><div>Toque em <b>Adicionar</b>, no canto de cima</div></li></ol>`
      : `<p class="note">No iPhone, abra este link no <b>Safari</b> (a bússola azul) e depois: Compartilhar ⬆︎ → <b>Adicionar à Tela de Início</b>.</p>`)
    : installEvt ? `<button class="btn big" id="inst-go">📲 Instalar agora</button>`
    : `<ol class="inst-steps"><li><span>1</span><div>Toque nos <b>3 pontinhos ⋮</b> do navegador, em cima</div></li><li><span>2</span><div>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b></div></li></ol>`}
    <button class="btn ghost" id="inst-later">Agora não</button></div>`;
  document.body.appendChild(pop);
  const close = () => pop.remove();
  pop.onclick = (e) => e.target === pop && close();
  (pop.querySelector("#inst-later") as HTMLButtonElement).onclick = close;
  const go = pop.querySelector("#inst-go") as HTMLButtonElement | null;
  if (go) go.onclick = () => {
    installEvt?.prompt();
    close();
  };
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/bebe/sw.js", { scope: "/bebe/" }).catch(() => {});
// link de convite: /bebe/?convite=CODIGO
{
  const inv = new URLSearchParams(location.search).get("convite");
  if (inv) {
    sessionStorage.setItem("cb_invite", inv.toUpperCase());
    history.replaceState(null, "", "/bebe/#conta");
  }
}
C.onSync(() => {
  const el = document.querySelector(".sync");
  if (el) el.outerHTML = syncBadge();
});
C.startSync();
route();
// quem já tem conta e ainda não viu o convite neste celular também vê uma vez
try {
  if (C.account() && !localStorage.getItem("cb_inst")) setTimeout(() => installPopup(), 2500);
} catch {
  /* sem armazenamento */
}

// ---------- conta, família e nuvem
function syncBadge() {
  const a = C.account();
  if (!a?.family) return "";
  const st = C.syncState();
  const t = { off: "", ok: "☁️ salvo na nuvem", busy: "☁️ sincronizando…", offline: "📴 sem internet (salvo no celular)", erro: "⚠️ não sincronizou" }[st];
  return `<span class="sync ${st}">${t}</span>`;
}
async function askMode(f: C.Family) {
  const local = db().babies.length > 0;
  const mode = local && !confirm(`Entrar na família "${f.name}".\n\nOK = juntar o que já está neste celular com os dados da família.\nCancelar = usar só os dados da família.`) ? "trocar" : "juntar";
  await C.enterFamily(f, mode);
  toast(`Pronto! Você está na família ${f.name} 💗`);
  location.hash = "#inicio";
}
function accountPage(v: HTMLElement) {
  const a = C.account();
  const invite = sessionStorage.getItem("cb_invite");
  if (!C.cloudOn()) {
    v.innerHTML = `${head("Conta e família", "#mais")}<p class="note">A nuvem não está disponível nesta versão.</p>`;
    return;
  }
  if (!a) {
    v.innerHTML = `${head("Conta e família", db().babies.length ? "#mais" : "")}
      ${invite ? `<div class="alert">💌 Você recebeu um convite para uma família. Crie sua conta ou entre para aceitar.</div>` : ""}
      <p class="lead">Com uma conta, os dados do bebê ficam guardados na nuvem e você pode compartilhar com o pai, a mãe, avós ou babá. Cada um vê e anota no próprio celular.</p>
      <div class="seg2"><button class="on" data-m="new">Criar conta</button><button data-m="in">Já tenho conta</button></div>
      <form class="form" id="af"><label data-only="new">Seu nome<input name="name" autocomplete="name"></label>
        <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
        <label>Senha<input name="pass" type="password" required minlength="6" autocomplete="current-password"></label>
        <button class="btn big" id="go">Criar conta</button></form>
      <button class="btn ghost" id="forgot" hidden>Esqueci a senha</button>
      <p class="fine">As fotos das peças vão para a nuvem da família (só quem você convidar vê). Você pode apagar a conta quando quiser.</p>`;
    let mode = "new";
    $$("[data-m]").forEach((x) => (x.onclick = () => {
      mode = x.dataset.m!;
      $$("[data-m]").forEach((y) => y.classList.toggle("on", y === x));
      $("[data-only=new]").hidden = mode !== "new";
      $("#go").textContent = mode === "new" ? "Criar conta" : "Entrar";
      $("#forgot").hidden = mode === "new";
    }));
    $("#forgot").onclick = async () => {
      const email = String(new FormData($<HTMLFormElement>("#af")).get("email") ?? "").trim() || prompt("Seu e-mail:")?.trim();
      if (!email) return;
      try {
        await C.resetRequest(email);
        toast("Se tiver conta com esse e-mail, o link chega em instantes 📩 (veja o spam)");
      } catch (err) {
        toast((err as Error).message);
      }
    };
    $<HTMLFormElement>("#af").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const g = (k: string) => String(fd.get(k) ?? "").trim();
      $("#go").textContent = "Aguarde…";
      try {
        const r = mode === "new" ? await C.signup(g("name"), g("email"), g("pass")) : await C.login(g("email"), g("pass"));
        setTimeout(() => installPopup(), 900); // logo depois de entrar: convite para pôr o app na tela inicial
        if (invite) {
          sessionStorage.removeItem("cb_invite");
          return askMode(await C.joinByCode(invite));
        }
        if (r.families.length === 1) return askMode(r.families[0]);
        route();
      } catch (err) {
        toast((err as Error).message);
        $("#go").textContent = mode === "new" ? "Criar conta" : "Entrar";
      }
    };
    return;
  }
  v.innerHTML = `${head("Conta e família", "#mais")}<p class="lead">Olá, <b>${esc(a.user.name)}</b> (${esc(a.user.email)})</p><div id="fam"><p class="note">Carregando…</p></div>
    <button class="btn ghost" id="out">Sair da conta neste celular</button><button class="btn danger" id="delacc">Apagar minha conta</button>`;
  $("#out").onclick = async () => {
    if (!confirm("Sair da conta? Os dados continuam neste celular.")) return;
    await C.logout();
    route();
  };
  $("#delacc").onclick = async () => {
    if (prompt('Isso apaga sua conta e as famílias em que você está sozinho(a). Digite "APAGAR" para confirmar.') !== "APAGAR") return;
    try {
      await C.api("delete_account");
      await C.logout();
      toast("Conta apagada. Os dados continuam neste celular.");
      route();
    } catch (err) {
      toast((err as Error).message);
    }
  };
  const fam = $("#fam");
  (async () => {
    try {
      if (invite) {
        sessionStorage.removeItem("cb_invite");
        return askMode(await C.joinByCode(invite));
      }
      const r = await C.me();
      const cur = a.family;
      if (!cur) {
        fam.innerHTML = `${r.families.length ? `<h2>Suas famílias</h2><div class="list">${r.families.map((f) => `<div class="row"><span>👨‍👩‍👧</span><div><b>${esc(f.name)}</b><small>${roleName(f.role)}</small></div><button class="chip" data-use="${f.id}">Usar</button></div>`).join("")}</div>` : ""}
          <h2>Criar a família do bebê</h2><form class="form" id="cf"><label>Nome da família<input name="name" value="Família ${esc(baby()?.name ?? "")}"></label><button class="btn">Criar e guardar na nuvem</button></form>
          <h2>Recebi um convite</h2><form class="form" id="jf"><label>Código do convite<input name="code" placeholder="ABCD2345" autocapitalize="characters"></label><button class="btn ghost">Entrar na família</button></form>`;
        $$("[data-use]", fam).forEach((x) => (x.onclick = () => askMode(r.families.find((f) => f.id === x.dataset.use)!)));
        $<HTMLFormElement>("#cf", fam).onsubmit = async (e) => {
          e.preventDefault();
          if (!db().babies.length) return toast("Cadastre o bebê primeiro");
          await C.createFamily(String(new FormData(e.target as HTMLFormElement).get("name")));
          toast("Família criada e dados na nuvem ☁️");
          route();
        };
        $<HTMLFormElement>("#jf", fam).onsubmit = async (e) => {
          e.preventDefault();
          try {
            await askMode(await C.joinByCode(String(new FormData(e.target as HTMLFormElement).get("code"))));
          } catch (err) {
            toast((err as Error).message);
          }
        };
        return;
      }
      const m = await C.api<{ role: C.Role; invite?: string; members: { id: string; name: string; email?: string; role: C.Role; me: boolean }[] }>("members", { family: cur.id });
      const link = m.invite ? `${location.origin}/bebe/?convite=${m.invite}` : "";
      fam.innerHTML = `<div class="sum"><div><small>Família</small><b>${esc(cur.name)}</b></div><div><small>Seu acesso</small><b>${roleName(m.role)}</b></div></div>
        <p class="fine">${syncBadge()} ${a.syncedAt ? `· última vez ${new Date(a.syncedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
        <button class="btn ghost" id="now">🔄 Sincronizar agora</button>
        <h2>Quem participa</h2><div class="list">${m.members.map((x) => `<div class="row"><span>${x.role === "dono" ? "👑" : x.role === "ve" ? "👀" : "✏️"}</span><div><b>${esc(x.name)}${x.me ? " (você)" : ""}</b><small>${roleName(x.role)}${x.email ? ` · ${esc(x.email)}` : ""}</small></div>
          ${m.role === "dono" && !x.me ? `<select data-role="${x.id}"><option value="edita" ${x.role === "edita" ? "selected" : ""}>Pode editar</option><option value="ve" ${x.role === "ve" ? "selected" : ""}>Só ver</option><option value="sair">Remover</option></select>` : ""}</div>`).join("")}</div>
        ${link ? `<h2>Convidar alguém</h2><p class="fine">Quem abrir o link cria a conta e entra podendo editar (você muda para "só ver" aqui).</p>
          <div class="row2"><button class="btn" id="wa">📲 Mandar no WhatsApp</button><button class="btn ghost" id="cp">🔗 Copiar link</button></div>
          <p class="fine">Código: <b>${m.invite}</b> · <a href="#" id="newinv">trocar código</a> (o antigo para de funcionar)</p>` : ""}
        <button class="btn ghost" id="leave">Sair desta família</button>`;
      $("#now", fam).onclick = async () => {
        await C.sync();
        toast(C.syncState() === "ok" ? "Tudo sincronizado ☁️" : "Não deu agora; tento de novo sozinho.");
        route();
      };
      $$<HTMLSelectElement>("[data-role]", fam).forEach((x) => (x.onchange = async () => {
        if (x.value === "sair" && !confirm("Remover essa pessoa da família?")) return route();
        await C.api("set_role", { family: cur.id, user: x.dataset.role, role: x.value });
        route();
      }));
      if (link) {
        const msg = `Oi! Entra no Cantinho do bebê para a gente acompanhar juntos o(a) ${baby()?.name ?? "bebê"} 💗 ${link}`;
        $("#wa", fam).onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
        $("#cp", fam).onclick = async () => {
          try {
            await navigator.clipboard.writeText(link);
            toast("Link copiado");
          } catch {
            prompt("Copie o link:", link);
          }
        };
        $("#newinv", fam).onclick = async (e) => {
          e.preventDefault();
          await C.api("new_invite", { family: cur.id });
          route();
        };
      }
      $("#leave", fam).onclick = async () => {
        if (!confirm(`Sair da família ${cur.name}? Os dados continuam neste celular, mas param de sincronizar.`)) return;
        await C.api("leave", { family: cur.id });
        await C.pushOffHere().catch(() => {});
        C.forgetFamily();
        route();
      };
    } catch (err) {
      fam.innerHTML = `<p class="note">${esc((err as Error).message)}</p>`;
    }
  })();
}
const roleName = (r: C.Role) => ({ dono: "Criou a família", edita: "Pode editar", ve: "Só ver" })[r];

function alertsPage(v: HTMLElement) {
  const on = C.pushPrefs();
  const p = on ?? C.defaultPrefs;
  const fam = C.account()?.family;
  const opts: [keyof C.Prefs, string][] = [["mv", "👶 Mêsversário (9h)"], ["fraldas", "🧷 Fraldas acabando (10h)"], ["roupas", "👕 Conferir roupinhas (domingo)"], ["agenda", "📅 Compromissos (véspera e 1 h antes)"], ["remedios", "💊 Horários de remédio que você marcou"], ["sono", "🌙 Lembrar de registrar a soneca (21h)"]];
  v.innerHTML = `${head("Avisos no celular", "#mais")}
    ${fam ? "" : `<div class="alert">Os avisos precisam de conta e família (é o servidor que manda o aviso com o app fechado). <a href="#conta">Criar agora</a></div>`}
    <form class="form" id="pf">${opts.map(([k, n]) => `<label class="check"><input type="checkbox" name="${k}" ${p[k] ? "checked" : ""}> ${n}</label>`).join("")}
      <div class="row2"><label>Silêncio de<input name="q1" type="time" value="${p.quiet.slice(0, 5)}"></label><label>até<input name="q2" type="time" value="${p.quiet.slice(6)}"></label></div>
      <p class="fine">No silêncio só tocam os lembretes de remédio. Na tela bloqueada não aparece o nome do remédio nem o que é o compromisso.</p>
      <button class="btn big" ${fam ? "" : "disabled"}>${on ? "Salvar" : "🔔 Ligar avisos"}</button>
      ${on ? `<div class="row2"><button type="button" class="btn ghost" id="test">Mandar um teste</button><button type="button" class="btn danger" id="off">Desligar</button></div>` : ""}
    </form><p class="fine">No iPhone, os avisos só funcionam com o app adicionado à tela inicial (Compartilhar → Adicionar à Tela de Início).</p>`;
  $<HTMLFormElement>("#pf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const prefs = { ...C.defaultPrefs, quiet: `${fd.get("q1") || "22:00"}-${fd.get("q2") || "07:00"}` } as C.Prefs;
    for (const [k] of opts) (prefs as unknown as Record<string, boolean>)[k] = !!fd.get(k);
    try {
      await C.pushOn(prefs);
      toast("🔔 Avisos ligados");
      route();
    } catch (err) {
      toast((err as Error).message);
    }
  };
  if (on) {
    $("#test").onclick = async () => {
      const r = await C.api<{ devices: number }>("push_test").catch((err) => (toast((err as Error).message), null));
      if (r) toast(r.devices ? "Teste enviado 🔔" : "Nenhum aparelho inscrito");
    };
    $("#off").onclick = async () => {
      await C.pushOffHere();
      toast("Avisos desligados neste celular");
      route();
    };
  }
}

// ---------- senha nova (link do e-mail: /bebe/#nova-senha/<token>)
function newPass(v: HTMLElement, token?: string) {
  v.innerHTML = `${head("Senha nova", "#conta")}<form class="form" id="np"><label>Senha nova<input name="p1" type="password" minlength="6" required autocomplete="new-password"></label>
    <label>Repita a senha<input name="p2" type="password" minlength="6" required autocomplete="new-password"></label><button class="btn big">Salvar e entrar</button></form>`;
  $<HTMLFormElement>("#np").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    if (fd.get("p1") !== fd.get("p2")) return toast("As senhas não são iguais");
    try {
      const r = await C.resetConfirm(token ?? "", String(fd.get("p1")));
      toast("Senha trocada 💗");
      if (r.families.length === 1) return askMode(r.families[0]);
      location.hash = "#conta";
    } catch (err) {
      toast((err as Error).message);
    }
  };
}

function trialBanner() {
  const a = C.access();
  if (a.status !== "trial") return "";
  return `<a class="trial" href="#assinar">🎁 Teste grátis: ${a.days === 1 ? "último dia" : `faltam ${a.days} dias`} · <b>Assinar ${C.PRICE}/mês</b></a>`;
}

/** nome da tela do móvel pelo que a família tem */
function roomTitle() {
  const p = db().wardrobe.pieces;
  return p === "comoda" ? "Cômoda" : p === "ambos" ? "Quartinho" : "Guarda-roupa";
}
