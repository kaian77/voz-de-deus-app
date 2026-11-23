// Telas extras do Cantinho do bebê: assinatura (7 dias grátis + R$ 29,90/mês), lista de compras, memórias,
// etiquetas com QR Code para as gavetas e relatório do mês (salvar em PDF pelo "Imprimir" do celular).
import QRCode from "qrcode";
import * as C from "./cloud";
import {
  comps, age, ageText, baby, db, isDrawer, diaperStock, dur, esc, money, photoUrl, putPhoto, save, shrink, sizeAlerts, slotNames, slotOf, today, uid,
  type Buy, type Cat, type Memory,
} from "./store";

type Ctx = { head: (t: string, back?: string, extra?: string) => string; toast: (m: string) => void; route: () => void };
const $ = <E extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as E;
const $$ = <E extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as E[];
const fmtDate = (d: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

// ---------- assinatura
export function paywall(v: HTMLElement, ctx: Ctx) {
  const acc = C.access();
  const a = C.account();
  const ended = acc.status === "expired";
  v.innerHTML = `${ctx.head("Assinatura", ended ? "" : "#mais")}
    <section class="pay">
      <div class="logo">🧸</div>
      <h1>${ended ? "Seu teste grátis terminou" : acc.status === "active" ? "Assinatura ativa 💗" : `Teste grátis: ${acc.days} ${acc.days === 1 ? "dia" : "dias"}`}</h1>
      ${acc.status === "active" ? `<p class="lead center">${acc.admin ? "Você é o administrador: tudo liberado, e a sua família também." : acc.gift ? "Acesso liberado de presente 🎁" : acc.family ? "Sua família tem a assinatura: tudo liberado." : "Obrigado! Tudo liberado."}</p>` : `
      <p class="lead center">Continue com tudo: guarda-roupa 3D, notas pela IA, BabyBot, família na nuvem e avisos no celular.</p>
      <div class="price"><b>${C.PRICE}</b><small>por mês · cancele quando quiser</small></div>
      <ul class="perks"><li>👨‍👩‍👧 A família inteira usa com uma assinatura</li><li>🤖 Notas lidas pela IA e BabyBot</li><li>☁️ Tudo guardado na nuvem, com fotos</li></ul>
      ${a ? `<button class="btn big" id="sub">Assinar no Mercado Pago</button><button class="btn ghost" id="check">Já assinei: conferir</button>`
        : `<a class="btn big" href="#conta">Criar conta para assinar</a><p class="fine center">A assinatura fica ligada à sua conta (e-mail).</p>`}`}
      ${ended ? `<p class="fine center">Seus dados continuam guardados. Você pode baixar tudo em <a href="#backup">Backup</a>.</p>` : ""}
    </section>`;
  if (acc.admin) adminGrants(v, ctx);
  const sub = $("#sub", v);
  if (sub) sub.onclick = async () => {
    sub.textContent = "Abrindo…";
    try {
      const r = await C.subscribeUrl();
      if (r.fixed) ctx.toast(`Pague com o mesmo e-mail da conta (${a!.user.email}) para liberar sozinho.`);
      window.open(r.url, "_blank");
    } catch (err) {
      ctx.toast((err as Error).message);
    }
    sub.textContent = "Assinar no Mercado Pago";
  };
  const check = $("#check", v);
  if (check) check.onclick = async () => {
    const s = await C.refreshAccess();
    if (s.status === "active") {
      ctx.toast("Assinatura confirmada! 💗");
      location.hash = "#inicio";
    } else ctx.toast("Ainda não chegou a confirmação do Mercado Pago. Pode levar alguns minutos.");
  };
}

// ---------- lista de compras
function suggestions(): Omit<Buy, "id" | "done">[] {
  const b = baby()!;
  const out: Omit<Buy, "id" | "done">[] = [];
  const ds = diaperStock(b.id);
  if (ds.daysLeft !== null && ds.daysLeft < 7) {
    const last = db().items.filter((i) => i.babyId === b.id && i.cat === "fralda").sort((x, y) => y.date.localeCompare(x.date))[0];
    out.push({ babyId: b.id, name: last?.name || "Fraldas", cat: "fralda", size: last?.size ?? "", qty: 1, price: 0, from: `estoque dá ~${ds.daysLeft} dias` });
  }
  // roupas que podem estar pequenas → o próximo tamanho
  const next: Record<string, string> = { RN: "P", P: "M", M: "G", G: "GG", GG: "XG" };
  const seen = new Set<string>();
  for (const i of sizeAlerts(b)) {
    const n = next[i.size.toUpperCase()];
    const key = `${i.name}|${n}`;
    if (!n || seen.has(key)) continue;
    seen.add(key);
    out.push({ babyId: b.id, name: i.name, cat: "roupa", size: n, qty: i.qty, price: 0, from: `${i.size} pode estar pequeno` });
  }
  for (const nm of ["Lenço umedecido", "Pomada"]) {
    if (!db().items.some((i) => i.babyId === b.id && i.name.toLowerCase().includes(nm.toLowerCase().slice(0, 5)) && i.qty > 0))
      out.push({ babyId: b.id, name: nm, cat: "higiene", size: "", qty: 1, price: 0, from: "acabou no estoque" });
  }
  const open = new Set(db().buys.filter((x) => x.babyId === b.id && !x.done).map((x) => `${x.name}|${x.size}`.toLowerCase()));
  return out.filter((x) => !open.has(`${x.name}|${x.size}`.toLowerCase()));
}
export function shopping(v: HTMLElement, ctx: Ctx) {
  const b = baby()!;
  const list = db().buys.filter((x) => x.babyId === b.id);
  const open = list.filter((x) => !x.done), done = list.filter((x) => x.done).slice(-10).reverse();
  const sug = suggestions();
  const total = open.reduce((s, x) => s + x.price * x.qty, 0);
  v.innerHTML = `${ctx.head("Lista de compras", "#mais")}
    <form class="ask inline" id="add"><input id="nm" placeholder="Anotar (ex.: 2 bodies G)" autocomplete="off"><button aria-label="Adicionar">＋</button></form>
    ${sug.length ? `<h2>Sugestões <small>pelo estoque e tamanhos</small></h2><div class="list">${sug.map((x, i) => `<div class="row"><span>💡</span><div><b>${esc(x.name)}${x.size ? ` ${esc(x.size)}` : ""}</b><small>${esc(x.from ?? "")}</small></div><button class="chip" data-sug="${i}">+ Lista</button></div>`).join("")}</div>` : ""}
    <h2>Para comprar <small>${open.length} ${open.length === 1 ? "item" : "itens"}${total ? ` · ~${money(total)}` : ""}</small></h2>
    <div class="list">${open.map((x) => `<div class="row"><input type="checkbox" class="tick" data-done="${x.id}"><div><b>${x.qty > 1 ? `${x.qty}× ` : ""}${esc(x.name)}${x.size ? ` ${esc(x.size)}` : ""}</b><small>${x.price ? money(x.price) + " cada" : "toque no ✏️ para pôr o preço"}</small></div><button class="x" data-price="${x.id}">✏️</button><button class="x" data-del="${x.id}">✕</button></div>`).join("") || `<p class="note">Nada na lista.</p>`}</div>
    ${done.length ? `<h2>Comprados</h2><div class="list">${done.map((x) => `<div class="row past"><span>✓</span><div><b>${esc(x.name)}${x.size ? ` ${esc(x.size)}` : ""}</b><small>${fmtDate(x.doneAt ?? "")}</small></div></div>`).join("")}</div>` : ""}
    <p class="fine">Marcar como comprado põe o item no inventário (e o preço nos gastos). O app não compra nada sozinho.</p>`;
  $<HTMLFormElement>("#add", v).onsubmit = (e) => {
    e.preventDefault();
    const t = $<HTMLInputElement>("#nm", v).value.trim();
    if (!t) return;
    const m = t.match(/^(\d+)\s*x?\s+(.+)$/i);
    const sz = (m?.[2] ?? t).match(/\b(RN|PP|P|M|G|GG|XG|\d{2})\s*$/i);
    save((d) => d.buys.push({ id: uid(), babyId: b.id, name: (m?.[2] ?? t).replace(sz?.[0] ?? "", "").trim(), cat: /fralda/i.test(t) ? "fralda" : "roupa", size: sz?.[1]?.toUpperCase() ?? "", qty: m ? Number(m[1]) : 1, price: 0, done: false }));
  };
  $$("[data-sug]", v).forEach((x) => (x.onclick = () => save((d) => d.buys.push({ ...sug[Number(x.dataset.sug)], id: uid(), done: false }))));
  $$("[data-del]", v).forEach((x) => (x.onclick = () => save((d) => (d.buys = d.buys.filter((y) => y.id !== x.dataset.del)))));
  $$("[data-price]", v).forEach((x) => (x.onclick = () => {
    const p = parseFloat((prompt("Preço de cada (R$):") ?? "").replace(",", "."));
    if (!isNaN(p)) save((d) => (d.buys.find((y) => y.id === x.dataset.price)!.price = p));
  }));
  $$<HTMLInputElement>("[data-done]", v).forEach((x) => (x.onchange = () => {
    const it = db().buys.find((y) => y.id === x.dataset.done)!;
    save((d) => {
      const y = d.buys.find((z) => z.id === it.id)!;
      y.done = true;
      y.doneAt = today();
      const isPack = y.cat === "fralda";
      d.items.push({ id: uid(), babyId: b.id, name: y.name, cat: y.cat, size: y.size, color: "", brand: "", qty: isPack ? 0 : y.qty, price: y.price, date: today(), state: "uso", loc: "", notes: isPack ? "Pacote comprado pela lista: ponha a quantidade de fraldas." : "" });
      if (y.price) d.purchases.push({ id: uid(), store: "Lista de compras", cnpj: "", date: today(), number: "", key: "", total: y.price * y.qty, discount: 0, lines: [{ desc: y.name, name: y.name, cat: y.cat, size: y.size, qty: y.qty, unit: y.price, total: y.price * y.qty }], source: "manual", createdAt: new Date().toISOString() });
    });
    ctx.toast("Comprado ✓ · entrou no inventário");
  }));
}

// ---------- memórias
export function memories(v: HTMLElement, ctx: Ctx) {
  const b = baby()!;
  const a = age(b.birth);
  const list = db().memories.filter((m) => m.babyId === b.id).sort((x, y) => y.date.localeCompare(x.date));
  v.innerHTML = `${ctx.head("Memórias", "#mais")}
    <div class="row2"><button class="btn" id="new">＋ Nova memória</button><button class="btn ghost" id="card">🎂 Cartão de ${a.months} ${a.months === 1 ? "mês" : "meses"}</button></div>
    <form class="form card-form" id="mf" hidden>
      <div class="photo" id="ph"><span>📷<br>Foto (opcional)</span><input type="file" accept="image/*" id="pf"></div>
      <label>Título<input name="title" required placeholder="Primeiro sorriso, primeiro passinho…"></label>
      <div class="row2"><label>Data<input name="date" type="date" value="${today()}"></label><label>Tipo<select name="kind"><option value="marco">⭐ Marco</option><option value="foto">📷 Foto</option></select></label></div>
      <label>Recadinho<textarea name="text" rows="2"></textarea></label><button class="btn">Guardar memória</button></form>
    <div class="timeline">${list.map((m) => `<article class="mem"><div class="dot">${m.kind === "marco" ? "⭐" : m.kind === "mesversario" ? "🎂" : "📷"}</div><div class="body">
      ${m.photo ? `<img data-ph="${m.photo}" alt="">` : ""}<b>${esc(m.title)}</b><small>${fmtDate(m.date)} · ${esc(ageText2(b.birth, m.date))}</small>${m.text ? `<p>${esc(m.text)}</p>` : ""}
      <button class="x" data-del="${m.id}">✕</button></div></article>`).join("") || `<p class="note">Guarde aqui os momentos: fotos, primeiras vezes e recadinhos.</p>`}</div>`;
  $$<HTMLImageElement>("[data-ph]", v).forEach((img) => photoUrl(img.dataset.ph!).then((u) => (u ? (img.src = u) : img.remove())));
  let photo: string | undefined;
  $("#new", v).onclick = () => ($("#mf", v).hidden = !$("#mf", v).hidden);
  $<HTMLInputElement>("#pf", v).onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const small = await shrink(f, 1200);
    photo = await putPhoto(small);
    $("#ph", v).style.backgroundImage = `url(${URL.createObjectURL(small)})`;
    $("#ph span", v).hidden = true;
  };
  $<HTMLFormElement>("#mf", v).onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    save((d) => d.memories.push({ id: uid(), babyId: b.id, date: String(fd.get("date") || today()), title: String(fd.get("title")), text: String(fd.get("text") ?? ""), photo, kind: fd.get("kind") as Memory["kind"] }));
    ctx.toast("Memória guardada 💗");
  };
  $$("[data-del]", v).forEach((x) => (x.onclick = () => confirm("Apagar esta memória?") && save((d) => (d.memories = d.memories.filter((m) => m.id !== x.dataset.del)))));
  $("#card", v).onclick = async () => {
    const blob = await monthCard(b.nick || b.name, a.months, list.find((m) => m.photo)?.photo);
    const file = new File([blob], `${b.name}-${a.months}-meses.png`, { type: "image/png" });
    save((d) => d.memories.push({ id: uid(), babyId: b.id, date: today(), title: `${a.months} ${a.months === 1 ? "mês" : "meses"}! 🎂`, text: "", kind: "mesversario" }));
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${b.name} · ${a.months} meses` }).catch(() => {});
    else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
    }
  };
}
const ageText2 = (birth: string, at: string) => {
  const a = age(birth, new Date(at + "T12:00:00"));
  return a.totalDays < 0 ? "antes de nascer" : a.months ? `${a.months} ${a.months === 1 ? "mês" : "meses"}${a.days ? ` e ${a.days} d` : ""}` : `${a.totalDays} dias`;
};
/** Cartão de mêsversário (1080x1350) para mandar no WhatsApp/Instagram. */
async function monthCard(name: string, months: number, photoId?: string) {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, 1350);
  g.addColorStop(0, "#F4D8DC");
  g.addColorStop(1, "#F5EDE3");
  x.fillStyle = g;
  x.fillRect(0, 0, 1080, 1350);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(214,185,140,${0.25 + Math.random() * 0.4})`;
    x.font = `${20 + Math.random() * 30}px serif`;
    x.fillText("✦", Math.random() * 1080, Math.random() * 1350);
  }
  if (photoId) {
    const u = await photoUrl(photoId);
    if (u) {
      const img = new Image();
      await new Promise((ok) => {
        img.onload = ok;
        img.onerror = ok;
        img.src = u;
      });
      if (img.width) {
        x.save();
        x.beginPath();
        x.arc(540, 520, 300, 0, Math.PI * 2);
        x.clip();
        const k = Math.max(600 / img.width, 600 / img.height);
        x.drawImage(img, 540 - (img.width * k) / 2, 520 - (img.height * k) / 2, img.width * k, img.height * k);
        x.restore();
        x.strokeStyle = "#ffffff";
        x.lineWidth = 16;
        x.beginPath();
        x.arc(540, 520, 300, 0, Math.PI * 2);
        x.stroke();
      }
    }
  } else {
    x.font = "260px serif";
    x.textAlign = "center";
    x.fillText("🧸", 540, 620);
  }
  x.textAlign = "center";
  x.fillStyle = "#8a6d4a";
  x.font = "italic 600 110px 'Playfair Display', Georgia, serif";
  x.fillText(name, 540, 1000);
  x.fillStyle = "#c98f9b";
  x.font = "800 150px Nunito, sans-serif";
  x.fillText(`${months} ${months === 1 ? "mês" : "meses"}`, 540, 1170);
  x.fillStyle = "#8a7f75";
  x.font = "600 34px Nunito, sans-serif";
  x.fillText(new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }), 540, 1250);
  return new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/png"));
}

// ---------- etiquetas com QR Code (colar na gaveta: o celular abre direto nela)
export async function labels(v: HTMLElement, ctx: Ctx) {
  const b = baby()!;
  const base = `${location.origin}/bebe/#quarto/`;
  v.innerHTML = `${ctx.head("Etiquetas com QR Code", "#mais", `<button class="chip" id="print">🖨️ Imprimir</button>`)}
    <p class="lead no-print">Imprima, recorte e cole em cada gaveta ou caixa. Apontando a câmera do celular, o app abre direto naquele lugar com o que tem dentro.</p>
    <div class="labels">${comps().map((c) => `<div class="lab"><canvas data-qr="${c.id}"></canvas><b>${c.name}</b><small>${esc(b.nick || b.name)}${isDrawer(c.id) ? ` · ${slotNames().map(esc).join(" · ")}` : ""}</small></div>`).join("")}</div>`;
  for (const cv of $$<HTMLCanvasElement>("[data-qr]", v)) await QRCode.toCanvas(cv, base + cv.dataset.qr, { width: 220, margin: 1, color: { dark: "#343434", light: "#ffffff" } });
  $("#print", v).onclick = () => window.print();
}

// ---------- relatório do mês (vira PDF pelo "Salvar como PDF" da impressão)
export function report(v: HTMLElement, ctx: Ctx) {
  const b = baby()!;
  const now = new Date();
  const ym = (dt: Date) => dt.toISOString().slice(0, 7);
  let month = ym(now);
  const draw = () => {
    const [y, m] = month.split("-").map(Number);
    const a0 = `${month}-01`, z0 = `${month}-31`;
    const ps = db().purchases.filter((p) => p.date >= a0 && p.date <= z0);
    const total = ps.reduce((s, p) => s + p.total - (p.returned ?? []).reduce((r, x) => r + x.value, 0), 0);
    const cats = new Map<Cat, number>();
    for (const p of ps) for (const l of p.lines) cats.set(l.cat, (cats.get(l.cat) ?? 0) + l.total);
    const sl = db().sleeps.filter((s) => s.babyId === b.id && s.end && s.start.slice(0, 7) === month);
    const days = new Set(sl.map((s) => s.start.slice(0, 10))).size;
    const slMs = sl.reduce((s, x) => s + (Date.parse(x.end!) - Date.parse(x.start)), 0);
    const ms = db().measures.filter((x) => x.babyId === b.id && x.date.slice(0, 7) <= month).sort((p, q) => q.date.localeCompare(p.date));
    const its = db().items.filter((i) => i.babyId === b.id && i.cat === "roupa" && i.state === "uso");
    const bySize = new Map<string, number>();
    for (const i of its) bySize.set(i.size || "—", (bySize.get(i.size || "—") ?? 0) + i.qty);
    const ds = diaperStock(b.id);
    const used = db().diapers.filter((d) => d.babyId === b.id && d.date.slice(0, 7) === month).reduce((s, d) => s + d.qty, 0);
    const mems = db().memories.filter((x) => x.babyId === b.id && x.date.slice(0, 7) === month);
    const drawers = comps().filter((c) => isDrawer(c.id)).map((c) => `${c.name}: ${slotNames().map((n, k) => `${n} ${db().items.filter((i) => i.loc === c.id && slotOf(i) === k).reduce((s, i) => s + i.qty, 0)}`).join(", ")}`);
    v.innerHTML = `${ctx.head("Relatório do mês", "#mais", `<button class="chip" id="pdf">⬇️ PDF</button>`)}
      <div class="row2 no-print"><button class="btn ghost" id="prev">‹ Mês anterior</button><button class="btn ghost" id="next" ${month >= ym(now) ? "disabled" : ""}>Próximo ›</button></div>
      <article class="report">
        <h1>${esc(b.name)} · ${new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h1>
        <p class="fine">${ageText(b.birth)} hoje · relatório do Cantinho do bebê</p>
        <h2>💰 Gastos</h2><p><b>${money(total)}</b> em ${ps.length} ${ps.length === 1 ? "compra" : "compras"}</p>
        <ul>${[...cats].sort((p, q) => q[1] - p[1]).map(([k, val]) => `<li>${k}: ${money(val)}</li>`).join("") || "<li>Sem itens detalhados.</li>"}</ul>
        <h2>🌙 Sono</h2><p>${sl.length ? `${sl.length} registros em ${days} dias · média de ${dur(days ? slMs / days : 0)} por dia registrado` : "Sem registros neste mês."}</p>
        <h2>📏 Crescimento</h2><p>${ms[0] ? `Última medida (${fmtDate(ms[0].date)}): ${[ms[0].weight && `${ms[0].weight} kg`, ms[0].length && `${ms[0].length} cm`, ms[0].head && `PC ${ms[0].head} cm`].filter(Boolean).join(" · ")}` : "Sem medidas."}</p>
        <h2>🧷 Fraldas</h2><p>${used} trocas registradas · ${ds.stock} em casa${ds.daysLeft !== null ? ` (dá ~${ds.daysLeft} dias)` : ""}</p>
        <h2>👕 Roupas em uso por tamanho</h2><p>${[...bySize].map(([k, val]) => `${k}: ${val}`).join(" · ") || "—"}</p>
        <p class="fine">${drawers.join("<br>")}</p>
        ${mems.length ? `<h2>💗 Memórias do mês</h2><ul>${mems.map((x) => `<li>${fmtDate(x.date)} · ${esc(x.title)}</li>`).join("")}</ul>` : ""}
        <p class="fine">O acompanhamento não substitui a avaliação do pediatra.</p>
      </article>`;
    $("#pdf", v).onclick = () => window.print();
    $("#prev", v).onclick = () => {
      month = ym(new Date(y, m - 2, 1));
      draw();
    };
    $("#next", v).onclick = () => {
      month = ym(new Date(y, m, 1));
      draw();
    };
  };
  draw();
}

// ---------- administrador: libera o app de graça para qualquer e-mail (a família de quem tem acesso entra junto)
type Grant = { email: string; note: string; created_at: string; has_account: boolean };
function adminGrants(v: HTMLElement, ctx: Ctx) {
  const box = document.createElement("section");
  box.className = "card-form admin";
  v.appendChild(box);
  const draw = (list: Grant[]) => {
    box.innerHTML = `<h2>👑 Administrador · acesso grátis</h2>
      <p class="fine">Quem entra na sua família (Conta e família → Convidar) já usa de graça. Para liberar outra pessoa que vai ter a família dela, coloque o e-mail dela aqui (pode ser antes de ela criar a conta).</p>
      <form class="ask inline" id="gf"><input id="ge" type="email" placeholder="e-mail da pessoa" autocomplete="off" required><button aria-label="Liberar">＋</button></form>
      <div class="list">${list.map((g) => `<div class="row"><span>🎁</span><div><b>${esc(g.email)}</b><small>${g.has_account ? "já tem conta · liberado" : "ainda não criou a conta · libera quando criar"}</small></div><button class="x" data-rm="${esc(g.email)}">✕</button></div>`).join("") || `<p class="note">Ninguém liberado ainda.</p>`}</div>`;
    ($("#gf", box) as HTMLFormElement).onsubmit = (e) => {
      e.preventDefault();
      void run({ email: $<HTMLInputElement>("#ge", box).value, add: true }, "Liberado 🎁");
    };
    $$<HTMLButtonElement>("[data-rm]", box).forEach((b) => (b.onclick = () => {
      if (confirm(`Tirar o acesso grátis de ${b.dataset.rm}?`)) void run({ email: b.dataset.rm, remove: true }, "Acesso tirado");
    }));
  };
  const run = async (body: Record<string, unknown>, msg?: string) => {
    try {
      const r = await C.api<{ grants: Grant[] }>("grants", body);
      draw(r.grants);
      if (msg) ctx.toast(msg);
    } catch (err) {
      ctx.toast((err as Error).message);
    }
  };
  void run({});
}
