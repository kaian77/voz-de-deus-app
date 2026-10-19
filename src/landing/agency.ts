// Site da PáginasPro (Bruno Braga): a vitrine do serviço de landing pages, em paginaspro.vercel.app.
// HTML único, sem dependências; servido por api/landing.ts (?home=1). Interativo: celular 3D que segue o dedo/mouse
// e troca de ramo, busca "sem site x com site", calculadora de retorno, painel de exemplo e planos.
// Contagem própria (visita, clique no WhatsApp, origem) -> função site_track -> painel "Seu site" no Studio.
import { OFFER } from "../studio/lib/offer.js";

const WA = "5561992372216";
const waLink = (text: string) => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
const HELLO = waLink("Oi, Bruno! Vi o site da PáginasPro e quero ver a prévia do site do meu negócio. Vou te mandar o @ do Instagram, fotos, endereço, horário e os serviços.");
const brl = (n: number) => n.toLocaleString("pt-BR");

export function renderAgency(): string {
  return String.raw`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>PáginasPro · Sites que fazem o WhatsApp tocar · Bruno Braga</title>
<meta name="description" content="Site profissional para o seu negócio, com as suas fotos, horário, mapa e botão do WhatsApp. Você vê a prévia pronta antes de pagar. Por Bruno Braga.">
<meta property="og:title" content="PáginasPro · Sites que fazem o WhatsApp tocar">
<meta property="og:description" content="Você vê o site do seu negócio pronto antes de pagar qualquer coisa.">
<meta property="og:url" content="https://paginaspro.vercel.app/"><link rel="canonical" href="https://paginaspro.vercel.app/">
<meta name="theme-color" content="#111110">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23111110'/%3E%3Ccircle cx='44' cy='20' r='7' fill='%23D4FF3F'/%3E%3Cpath d='M18 46V18h12a9 9 0 0 1 0 18h-6' stroke='%23F3F1EA' stroke-width='6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
:root{--paper:#F3F1EA;--paper2:#EAE7DD;--ink:#111110;--muted:#6B6A63;--line:#D9D5C8;--lime:#D4FF3F;--forest:#173B2C;--orange:#FF6A3D}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
html,body{overflow-x:hidden;overflow-x:clip}
body{font-family:'Inter Tight',system-ui,sans-serif;background:var(--paper);color:var(--ink);font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
.wrap{width:min(1180px,100% - 32px);margin-inline:auto}
.serif{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-style:italic;letter-spacing:-.01em}
h1,h2,h3{font-weight:700;letter-spacing:-.035em;line-height:1}
h1{font-size:clamp(46px,7.6vw,104px)}
h2{font-size:clamp(36px,5.2vw,68px)}
h3{font-size:22px;letter-spacing:-.02em;line-height:1.2}
.kicker{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.kicker i{width:8px;height:8px;border-radius:50%;background:var(--lime);box-shadow:0 0 0 3px var(--ink)}
.btn{display:inline-flex;align-items:center;gap:10px;background:var(--ink);color:var(--paper);font-weight:600;font-size:16px;padding:16px 24px;border-radius:999px;transition:transform .25s cubic-bezier(.2,.8,.2,1),background .2s;will-change:transform}
.btn:hover{background:#000}
.btn .dot{width:9px;height:9px;border-radius:50%;background:var(--lime)}
.btn.lime{background:var(--lime);color:var(--ink)}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--ink)}
.btn svg{width:18px;height:18px}
section{padding:clamp(80px,11vw,140px) 0}

/* nav */
.nav{position:fixed;top:12px;left:0;right:0;z-index:50}
.nav .bar{display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(243,241,234,.78);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);border:1px solid rgba(17,17,16,.08);border-radius:999px;padding:8px 8px 8px 20px}
.logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:19px;letter-spacing:-.04em}
.logo b{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:var(--ink);color:var(--lime);font-size:15px;position:relative}
.logo span em{font-family:'Instrument Serif',serif;font-weight:400;font-style:italic;font-size:21px;letter-spacing:0}
.nav nav{display:flex;gap:26px;font-size:15px;color:var(--muted)}
.nav nav a:hover{color:var(--ink)}
.nav .btn{padding:11px 18px;font-size:14px}

/* hero */
.hero{padding:140px 0 60px;position:relative}
.hero .grid{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center}
.hero h1 .serif{color:var(--forest)}
.hero .lead{font-size:clamp(18px,1.6vw,21px);color:var(--muted);max-width:30em;margin:26px 0 34px}
.hero .lead b{color:var(--ink);font-weight:600}
.hero .ctas{display:flex;flex-wrap:wrap;gap:12px}
.hero .proof{display:flex;flex-wrap:wrap;gap:18px 26px;margin-top:38px;font-size:14px;color:var(--muted)}
.hero .proof span{display:flex;align-items:center;gap:8px}
.hero .proof svg{width:18px;height:18px;color:var(--forest)}
.blob{position:absolute;right:-12%;top:8%;width:62vw;max-width:820px;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 35% 35%,#E2FF7A 0,#D4FF3F 28%,rgba(212,255,63,0) 66%);filter:blur(10px);opacity:.55;z-index:-1;pointer-events:none}

/* phone 3D */
.stage{perspective:1400px;display:grid;place-items:center;min-height:620px;position:relative;touch-action:pan-y}
.rig{position:relative;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.2,.8,.2,1);transform:rotateY(-18deg) rotateX(8deg)}
.phone{width:300px;height:610px;border-radius:52px;background:#0c0c0b;padding:12px;box-shadow:0 2px 0 1px #2a2a27 inset,0 60px 90px -30px rgba(17,17,16,.55),0 20px 40px -20px rgba(17,17,16,.4);transform-style:preserve-3d;position:relative}
.phone:before{content:"";position:absolute;inset:-3px;border-radius:55px;background:linear-gradient(135deg,#3a3a36,#111 40%,#2b2b28);z-index:-1;transform:translateZ(-14px)}
.notch{position:absolute;top:22px;left:50%;transform:translateX(-50%) translateZ(2px);width:92px;height:26px;border-radius:20px;background:#000;z-index:3}
.screen{width:100%;height:100%;border-radius:41px;overflow:hidden;background:#fff;position:relative}
.mini{position:absolute;inset:0;overflow:hidden;transition:opacity .35s}
.mini.swap{opacity:0}
.mini .top{padding:52px 18px 10px;display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700}
.mini .top i{width:22px;height:22px;border-radius:50%;display:block}
.mini .hero2{margin:6px 12px;border-radius:22px;padding:18px 16px 16px;color:#fff;position:relative;overflow:hidden;min-height:250px;display:flex;flex-direction:column;justify-content:flex-end}
.mini .hero2:before{content:"";position:absolute;inset:0;background:var(--ph);opacity:1}
.mini .hero2 .shape{position:absolute;border-radius:50%;opacity:.35}
.mini .hero2 small,.mini .hero2 strong,.mini .hero2 p,.mini .hero2 a{position:relative}
.mini .hero2 small{font-size:9px;letter-spacing:.12em;text-transform:uppercase;opacity:.85}
.mini .hero2 strong{font-family:'Instrument Serif',serif;font-weight:400;font-size:29px;line-height:1.02;margin:6px 0 8px;letter-spacing:-.01em}
.mini .hero2 p{font-size:11px;opacity:.88;line-height:1.4}
.mini .wa{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;background:#fff;color:#111;border-radius:99px;padding:9px;font-size:11px;font-weight:700}
.mini .wa i{width:8px;height:8px;border-radius:50%;background:#25D366}
.mini .rating{display:flex;align-items:center;gap:6px;margin:12px 16px 4px;font-size:10px;color:#555}
.mini .rating b{color:#F5A623;letter-spacing:1px}
.mini .svc{margin:8px 12px;display:grid;gap:7px}
.mini .svc div{border:1px solid #eee;border-radius:14px;padding:10px 12px;font-size:11px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
.mini .svc div span{font-weight:400;color:#888}
.chip{position:absolute;background:#fff;border-radius:16px;padding:11px 14px;font-size:13px;font-weight:600;box-shadow:0 18px 40px -16px rgba(17,17,16,.35);display:flex;align-items:center;gap:10px;white-space:nowrap}
.chip small{display:block;font-size:11px;font-weight:500;color:var(--muted)}
.chip .ic{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:none}
.c1{left:-120px;top:120px;transform:translateZ(90px)}
.c2{right:-110px;top:300px;transform:translateZ(130px)}
.c3{left:-80px;bottom:70px;transform:translateZ(60px)}
.float{animation:float 6s ease-in-out infinite}
@keyframes float{0%,100%{translate:0 0}50%{translate:0 -12px}}
.niches{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:26px}
.niches button{font:inherit;font-size:14px;font-weight:600;border:1.5px solid var(--ink);background:transparent;color:var(--ink);border-radius:999px;padding:9px 15px;cursor:pointer;transition:background .2s,color .2s}
.niches button[aria-pressed=true]{background:var(--ink);color:var(--lime)}
.hint{text-align:center;font-size:13px;color:var(--muted);margin-top:12px}

/* marquee */
.marquee{border-block:1.5px solid var(--ink);background:var(--lime);overflow:hidden;padding:18px 0}
.marquee .track{display:flex;gap:48px;width:max-content;animation:mq 38s linear infinite;font-weight:700;font-size:clamp(22px,3vw,34px);letter-spacing:-.03em}
.marquee .track span{display:flex;align-items:center;gap:48px}
.marquee .track span:after{content:"✳";font-size:.8em}
@keyframes mq{to{transform:translateX(-50%)}}

/* compare */
.compare .head{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:end;margin-bottom:46px}
.compare .head p{color:var(--muted);max-width:30em}
.toggle{display:inline-flex;background:var(--paper2);border-radius:999px;padding:5px;gap:4px;margin-bottom:22px}
.toggle button{font:inherit;font-weight:600;font-size:15px;border:0;background:transparent;padding:10px 18px;border-radius:999px;cursor:pointer;color:var(--muted)}
.toggle button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
.serp{background:#fff;border-radius:28px;padding:clamp(18px,3vw,34px);border:1px solid var(--line);display:grid;grid-template-columns:1.1fr .9fr;gap:28px;align-items:start}
.searchbar{display:flex;align-items:center;gap:10px;border:1px solid #e3e3e3;border-radius:999px;padding:12px 18px;font-size:15px;color:#333;box-shadow:0 2px 10px -6px rgba(0,0,0,.2);margin-bottom:18px}
.searchbar svg{width:18px;height:18px;color:#999}
.result{border:1px solid #ececec;border-radius:18px;padding:16px;margin-bottom:12px;transition:opacity .4s,transform .4s,filter .4s}
.result .t{font-weight:700;font-size:16px}
.result .m{font-size:13px;color:#70757a;margin-top:2px}
.result .acts{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.result .acts span{font-size:12px;border:1px solid #dadce0;border-radius:99px;padding:6px 12px;color:#1a73e8;font-weight:600}
.result .acts span.off{color:#b0b0b0;border-style:dashed;text-decoration:line-through}
.result.you{border:2px solid var(--ink)}
.result.you .site{display:none;margin-top:12px;border-radius:12px;overflow:hidden;height:92px;background:linear-gradient(120deg,#173B2C,#2F6B4F);color:#fff;padding:14px;font-family:'Instrument Serif',serif;font-size:22px;line-height:1.05}
.serp.on .result.you .site{display:block}
.serp.on .result.other{opacity:.45;filter:grayscale(1)}
.verdict{background:var(--paper);border-radius:22px;padding:24px}
.verdict .big{font-size:56px;font-weight:800;letter-spacing:-.05em;line-height:1}
.verdict ul{list-style:none;margin-top:16px;display:grid;gap:10px;font-size:15px}
.verdict li{display:flex;gap:10px}
.verdict li:before{content:"";flex:none;width:18px;height:18px;margin-top:3px;border-radius:50%;background:var(--ink) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M6 10.5l2.5 2.5L14 7.5' fill='none' stroke='%23D4FF3F' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/18px no-repeat}
.serp:not(.on) .verdict li:before{background:#cfcbbf url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M7 7l6 6M13 7l-6 6' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round'/%3E%3C/svg%3E") center/18px no-repeat}

/* calc */
.calc{background:var(--ink);color:var(--paper);border-radius:36px;margin-inline:16px}
.calc .grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(30px,6vw,80px);align-items:center}
.calc h2 .serif{color:var(--lime)}
.calc p.sub{color:#A9A79E;margin-top:18px;max-width:28em}
.field{margin-bottom:28px}
.field label{display:flex;justify-content:space-between;font-size:15px;color:#C9C6BB;margin-bottom:12px}
.field label b{color:var(--paper);font-size:20px}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:8px;border-radius:99px;background:#2b2b28;outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;background:var(--lime);border:4px solid var(--ink);box-shadow:0 0 0 2px var(--lime);cursor:grab}
input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--lime);border:4px solid var(--ink);cursor:grab}
.result-box{background:#1c1c1a;border-radius:24px;padding:26px}
.result-box .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:10px 0;border-bottom:1px solid #2c2c29;font-size:15px;color:#BDBAB0}
.result-box .row:last-of-type{border:0}
.result-box .row b{font-size:22px;color:var(--paper)}
.result-box .x{font-size:clamp(54px,7vw,86px);font-weight:800;letter-spacing:-.05em;color:var(--lime);line-height:1;margin-top:14px}
.result-box small{color:#8f8d85;font-size:13px}

/* steps */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:50px}
.step{background:#fff;border-radius:28px;padding:30px;border:1px solid var(--line);position:relative;overflow:hidden;min-height:280px;display:flex;flex-direction:column;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.step:hover{transform:translateY(-6px) rotate(-.6deg)}
.step .n{font-family:'Instrument Serif',serif;font-style:italic;font-size:88px;line-height:.8;color:var(--forest)}
.step h3{margin-top:auto}
.step p{color:var(--muted);margin-top:10px;font-size:15.5px}
.step.dark{background:var(--forest);color:var(--paper);border:0}
.step.dark .n{color:var(--lime)}
.step.dark p{color:#BFD0C6}

.need{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
.need span{font-size:12.5px;font-weight:600;background:var(--paper);border-radius:99px;padding:6px 11px}

/* animação ao chamar no WhatsApp */
.wa-sheet{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:rgba(17,17,16,.0);backdrop-filter:blur(0);-webkit-backdrop-filter:blur(0);visibility:hidden;transition:background .35s,backdrop-filter .35s,visibility 0s .35s}
.wa-sheet.open{visibility:visible;background:rgba(17,17,16,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background .35s,backdrop-filter .35s}
.wa-card{width:min(380px,100%);border-radius:28px;overflow:hidden;background:#EFEAE2;box-shadow:0 40px 80px -30px rgba(0,0,0,.6);transform:translateY(40px) scale(.94);opacity:0;transition:transform .5s cubic-bezier(.2,.9,.2,1.15),opacity .3s}
.wa-sheet.open .wa-card{transform:none;opacity:1}
.wa-head{display:flex;align-items:center;gap:12px;background:#111110;color:#F3F1EA;padding:14px 16px}
.wa-head .av{width:40px;height:40px;border-radius:50%;background:var(--lime);color:var(--ink);display:grid;place-items:center;font-weight:800}
.wa-head b{display:block;font-size:15px}
.wa-head small{font-size:12px;color:#9FE870}
.wa-body{padding:18px 14px 10px;min-height:150px;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;background:#EFEAE2 radial-gradient(rgba(0,0,0,.035) 1px,transparent 1px) 0 0/14px 14px}
.bubble{align-self:flex-end;max-width:86%;background:#D9FDD3;color:#111;border-radius:14px 14px 4px 14px;padding:9px 12px 6px;font-size:14px;line-height:1.4;box-shadow:0 1px 1px rgba(0,0,0,.08);transform-origin:100% 100%;transform:scale(.6);opacity:0;transition:transform .35s cubic-bezier(.2,.9,.2,1.2),opacity .2s}
.bubble.in{transform:none;opacity:1}
.bubble .meta{display:flex;justify-content:flex-end;align-items:center;gap:3px;font-size:10.5px;color:#667781;margin-top:2px}
.bubble .ticks{color:#8696a0;transition:color .3s}
.bubble.read .ticks{color:#53BDEB}
.caret{display:inline-block;width:2px;height:15px;background:#111;vertical-align:-2px;margin-left:1px;animation:blink .8s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.wa-foot{display:flex;align-items:center;gap:10px;padding:12px 14px 16px;background:#EFEAE2}
.wa-foot .bar{flex:1;height:6px;border-radius:99px;background:rgba(0,0,0,.08);overflow:hidden}
.wa-foot .bar i{display:block;height:100%;width:0;background:#25D366;border-radius:99px}
.wa-sheet.go .wa-foot .bar i{width:100%;transition:width 1.1s cubic-bezier(.4,0,.2,1)}
.wa-foot span{font-size:12.5px;color:#54656F;font-weight:600;white-space:nowrap}
.wa-foot a{font-size:12.5px;font-weight:700;color:#008069}

.thanks{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:20px;background:rgba(17,17,16,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.tcard{width:min(400px,100%);background:var(--paper);border-radius:28px;padding:32px 26px;text-align:center}
.tcard .tk{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:var(--lime);font-size:30px;font-weight:800}
.tcard h3{font-size:28px}
.tcard p{color:var(--muted);margin:10px 0 22px}
.tclose{display:block;margin:14px auto 0;background:none;border:0;font:inherit;font-size:14px;color:var(--muted);cursor:pointer}

/* features bento */
.bento{display:grid;grid-template-columns:repeat(6,1fr);gap:16px;margin-top:50px}
.tile{background:#fff;border:1px solid var(--line);border-radius:28px;padding:28px;position:relative;overflow:hidden}
.tile p{color:var(--muted);font-size:15.5px;margin-top:8px}
.t1{grid-column:span 4;background:var(--lime);border:0}
.t1 p{color:#3b4a12}
.t2{grid-column:span 2}
.t3{grid-column:span 2}
.t4{grid-column:span 2;background:var(--ink);color:var(--paper);border:0}
.t4 p{color:#A9A79E}
.t5{grid-column:span 2}
.panel-demo{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:22px}
.panel-demo div{background:rgba(255,255,255,.55);border-radius:16px;padding:14px}
.panel-demo b{display:block;font-size:34px;font-weight:800;letter-spacing:-.04em;line-height:1}
.panel-demo span{font-size:12.5px;color:#3b4a12}
.bars{display:flex;align-items:flex-end;gap:5px;height:70px;margin-top:16px}
.bars i{flex:1;background:var(--ink);border-radius:4px 4px 2px 2px;height:10%;transition:height 1s cubic-bezier(.2,.8,.2,1)}
.tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:var(--ink);color:var(--lime);padding:4px 9px;border-radius:99px;margin-bottom:14px}
.t4 .tag{background:var(--lime);color:var(--ink)}
.big-ic{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:var(--paper);margin-bottom:18px}
.big-ic svg{width:24px;height:24px}
.t4 .big-ic{background:#262624;color:var(--lime)}

/* pricing */
.plans{display:grid;grid-template-columns:1.1fr .9fr;gap:16px;margin-top:50px;align-items:stretch}
.plan{border-radius:32px;padding:clamp(26px,3.4vw,40px);background:#fff;border:1px solid var(--line);display:flex;flex-direction:column}
.plan.main{background:var(--ink);color:var(--paper);border:0;position:relative;overflow:hidden}
.plan.main:after{content:"";position:absolute;width:340px;height:340px;right:-120px;top:-140px;border-radius:50%;background:var(--lime);opacity:.16;filter:blur(30px)}
.plan .name{font-size:15px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.plan.main .name{color:var(--lime)}
.price{display:flex;align-items:baseline;gap:8px;margin:18px 0 6px}
.price b{font-size:clamp(56px,6vw,76px);font-weight:800;letter-spacing:-.05em;line-height:1}
.price span{color:var(--muted);font-size:17px}
.plan.main .price span{color:#A9A79E}
.plan .note{font-size:14px;color:var(--muted)}
.plan.main .note{color:#A9A79E}
.plan ul{list-style:none;margin:26px 0 30px;display:grid;gap:12px;font-size:16px}
.plan li{display:flex;gap:12px}
.plan li:before{content:"→";font-weight:700;color:var(--forest)}
.plan.main li:before{color:var(--lime)}
.plan .btn{margin-top:auto;justify-content:center}
.plan.premium{margin-top:16px;display:grid;grid-template-columns:1.2fr 1fr auto;gap:24px;align-items:center;background:linear-gradient(120deg,#fff 0,#fff 55%,var(--lime) 160%)}
.plan.premium .name{color:var(--forest)}
.pp{display:flex;gap:26px;flex-wrap:wrap}
.pp b{display:block;font-size:40px;font-weight:800;letter-spacing:-.05em;line-height:1}
.pp span{font-size:13px;color:var(--muted)}
.addon{margin-top:14px;font-size:14px;color:var(--muted);text-align:center}

/* faq */
.faq{display:grid;grid-template-columns:.8fr 1.2fr;gap:50px}
.faq details{border-top:1.5px solid var(--ink);padding:22px 0}
.faq details:last-child{border-bottom:1.5px solid var(--ink)}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:20px;font-size:20px;font-weight:600;letter-spacing:-.02em}
.faq summary::-webkit-details-marker{display:none}
.faq summary:after{content:"+";font-size:28px;line-height:.8;transition:transform .25s}
.faq details[open] summary:after{transform:rotate(45deg)}
.faq details p{color:var(--muted);margin-top:12px;max-width:40em}

/* final */
.final{text-align:center;padding-bottom:60px}
.final .card{background:var(--lime);border-radius:44px;padding:clamp(48px,8vw,110px) 22px;position:relative;overflow:hidden}
.final h2{max-width:13em;margin:0 auto}
.final p{max-width:32em;margin:22px auto 34px;color:#3b4a12;font-size:19px}
.final .ring{position:absolute;border:1.5px solid var(--ink);border-radius:50%;opacity:.14}
footer{padding:30px 0 110px;font-size:14px;color:var(--muted)}
footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}
.fab{position:fixed;right:18px;bottom:18px;z-index:60;display:flex;align-items:center;gap:10px;background:#25D366;color:#fff;font-weight:700;font-size:15px;padding:14px 18px 14px 16px;border-radius:999px;box-shadow:0 16px 34px -12px rgba(0,0,0,.45);transform:translateY(120px);transition:transform .45s cubic-bezier(.2,.8,.2,1)}
.fab.show{transform:none}
.fab svg{width:22px;height:22px}

.reveal{opacity:0;transform:translateY(26px);transition:opacity .8s ease,transform .8s cubic-bezier(.2,.8,.2,1)}
.reveal.in{opacity:1;transform:none}
.split-word{display:inline-block;overflow:hidden;vertical-align:top}
.split-word>span{display:inline-block;transform:translateY(105%);transition:transform .9s cubic-bezier(.2,.8,.2,1)}
.loaded .split-word>span{transform:none}

@media (max-width:960px){
  .nav nav{display:none}
  .hero{padding-top:110px}
  .hero .grid,.compare .head,.serp,.calc .grid,.plans,.faq,.plan.premium{grid-template-columns:1fr}
  .stage{min-height:560px;margin-top:10px}
  .phone{width:262px;height:540px}
  .c1{left:-70px;top:70px}.c2{right:-74px;top:auto;bottom:150px}.c3{left:-58px;bottom:40px}
  .mini .hero2{min-height:220px}
  .mini .hero2 strong{font-size:24px}
  .steps{grid-template-columns:1fr}
  .step{min-height:0}
  .step h3{margin-top:26px}
  .bento{grid-template-columns:1fr}
  .t1,.t2,.t3,.t4,.t5{grid-column:auto}
  .calc{margin-inline:8px;border-radius:28px}
}
@media (max-width:420px){
  .chip{font-size:12px;padding:9px 11px}
  .chip .ic{width:26px;height:26px}
  .c1{left:-34px}.c2{right:-36px}.c3{left:-26px}
  .nav .btn{padding:10px 14px}
  .fab{font-size:0;gap:0;padding:15px}
  .fab svg{width:26px;height:26px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.reveal{opacity:1;transform:none}.split-word>span{transform:none}}
</style></head>
<body>

<header class="nav"><div class="wrap"><div class="bar">
  <a class="logo" href="#topo" aria-label="PáginasPro"><b>P</b><span>Páginas<em>pro</em></span></a>
  <nav><a href="#como">Como funciona</a><a href="#incluso">O que vem</a><a href="#planos">Planos</a><a href="#duvidas">Dúvidas</a></nav>
  <a class="btn magnet" data-wa href="${HELLO}" target="_blank" rel="noopener"><i class="dot"></i><span>Quero meu site</span></a>
</div></div></header>

<main id="topo">
<section class="hero">
  <div class="blob"></div>
  <div class="wrap grid">
    <div>
      <span class="kicker reveal"><i></i>Bruno Braga · sites para qualquer negócio</span>
      <h1 style="margin-top:22px" class="split">Seu cliente te acha. <span class="serif">O WhatsApp toca.</span></h1>
      <p class="lead reveal">Eu monto o site do seu negócio com as suas fotos, seu horário, o mapa e o botão do WhatsApp. <b>Você vê ele pronto antes de pagar qualquer coisa.</b></p>
      <div class="ctas reveal">
        <a class="btn magnet" data-wa href="${HELLO}" target="_blank" rel="noopener"><i class="dot"></i>Quero ver a prévia do meu</a>
        <a class="btn ghost" href="#ramos">Ver como fica</a>
      </div>
      <div class="proof reveal">
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>Prévia grátis, sem compromisso</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>Pronto em até 24 h</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>Feito para o celular</span>
      </div>
    </div>

    <div id="ramos">
      <div class="stage" id="stage">
        <div class="rig" id="rig">
          <div class="phone"><div class="notch"></div>
            <div class="screen"><div class="mini" id="mini"></div></div>
          </div>
          <div class="chip c1 float"><span class="ic" style="background:#E8FCEB"><svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z"/></svg></span><div><span id="chipWa">+27 chamadas</span><small>no WhatsApp este mês</small></div></div>
          <div class="chip c2 float" style="animation-delay:-2s"><span class="ic" style="background:#FFF4D6"><svg width="16" height="16" viewBox="0 0 24 24" fill="#F5A623"><path d="m12 2 3 6.6 7 .7-5.3 4.7L18.3 21 12 17.3 5.7 21l1.6-7L2 9.3l7-.7z"/></svg></span><div>Aparece no Google<small>busca + Maps</small></div></div>
          <div class="chip c3 float" style="animation-delay:-4s"><span class="ic" style="background:#111110;color:#D4FF3F;font-weight:800">24h</span><div>Prévia pronta<small>com as suas fotos</small></div></div>
        </div>
      </div>
      <div class="niches" role="group" aria-label="Escolha um ramo" id="niches"></div>
      <p class="hint">Toque num ramo e arraste o celular</p>
    </div>
  </div>
</section>

<div class="marquee" aria-hidden="true"><div class="track"><span>Dentistas</span><span>Nutricionistas</span><span>Barbearias</span><span>Advogados</span><span>Clínicas de estética</span><span>Psicólogos</span><span>Pet shops</span><span>Fisioterapeutas</span><span>Salões</span><span>Personal trainers</span><span>Restaurantes</span><span>Lojas</span><span>Oficinas</span><span>Qualquer negócio</span><span>Dentistas</span><span>Nutricionistas</span><span>Barbearias</span><span>Advogados</span><span>Clínicas de estética</span><span>Psicólogos</span><span>Pet shops</span><span>Fisioterapeutas</span><span>Salões</span><span>Personal trainers</span><span>Restaurantes</span><span>Lojas</span><span>Oficinas</span><span>Qualquer negócio</span></div></div>

<section class="compare">
  <div class="wrap">
    <div class="head">
      <h2 class="reveal">Quem procura no Google, <span class="serif">escolhe quem passa confiança.</span></h2>
      <p class="reveal">Alguém busca o seu serviço perto de casa. Aparecem três opções. A que tem site, fotos e um botão para chamar no WhatsApp leva o cliente. Veja a diferença:</p>
    </div>
    <div class="toggle reveal" role="group" aria-label="Comparar"><button type="button" aria-pressed="true" data-mode="off">Sem site</button><button type="button" aria-pressed="false" data-mode="on">Com PáginasPro</button></div>
    <div class="serp reveal" id="serp">
      <div>
        <div class="searchbar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span id="q">dentista perto de mim</span></div>
        <div class="result other"><div class="t">Clínica Sorriso Centro</div><div class="m">4,6 ★ (212) · Aberto até 19h</div><div class="acts"><span>Site</span><span>Rotas</span><span>Ligar</span></div></div>
        <div class="result you"><div class="t" id="youName">Seu negócio</div><div class="m">4,9 ★ (38) · Aberto até 18h</div><div class="site" id="youSite">Atendimento com hora marcada, perto de você</div><div class="acts" id="youActs"><span class="off">Site</span><span>Rotas</span><span>Ligar</span></div></div>
        <div class="result other"><div class="t">Odonto Prime</div><div class="m">4,4 ★ (97) · Fecha às 18h</div><div class="acts"><span>Site</span><span>Rotas</span></div></div>
      </div>
      <div class="verdict">
        <div class="big" id="vBig">1 de 3</div>
        <div style="color:var(--muted);margin-top:6px" id="vSub">sem site, você fica atrás de quem tem</div>
        <ul><li>Fotos do seu trabalho e do seu espaço</li><li>Botão do WhatsApp com a mensagem pronta</li><li>Horário, endereço e rota no mapa</li><li>Cara de profissional, não de improviso</li></ul>
      </div>
    </div>
  </div>
</section>

<section class="calc">
  <div class="wrap grid">
    <div>
      <span class="kicker" style="color:#A9A79E"><i></i>Faça a conta</span>
      <h2 style="margin-top:18px">Um cliente novo <span class="serif">já paga o ano.</span></h2>
      <p class="sub">Mexa nos valores com o que é real no seu negócio. O site custa R$ ${brl(OFFER.monthly)} por mês.</p>
    </div>
    <div>
      <div class="field"><label for="ticket">Quanto vale um cliente para você <b id="ticketV">R$ 150</b></label><input id="ticket" type="range" min="30" max="2000" step="10" value="150"></div>
      <div class="field"><label for="extra">Clientes novos por mês vindos do site <b id="extraV">3</b></label><input id="extra" type="range" min="1" max="20" step="1" value="3"></div>
      <div class="result-box">
        <div class="row"><span>Você ganha por mês</span><b id="gain">R$ 450</b></div>
        <div class="row"><span>O site custa</span><b>R$ ${brl(OFFER.monthly)}</b></div>
        <div class="x" id="mult">7,6x</div>
        <small>o que o site devolve para cada real investido (simulação com os seus números)</small>
      </div>
    </div>
  </div>
</section>

<section id="como">
  <div class="wrap">
    <span class="kicker reveal"><i></i>Como funciona</span>
    <h2 class="reveal" style="margin-top:18px;max-width:14em">Você não precisa fazer nada <span class="serif">além de olhar.</span></h2>
    <div class="steps">
      <div class="step reveal"><span class="n">1</span><h3>Me chama e manda o básico</h3><p>Tudo pelo WhatsApp mesmo, em poucos minutos:</p><div class="need"><span>@ do Instagram</span><span>Fotos para o site</span><span>Endereço (se tiver)</span><span>Horário de funcionamento</span><span>Tipo de serviço</span></div></div>
      <div class="step reveal"><span class="n">2</span><h3>Recebe a prévia pronta</h3><p>Em até 24 h te mando o link do seu site funcionando. Pode testar os botões, mostrar para quem quiser.</p></div>
      <div class="step dark reveal"><span class="n">3</span><h3>Gostou? Está no ar.</h3><p>Ajusto o que você pedir e publico. Não gostou, não paga nada. Simples assim.</p></div>
    </div>
  </div>
</section>

<section id="incluso" style="padding-top:0">
  <div class="wrap">
    <span class="kicker reveal"><i></i>O que vem no seu site</span>
    <h2 class="reveal" style="margin-top:18px;max-width:15em">Tudo o que faz o cliente <span class="serif">confiar e chamar.</span></h2>
    <div class="bento">
      <div class="tile t1 reveal">
        <span class="tag">Painel de resultados</span>
        <h3>Você vê quantas pessoas te chamaram pelo site</h3>
        <p>Um painel só seu, com as cores do seu site, atualizado na hora. Exemplo: <a href="/r/demo" target="_blank" rel="noopener" style="font-weight:700;text-decoration:underline;text-underline-offset:3px">abrir um painel de verdade ↗</a></p>
        <div class="panel-demo"><div><b data-count="412">0</b><span>visitas</span></div><div><b data-count="63">0</b><span>chamaram no WhatsApp</span></div><div><b data-count="29">0</b><span>pediram rota</span></div></div>
        <div class="bars" id="bars"></div>
      </div>
      <div class="tile t2 reveal"><div class="big-ic"><svg viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z"/></svg></div><h3>Botão do WhatsApp</h3><p>Em todo lugar do site, com a mensagem já escrita. O cliente só aperta enviar.</p></div>
      <div class="tile t3 reveal"><div class="big-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg></div><h3>Mapa e rota</h3><p>Endereço, horário de funcionamento e o botão "Como chegar".</p></div>
      <div class="tile t4 reveal"><span class="tag">Do seu jeito</span><div class="big-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div><h3>Alterações quando precisar</h3><p>Mudou o horário, entrou serviço novo, quer outra foto? Me manda no WhatsApp e eu atualizo.</p></div>
      <div class="tile t5 reveal"><div class="big-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg></div><h3>Rápido no celular</h3><p>Abre na hora, mesmo no 4G. É onde o seu cliente está.</p></div>
    </div>
  </div>
</section>

<section id="planos" style="padding-top:0">
  <div class="wrap">
    <span class="kicker reveal"><i></i>Planos</span>
    <h2 class="reveal" style="margin-top:18px">Preço de gente, <span class="serif">sem letra miúda.</span></h2>
    <div class="plans">
      <div class="plan main reveal">
        <span class="name">Mensal · o mais escolhido</span>
        <div class="price"><b>R$ ${brl(OFFER.monthly)}</b><span>/mês</span></div>
        <span class="note">Sem taxa de entrada</span>
        <ul><li>Site completo no ar</li><li>Painel de resultados só seu</li><li>Alterações sempre que precisar</li><li>Domínio próprio configurado (se você tiver)</li><li>Atendimento direto comigo no WhatsApp</li></ul>
        <a class="btn lime magnet" data-wa href="${waLink("Oi, Bruno! Quero o plano mensal da PáginasPro.")}" target="_blank" rel="noopener">Quero o mensal</a>
      </div>
      <div class="plan reveal">
        <span class="name">Avulso</span>
        <div class="price"><b>R$ ${brl(OFFER.oneTime)}</b><span>uma vez</span></div>
        <span class="note">Paga uma vez, sem mensalidade</span>
        <ul><li>Site completo no ar</li><li>Alterações depois: R$ ${brl(OFFER.change)} cada</li><li>Painel de resultados opcional: + R$ ${brl(OFFER.panelAddon)}/mês</li></ul>
        <a class="btn ghost magnet" data-wa href="${waLink("Oi, Bruno! Quero o site avulso da PáginasPro.")}" target="_blank" rel="noopener">Quero o avulso</a>
      </div>
    </div>
    <div class="plan premium reveal">
      <div><span class="name">Premium · um site igual a este</span>
      <p class="note" style="margin-top:8px;max-width:34em">Animações, foto em 3D que se mexe com o dedo, galeria arrastável e a conversa animada do WhatsApp, com as cores e a cara do seu negócio.</p></div>
      <div class="pp"><div><b>R$ ${brl(OFFER.premiumMonthly)}</b><span>/mês com painel e alterações</span></div><div><b>R$ ${brl(OFFER.premiumOneTime)}</b><span>à vista, sem mensalidade</span></div></div>
      <a class="btn magnet" data-wa href="${waLink("Oi, Bruno! Quero o site Premium da PáginasPro, igual ao seu.")}" target="_blank" rel="noopener"><i class="dot"></i>Quero o Premium</a>
    </div>
    <p class="addon reveal">Em todos, você vê a prévia pronta antes de decidir.</p>
  </div>
</section>

<section id="duvidas" style="padding-top:0">
  <div class="wrap faq">
    <div><span class="kicker reveal"><i></i>Dúvidas</span><h2 class="reveal" style="margin-top:18px">Pergunta <span class="serif">que todo mundo faz.</span></h2></div>
    <div>
      <details class="reveal"><summary>O que eu preciso mandar?</summary><p>Pelo WhatsApp mesmo: o @ do seu Instagram, as fotos que quer no site (do seu trabalho, do espaço, sua ou da equipe), o endereço (se tiver), o horário de funcionamento e o tipo de serviço que você faz. Quer mais alguma coisa no site, como formação, convênios ou formas de pagamento? É só mandar junto.</p></details>
      <details class="reveal"><summary>E se eu não gostar da prévia?</summary><p>Você não paga nada. A prévia é para você ver o site funcionando antes de decidir.</p></details>
      <details class="reveal"><summary>Preciso ter domínio (.com.br)?</summary><p>Não. Seu site já sai com um endereço pronto. Se você tiver ou quiser comprar um domínio próprio, eu configuro.</p></details>
      <details class="reveal"><summary>Quem vai fazer o meu site?</summary><p>Eu, Bruno Braga. Você fala direto comigo pelo WhatsApp, sem atendente e sem fila.</p></details>
      <details class="reveal"><summary>Funciona para o meu ramo?</summary><p>Sim, para qualquer ramo. Clínica, salão, loja, restaurante, oficina, escritório, prestador de serviço, profissional autônomo, comércio de bairro ou negócio online: cada site é feito sob medida para o que você faz e para o seu cliente.</p></details>
    </div>
  </div>
</section>

<section class="final">
  <div class="wrap"><div class="card reveal">
    <span class="ring" style="width:520px;height:520px;left:-160px;top:-220px"></span><span class="ring" style="width:380px;height:380px;right:-120px;bottom:-200px"></span>
    <h2>Me manda o seu @ e suas fotos. <span class="serif">Eu te mostro seu site pronto.</span></h2>
    <p>@ do Instagram, fotos, endereço, horário e tipo de serviço. Sem compromisso: se gostar, a gente coloca no ar.</p>
    <a class="btn magnet" data-wa href="${HELLO}" target="_blank" rel="noopener"><i class="dot"></i>Chamar o Bruno no WhatsApp</a>
  </div></div>
</section>
</main>

<footer><div class="wrap"><span><b style="color:var(--ink)">PáginasPro</b> · por Bruno Braga · Brasília · DF</span><a data-wa href="${HELLO}" target="_blank" rel="noopener">WhatsApp (61) 99237-2216</a></div></footer>
<a class="fab" id="fab" data-wa href="${HELLO}" target="_blank" rel="noopener" aria-label="Chamar no WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>Chamar no WhatsApp</a>

<div class="wa-sheet" id="waSheet" aria-hidden="true">
  <div class="wa-card" role="dialog" aria-label="Abrindo o WhatsApp">
    <div class="wa-head"><span class="av">B</span><div><b>Bruno Braga · PáginasPro</b><small>online</small></div></div>
    <div class="wa-body"><div class="bubble" id="waBubble"><span id="waText"></span><span class="caret" id="waCaret"></span><div class="meta"><span id="waTime"></span><span class="ticks">✓✓</span></div></div></div>
    <div class="wa-foot"><div class="bar"><i></i></div><span>Abrindo seu WhatsApp…</span><a id="waNow" href="#" rel="noopener">abrir agora</a></div>
  </div>
</div>

<script>
(function(){
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function track(e){ try{ var u = '/inicio?e=' + e + (e === 'view' ? '&r=' + encodeURIComponent(new URLSearchParams(location.search).get('utm_source') || document.referrer) : ''); navigator.sendBeacon ? navigator.sendBeacon(u) : fetch(u, {method:'POST', keepalive:true}); }catch(x){} }
  track('view');

  // volta do Mercado Pago (?pago=1): agradece e pede para avisar no WhatsApp
  if (/[?&]pago=1/.test(location.search)) {
    var thanks = document.createElement('div');
    thanks.className = 'thanks';
    thanks.innerHTML = '<div class="tcard"><span class="tk">✓</span><h3>Pagamento recebido!</h3><p>Obrigado por escolher a PáginasPro. Me avisa no WhatsApp que eu já coloco o seu site no ar.</p>' +
      '<a class="btn" data-wa href="https://wa.me/${WA}?text=' + encodeURIComponent('Oi, Bruno! Acabei de fazer o pagamento da PáginasPro. Pode colocar meu site no ar!') + '"><i class="dot"></i>Avisar o Bruno</a>' +
      '<button type="button" class="tclose">Fechar</button></div>';
    document.body.appendChild(thanks);
    thanks.querySelector('.tclose').onclick = function(){ thanks.remove(); };
  }
  // ao chamar: mini conversa do WhatsApp com a mensagem sendo digitada e enviada, depois abre o WhatsApp de verdade
  var sheet = document.getElementById('waSheet'), bubble = document.getElementById('waBubble'), txt = document.getElementById('waText'), caret = document.getElementById('waCaret'), busy = false;
  function openWa(href){
    track('whatsapp');
    if (reduce || busy) { location.href = href; return; }
    busy = true;
    var msg = decodeURIComponent((href.split('text=')[1] || '').replace(/\+/g, ' '));
    var short = msg.length > 120 ? msg.slice(0, 117) + '…' : msg;
    var d = new Date(); document.getElementById('waTime').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    document.getElementById('waNow').href = href;
    txt.textContent = ''; caret.style.display = ''; bubble.className = 'bubble'; sheet.className = 'wa-sheet';
    sheet.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function(){ sheet.classList.add('open'); });
    setTimeout(function(){
      bubble.classList.add('in');
      var i = 0, step = Math.max(1, Math.ceil(short.length / 38));
      var t = setInterval(function(){
        i += step; txt.textContent = short.slice(0, i);
        if (i >= short.length) {
          clearInterval(t); caret.style.display = 'none';
          setTimeout(function(){ bubble.classList.add('read'); sheet.classList.add('go'); }, 200);
          setTimeout(function(){ location.href = href; }, 1350);
          setTimeout(function(){ sheet.className = 'wa-sheet'; sheet.setAttribute('aria-hidden', 'true'); busy = false; }, 2600);
        }
      }, 22);
    }, 260);
  }
  document.querySelectorAll('[data-wa]').forEach(function(a){
    a.removeAttribute('target');
    a.addEventListener('click', function(e){ e.preventDefault(); openWa(a.href); });
  });
  sheet.addEventListener('click', function(e){ if (e.target === sheet) { sheet.className = 'wa-sheet'; busy = false; } });

  // título palavra a palavra
  document.querySelectorAll('.split').forEach(function(h){
    var i = 0;
    function wrap(node){
      Array.prototype.slice.call(node.childNodes).forEach(function(n){
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function(w){
            if (!w.trim()) { frag.appendChild(document.createTextNode(w)); return; }
            var o = document.createElement('span'); o.className = 'split-word';
            var s = document.createElement('span'); s.textContent = w; s.style.transitionDelay = (i++ * 70) + 'ms';
            o.appendChild(s); frag.appendChild(o);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) wrap(n);
      });
    }
    wrap(h);
  });
  requestAnimationFrame(function(){ setTimeout(function(){ document.body.classList.add('loaded'); }, 60); });

  // aparecer ao rolar
  var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(function(el, k){ el.style.transitionDelay = (k % 4) * 70 + 'ms'; io.observe(el); });

  // ramos: o celular mostra o site de exemplo de cada um
  var N = [
    { k:'Dentista', name:'Dra. Lívia Rocha', tag:'Odontologia · Asa Norte', h:'Seu sorriso, sem medo de dentista.', p:'Clareamento, lentes e implantes com hora marcada.', c:'#0F4C5C', c2:'#5FB3B3', s:[['Clareamento','1 sessão'],['Lentes de contato','avaliação'],['Implantes','parcelado']], q:'dentista perto de mim', wa:27 },
    { k:'Nutricionista', name:'Nutri Camila Alves', tag:'Nutrição · Águas Claras', h:'Comer bem sem viver de dieta.', p:'Emagrecimento, gestantes e esporte. Online ou presencial.', c:'#3E5C2B', c2:'#B5D17A', s:[['Consulta inicial','60 min'],['Retorno','30 dias'],['Online','todo o Brasil']], q:'nutricionista em águas claras', wa:19 },
    { k:'Barbearia', name:'Barbearia do Zé', tag:'Barbearia · Taguatinga', h:'Corte em dia, sem fila.', p:'Agende pelo WhatsApp e chegue na sua hora.', c:'#1B1B1B', c2:'#C8A26A', s:[['Corte','40 min'],['Barba','30 min'],['Corte + barba','combo']], q:'barbearia perto de mim', wa:41 },
    { k:'Advocacia', name:'Mendes Advocacia', tag:'Direito de família · Brasília', h:'Orientação jurídica clara, do começo ao fim.', p:'Divórcio, pensão e inventário com atendimento humano.', c:'#2B2D42', c2:'#A39171', s:[['Divórcio','consensual'],['Pensão','revisão'],['Inventário','extrajudicial']], q:'advogado de família brasília', wa:12 },
    { k:'Estética', name:'Studio Bella Pele', tag:'Estética · Sudoeste', h:'Pele bonita de verdade, sem exagero.', p:'Limpeza de pele, peeling e protocolos faciais.', c:'#7A3E48', c2:'#E8B4B8', s:[['Limpeza de pele','75 min'],['Peeling','avaliação'],['Drenagem','pacotes']], q:'limpeza de pele sudoeste', wa:33 },
    { k:'Pet shop', name:'PetCare Gama', tag:'Banho e tosa · Gama', h:'Seu pet cheiroso e bem cuidado.', p:'Banho, tosa e leva e traz no bairro.', c:'#1F4E8C', c2:'#F2C14E', s:[['Banho','pequeno porte'],['Tosa','na tesoura'],['Leva e traz','no bairro']], q:'pet shop no gama', wa:22 }
  ];
  var mini = document.getElementById('mini'), box = document.getElementById('niches');
  function paint(n){
    mini.innerHTML =
      '<div class="top"><span>' + n.name + '</span><i style="background:' + n.c + '"></i></div>' +
      '<div class="hero2" style="--ph:linear-gradient(150deg,' + n.c + ' 10%,' + n.c2 + ' 140%)">' +
        '<span class="shape" style="width:160px;height:160px;right:-50px;top:-40px;background:' + n.c2 + '"></span>' +
        '<span class="shape" style="width:90px;height:90px;left:-30px;top:60px;background:#fff;opacity:.12"></span>' +
        '<small>' + n.tag + '</small><strong>' + n.h + '</strong><p>' + n.p + '</p><a class="wa"><i></i>Agendar pelo WhatsApp</a></div>' +
      '<div class="rating"><b>★★★★★</b> 4,9 no Google</div>' +
      '<div class="svc">' + n.s.map(function(x){ return '<div>' + x[0] + '<span>' + x[1] + '</span></div>'; }).join('') + '</div>';
    document.getElementById('chipWa').textContent = '+' + n.wa + ' chamadas';
    document.getElementById('q').textContent = n.q;
    document.getElementById('youName').textContent = n.name;
    document.getElementById('youSite').textContent = n.h;
    document.getElementById('youSite').style.background = 'linear-gradient(120deg,' + n.c + ',' + n.c2 + ')';
  }
  var cur = 0, auto;
  N.forEach(function(n, i){
    var b = document.createElement('button'); b.type = 'button'; b.textContent = n.k; b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.onclick = function(){ clearInterval(auto); pick(i); };
    box.appendChild(b);
  });
  function pick(i){
    cur = i;
    Array.prototype.forEach.call(box.children, function(b, j){ b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
    mini.classList.add('swap');
    setTimeout(function(){ paint(N[i]); mini.classList.remove('swap'); }, 220);
  }
  paint(N[0]);
  if (!reduce) auto = setInterval(function(){ pick((cur + 1) % N.length); }, 4200);

  // celular 3D: segue o mouse ou o dedo
  var stage = document.getElementById('stage'), rig = document.getElementById('rig');
  function tilt(x, y){ rig.style.transform = 'rotateY(' + (x * 28 - 4) + 'deg) rotateX(' + (-y * 18 + 4) + 'deg)'; }
  function rest(){ rig.style.transform = ''; }
  stage.addEventListener('pointermove', function(e){ var r = stage.getBoundingClientRect(); tilt((e.clientX - r.left) / r.width - .5, (e.clientY - r.top) / r.height - .5); });
  stage.addEventListener('pointerleave', rest);
  if (!reduce) window.addEventListener('scroll', function(){ if (matchMedia('(hover: none)').matches) { var r = stage.getBoundingClientRect(); var p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight)); rig.style.transform = 'rotateY(' + (-14 + p * 22) + 'deg) rotateX(' + (6 - p * 10) + 'deg)'; } }, { passive: true });

  // botões magnéticos (só com mouse)
  if (matchMedia('(hover: hover)').matches && !reduce) document.querySelectorAll('.magnet').forEach(function(b){
    b.addEventListener('pointermove', function(e){ var r = b.getBoundingClientRect(); b.style.transform = 'translate(' + (e.clientX - r.left - r.width / 2) * .18 + 'px,' + (e.clientY - r.top - r.height / 2) * .3 + 'px)'; });
    b.addEventListener('pointerleave', function(){ b.style.transform = ''; });
  });

  // sem site x com site
  var serp = document.getElementById('serp'), acts = document.getElementById('youActs');
  document.querySelectorAll('.toggle button').forEach(function(b){
    b.onclick = function(){
      var on = b.getAttribute('data-mode') === 'on';
      document.querySelectorAll('.toggle button').forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      serp.classList.toggle('on', on);
      acts.innerHTML = on ? '<span>Site</span><span>WhatsApp</span><span>Rotas</span><span>Ligar</span>' : '<span class="off">Site</span><span>Rotas</span><span>Ligar</span>';
      document.getElementById('vBig').textContent = on ? 'Você' : '1 de 3';
      document.getElementById('vSub').textContent = on ? 'é quem mais passa confiança na busca' : 'sem site, você fica atrás de quem tem';
    };
  });

  // calculadora
  var ticket = document.getElementById('ticket'), extra = document.getElementById('extra'), COST = ${OFFER.monthly};
  function money(v){ return 'R$ ' + Math.round(v).toLocaleString('pt-BR'); }
  function calc(){
    var g = +ticket.value * +extra.value;
    document.getElementById('ticketV').textContent = money(+ticket.value);
    document.getElementById('extraV').textContent = extra.value;
    document.getElementById('gain').textContent = money(g);
    document.getElementById('mult').textContent = (g / COST).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'x';
  }
  ticket.oninput = extra.oninput = calc; calc();

  // painel de exemplo: números contando e barras subindo
  var bars = document.getElementById('bars'), H = [22,35,28,48,40,55,38,62,51,70,58,76,64,88,72,95];
  H.forEach(function(){ bars.appendChild(document.createElement('i')); });
  var pio = new IntersectionObserver(function(es){ es.forEach(function(e){
    if (!e.isIntersecting) return; pio.disconnect();
    Array.prototype.forEach.call(bars.children, function(b, i){ setTimeout(function(){ b.style.height = H[i] + '%'; }, i * 50); });
    document.querySelectorAll('[data-count]').forEach(function(el){
      var to = +el.getAttribute('data-count'), t0 = performance.now();
      (function step(t){ var k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0);
    });
  }); }, { threshold: .4 });
  pio.observe(bars);

  // botão flutuante do WhatsApp depois do topo
  var fab = document.getElementById('fab');
  window.addEventListener('scroll', function(){ fab.classList.toggle('show', scrollY > innerHeight * .7); }, { passive: true });
})();
</script>
</body></html>`;
}
