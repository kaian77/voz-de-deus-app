// Modelo "Link da bio" (substitui o Linktree): uma tela de celular feita para o link da bio do Instagram.
// Vídeo curto da pessoa no topo (ou a foto com zoom lento), nome/assinatura por cima, números reais do negócio,
// abas por público ("Sou paciente" × "Sou dentista"), fotos que passam sozinhas e o botão grande do WhatsApp.
// Mesmo conteúdo da IA (campos bio_* do LandingContent); chamado por renderLanding quando tier = "bio".
import { esc, FONTS, hex, mix, onColor, WA_ICON, type LandingData } from "./render.js";

const IG_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21.9 8c-.1-1.6-.4-3-1.6-4.2S17.6 2.2 16 2.1C14.4 2 9.6 2 8 2.1 6.4 2.2 5 2.5 3.8 3.7S2.2 6.4 2.1 8C2 9.6 2 14.4 2.1 16c.1 1.6.4 3 1.6 4.2s2.6 1.5 4.2 1.6c1.6.1 6.4.1 8 0 1.6-.1 3-.4 4.2-1.6s1.5-2.6 1.6-4.2c.1-1.6.1-6.4 0-8Zm-2.1 9.7a3.3 3.3 0 0 1-1.8 1.8c-1.3.5-4.3.4-5.7.4s-4.4.1-5.7-.4a3.3 3.3 0 0 1-1.8-1.8c-.5-1.3-.4-4.3-.4-5.7s-.1-4.4.4-5.7A3.3 3.3 0 0 1 6.6 4.5C7.9 4 10.9 4.1 12.3 4.1s4.4-.1 5.7.4a3.3 3.3 0 0 1 1.8 1.8c.5 1.3.4 4.3.4 5.7s.1 4.4-.4 5.7Z"/></svg>';
const PIN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>';

function waHref(d: LandingData, message?: string) {
  const n = String(d.whatsapp ?? "").replace(/\D/g, "");
  if (!n) return "";
  const full = n.length <= 11 ? `55${n}` : n;
  return `https://wa.me/${full}?text=${encodeURIComponent(message || d.content.whatsapp_message || "Olá! Vim pelo seu link da bio.")}`;
}

export function renderBio(d: LandingData, opts: { url?: string; preview?: boolean; sample?: boolean; track?: boolean } = {}): string {
  const c = d.content;
  const f = FONTS[c.fonts] ?? FONTS.fraunces;
  const primary = hex(c.colors?.primary, "#2f5d50");
  const ink = hex(c.colors?.ink, "#1c2321");
  // Fundo escuro puxando para o tom da marca (como as páginas de link da bio "de luxo")
  const bg = mix(ink, "#08080a", 0.55);
  const card = mix(bg, "#ffffff", 0.06);
  const line = mix(bg, "#ffffff", 0.12);
  const muted = mix(bg, "#ffffff", 0.58);
  const accent = mix(primary, "#ffffff", onColor(primary) === "#ffffff" ? 0.25 : 0);
  const photos = d.photos.filter(Boolean);
  const hero = photos[c.hero_photo] ?? photos[0];
  const rest = photos.filter((p) => p !== hero);
  const ig = String(d.instagram ?? "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  const mapQuery = d.address ? encodeURIComponent(`${d.name}, ${d.address}`) : "";
  const script = c.fonts !== "jakarta";

  // Números: só os reais que a IA tirou das informações; sem eles, nota do Google e cidade
  const stats = (c.bio_stats ?? []).filter((s) => s.value?.trim()).slice(0, 3);
  if (!stats.length) {
    if (d.rating && d.reviews) stats.push({ value: `${String(d.rating).replace(".", ",")} ★`, label: `${d.reviews} avaliações no Google` });
    if (d.city) stats.push({ value: d.city.split(/[·,-]/)[0].trim(), label: "onde atendemos" });
  }
  const tabs = (c.bio_tabs?.length ? c.bio_tabs : [{ tab: "", title: c.headline, text: c.subheadline, cta_label: c.cta_label, whatsapp_message: c.whatsapp_message }]).slice(0, 2);

  const media = d.video
    ? `<video class="hv" src="${esc(d.video)}" ${hero ? `poster="${esc(hero)}"` : ""} autoplay muted loop playsinline preload="metadata"></video>`
    : hero
      ? `<img class="hv zoom" src="${esc(hero)}" alt="${esc(d.name)}">`
      : `<div class="hv mono"><b>${esc((d.name.trim()[0] ?? "").toUpperCase())}</b></div>`;
  const brand = d.logo
    ? `<img class="logo" src="${esc(d.logo)}" alt="${esc(d.name)}">`
    : `<h1 class="${script ? "sig" : "word"}">${esc(d.name)}</h1>`;

  const panel = (t: (typeof tabs)[number], i: number) => {
    // Cada aba mostra fotos diferentes (metade das fotos para cada público)
    const pics = tabs.length > 1 ? rest.filter((_, k) => k % 2 === i) : rest;
    const list = (pics.length ? pics : rest).slice(0, 6);
    const wa = waHref(d, t.whatsapp_message);
    return `<section class="pane${i === 0 ? " on" : ""}" data-pane="${i}"${i ? " hidden" : ""}>
<h2>${esc(t.title)}</h2>
${list.length ? `<div class="car" data-car>${list.map((p) => `<img src="${esc(p)}" alt="" loading="lazy">`).join("")}</div>${list.length > 1 ? `<div class="dots">${list.map((_, k) => `<i${k ? "" : ' class="on"'}></i>`).join("")}</div>` : ""}` : ""}
<p class="txt">${esc(t.text)}</p>
${wa ? `<a class="cta" href="${esc(wa)}" target="_blank" rel="noopener">${WA_ICON}<span>${esc(t.cta_label || "Chamar no WhatsApp")}</span></a>` : ""}
</section>`;
  };

  const links = [
    ig && `<a class="lk" href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">${IG_ICON}<span>@${esc(ig)}</span><em>›</em></a>`,
    mapQuery && `<a class="lk" data-track="maps" href="https://www.google.com/maps/dir/?api=1&destination=${mapQuery}" target="_blank" rel="noopener">${PIN_ICON}<span>Como chegar${d.address ? `<small>${esc(d.address)}</small>` : ""}</span><em>›</em></a>`,
  ].filter(Boolean).join("");
  const tags = (c.specialties?.length ? c.specialties : c.services.map((s) => s.title)).slice(0, 8);

  const css = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--p:${primary};--a:${accent};--bg:${bg};--card:${card};--line:${line};--muted:${muted};--head:${f.head};--body:${f.body}}
html{background:var(--bg)}
body{font-family:var(--body);background:var(--bg);color:#f4f2ee;-webkit-font-smoothing:antialiased;min-height:100vh;overflow-x:hidden}
a{color:inherit;text-decoration:none}
img,video{display:block;max-width:100%}
.bgblur{position:fixed;inset:-40px;z-index:0;background:${hero ? `url("${esc(hero)}") center/cover` : "none"};filter:blur(60px) brightness(.35);opacity:.7;pointer-events:none}
.app{position:relative;z-index:1;width:min(460px,100%);margin:0 auto;background:var(--bg);min-height:100vh;box-shadow:0 0 0 1px var(--line),0 40px 120px -40px #000}
.top{position:relative;height:min(64vh,560px);overflow:hidden}
.hv{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.zoom{animation:kb 18s ease-in-out infinite alternate}
@keyframes kb{from{transform:scale(1.02)}to{transform:scale(1.14) translate(-2%,-2%)}}
.mono{display:grid;place-items:center;background:linear-gradient(150deg,var(--p),var(--bg))}
.mono b{font-family:var(--head);font-size:160px;color:#fff;opacity:.9}
.top:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,color-mix(in srgb,var(--bg) 70%,transparent) 72%,var(--bg) 100%)}
.snd{position:absolute;top:16px;right:16px;z-index:3;display:flex;align-items:center;gap:8px;border:0;cursor:pointer;font:600 13px var(--body);color:#fff;background:rgba(0,0,0,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:9px 14px;border-radius:999px;animation:pulse 2.6s infinite}
.snd.on{animation:none}.snd.on .lb{display:none}
.brand{position:absolute;left:22px;right:22px;bottom:18px;z-index:2}
.sig{font-family:'Allura',cursive;font-weight:400;font-size:clamp(54px,15vw,72px);line-height:.9;letter-spacing:0;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,.4)}
.word{font-family:var(--head);font-weight:${f.weight};font-size:clamp(34px,9vw,44px);line-height:1.02;letter-spacing:-.02em}
.logo{max-height:76px;max-width:70%;object-fit:contain;filter:drop-shadow(0 4px 20px rgba(0,0,0,.5))}
.sub{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:6px 22px 0;font-size:14px}
.sub small{font-size:11px;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;white-space:nowrap}
.stats{display:grid;grid-template-columns:repeat(${Math.max(stats.length, 1)},1fr);gap:10px;padding:22px 22px 6px}
.stats b{display:block;font-family:var(--head);font-weight:${f.weight};font-size:26px;letter-spacing:-.02em;line-height:1.1}
.stats span{display:block;font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.3}
.tabs{position:relative;display:grid;grid-template-columns:1fr 1fr;margin:20px 22px 0;padding:4px;border-radius:999px;background:var(--card);border:1px solid var(--line)}
.tabs button{position:relative;z-index:1;border:0;background:none;color:var(--muted);font:600 14px var(--body);padding:11px 6px;border-radius:999px;cursor:pointer;transition:color .3s}
.tabs button[aria-selected=true]{color:#111}
.tabs .pill{position:absolute;top:4px;bottom:4px;left:4px;width:calc(50% - 4px);border-radius:999px;background:#f4f2ee;transition:transform .45s cubic-bezier(.2,.8,.2,1)}
.tabs[data-i="1"] .pill{transform:translateX(100%)}
.pane{padding:22px 22px 0;animation:in .5s cubic-bezier(.2,.8,.2,1)}
@keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.pane h2{font-family:var(--head);font-weight:${f.weight};font-size:30px;line-height:1.08;letter-spacing:-.02em}
.car{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;margin:18px -22px 0;padding:0 22px;scrollbar-width:none}
.car::-webkit-scrollbar{display:none}
.car img{flex:none;width:100%;aspect-ratio:4/3.2;object-fit:cover;border-radius:22px;scroll-snap-align:center}
.dots{display:flex;justify-content:center;gap:6px;margin-top:12px}
.dots i{width:6px;height:6px;border-radius:99px;background:var(--line);transition:width .3s,background .3s}
.dots i.on{width:18px;background:var(--a)}
.txt{color:var(--muted);font-size:15.5px;line-height:1.6;margin-top:16px}
.cta{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:20px;background:#f4f2ee;color:#111;font-weight:700;font-size:16px;padding:17px 20px;border-radius:999px;box-shadow:0 0 0 0 rgba(244,242,238,.5);animation:pulse 2.6s infinite;transition:transform .2s}
.cta:active{transform:scale(.97)}
.cta svg{color:#1faa53}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(244,242,238,.35)}70%{box-shadow:0 0 0 14px rgba(244,242,238,0)}100%{box-shadow:0 0 0 0 rgba(244,242,238,0)}}
.tags{display:flex;flex-wrap:wrap;gap:8px;padding:26px 22px 0}
.tags span{font-size:12.5px;padding:7px 12px;border-radius:999px;border:1px solid var(--line);color:#e9e6df}
.links{display:grid;gap:10px;padding:22px 22px 0}
.lk{display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:15px 16px;font-weight:600;font-size:15px;transition:background .2s,transform .2s}
.lk:active{transform:scale(.98)}
.lk svg{color:var(--a);flex:none}
.lk span{flex:1;min-width:0}
.lk small{display:block;font-weight:400;font-size:12px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lk em{font-style:normal;color:var(--muted);font-size:22px}
.hours{padding:16px 22px 0;font-size:13px;color:var(--muted)}
footer{padding:34px 22px 40px;text-align:center;font-size:12px;color:var(--muted)}
.up{opacity:0;animation:in .7s cubic-bezier(.2,.8,.2,1) forwards}
@media (prefers-reduced-motion:reduce){.zoom,.cta,.pane,.up{animation:none;opacity:1}}
`;

  const fontUrl = `https://fonts.googleapis.com/css2?${f.url}${script && !d.logo ? "&family=Allura" : ""}&display=swap`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(c.seo_title || d.name)}</title>
<meta name="description" content="${esc(c.seo_description)}">
<meta property="og:title" content="${esc(d.name)}"><meta property="og:description" content="${esc(c.seo_description)}">
${hero ? `<meta property="og:image" content="${esc(hero)}">` : ""}${opts.url ? `<meta property="og:url" content="${esc(opts.url)}"><link rel="canonical" href="${esc(opts.url)}">` : ""}
<meta name="theme-color" content="${bg}">${opts.preview ? '<meta name="robots" content="noindex">' : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontUrl}" rel="stylesheet">
<style>${css}</style></head>
<body>
<div class="bgblur" aria-hidden="true"></div>
${opts.preview ? `<div style="position:fixed;left:0;right:0;bottom:0;z-index:41;background:#000;color:#fff;text-align:center;font-size:13px;padding:10px 16px;font-family:system-ui,sans-serif">PRÉVIA · página ainda não publicada</div>
<div aria-hidden="true" style="position:fixed;inset:0;z-index:40;pointer-events:none;background:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='200'%3E%3Ctext x='20' y='120' transform='rotate(-24 140 100)' font-family='Arial' font-size='30' font-weight='700' fill='%23fff' fill-opacity='.07'%3EPR%C3%89VIA%3C/text%3E%3C/svg%3E&quot;)"></div><style>footer{padding-bottom:70px}</style>` : ""}
<main class="app">
<header class="top">${media}${d.video ? `<button class="snd" type="button" aria-label="Ouvir o vídeo"><span class="ic">🔇</span><span class="lb">Toque para ouvir</span></button>` : ""}<div class="brand up">${brand}</div></header>
${c.bio_tagline || d.registry ? `<div class="sub up" style="animation-delay:.1s"><span>${esc(c.bio_tagline ?? "")}</span>${d.registry ? `<small>${esc(d.registry)}</small>` : ""}</div>` : ""}
${stats.length ? `<div class="stats up" style="animation-delay:.2s">${stats.map((s) => `<div><b data-n="${esc(s.value)}">${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join("")}</div>` : ""}
${tabs.length > 1 ? `<div class="tabs up" role="tablist" data-i="0" style="animation-delay:.3s"><i class="pill"></i>${tabs.map((t, i) => `<button role="tab" aria-selected="${i === 0}" data-tab="${i}">${esc(t.tab || (i ? "Profissionais" : "Clientes"))}</button>`).join("")}</div>` : ""}
<div class="up" style="animation-delay:.35s">${tabs.map(panel).join("")}</div>
${tags.length ? `<div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
${links ? `<nav class="links">${links}</nav>` : ""}
${d.hours ? `<p class="hours">◷ ${esc(d.hours)}</p>` : ""}
<footer>© ${new Date().getFullYear()} ${esc(d.name)}${d.city ? ` · ${esc(d.city)}` : ""}</footer>
</main>
${opts.track ? `<script>
(function(){function t(e,r){var u=location.pathname.replace(/\\/$/,'')+'?e='+e+(r?'&r='+encodeURIComponent(r):'');try{navigator.sendBeacon?navigator.sendBeacon(u):fetch(u,{method:'POST',keepalive:true})}catch(x){}}
t('view',(new URLSearchParams(location.search).get('utm_source'))||document.referrer);
document.addEventListener('click',function(ev){var a=ev.target.closest&&ev.target.closest('a');if(!a)return;if(/wa\\.me\\//.test(a.href))t('whatsapp');else if(a.getAttribute('data-track')==='maps')t('maps')},true)})();
</script>` : ""}
<script>
(function(){
// Som do vídeo: o navegador só deixa começar mudo; um toque liga o som e volta para o começo
var v=document.querySelector('video.hv'),snd=document.querySelector('.snd');
if(v&&snd)snd.addEventListener('click',function(){var on=v.muted;v.muted=!on;if(on){v.currentTime=0;v.play()}snd.classList.toggle('on',on);snd.querySelector('.ic').textContent=on?'🔊':'🔇';snd.setAttribute('aria-label',on?'Tirar o som':'Ouvir o vídeo')});
// Abas por público
var tabs=document.querySelector('.tabs');
if(tabs)tabs.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var i=b.getAttribute('data-tab');tabs.setAttribute('data-i',i);
tabs.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-selected',x===b)});
document.querySelectorAll('.pane').forEach(function(p){var on=p.getAttribute('data-pane')===i;p.hidden=!on;if(on){p.style.animation='none';p.offsetHeight;p.style.animation=''}})});
// Fotos passando sozinhas (param quando a pessoa arrasta)
document.querySelectorAll('[data-car]').forEach(function(car){var dots=car.nextElementSibling&&car.nextElementSibling.classList.contains('dots')?car.nextElementSibling.children:null;var n=car.children.length,k=0,hold=0;
var step=function(){return car.children[0].offsetWidth+10};
car.addEventListener('scroll',function(){k=Math.round(car.scrollLeft/step());if(dots)for(var j=0;j<dots.length;j++)dots[j].classList.toggle('on',j===k)},{passive:true});
car.addEventListener('touchstart',function(){hold=Date.now()},{passive:true});
if(n>1)setInterval(function(){if(car.closest('[hidden]')||Date.now()-hold<6000)return;k=(k+1)%n;car.scrollTo({left:k*step(),behavior:'smooth'})},3500)});
// Números contando ao abrir (só os que começam com número)
document.querySelectorAll('[data-n]').forEach(function(el){var m=el.textContent.match(/^(\\d+)(.*)$/);if(!m)return;var end=+m[1],t0=null;
function step(t){t0=t0||t;var p=Math.min((t-t0)/1200,1);el.textContent=Math.round(end*(1-Math.pow(1-p,3)))+m[2];if(p<1)requestAnimationFrame(step)}requestAnimationFrame(step)});
})();
</script>
</body></html>`;
}
