// Painel de resultados do cliente (plano mensal): /r/<token> -> HTML com as cores, fontes e logo da landing dele.
// Os números vêm da função landing_report (só totais por dia). Feito para o celular; sem login (o token é o acesso).
import { esc, FONTS, hex, mix, onColor, type LandingContent } from "./render.js";

type Day = { day: string; views: number; whatsapp: number; maps: number; sources: Record<string, number> };
export type ReportData = {
  name: string;
  logo?: string | null;
  slug: string;
  domain?: string | null;
  status: string;
  plan: string;
  content?: Partial<Pick<LandingContent, "colors" | "fonts">> | null;
  support?: string | null;
  stats: Day[] | null;
  /** Painel de exemplo (/r/demo), com números fictícios */
  demo?: boolean;
};

/** Painel de exemplo para mostrar a quem ainda não é cliente: números inventados, mas estáveis (não mudam a cada visita). */
export function demoReport(): ReportData {
  const today = new Date(Date.now() - 3 * 3600_000);
  const stats: Day[] = Array.from({ length: 60 }, (_, i) => {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() - (59 - i));
    const weekend = [0, 6].includes(dt.getUTCDay());
    const views = Math.round((i < 30 ? 7 : 11) + 6 * Math.sin(i * 1.7) + (weekend ? -3 : 3) + (i % 5));
    return {
      day: dt.toISOString().slice(0, 10), views,
      whatsapp: Math.max(0, Math.round(views * 0.16 + Math.sin(i) * 1.2)), maps: Math.max(0, Math.round(views * 0.07)),
      sources: { instagram: Math.round(views * 0.45), google: Math.round(views * 0.33), direto: views - Math.round(views * 0.45) - Math.round(views * 0.33) },
    };
  });
  return {
    name: "Dra. Lívia Rocha", slug: "exemplo", status: "published", plan: "monthly", demo: true,
    content: { colors: { primary: "#0F4C5C", ink: "#14242A", soft: "#EAF3F3" }, fonts: "fraunces" },
    support: "5561992372216", stats,
  };
}

const SOURCES: Record<string, string> = { google: "Google", instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp", tiktok: "TikTok", direto: "Link direto", outros: "Outros" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const br = (n: number) => n.toLocaleString("pt-BR");

function delta(now: number, before: number) {
  if (!before) return now ? `<span class="up">novo</span>` : "";
  const p = Math.round(((now - before) / before) * 100);
  return p === 0 ? `<span>igual</span>` : `<span class="${p > 0 ? "up" : "down"}">${p > 0 ? "↑" : "↓"} ${Math.abs(p)}%</span>`;
}

export function renderReport(d: ReportData): string {
  const fonts = FONTS[d.content?.fonts as LandingContent["fonts"]] ?? FONTS.fraunces;
  const primary = hex(d.content?.colors?.primary ?? "", "#2f5d50");
  const ink = hex(d.content?.colors?.ink ?? "", "#1c2321");
  const soft = hex(d.content?.colors?.soft ?? "", mix(primary, "#ffffff", 0.92));
  const site = d.domain ? `https://${d.domain}` : `https://paginaspro.vercel.app/p/${d.slug}`;
  const support = String(d.support ?? "").replace(/\D/g, "");
  const supportUrl = support
    ? `https://wa.me/${support.length <= 11 ? `55${support}` : support}?text=${encodeURIComponent(`Olá! Sou de ${d.name} e queria pedir uma alteração no site: `)}`
    : "";
  const brand = d.logo ? `<img class="logo" src="${esc(d.logo)}" alt="${esc(d.name)}">` : `<span class="wordmark">${esc(d.name)}</span>`;

  let body: string;
  if (d.plan !== "monthly" || !d.stats) {
    body = `<section class="card center"><h2>Painel indisponível</h2><p>O painel de resultados faz parte do plano mensal do site.</p>
${supportUrl ? `<a class="btn" href="${esc(supportUrl)}" target="_blank" rel="noopener">Falar com o suporte</a>` : ""}</section>`;
  } else {
    const byDay = new Map(d.stats.map((s) => [String(s.day).slice(0, 10), s]));
    const today = new Date(Date.now() - 3 * 3600_000); // dia de Brasília
    const days = Array.from({ length: 60 }, (_, i) => {
      const dt = new Date(today);
      dt.setUTCDate(dt.getUTCDate() - (59 - i));
      const k = iso(dt);
      return byDay.get(k) ?? { day: k, views: 0, whatsapp: 0, maps: 0, sources: {} };
    });
    const last = days.slice(30);
    const prev = days.slice(0, 30);
    const sum = (list: Day[], k: "views" | "whatsapp" | "maps") => list.reduce((a, x) => a + (x[k] || 0), 0);
    const cards = ([["views", "Visitas no site"], ["whatsapp", "Chamaram no WhatsApp"], ["maps", "Pediram rota no mapa"]] as const)
      .map(([k, label]) => `<div class="stat"><b>${br(sum(last, k))}</b><span>${label}</span>${delta(sum(last, k), sum(prev, k))}</div>`).join("");
    const max = Math.max(1, ...last.map((x) => x.views));
    const W = 300, H = 120, bw = W / 30;
    const bars = last.map((x, i) => {
      const h = Math.max(x.views ? 3 : 1, (x.views / max) * (H - 10));
      const wh = x.views ? Math.min(h, (x.whatsapp / max) * (H - 10)) : 0;
      return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${mix(primary, "#ffffff", 0.55)}"><title>${x.day.slice(8, 10)}/${x.day.slice(5, 7)}: ${x.views} visitas, ${x.whatsapp} no WhatsApp</title></rect>` +
        (wh ? `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - wh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${wh.toFixed(1)}" rx="2" fill="${primary}"/>` : "");
    }).join("");
    const src: Record<string, number> = {};
    for (const x of last) for (const [k, v] of Object.entries(x.sources ?? {})) src[k] = (src[k] ?? 0) + Number(v || 0);
    const total = Object.values(src).reduce((a, b) => a + b, 0);
    const sources = Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
      const p = Math.round((v / total) * 100);
      return `<div class="src"><div class="row"><span>${esc(SOURCES[k] ?? k)}</span><b>${p}%</b></div><div class="track"><i style="width:${p}%"></i></div></div>`;
    }).join("");
    const wa = sum(last, "whatsapp");
    body = `<p class="intro">Últimos 30 dias${wa ? ` · <b>${br(wa)} ${wa === 1 ? "pessoa chamou" : "pessoas chamaram"} você pelo site</b>` : ""}</p>
<section class="stats">${cards}</section>
<section class="card"><h3>Visitas por dia</h3>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Visitas por dia nos últimos 30 dias" preserveAspectRatio="none">${bars}</svg>
<div class="legend"><span><i style="background:${mix(primary, "#ffffff", 0.55)}"></i>Visitas</span><span><i style="background:${primary}"></i>Chamaram no WhatsApp</span></div></section>
<section class="card"><h3>De onde vieram</h3>${sources || `<p class="muted">Ainda sem visitas neste período.</p>`}</section>
${supportUrl ? `<section class="card center"><h3>Precisa mudar algo no site?</h3><p class="muted">Texto, foto, horário, serviço: é só pedir, está incluso no seu plano.</p><a class="btn" href="${esc(supportUrl)}" target="_blank" rel="noopener">Pedir alteração</a></section>` : ""}`;
  }

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resultados · ${esc(d.name)}</title><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="${primary}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fonts.url}&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:${fonts.body};color:${ink};background:${soft};font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{width:min(720px,100% - 32px);margin:0 auto;padding:20px 0 48px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px}
.logo{height:40px;width:auto;max-width:160px;object-fit:contain}
.wordmark{font-family:${fonts.head};font-weight:${fonts.weight};font-size:20px}
header a{font-size:14px;color:${primary};font-weight:600;text-decoration:none}
h1,h2,h3{font-family:${fonts.head};font-weight:${fonts.weight};line-height:1.15}
h1{font-size:30px}
h2{font-size:24px;margin-bottom:8px}
h3{font-size:18px;margin-bottom:14px}
.intro{margin:6px 0 18px;color:${mix(ink, "#ffffff", 0.3)}}
.intro b{color:${ink}}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.stat{background:#fff;border-radius:16px;padding:16px 14px;display:flex;flex-direction:column;gap:4px}
.stat b{font-family:${fonts.head};font-size:32px;line-height:1;color:${primary}}
.stat span{font-size:13px;color:${mix(ink, "#ffffff", 0.3)}}
.stat span.up{color:#15803d;font-weight:600}.stat span.down{color:#b91c1c;font-weight:600}
.card{background:#fff;border-radius:18px;padding:20px;margin-top:12px}
.card svg{width:100%;height:130px;display:block}
.legend{display:flex;gap:16px;margin-top:10px;font-size:12px;color:${mix(ink, "#ffffff", 0.35)}}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.src{margin-top:12px}.src:first-of-type{margin-top:0}
.src .row{display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px}
.track{height:8px;background:${soft};border-radius:99px;overflow:hidden}.track i{display:block;height:100%;background:${primary};border-radius:99px}
.center{text-align:center}.center p{margin:4px 0 16px}
.muted{color:${mix(ink, "#ffffff", 0.35)};font-size:14px}
.btn{display:inline-block;background:${primary};color:${onColor(primary)};text-decoration:none;font-weight:600;padding:13px 22px;border-radius:999px}
footer{margin-top:24px;text-align:center;font-size:12px;color:${mix(ink, "#ffffff", 0.45)}}
@media (max-width:520px){.stats{grid-template-columns:1fr}.stat{flex-direction:row;align-items:baseline;gap:10px}.stat b{font-size:28px;min-width:64px}}
</style></head>
<body><div class="wrap">
<header>${brand}<a href="${esc(site)}" target="_blank" rel="noopener">Ver meu site ↗</a></header>
${d.demo ? `<p style="background:${ink};color:#fff;border-radius:12px;padding:10px 14px;font-size:13px;margin-bottom:16px">Painel de exemplo com números fictícios. É assim que o seu fica, com as cores e o logo do seu site.</p>` : ""}
<h1>Resultados do seu site</h1>
${body}
<footer>Atualizado agora · os números contam visitas reais (robôs ficam de fora)</footer>
</div></body></html>`;
}
