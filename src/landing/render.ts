// Landing page de cliente (Renda extra): HTML completo, sem dependências, a partir dos dados da página.
// Usado na prévia do Studio (iframe) e na página publicada (/p/<slug>, função api/landing.ts) — mesmo resultado nos dois.
// O layout é fixo e desenhado à mão; a IA só escreve os textos e escolhe cores, fontes e o estilo do topo.

export type LandingContent = {
  template: "split" | "full";
  fonts: "fraunces" | "cormorant" | "dmserif" | "jakarta";
  colors: { primary: string; ink: string; soft: string };
  seo_title: string;
  seo_description: string;
  eyebrow: string;
  headline: string;
  /** Trecho do título pintado na cor principal */
  highlight: string;
  subheadline: string;
  cta_label: string;
  whatsapp_message: string;
  about_title: string;
  about_text: string;
  credentials: string[];
  /** Especialidades tiradas dos dados reais (Google, Instagram, informações do cliente) */
  specialties?: string[];
  services_title: string;
  services: { title: string; text: string }[];
  steps: { title: string; text: string }[];
  benefits: { title: string; text: string }[];
  faq: { q: string; a: string }[];
  final_title: string;
  final_text: string;
  /** Índices em photos: foto do topo e da seção "sobre" */
  hero_photo: number;
  about_photo: number;
};

export type LandingData = {
  name: string;
  niche: string;
  city?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  address?: string | null;
  registry?: string | null;
  hours?: string | null;
  photos: string[];
  logo?: string | null;
  rating?: number | null;
  reviews?: number | null;
  content: LandingContent;
};

export const FONTS: Record<LandingContent["fonts"], { head: string; body: string; url: string; weight: number }> = {
  fraunces: { head: "'Fraunces', Georgia, serif", body: "'Inter', system-ui, sans-serif", weight: 500, url: "family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600" },
  cormorant: { head: "'Cormorant Garamond', Georgia, serif", body: "'Manrope', system-ui, sans-serif", weight: 600, url: "family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600" },
  dmserif: { head: "'DM Serif Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif", weight: 400, url: "family=DM+Serif+Display&family=DM+Sans:wght@400;500;600" },
  jakarta: { head: "'Plus Jakarta Sans', system-ui, sans-serif", body: "'Plus Jakarta Sans', system-ui, sans-serif", weight: 700, url: "family=Plus+Jakarta+Sans:wght@400;500;600;700;800" },
};

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const hex = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v ?? "") ? v : fallback);

/** Mistura duas cores hex (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Texto legível sobre a cor (preto ou branco). */
export function onColor(h: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#ffffff";
}

function headline(c: LandingContent) {
  const h = esc(c.headline);
  const mark = esc(c.highlight ?? "").trim();
  return mark && h.includes(mark) ? h.replace(mark, `<em>${mark}</em>`) : h;
}

const WA_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';

export function whatsappLink(d: LandingData) {
  const n = String(d.whatsapp ?? "").replace(/\D/g, "");
  if (!n) return "";
  const full = n.length <= 11 ? `55${n}` : n;
  return `https://wa.me/${full}?text=${encodeURIComponent(d.content.whatsapp_message || "Olá! Vim pelo site e gostaria de mais informações.")}`;
}

/** Horário de exemplo, só na prévia, quando o cliente não tem horário no Google nem informado (confirmar com ele). */
const SAMPLE_HOURS = "Seg a sex: 8h às 18h (exemplo, confirmar)";

/** opts.preview = link de prévia (faixa + sem indexar); opts.sample = mostra exemplo no que falta (prévia e Studio). */
/** opts.track = conta visitas e cliques (só na página servida pela api/landing.ts, nunca na prévia do Studio). */
export function renderLanding(d: LandingData, opts: { url?: string; preview?: boolean; sample?: boolean; track?: boolean } = {}): string {
  const c = d.content;
  const f = FONTS[c.fonts] ?? FONTS.fraunces;
  const primary = hex(c.colors?.primary, "#2f5d50");
  const ink = hex(c.colors?.ink, "#1c2321");
  const soft = hex(c.colors?.soft, mix(primary, "#ffffff", 0.92));
  const onPrimary = onColor(primary);
  const photos = d.photos.filter(Boolean);
  const hero = photos[c.hero_photo] ?? photos[0];
  const about = photos[c.about_photo] ?? photos[1] ?? photos[0];
  const gallery = photos.filter((p) => p !== hero && p !== about).slice(0, 6);
  const wa = whatsappLink(d);
  // Galeria sem buraco: 2 fotos lado a lado ou múltiplos de 3
  const shown = gallery.length >= 3 ? gallery.slice(0, 3 * Math.floor(gallery.length / 3)) : gallery.length === 2 ? gallery : [];
  const galleryHtml = shown.length
    ? `<div class="gallery" style="grid-template-columns:repeat(${shown.length === 2 ? 2 : 3},1fr)">${shown.map((g) => `<img class="reveal" src="${esc(g)}" alt="" loading="lazy">`).join("")}</div>`
    : "";
  const ig = String(d.instagram ?? "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  const cta = (cls = "btn") =>
    wa ? `<a class="${cls}" href="${esc(wa)}" target="_blank" rel="noopener">${WA_ICON}<span>${esc(c.cta_label || "Agendar pelo WhatsApp")}</span></a>` : "";
  const rating =
    d.rating && d.reviews ? `<div class="trust"><span class="stars">★★★★★</span><b>${String(d.rating).replace(".", ",")}</b> no Google · ${d.reviews} avaliações</div>` : "";
  const mapQuery = d.address ? encodeURIComponent(`${d.name}, ${d.address}`) : "";
  const brand = d.logo
    ? `<img class="logo" src="${esc(d.logo)}" alt="${esc(d.name)}">`
    : `<span class="wordmark">${esc(d.name)}</span>`;

  const css = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--p:${primary};--on-p:${onPrimary};--ink:${ink};--soft:${soft};--line:${mix(ink, "#ffffff", 0.86)};--muted:${mix(ink, "#ffffff", 0.38)};--bg:#fff;--head:${f.head};--body:${f.body}}
html{scroll-behavior:smooth}
body{font-family:var(--body);color:var(--ink);background:var(--bg);font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}
a{color:inherit}
.wrap{width:min(1120px,100% - 40px);margin-inline:auto}
h1,h2,h3{font-family:var(--head);font-weight:${f.weight};line-height:1.1;letter-spacing:-.015em;color:var(--ink)}
h1{font-size:clamp(38px,6vw,64px)}
h2{font-size:clamp(30px,4vw,44px)}
h3{font-size:21px;line-height:1.25}
h1 em,h2 em{font-style:${c.fonts === "jakarta" ? "normal" : "italic"};color:var(--p)}
.eyebrow{display:inline-block;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--p);margin-bottom:18px}
.lead{font-size:clamp(17px,2vw,20px);color:var(--muted);max-width:34em}
.btn{display:inline-flex;align-items:center;gap:10px;background:var(--p);color:var(--on-p);text-decoration:none;font-weight:600;font-size:16px;padding:16px 26px;border-radius:999px;transition:transform .2s,box-shadow .2s;box-shadow:0 10px 24px -12px var(--p)}
.btn:hover{transform:translateY(-2px);box-shadow:0 16px 30px -12px var(--p)}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--line)}
.btn.small{padding:10px 18px;font-size:14px}
header.nav{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.88);backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line)}
header.nav .wrap{display:flex;align-items:center;justify-content:space-between;height:72px;gap:16px}
.logo{height:44px;width:auto;object-fit:contain}
.wordmark{font-family:var(--head);font-size:22px;font-weight:${f.weight}}
nav.links{display:flex;gap:28px;font-size:15px}
nav.links a{text-decoration:none;color:var(--muted)}
nav.links a:hover{color:var(--ink)}
section{padding:clamp(72px,10vw,120px) 0}
.hero{padding-top:clamp(48px,7vw,88px)}
.hero.split .wrap{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(32px,6vw,80px);align-items:center}
.hero.split .photo{position:relative}
.hero.split .photo img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:28px}
.hero.split .photo:before{content:"";position:absolute;inset:auto -18px -18px auto;width:70%;height:70%;background:var(--soft);border-radius:28px;z-index:-1}
.hero .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
.hero .lead{margin-top:22px}
.trust{margin-top:28px;font-size:14px;color:var(--muted)}
.trust .stars{color:#f5a623;letter-spacing:2px;margin-right:6px}
.trust b{color:var(--ink)}
.hero.full{position:relative;min-height:min(86vh,760px);display:flex;align-items:flex-end;padding:0;color:#fff;overflow:hidden}
.hero.full>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero.full:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05) 20%,rgba(0,0,0,.72))}
.hero.full .wrap{position:relative;z-index:1;padding:120px 0 clamp(48px,8vw,96px)}
.hero.full h1,.hero.full .lead{color:#fff}
.hero.full h1 em{color:#fff;text-decoration:underline;text-decoration-color:var(--p);text-decoration-thickness:.08em;text-underline-offset:.12em}
.hero.full .lead{opacity:.88}
.hero.full .eyebrow{color:#fff;opacity:.9}
.hero.full .trust,.hero.full .trust b{color:#fff}
.hero.full .btn.ghost{color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5)}
.about .wrap{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(32px,6vw,88px);align-items:center}
.about img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:24px}
.about p{margin-top:20px;color:var(--muted);white-space:pre-line}
.creds{list-style:none;margin-top:28px;display:grid;gap:12px}
.creds li{display:flex;gap:12px;align-items:flex-start;font-size:16px}
.creds li:before{content:"";flex:none;width:20px;height:20px;margin-top:3px;border-radius:50%;background:var(--soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M6 10.5l2.5 2.5L14 7.5' fill='none' stroke='${encodeURIComponent(primary)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/20px no-repeat}
.services{background:var(--soft)}
.head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:48px}
.head p{max-width:28em;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
.card{background:#fff;border-radius:20px;padding:30px 28px;border:1px solid var(--line)}
.card .n{font-family:var(--head);font-size:15px;color:var(--p);margin-bottom:18px;display:block}
.card p{margin-top:10px;font-size:15.5px;color:var(--muted)}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(20px,4vw,48px);counter-reset:s}
.step{border-top:2px solid var(--ink);padding-top:22px}
.step:before{counter-increment:s;content:"0" counter(s);font-family:var(--head);font-size:44px;color:var(--p);display:block;margin-bottom:14px;line-height:1}
.step p{margin-top:8px;color:var(--muted);font-size:15.5px}
.benefits{background:var(--ink);color:#fff}
.benefits h2,.benefits h3{color:#fff}
.benefits .grid{gap:40px 48px}
.benefits p{color:rgba(255,255,255,.72);margin-top:10px;font-size:15.5px}
.benefits .b{border-left:2px solid var(--p);padding-left:22px}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:48px}
.gallery img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:16px}
.faq{max-width:780px}
.faq details{border-bottom:1px solid var(--line);padding:22px 0}
.faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px;font-weight:600;font-size:18px}
.faq summary::-webkit-details-marker{display:none}
.faq summary:after{content:"+";font-family:var(--head);font-size:26px;line-height:1;color:var(--p);transition:transform .2s}
.faq details[open] summary:after{transform:rotate(45deg)}
.faq details p{margin-top:12px;color:var(--muted)}
.final{background:var(--p);color:var(--on-p);text-align:center}
.final h2{color:var(--on-p);max-width:16em;margin-inline:auto}
.final p{margin:18px auto 34px;max-width:32em;opacity:.85}
.final .btn{background:var(--on-p);color:var(--p);box-shadow:none}
.contact .wrap{display:grid;grid-template-columns:1fr 1.2fr;gap:clamp(32px,5vw,64px);align-items:start}
.contact dl{display:grid;gap:22px;margin-top:28px}
.contact dt{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600}
.contact dd{margin-top:4px;font-size:17px}
.contact dd.sample{color:var(--muted);font-style:italic}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}
.tags span{background:var(--soft);color:var(--ink);font-size:14px;font-weight:500;padding:7px 14px;border-radius:999px}
.contact iframe{width:100%;height:360px;border:0;border-radius:20px;filter:grayscale(.2)}
footer{border-top:1px solid var(--line);padding:32px 0;font-size:14px;color:var(--muted)}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.float{position:fixed;right:20px;bottom:20px;z-index:30;width:58px;height:58px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 12px 28px -8px rgba(0,0,0,.35)}
.float svg{width:28px;height:28px}
.reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease}
.reveal.in{opacity:1;transform:none}
@media (max-width:880px){
  nav.links{display:none}
  .hero.split .wrap,.about .wrap,.contact .wrap{grid-template-columns:1fr}
  .hero.split .photo{order:-1}
  .hero.split .photo img{aspect-ratio:4/4.2}
  .steps{grid-template-columns:1fr}
  .head{flex-direction:column;align-items:flex-start}
  .gallery{grid-template-columns:repeat(2,1fr)!important}
  header.nav .btn span{display:none}
  header.nav .btn{padding:10px}
}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}html{scroll-behavior:auto}}
`;

  const heroHtml =
    c.template === "full" && hero
      ? `<section class="hero full"><img src="${esc(hero)}" alt="${esc(d.name)}"><div class="wrap">
  <span class="eyebrow">${esc(c.eyebrow)}</span><h1>${headline(c)}</h1><p class="lead">${esc(c.subheadline)}</p>
  <div class="actions">${cta()}<a class="btn ghost" href="#servicos">Conhecer os serviços</a></div>${rating}</div></section>`
      : `<section class="hero split"><div class="wrap"><div>
  <span class="eyebrow">${esc(c.eyebrow)}</span><h1>${headline(c)}</h1><p class="lead">${esc(c.subheadline)}</p>
  <div class="actions">${cta()}<a class="btn ghost" href="#servicos">Conhecer os serviços</a></div>${rating}</div>
  ${hero ? `<div class="photo"><img src="${esc(hero)}" alt="${esc(d.name)}"></div>` : ""}</div></section>`;

  const contactRows = [
    d.address && `<div><dt>Endereço</dt><dd>${esc(d.address)}</dd></div>`,
    (d.hours || opts.sample) && `<div><dt>Horário</dt><dd${d.hours ? "" : ' class="sample"'}>${esc(d.hours || SAMPLE_HOURS)}</dd></div>`,
    d.whatsapp && `<div><dt>WhatsApp</dt><dd><a href="${esc(wa)}" target="_blank" rel="noopener">${esc(d.whatsapp)}</a></dd></div>`,
    ig && `<div><dt>Instagram</dt><dd><a href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">@${esc(ig)}</a></dd></div>`,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.seo_title || d.name)}</title>
<meta name="description" content="${esc(c.seo_description)}">
<meta property="og:title" content="${esc(c.seo_title || d.name)}"><meta property="og:description" content="${esc(c.seo_description)}">
${hero ? `<meta property="og:image" content="${esc(hero)}">` : ""}${opts.url ? `<meta property="og:url" content="${esc(opts.url)}"><link rel="canonical" href="${esc(opts.url)}">` : ""}
<meta name="theme-color" content="${primary}">${opts.preview ? '<meta name="robots" content="noindex">' : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${f.url}&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
${opts.preview ? `<div style="background:${ink};color:#fff;text-align:center;font-size:13px;padding:8px 16px">Prévia do site · ainda não publicado</div>
<div aria-hidden="true" style="position:fixed;inset:0;z-index:40;pointer-events:none;background:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='200'%3E%3Ctext x='20' y='120' transform='rotate(-24 140 100)' font-family='Arial' font-size='30' font-weight='700' fill='%23000' fill-opacity='.07'%3EPR%C3%89VIA%3C/text%3E%3C/svg%3E&quot;)"></div>
<div style="position:fixed;left:0;right:0;bottom:0;z-index:41;background:${ink};color:#fff;text-align:center;font-size:13px;padding:10px 16px;font-family:system-ui,sans-serif">PRÉVIA · site ainda não publicado</div><style>.float{bottom:62px}footer{padding-bottom:64px}</style>` : ""}
<header class="nav"><div class="wrap">${brand}
<nav class="links"><a href="#sobre">Sobre</a><a href="#servicos">Serviços</a><a href="#como-funciona">Como funciona</a><a href="#duvidas">Dúvidas</a><a href="#contato">Contato</a></nav>
${cta("btn small")}</div></header>
<main>
${heroHtml}
<section class="about" id="sobre"><div class="wrap">
${about ? `<img class="reveal" src="${esc(about)}" alt="${esc(d.name)}">` : ""}
<div class="reveal"><span class="eyebrow">Sobre</span><h2>${esc(c.about_title)}</h2><p>${esc(c.about_text)}</p>
${c.specialties?.length ? `<div class="tags">${c.specialties.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
${c.credentials?.length ? `<ul class="creds">${c.credentials.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
${d.registry ? `<p style="font-size:14px;margin-top:22px">${esc(d.registry)}</p>` : ""}</div></div></section>
<section class="services" id="servicos"><div class="wrap">
<div class="head reveal"><div><span class="eyebrow">Serviços</span><h2>${esc(c.services_title)}</h2></div></div>
<div class="grid">${c.services.map((s, i) => `<article class="card reveal"><span class="n">${String(i + 1).padStart(2, "0")}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></article>`).join("")}</div>
</div></section>
<section id="como-funciona"><div class="wrap">
<div class="head reveal"><div><span class="eyebrow">Como funciona</span><h2>Do primeiro contato ao acompanhamento</h2></div></div>
<div class="steps">${c.steps.slice(0, 3).map((s) => `<div class="step reveal"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join("")}</div>
${galleryHtml}
</div></section>
<section class="benefits"><div class="wrap">
<div class="head reveal"><div><span class="eyebrow" style="color:#fff;opacity:.7">Por que escolher</span><h2>${esc(d.name)}</h2></div></div>
<div class="grid">${c.benefits.map((b) => `<div class="b reveal"><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></div>`).join("")}</div>
</div></section>
<section id="duvidas"><div class="wrap"><div class="head reveal"><div><span class="eyebrow">Dúvidas frequentes</span><h2>Perguntas que sempre recebemos</h2></div></div>
<div class="faq">${c.faq.map((q) => `<details class="reveal"><summary>${esc(q.q)}</summary><p>${esc(q.a)}</p></details>`).join("")}</div></div></section>
<section class="final"><div class="wrap reveal"><h2>${esc(c.final_title)}</h2><p>${esc(c.final_text)}</p>${cta()}</div></section>
${contactRows.length || mapQuery ? `<section class="contact" id="contato"><div class="wrap">
<div class="reveal"><span class="eyebrow">Contato</span><h2>Fale com a gente</h2><dl>${contactRows.join("")}</dl></div>
${mapQuery ? `<div class="reveal"><iframe loading="lazy" title="Mapa" src="https://www.google.com/maps?q=${mapQuery}&output=embed"></iframe>
<a class="btn ghost small" style="margin-top:14px" data-track="maps" href="https://www.google.com/maps/dir/?api=1&destination=${mapQuery}" target="_blank" rel="noopener">Como chegar</a></div>` : ""}
</div></section>` : ""}
</main>
<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(d.name)}${d.city ? ` · ${esc(d.city)}` : ""}</span>${d.registry ? `<span>${esc(d.registry)}</span>` : ""}</div></footer>
${wa ? `<a class="float" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp">${WA_ICON}</a>` : ""}
${opts.track ? `<script>
(function(){function t(e,r){var u=location.pathname.replace(/\\/$/,'')+'?e='+e+(r?'&r='+encodeURIComponent(r):'');try{navigator.sendBeacon?navigator.sendBeacon(u):fetch(u,{method:'POST',keepalive:true})}catch(x){}}
t('view',(new URLSearchParams(location.search).get('utm_source'))||document.referrer);
document.addEventListener('click',function(ev){var a=ev.target.closest&&ev.target.closest('a');if(!a)return;if(/wa\\.me\\//.test(a.href))t('whatsapp');else if(a.getAttribute('data-track')==='maps')t('maps')},true)})();
</script>` : ""}
<script>
(function(){var els=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)){els.forEach(function(e){e.classList.add('in')});return}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});els.forEach(function(e){io.observe(e)})})();
</script>
</body></html>`;
}
