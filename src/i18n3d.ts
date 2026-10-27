// Idioma das demonstrações 3D (montagem, corrida, tour): português, inglês ou espanhol.
// Ordem: ?lang= na URL → escolha salva neste navegador → idioma do celular → português.
export type Lang = "pt" | "en" | "es";
/** Texto em vários idiomas (ou só em português). */
export type L = string | { pt: string; en?: string; es?: string };

const LANGS: Lang[] = ["pt", "en", "es"];
function detect(): Lang {
  const q = new URLSearchParams(location.search).get("lang") as Lang | null;
  if (q && LANGS.includes(q)) {
    try {
      localStorage.setItem("demo-lang", q);
    } catch {
      /* sem armazenamento */
    }
    return q;
  }
  // Versão do CrazyGames (tem o SDK deles na página): o portal exige inglês como idioma padrão
  if (document.querySelector('script[src*="crazygames-sdk"]')) return "en";
  try {
    const saved = localStorage.getItem("demo-lang") as Lang | null;
    if (saved && LANGS.includes(saved)) return saved;
  } catch {
    /* sem armazenamento */
  }
  const nav = (navigator.language || "pt").slice(0, 2).toLowerCase();
  return nav === "en" || nav === "es" ? nav : "pt";
}
export const lang: Lang = detect();
document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;

export const tr = (x: L) => (typeof x === "string" ? x : (x[lang] ?? x.pt));
/** Texto curto da interface nos três idiomas. */
export const t = (pt: string, en: string, es: string) => (lang === "en" ? en : lang === "es" ? es : pt);
/** Número no formato do idioma (vírgula ou ponto). */
export const num = (n: number, digits = 1) => n.toLocaleString(lang === "pt" ? "pt-BR" : lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Botão "🌐 EN": cada toque passa para o próximo idioma (recarrega a página nele). Ocupa pouco espaço no topo. */
export function langSwitch(className: string) {
  const el = document.createElement("button");
  el.className = className;
  el.type = "button";
  el.setAttribute("aria-label", t("Mudar idioma", "Change language", "Cambiar idioma"));
  el.textContent = `🌐 ${lang.toUpperCase()}`;
  el.addEventListener("click", () => {
    const u = new URL(location.href);
    u.searchParams.set("lang", LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]);
    location.href = u.toString();
  });
  return el;
}

/** WhatsApp do Bruno com a mensagem no idioma. */
export const pitchMsg = (what: string) =>
  t(`Olá, Bruno! Vi a demonstração ${what} e quero saber mais.`, `Hi Bruno! I saw the ${what} demo and I'd like to know more.`, `¡Hola, Bruno! Vi la demostración ${what} y quiero saber más.`);
