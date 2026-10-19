// Landing page Premium (plano mais caro): mesmo conteúdo da IA, layout animado no estilo do site da PáginasPro.
// Cores e fontes do cliente; foto do topo num cartão 3D que segue o dedo/mouse, título palavra a palavra, faixa
// rolando com as especialidades, serviços que abrem ao tocar, galeria arrastável, blocos em mosaico e mini conversa
// do WhatsApp ao chamar. Chamado por renderLanding quando tier = "premium" (prévia do Studio e página publicada).
import { WIDGET_CSS, WIDGET_JS, WIDGET_TITLE, widgetFor, widgetHtml } from "./widgets.js";
import { esc, FONTS, headline, hex, mix, onColor, SAMPLE_HOURS, WA_ICON, whatsappLink, type LandingContent, type LandingData } from "./render.js";

export function renderPremium(d: LandingData, opts: { url?: string; preview?: boolean; sample?: boolean; track?: boolean } = {}): string {
  const c = d.content;
  const f = FONTS[c.fonts] ?? FONTS.fraunces;
  const primary = hex(c.colors?.primary, "#2f5d50");
  const ink = hex(c.colors?.ink, "#1c2321");
  const soft = hex(c.colors?.soft, mix(primary, "#ffffff", 0.92));
  const paper = mix(soft, "#ffffff", 0.55);
  const onP = onColor(primary);
  const muted = mix(ink, "#ffffff", 0.4);
  const line = mix(ink, "#ffffff", 0.85);
  const photos = d.photos.filter(Boolean);
  const hero = photos[c.hero_photo] ?? photos[0];
  const about = photos[c.about_photo] ?? photos[1] ?? photos[0];
  const gallery = photos.filter((p) => p !== hero && p !== about).slice(0, 8);
  const wa = whatsappLink(d);
  const ig = String(d.instagram ?? "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  const mapQuery = d.address ? encodeURIComponent(`${d.name}, ${d.address}`) : "";
  const hours = d.hours || (opts.sample ? SAMPLE_HOURS : "");
  const initial = esc(d.name.trim().charAt(0).toUpperCase() || "•");
  const italic = c.fonts === "jakarta" ? "normal" : "italic";
  const brand = d.logo ? `<img class="logo" src="${esc(d.logo)}" alt="${esc(d.name)}">` : `<span class="wordmark">${esc(d.name)}</span>`;
  const cta = (label: string, cls = "btn") => (wa ? `<a class="${cls} magnet" data-wa href="${esc(wa)}" target="_blank" rel="noopener"><i class="dot"></i>${esc(label)}</a>` : "");
  const tags = (c.specialties?.length ? c.specialties : c.services.map((s) => s.title)).slice(0, 10);
  const chips = [
    d.rating && d.reviews ? `<div class="chip c1 float"><span class="ic star">★</span><div>${String(d.rating).replace(".", ",")} no Google<small>${d.reviews} avaliações</small></div></div>` : "",
    wa ? `<div class="chip c2 float" style="animation-delay:-2s"><span class="ic wa">${WA_ICON}</span><div>Atendimento<small>pelo WhatsApp</small></div></div>` : "",
    d.hours ? `<div class="chip c3 float" style="animation-delay:-4s"><span class="ic clock">◷</span><div>${esc(d.hours.split("·")[0].trim())}<small>horário de atendimento</small></div></div>` : d.city ? `<div class="chip c3 float" style="animation-delay:-4s"><span class="ic clock">⌖</span><div>${esc(d.city)}<small>onde estamos</small></div></div>` : "",
  ].join("");

  const css = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--p:${primary};--on-p:${onP};--ink:${ink};--soft:${soft};--paper:${paper};--muted:${muted};--line:${line};--head:${f.head};--body:${f.body}}
html,body{overflow-x:hidden;overflow-x:clip}
html{scroll-behavior:smooth}
body{font-family:var(--body);background:var(--paper);color:var(--ink);font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
.wrap{width:min(1160px,100% - 32px);margin-inline:auto}
h1,h2,h3{font-family:var(--head);font-weight:${f.weight};letter-spacing:-.025em;line-height:1.02;color:var(--ink)}
h1{font-size:clamp(44px,7vw,92px)}
h2{font-size:clamp(34px,4.8vw,62px)}
h3{font-size:21px;line-height:1.25;letter-spacing:-.01em}
h1 em,h2 em{font-style:${italic};color:var(--p)}
.kicker{display:inline-flex;align-items:center;gap:9px;font-size:13px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.kicker i{width:8px;height:8px;border-radius:50%;background:var(--p);box-shadow:0 0 0 4px var(--soft)}
.btn{display:inline-flex;align-items:center;gap:10px;background:var(--ink);color:#fff;font-weight:600;font-size:16px;padding:16px 24px;border-radius:999px;transition:transform .25s cubic-bezier(.2,.8,.2,1);will-change:transform}
.btn .dot{width:9px;height:9px;border-radius:50%;background:#25D366;box-shadow:0 0 0 3px rgba(37,211,102,.25)}
.btn.p{background:var(--p);color:var(--on-p)}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--ink)}
section{padding:clamp(80px,11vw,130px) 0}
.nav{position:fixed;top:12px;left:0;right:0;z-index:50}
.nav .bar{display:flex;align-items:center;justify-content:space-between;gap:12px;background:color-mix(in srgb,var(--paper) 78%,transparent);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);border:1px solid var(--line);border-radius:999px;padding:8px 8px 8px 20px}
.logo{height:36px;width:auto;max-width:150px;object-fit:contain}
.wordmark{font-family:var(--head);font-weight:${f.weight};font-size:20px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52vw}
.nav nav{display:flex;gap:24px;font-size:15px;color:var(--muted)}
.nav nav a:hover{color:var(--ink)}
.nav .btn{padding:11px 18px;font-size:14px}
.hero{padding:130px 0 70px;position:relative}
.hero .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center}
.hero .lead{font-size:clamp(18px,1.6vw,21px);color:var(--muted);max-width:30em;margin:24px 0 32px}
.hero .ctas{display:flex;flex-wrap:wrap;gap:12px}
.blob{position:absolute;right:-14%;top:4%;width:60vw;max-width:780px;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,var(--soft) 0,color-mix(in srgb,var(--p) 18%,transparent) 38%,transparent 68%);z-index:-1;pointer-events:none}
.stage{perspective:1300px;display:grid;place-items:center;min-height:540px;touch-action:pan-y}
.rig{position:relative;transform-style:preserve-3d;transform:rotateY(-14deg) rotateX(6deg);transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.card3d{width:min(400px,78vw);aspect-ratio:4/5;border-radius:34px;overflow:hidden;box-shadow:0 60px 90px -36px color-mix(in srgb,var(--ink) 60%,transparent),0 0 0 8px #fff;background:var(--soft)}
.card3d img{width:100%;height:100%;object-fit:cover}
.card3d .ph{width:100%;height:100%;background:linear-gradient(150deg,var(--p),var(--soft));display:grid;place-items:center;color:var(--on-p);font-family:var(--head);font-size:120px}
.chip{position:absolute;background:#fff;border-radius:16px;padding:11px 14px;font-size:13.5px;font-weight:600;box-shadow:0 18px 40px -16px color-mix(in srgb,var(--ink) 45%,transparent);display:flex;align-items:center;gap:10px;white-space:nowrap}
.chip small{display:block;font-size:11.5px;font-weight:500;color:var(--muted)}
.chip .ic{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;flex:none;font-size:16px}
.chip .star{background:#FFF4D6;color:#F5A623}
.chip .wa{background:#E8FCEB;color:#25D366}.chip .wa svg{width:17px;height:17px}
.chip .clock{background:var(--soft);color:var(--p);font-weight:700}
.c1{left:-90px;top:60px;transform:translateZ(90px)}
.c2{right:-80px;top:44%;transform:translateZ(130px)}
.c3{left:-60px;bottom:40px;transform:translateZ(60px)}
.float{animation:float 6s ease-in-out infinite}
@keyframes float{0%,100%{translate:0 0}50%{translate:0 -10px}}
.marquee{background:var(--p);color:var(--on-p);overflow:hidden;padding:18px 0}
.marquee .track{display:flex;width:max-content;animation:mq 40s linear infinite;font-family:var(--head);font-weight:${f.weight};font-size:clamp(22px,3vw,32px);letter-spacing:-.02em}
.marquee span{display:flex;align-items:center;gap:40px;padding-right:40px;white-space:nowrap}
.marquee span:after{content:"✳";font-size:.7em;opacity:.7}
@keyframes mq{to{transform:translateX(-50%)}}
.about .grid{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(32px,6vw,90px);align-items:center}
.about .photo{position:relative}
.about .photo img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:30px}
.about .photo:after{content:"";position:absolute;inset:auto -16px -16px auto;width:60%;height:60%;border-radius:30px;background:var(--p);opacity:.14;z-index:-1}
.about p.txt{color:var(--muted);margin-top:20px;white-space:pre-line}
.creds{list-style:none;margin-top:24px;display:grid;gap:10px}
.creds li{display:flex;gap:12px;font-size:16px}
.creds li:before{content:"";flex:none;width:20px;height:20px;margin-top:3px;border-radius:50%;background:var(--p)}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.tags span{background:#fff;border:1px solid var(--line);font-size:14px;font-weight:500;padding:7px 14px;border-radius:999px}
.svc{margin-top:46px;border-top:1.5px solid var(--ink)}
.svc details{border-bottom:1.5px solid var(--ink)}
.svc summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:70px 1fr auto;align-items:center;gap:16px;padding:24px 4px;transition:padding .3s}
.svc summary::-webkit-details-marker{display:none}
.svc summary .n{font-family:var(--head);font-style:${italic};font-size:28px;color:var(--p)}
.svc summary h3{font-size:clamp(22px,2.6vw,32px);font-family:var(--head);font-weight:${f.weight}}
.svc summary .ar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;border:1.5px solid var(--ink);transition:transform .3s,background .3s,color .3s;font-size:20px}
.svc details[open] summary .ar{transform:rotate(45deg);background:var(--ink);color:#fff}
.svc summary:hover{padding-left:14px}
.svc details p{padding:0 4px 26px 90px;color:var(--muted);max-width:44em}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:46px}
.step{background:#fff;border:1px solid var(--line);border-radius:28px;padding:30px;min-height:260px;display:flex;flex-direction:column;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.step:hover{transform:translateY(-6px) rotate(-.6deg)}
.step .n{font-family:var(--head);font-style:${italic};font-size:84px;line-height:.8;color:var(--p)}
.step h3{margin-top:auto}
.step p{color:var(--muted);font-size:15.5px;margin-top:8px}
.step.dark{background:var(--ink);color:#fff;border:0}
.step.dark h3{color:#fff}.step.dark p{color:rgba(255,255,255,.7)}
.step.dark .n{color:var(--soft)}
.bento{display:grid;grid-template-columns:repeat(6,1fr);gap:16px;margin-top:46px}
.tile{background:#fff;border:1px solid var(--line);border-radius:28px;padding:28px;grid-column:span 2}
.tile p{color:var(--muted);font-size:15.5px;margin-top:8px}
.tile:first-child{grid-column:span 4;background:var(--p);border:0;color:var(--on-p)}
.tile:first-child h3{color:var(--on-p);font-size:28px;font-family:var(--head);font-weight:${f.weight}}
.tile:first-child p{color:var(--on-p);opacity:.8}
.tile.dark{background:var(--ink);border:0}.tile.dark h3{color:#fff}.tile.dark p{color:rgba(255,255,255,.7)}
.gal{margin-top:40px;display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px;cursor:grab;scrollbar-width:none}
.gal::-webkit-scrollbar{display:none}
.gal img{flex:none;width:min(340px,76vw);aspect-ratio:4/5;object-fit:cover;border-radius:24px;scroll-snap-align:start;user-select:none;-webkit-user-drag:none}
.gal-nav{display:flex;gap:8px}
.gal-nav button{width:48px;height:48px;border-radius:50%;border:1.5px solid var(--ink);background:transparent;font-size:20px;cursor:pointer;color:var(--ink)}
.row-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
.faq{display:grid;grid-template-columns:.8fr 1.2fr;gap:50px}
.faq details{border-top:1.5px solid var(--ink);padding:22px 0}
.faq details:last-child{border-bottom:1.5px solid var(--ink)}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:20px;font-size:19px;font-weight:600}
.faq summary::-webkit-details-marker{display:none}
.faq summary:after{content:"+";font-size:28px;line-height:.8;color:var(--p);transition:transform .25s}
.faq details[open] summary:after{transform:rotate(45deg)}
.faq details p{color:var(--muted);margin-top:12px}
.contact .grid{display:grid;grid-template-columns:1fr 1.2fr;gap:clamp(30px,5vw,60px);align-items:start}
.contact dl{display:grid;gap:20px;margin-top:26px}
.contact dt{font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600}
.contact dd{margin-top:4px;font-size:17px}
.contact dd.sample{color:var(--muted);font-style:italic}
.contact iframe{width:100%;height:380px;border:0;border-radius:28px}
.final{padding-top:0}
.final .card{background:var(--p);color:var(--on-p);border-radius:44px;padding:clamp(56px,8vw,110px) 22px;text-align:center;position:relative;overflow:hidden}
.final h2{color:var(--on-p);max-width:14em;margin:0 auto}
.final p{max-width:32em;margin:20px auto 32px;opacity:.85;font-size:18px}
.final .btn{background:var(--on-p);color:var(--p)}
.final .ring{position:absolute;border:1.5px solid currentColor;border-radius:50%;opacity:.16}
footer{padding:30px 0 110px;font-size:14px;color:var(--muted)}
footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}
.fab{position:fixed;right:18px;bottom:18px;z-index:60;width:60px;height:60px;border-radius:50%;background:#25D366;color:#fff;display:grid;place-items:center;box-shadow:0 16px 34px -12px rgba(0,0,0,.45);transform:translateY(120px);transition:transform .45s cubic-bezier(.2,.8,.2,1)}
.fab.show{transform:none}
.fab svg{width:28px;height:28px}
.reveal{opacity:0;transform:translateY(26px);transition:opacity .8s ease,transform .8s cubic-bezier(.2,.8,.2,1)}
.reveal.in{opacity:1;transform:none}
.sw{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em}
.sw>span{display:inline-block;transform:translateY(105%);transition:transform .9s cubic-bezier(.2,.8,.2,1)}
.loaded .sw>span{transform:none}
.wa-sheet{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,0);visibility:hidden;transition:background .35s,visibility 0s .35s}
.wa-sheet.open{visibility:visible;background:rgba(0,0,0,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background .35s}
.wa-card{width:min(380px,100%);border-radius:28px;overflow:hidden;background:#EFEAE2;box-shadow:0 40px 80px -30px rgba(0,0,0,.6);transform:translateY(40px) scale(.94);opacity:0;transition:transform .5s cubic-bezier(.2,.9,.2,1.15),opacity .3s}
.wa-sheet.open .wa-card{transform:none;opacity:1}
.wa-head{display:flex;align-items:center;gap:12px;background:var(--ink);color:#fff;padding:14px 16px}
.wa-head .av{width:40px;height:40px;border-radius:50%;background:var(--p);color:var(--on-p);display:grid;place-items:center;font-weight:800;overflow:hidden}
.wa-head .av img{width:100%;height:100%;object-fit:cover;background:#fff}
.wa-head b{display:block;font-size:15px}
.wa-head small{font-size:12px;color:#9FE870}
.wa-body{padding:18px 14px 10px;min-height:140px;display:flex;flex-direction:column;justify-content:flex-end;background:#EFEAE2 radial-gradient(rgba(0,0,0,.035) 1px,transparent 1px) 0 0/14px 14px}
.bubble{align-self:flex-end;max-width:86%;background:#D9FDD3;color:#111;border-radius:14px 14px 4px 14px;padding:9px 12px 6px;font-size:14px;line-height:1.4;transform-origin:100% 100%;transform:scale(.6);opacity:0;transition:transform .35s cubic-bezier(.2,.9,.2,1.2),opacity .2s}
.bubble.in{transform:none;opacity:1}
.bubble .meta{display:flex;justify-content:flex-end;gap:3px;font-size:10.5px;color:#667781;margin-top:2px}
.bubble .ticks{color:#8696a0;transition:color .3s}.bubble.read .ticks{color:#53BDEB}
.caret{display:inline-block;width:2px;height:15px;background:#111;vertical-align:-2px;margin-left:1px;animation:blink .8s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.wa-foot{display:flex;align-items:center;gap:10px;padding:12px 14px 16px;background:#EFEAE2}
.wa-foot .bar{flex:1;height:6px;border-radius:99px;background:rgba(0,0,0,.08);overflow:hidden}
.wa-foot .bar i{display:block;height:100%;width:0;background:#25D366}
.wa-sheet.go .wa-foot .bar i{width:100%;transition:width 1.1s cubic-bezier(.4,0,.2,1)}
.wa-foot span{font-size:12.5px;color:#54656F;font-weight:600}
.wa-foot a{font-size:12.5px;font-weight:700;color:#008069}
@media (max-width:960px){
  .nav nav{display:none}
  .hero{padding-top:108px}
  .hero .grid,.about .grid,.faq,.contact .grid{grid-template-columns:1fr}
  .stage{min-height:auto;padding:30px 0 10px}
  .c1{left:-30px;top:30px}.c2{right:-24px}.c3{left:-20px;bottom:24px}
  .steps{grid-template-columns:1fr}.step{min-height:0}.step h3{margin-top:24px}
  .bento{grid-template-columns:1fr}.tile,.tile:first-child{grid-column:auto}
  .svc summary{grid-template-columns:44px 1fr auto}
  .svc details p{padding-left:4px}
  .nav .btn{padding:10px 14px}
}
@media (max-width:420px){.chip{font-size:12px;padding:9px 11px}.chip .ic{width:26px;height:26px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.reveal{opacity:1;transform:none}.sw>span{transform:none}}
`;

  const benefits = c.benefits.slice(0, 4);
  const bento = benefits.map((b, i) => `<div class="tile reveal${i === 3 || (benefits.length === 3 && i === 2) ? " dark" : ""}"><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></div>`).join("");
  const contactRows = [
    d.address && `<div><dt>Endereço</dt><dd>${esc(d.address)}</dd></div>`,
    hours && `<div><dt>Horário</dt><dd${d.hours ? "" : ' class="sample"'}>${esc(hours)}</dd></div>`,
    d.whatsapp && `<div><dt>WhatsApp</dt><dd><a data-wa href="${esc(wa)}" target="_blank" rel="noopener">${esc(d.whatsapp)}</a></dd></div>`,
    ig && `<div><dt>Instagram</dt><dd><a href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">@${esc(ig)}</a></dd></div>`,
  ].filter(Boolean);
  const tagLine = tags.map((t) => `<span>${esc(t)}</span>`).join("");
  // Animação interativa do ramo (dente, prato, corpo, respiração, pele), quando houver uma para a área
  const wk = widgetFor(`${d.niche} ${c.eyebrow ?? ""}`);

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(c.seo_title || d.name)}</title>
<meta name="description" content="${esc(c.seo_description)}">
<meta property="og:title" content="${esc(c.seo_title || d.name)}"><meta property="og:description" content="${esc(c.seo_description)}">
${hero ? `<meta property="og:image" content="${esc(hero)}">` : ""}${opts.url ? `<meta property="og:url" content="${esc(opts.url)}"><link rel="canonical" href="${esc(opts.url)}">` : ""}
<meta name="theme-color" content="${primary}">${opts.preview ? '<meta name="robots" content="noindex">' : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${f.url}&display=swap" rel="stylesheet">
<style>${css}${wk ? WIDGET_CSS : ""}</style></head>
<body>
${opts.preview ? `<div aria-hidden="true" style="position:fixed;inset:0;z-index:40;pointer-events:none;background:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='200'%3E%3Ctext x='20' y='120' transform='rotate(-24 140 100)' font-family='Arial' font-size='30' font-weight='700' fill='%23000' fill-opacity='.07'%3EPR%C3%89VIA%3C/text%3E%3C/svg%3E&quot;)"></div>
<div style="position:fixed;left:0;right:0;bottom:0;z-index:41;background:${ink};color:#fff;text-align:center;font-size:13px;padding:10px 16px;font-family:system-ui,sans-serif">PRÉVIA · site ainda não publicado</div><style>.fab{bottom:62px}footer{padding-bottom:64px}</style>` : ""}
<header class="nav"><div class="wrap"><div class="bar">${brand}
<nav><a href="#sobre">Sobre</a><a href="#servicos">Serviços</a><a href="#como-funciona">Como funciona</a><a href="#duvidas">Dúvidas</a><a href="#contato">Contato</a></nav>
${cta("Agendar", "btn")}</div></div></header>
<main>
<section class="hero"><div class="blob"></div><div class="wrap grid">
<div>
<span class="kicker reveal"><i></i>${esc(c.eyebrow)}</span>
<h1 class="split" style="margin-top:20px">${headline(c)}</h1>
<p class="lead reveal">${esc(c.subheadline)}</p>
<div class="ctas reveal">${cta(c.cta_label || "Agendar pelo WhatsApp")}<a class="btn ghost" href="#servicos">Ver serviços</a></div>
</div>
<div class="stage" id="stage"><div class="rig" id="rig"><div class="card3d">${hero ? `<img src="${esc(hero)}" alt="${esc(d.name)}">` : `<div class="ph">${initial}</div>`}</div>${chips}</div></div>
</div></section>
${tagLine ? `<div class="marquee" aria-hidden="true"><div class="track">${tagLine}${tagLine}${tagLine}${tagLine}</div></div>` : ""}

<section class="about" id="sobre"><div class="wrap grid">
${about ? `<div class="photo reveal"><img src="${esc(about)}" alt="${esc(d.name)}" loading="lazy"></div>` : ""}
<div class="reveal"><span class="kicker"><i></i>Sobre</span><h2 style="margin-top:16px">${esc(c.about_title)}</h2><p class="txt">${esc(c.about_text)}</p>
${c.credentials?.length ? `<ul class="creds">${c.credentials.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
${c.specialties?.length ? `<div class="tags">${c.specialties.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
${d.registry ? `<p style="font-size:14px;margin-top:20px;color:var(--muted)">${esc(d.registry)}</p>` : ""}</div>
</div></section>

<section id="servicos" style="padding-top:0"><div class="wrap">
<span class="kicker reveal"><i></i>Serviços</span><h2 class="reveal" style="margin-top:16px;max-width:15em">${esc(c.services_title)}</h2>
<div class="svc">${c.services.map((s, i) => `<details class="reveal"${i === 0 ? " open" : ""}><summary><span class="n">${String(i + 1).padStart(2, "0")}</span><h3>${esc(s.title)}</h3><span class="ar">+</span></summary><p>${esc(s.text)}</p></details>`).join("")}</div>
</div></section>

${wk ? `<section style="padding-top:0"><div class="wrap">
<span class="kicker reveal"><i></i>Experimente</span><h2 class="reveal" style="margin-top:16px">${esc(WIDGET_TITLE[wk][0])}</h2><p class="reveal" style="color:var(--muted);margin:12px 0 30px;max-width:34em">${esc(WIDGET_TITLE[wk][1])}</p>
<div class="reveal" style="--wp:${primary};--wi:${ink};--ws:${soft}">${widgetHtml(wk)}</div>
</div></section>` : ""}

<section id="como-funciona" style="padding-top:0"><div class="wrap">
<span class="kicker reveal"><i></i>Como funciona</span><h2 class="reveal" style="margin-top:16px">Simples <em>do começo ao fim.</em></h2>
<div class="steps">${c.steps.slice(0, 3).map((s, i) => `<div class="step reveal${i === 2 ? " dark" : ""}"><span class="n">${i + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join("")}</div>
</div></section>

${gallery.length >= 2 ? `<section style="padding-top:0"><div class="wrap">
<div class="row-head reveal"><div><span class="kicker"><i></i>Galeria</span><h2 style="margin-top:16px">Por dentro <em>do nosso dia a dia.</em></h2></div><div class="gal-nav"><button type="button" data-g="-1" aria-label="Anterior">←</button><button type="button" data-g="1" aria-label="Próxima">→</button></div></div>
<div class="gal" id="gal">${gallery.map((g) => `<img src="${esc(g)}" alt="" loading="lazy" draggable="false">`).join("")}</div>
</div></section>` : ""}

${bento ? `<section style="padding-top:0"><div class="wrap">
<span class="kicker reveal"><i></i>Por que escolher</span><h2 class="reveal" style="margin-top:16px">${esc(d.name)}</h2>
<div class="bento">${bento}</div>
</div></section>` : ""}

<section id="duvidas" style="padding-top:0"><div class="wrap faq">
<div><span class="kicker reveal"><i></i>Dúvidas</span><h2 class="reveal" style="margin-top:16px">Perguntas <em>frequentes.</em></h2></div>
<div>${c.faq.map((q) => `<details class="reveal"><summary>${esc(q.q)}</summary><p>${esc(q.a)}</p></details>`).join("")}</div>
</div></section>

${contactRows.length || mapQuery ? `<section class="contact" id="contato" style="padding-top:0"><div class="wrap grid">
<div class="reveal"><span class="kicker"><i></i>Contato</span><h2 style="margin-top:16px">Fale <em>com a gente.</em></h2><dl>${contactRows.join("")}</dl></div>
${mapQuery ? `<div class="reveal"><iframe loading="lazy" title="Mapa" src="https://www.google.com/maps?q=${mapQuery}&output=embed"></iframe>
<a class="btn ghost" style="margin-top:14px" data-track="maps" href="https://www.google.com/maps/dir/?api=1&destination=${mapQuery}" target="_blank" rel="noopener">Como chegar</a></div>` : ""}
</div></section>` : ""}

<section class="final"><div class="wrap"><div class="card reveal">
<span class="ring" style="width:520px;height:520px;left:-170px;top:-230px"></span><span class="ring" style="width:380px;height:380px;right:-130px;bottom:-200px"></span>
<h2>${esc(c.final_title)}</h2><p>${esc(c.final_text)}</p>${cta(c.cta_label || "Chamar no WhatsApp")}
</div></div></section>
</main>
<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(d.name)}${d.city ? ` · ${esc(d.city)}` : ""}</span>${d.registry ? `<span>${esc(d.registry)}</span>` : ""}</div></footer>
${wa ? `<a class="fab" id="fab" data-wa href="${esc(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp">${WA_ICON}</a>
<div class="wa-sheet" id="waSheet" aria-hidden="true"><div class="wa-card" role="dialog" aria-label="Abrindo o WhatsApp">
<div class="wa-head"><span class="av">${d.logo ? `<img src="${esc(d.logo)}" alt="">` : initial}</span><div><b>${esc(d.name)}</b><small>online</small></div></div>
<div class="wa-body"><div class="bubble" id="waBubble"><span id="waText"></span><span class="caret" id="waCaret"></span><div class="meta"><span id="waTime"></span><span class="ticks">✓✓</span></div></div></div>
<div class="wa-foot"><div class="bar"><i></i></div><span>Abrindo seu WhatsApp…</span><a id="waNow" href="#">abrir agora</a></div>
</div></div>` : ""}
${opts.track ? `<script>
(function(){function t(e,r){var u=location.pathname.replace(/\\/$/,'')+'?e='+e+(r?'&r='+encodeURIComponent(r):'');try{navigator.sendBeacon?navigator.sendBeacon(u):fetch(u,{method:'POST',keepalive:true})}catch(x){}}
t('view',(new URLSearchParams(location.search).get('utm_source'))||document.referrer);
window.__wa=function(){t('whatsapp')};
document.addEventListener('click',function(ev){var a=ev.target.closest&&ev.target.closest('a');if(a&&a.getAttribute('data-track')==='maps')t('maps')},true)})();
</script>` : ""}
<script>
(function(){
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.split').forEach(function(h){
    var i = 0;
    (function wrap(node){
      Array.prototype.slice.call(node.childNodes).forEach(function(n){
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/( +)/).forEach(function(w){
            if (!w.trim()) { frag.appendChild(document.createTextNode(w)); return; }
            var o = document.createElement('span'); o.className = 'sw';
            var s = document.createElement('span'); s.textContent = w; s.style.transitionDelay = (i++ * 70) + 'ms';
            o.appendChild(s); frag.appendChild(o);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) wrap(n);
      });
    })(h);
  });
  setTimeout(function(){ document.body.classList.add('loaded'); }, 60);
  var els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) els.forEach(function(e){ e.classList.add('in'); });
  else { var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' }); els.forEach(function(e, k){ e.style.transitionDelay = (k % 4) * 70 + 'ms'; io.observe(e); }); }

  var stage = document.getElementById('stage'), rig = document.getElementById('rig');
  if (stage && rig && !reduce) {
    stage.addEventListener('pointermove', function(e){ var r = stage.getBoundingClientRect(); var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; rig.style.transform = 'rotateY(' + (x * 26 - 4) + 'deg) rotateX(' + (-y * 16 + 4) + 'deg)'; });
    stage.addEventListener('pointerleave', function(){ rig.style.transform = ''; });
    window.addEventListener('scroll', function(){ if (matchMedia('(hover: none)').matches) { var r = stage.getBoundingClientRect(); var p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight)); rig.style.transform = 'rotateY(' + (-12 + p * 20) + 'deg) rotateX(' + (5 - p * 9) + 'deg)'; } }, { passive: true });
  }
  if (matchMedia('(hover: hover)').matches && !reduce) document.querySelectorAll('.magnet').forEach(function(b){
    b.addEventListener('pointermove', function(e){ var r = b.getBoundingClientRect(); b.style.transform = 'translate(' + (e.clientX - r.left - r.width / 2) * .18 + 'px,' + (e.clientY - r.top - r.height / 2) * .3 + 'px)'; });
    b.addEventListener('pointerleave', function(){ b.style.transform = ''; });
  });

  var gal = document.getElementById('gal');
  if (gal) {
    document.querySelectorAll('[data-g]').forEach(function(b){ b.onclick = function(){ gal.scrollBy({ left: +b.getAttribute('data-g') * gal.clientWidth * .8, behavior: 'smooth' }); }; });
    var down = false, sx = 0, sl = 0;
    gal.addEventListener('pointerdown', function(e){ if (e.pointerType !== 'mouse') return; down = true; sx = e.clientX; sl = gal.scrollLeft; gal.style.scrollSnapType = 'none'; });
    window.addEventListener('pointerup', function(){ if (down) { down = false; gal.style.scrollSnapType = ''; } });
    gal.addEventListener('pointermove', function(e){ if (down) gal.scrollLeft = sl - (e.clientX - sx); });
  }

  var sheet = document.getElementById('waSheet');
  if (sheet) {
    var bubble = document.getElementById('waBubble'), txt = document.getElementById('waText'), caret = document.getElementById('waCaret'), busy = false;
    var go = function(href){
      if (window.__wa) window.__wa();
      var framed = window.top !== window;
      if ((reduce && !framed) || busy) { location.href = href; return; }
      busy = true;
      var msg = decodeURIComponent((href.split('text=')[1] || '').split('+').join(' '));
      var short = msg.length > 120 ? msg.slice(0, 117) + '…' : msg;
      var d = new Date(); document.getElementById('waTime').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      var now = document.getElementById('waNow'); now.href = href; now.target = '_blank'; now.rel = 'noopener';
      txt.textContent = ''; caret.style.display = ''; bubble.className = 'bubble'; sheet.className = 'wa-sheet';
      requestAnimationFrame(function(){ sheet.classList.add('open'); });
      setTimeout(function(){
        bubble.classList.add('in');
        var i = 0, step = Math.max(1, Math.ceil(short.length / 38));
        var t = setInterval(function(){
          i += step; txt.textContent = short.slice(0, i);
          if (i >= short.length) {
            clearInterval(t); caret.style.display = 'none';
            setTimeout(function(){ bubble.classList.add('read'); sheet.classList.add('go'); }, 200);
            // numa prévia (Studio, link de teste) a página não pode sair: fica no "abrir agora"
            if (framed) { busy = false; return; }
            setTimeout(function(){ location.href = href; }, 1350);
            setTimeout(function(){ sheet.className = 'wa-sheet'; busy = false; }, 2600);
          }
        }, 22);
      }, 260);
    };
    document.querySelectorAll('[data-wa]').forEach(function(a){ a.removeAttribute('target'); a.addEventListener('click', function(e){ e.preventDefault(); go(a.href); }); });
    sheet.addEventListener('click', function(e){ if (e.target === sheet) { sheet.className = 'wa-sheet'; busy = false; } });
    var fab = document.getElementById('fab');
    window.addEventListener('scroll', function(){ fab.classList.toggle('show', scrollY > innerHeight * .6); }, { passive: true });
  }
})();
</script>
${wk ? `<script>${WIDGET_JS}</script>` : ""}
</body></html>`;
}

export type { LandingContent };
