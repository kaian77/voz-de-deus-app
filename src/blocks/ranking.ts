// Ranking do Block Pop (só no nosso link; no portal fica de fora): nome do jogador, top 50 e aviso "Fulano passou de você".
// Sem login: id aleatório guardado no navegador. Funções do Supabase em 20261028000000_blockpop_ranking.sql.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../studio/lib/config";
import { t } from "../i18n3d";

type Row = { name: string; best: number; me: boolean };
export type Submit = { ok: boolean; rank?: number; total?: number; passed?: string[]; error?: string };

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};
// no portal (SDK do CrazyGames na página) não tem ranking: nome digitado por estranhos e chamada para fora
export const rankingOn = !!SUPABASE_URL && !document.querySelector('script[src*="crazygames-sdk"]');

const id = (() => {
  let v = ls.get("blockpop-id");
  if (!v) {
    v = crypto.randomUUID?.() ?? "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
    ls.set("blockpop-id", v);
  }
  return v;
})();
export const playerName = () => ls.get("blockpop-name") ?? "";

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  if (!rankingOn) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Manda o recorde (só se a pessoa já escolheu um nome). */
export async function submitBest(best: number): Promise<Submit | null> {
  const name = playerName();
  if (!name || best <= 0) return null;
  const r = await rpc<Submit>("blockpop_submit", { p_id: id, p_name: name, p_score: Math.round(best) });
  if (r?.ok && r.passed?.length) toast(t(`🚀 Você passou de ${r.passed[0]}!`, `🚀 You passed ${r.passed[0]}!`, `🚀 ¡Superaste a ${r.passed[0]}!`));
  return r;
}

/** Avisa quem passou de você desde a última vez (ao abrir e a cada minuto). */
export async function checkNews() {
  if (!playerName()) return;
  const news = await rpc<{ name: string; score: number }[]>("blockpop_news", { p_id: id });
  if (!news?.length) return;
  const n = news[0];
  const more = news.length > 1 ? t(` (+${news.length - 1})`, ` (+${news.length - 1})`, ` (+${news.length - 1})`) : "";
  toast(t(`😱 ${n.name} passou de você com ${n.score.toLocaleString()} pontos!${more}`, `😱 ${n.name} passed you with ${n.score.toLocaleString()} points!${more}`,
    `😱 ¡${n.name} te superó con ${n.score.toLocaleString()} puntos!${more}`), true);
}

// ------------------------------------------------------------------------------------------------ tela (HTML por cima do canvas)
const css = document.createElement("style");
css.textContent = `
.bp-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 12px);transform:translate(-50%,-140%);z-index:20;max-width:min(92vw,420px);
  background:#ffd23f;color:#1a2142;font:600 15px Fredoka,system-ui,sans-serif;padding:12px 16px;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.35);
  transition:transform .35s cubic-bezier(.2,1.4,.4,1);cursor:pointer;text-align:center}
.bp-toast.in{transform:translate(-50%,0)}
.bp-modal{position:fixed;inset:0;z-index:30;background:rgba(10,13,30,.86);display:flex;align-items:center;justify-content:center;padding:16px;
  font-family:Fredoka,system-ui,sans-serif;color:#e6ebff}
.bp-card{background:#232c57;border-radius:22px;width:min(100%,400px);max-height:88dvh;display:flex;flex-direction:column;padding:18px;box-sizing:border-box;box-shadow:0 20px 50px rgba(0,0,0,.5)}
.bp-card h2{margin:0 0 4px;font-size:24px;color:#ffd23f;display:flex;justify-content:space-between;align-items:center}
.bp-x{background:none;border:0;color:#aab4e8;font-size:26px;cursor:pointer;line-height:1}
.bp-sub{color:#aab4e8;font-size:14px;margin:0 0 12px}
.bp-form{display:flex;gap:8px;margin-bottom:12px}
.bp-form input{flex:1;min-width:0;border:2px solid #4a7dff;background:#141a35;color:#fff;border-radius:12px;padding:10px 12px;font:500 16px Fredoka,system-ui,sans-serif;outline:none}
.bp-form button{border:0;background:#36c96f;color:#fff;border-radius:12px;padding:0 16px;font:600 16px Fredoka,system-ui,sans-serif;cursor:pointer}
.bp-list{overflow:auto;margin:0;padding:0;list-style:none}
.bp-list li{display:flex;gap:10px;align-items:center;padding:9px 10px;border-radius:12px;font-size:16px}
.bp-list li:nth-child(odd){background:rgba(255,255,255,.04)}
.bp-list li.me{background:rgba(74,125,255,.35)}
.bp-list .p{width:30px;text-align:center;font-weight:700;color:#aab4e8}
.bp-list .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bp-list .s{font-weight:700;color:#ffd23f}
.bp-me{margin-top:10px;font-size:14px;color:#aab4e8;text-align:center}`;
document.head.appendChild(css);

let toastEl: HTMLDivElement | null = null;
export function toast(msg: string, openBoard = false) {
  toastEl?.remove();
  const el = document.createElement("div");
  el.className = "bp-toast";
  el.textContent = msg;
  if (openBoard) el.onclick = () => { el.remove(); openRanking(0); };
  document.body.appendChild(el);
  toastEl = el;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  setTimeout(() => el.classList.remove("in"), 5200);
  setTimeout(() => el.remove(), 5700);
}

export const rankingOpen = () => !!document.querySelector(".bp-modal");

/** Abre o ranking. Sem nome ainda: pede o nome (e manda o recorde ao salvar). */
export async function openRanking(best: number) {
  if (rankingOpen()) return;
  const m = document.createElement("div");
  m.className = "bp-modal";
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  m.innerHTML = `<div class="bp-card">
    <h2>🏆 Ranking <button class="bp-x" aria-label="${t("Fechar", "Close", "Cerrar")}">×</button></h2>
    <p class="bp-sub">${t("Quem fez mais pontos no Block Pop", "Top Block Pop scores", "Quién hizo más puntos en Block Pop")}</p>
    <form class="bp-form"><input maxlength="16" placeholder="${t("Seu nome no ranking", "Your name", "Tu nombre")}" value="${esc(playerName())}"/>
      <button>${playerName() ? t("Trocar", "Change", "Cambiar") : t("Entrar", "Join", "Entrar")}</button></form>
    <ul class="bp-list"><li>${t("Carregando…", "Loading…", "Cargando…")}</li></ul>
    <div class="bp-me"></div></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.querySelector(".bp-x")!.addEventListener("click", close);
  m.addEventListener("pointerdown", (e) => { if (e.target === m) close(); });
  const input = m.querySelector("input")!;
  const list = m.querySelector(".bp-list")!;
  const meEl = m.querySelector(".bp-me")!;
  const load = async () => {
    const b = await rpc<{ top: Row[]; me: { rank: number; best: number } | null; total: number }>("blockpop_board", { p_id: id });
    if (!b) {
      list.innerHTML = `<li>${t("Sem conexão agora", "No connection right now", "Sin conexión ahora")}</li>`;
      return;
    }
    list.innerHTML = b.top.length
      ? b.top.map((r, i) => `<li class="${r.me ? "me" : ""}"><span class="p">${["🥇", "🥈", "🥉"][i] ?? i + 1}</span><span class="n">${esc(r.name)}</span><span class="s">${r.best.toLocaleString()}</span></li>`).join("")
      : `<li>${t("Ninguém ainda. Seja o primeiro!", "No one yet. Be the first!", "Nadie aún. ¡Sé el primero!")}</li>`;
    meEl.textContent = b.me
      ? t(`Você: ${b.me.rank}º de ${b.total} · ${b.me.best.toLocaleString()} pontos`, `You: #${b.me.rank} of ${b.total} · ${b.me.best.toLocaleString()} points`,
        `Tú: ${b.me.rank}º de ${b.total} · ${b.me.best.toLocaleString()} puntos`)
      : t("Coloque seu nome para aparecer aqui", "Enter your name to show up here", "Pon tu nombre para aparecer aquí");
    m.querySelector(".me")?.scrollIntoView({ block: "center" });
  };
  m.querySelector("form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = input.value.replace(/\s+/g, " ").trim().slice(0, 16);
    if (name.length < 2 || /https?|www\.|\.com|\/|\.br/i.test(name)) {
      input.style.borderColor = "#ff5a6e";
      return;
    }
    ls.set("blockpop-name", name);
    input.blur();
    const r = await rpc<Submit>("blockpop_submit", { p_id: id, p_name: name, p_score: Math.max(0, Math.round(best)) });
    if (r && !r.ok) input.style.borderColor = "#ff5a6e";
    load();
  });
  if (!playerName()) setTimeout(() => input.focus(), 50);
  load();
}

// avisos: ao abrir e a cada minuto com a aba aberta
if (rankingOn) {
  setTimeout(checkNews, 1500);
  setInterval(() => { if (document.visibilityState === "visible") checkNews(); }, 60000);
}
