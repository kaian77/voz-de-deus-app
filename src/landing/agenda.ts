// Agenda online da PáginasPro (HTML servido pela api/landing.ts, mesmas cores e fontes do site do cliente):
//  - renderBooking: paginaspro.app.br/agendar/<slug> — quem precisa de horário marca (sem login). Modo "simple" = um passo por
//    tela, letra grande (público mais velho); "modern" = tudo numa tela, faixa de dias e grade de horários.
//  - agendaPanel: aba Agenda do painel /r/<token> — o profissional entra com e-mail + senha e controla os horários.
//  - renderLogin: paginaspro.app.br/entrar — entra com e-mail + senha e vai para o painel.
// O JavaScript das telas fica em String.raw (sem ${} nem crase dentro) e conversa com a função "agenda" do Supabase.
import { esc, FONTS, hex, mix, onColor, type LandingContent } from "./render.js";

export type AgendaTheme = { name: string; logo?: string | null; content?: Partial<Pick<LandingContent, "colors" | "fonts">> | null };
export type AgendaCfg = { api: string; key: string };

function theme(d: AgendaTheme) {
  const f = FONTS[d.content?.fonts as LandingContent["fonts"]] ?? FONTS.jakarta;
  const p = hex(d.content?.colors?.primary ?? "", "#2f5d50");
  const ink = hex(d.content?.colors?.ink ?? "", "#1c2321");
  const soft = hex(d.content?.colors?.soft ?? "", mix(p, "#ffffff", 0.92));
  return { f, p, ink, soft, on: onColor(p) };
}

const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Funções comuns do navegador: chamada à API, datas no fuso de Brasília, escape. */
const COMMON = String.raw`
function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return '&#'+c.charCodeAt(0)+';'})}
function call(action,data){return fetch(CFG.api,{method:'POST',headers:{'Content-Type':'application/json',apikey:CFG.key,Authorization:'Bearer '+CFG.key},body:JSON.stringify(Object.assign({action:action},data||{}))}).then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok)throw new Error(j.error||'Não deu certo. Tente de novo.');return j})})}
var WD=['domingo','segunda','terça','quarta','quinta','sexta','sábado'],WS=['dom','seg','ter','qua','qui','sex','sáb'],MS=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function br(iso){return new Date(Date.parse(iso)-3*3600e3)}
function dkey(d){return d.toISOString().slice(0,10)}
function hhmm(d){return String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')}
function dayNice(date,full){var d=new Date(date+'T12:00:00Z');var t=dkey(br(new Date().toISOString()));var tm=dkey(new Date(Date.parse(t+'T12:00:00Z')+864e5));var w=date===t?'Hoje':date===tm?'Amanhã':(full?WD:WS)[d.getUTCDay()];w=w.charAt(0).toUpperCase()+w.slice(1);return w+', '+d.getUTCDate()+' de '+MS[d.getUTCMonth()]}
function waLink(n,text){n=String(n||'').replace(/\D/g,'');if(!n)return '';if(n.length<=11)n='55'+n;return 'https://wa.me/'+n+(text?'?text='+encodeURIComponent(text):'')}
function phoneNice(n){n=String(n||'').replace(/\D/g,'');if(n.indexOf('55')===0&&n.length>11)n=n.slice(2);return n.length>=10?'('+n.slice(0,2)+') '+n.slice(2,n.length-4)+'-'+n.slice(-4):n}
`;

function baseCss(t: ReturnType<typeof theme>, big: boolean) {
  return `*{box-sizing:border-box;margin:0;padding:0}
:root{--p:${t.p};--on:${t.on};--ink:${t.ink};--soft:${t.soft};--line:${mix(t.ink, "#ffffff", 0.85)};--muted:${mix(t.ink, "#ffffff", 0.4)}}
body{font-family:${t.f.body};color:var(--ink);background:var(--soft);font-size:${big ? 19 : 16}px;line-height:1.5;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:${t.f.head};font-weight:${t.f.weight};line-height:1.15}
button,input,select,textarea{font:inherit;color:inherit}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--p);color:var(--on);border:0;border-radius:999px;padding:${big ? "18px 26px" : "13px 22px"};font-weight:700;cursor:pointer;text-decoration:none}
.btn.ghost{background:transparent;color:var(--p);box-shadow:inset 0 0 0 2px var(--p)}
.btn.wide{width:100%}
.btn:disabled{opacity:.5;cursor:default}
.card{background:#fff;border-radius:20px;padding:${big ? 22 : 18}px}
.muted{color:var(--muted)}
.err{background:#fde8e8;color:#9b1c1c;border-radius:14px;padding:12px 14px;margin:12px 0;font-size:.9em}
input,select,textarea{width:100%;border:2px solid var(--line);border-radius:14px;padding:${big ? 16 : 12}px 14px;background:#fff;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--p)}
label{display:block;font-weight:600;margin:14px 0 6px}`;
}

/** Página de quem marca (paciente/cliente): /agendar/<slug> */
export function renderBooking(d: AgendaTheme & { slug: string; style: "simple" | "modern"; site: string }, cfg: AgendaCfg) {
  const t = theme(d);
  const big = d.style !== "modern";
  const brand = d.logo ? `<img class="logo" src="${esc(d.logo)}" alt="${esc(d.name)}">` : `<b class="word">${esc(d.name)}</b>`;
  const css = `${baseCss(t, big)}
.wrap{width:min(640px,100% - 28px);margin:0 auto;padding:18px 0 120px}
header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:18px}
.logo{height:42px;max-width:170px;object-fit:contain}.word{font-family:${t.f.head};font-size:20px}
header a{color:var(--p);font-weight:600;text-decoration:none;font-size:15px}
h1{font-size:${big ? 32 : 28}px;margin-bottom:6px}
.step{font-size:.8em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--p);margin-bottom:6px}
.list{display:grid;gap:12px;margin-top:18px}
.opt{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;text-align:left;background:#fff;border:2px solid transparent;border-radius:18px;padding:${big ? "22px 20px" : "16px"};cursor:pointer;font-size:1em}
.opt b{font-size:1.08em}.opt small{color:var(--muted);font-size:.85em}
.opt:hover,.opt.on{border-color:var(--p)}
.opt .go{font-size:1.4em;color:var(--p)}
.times{display:grid;grid-template-columns:repeat(${big ? 2 : 4},1fr);gap:10px;margin-top:16px}
.time{background:#fff;border:2px solid transparent;border-radius:14px;padding:${big ? "18px 0" : "12px 0"};font-weight:700;font-size:1.05em;cursor:pointer}
.time:hover,.time.on{border-color:var(--p)}.time.on{background:var(--p);color:var(--on)}
.back{background:none;border:0;color:var(--p);font-weight:700;cursor:pointer;padding:6px 0;margin-bottom:10px;font-size:1em}
.strip{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 10px;margin-top:10px;scrollbar-width:none}
.strip::-webkit-scrollbar{display:none}
.day{flex:0 0 auto;width:66px;background:#fff;border:2px solid transparent;border-radius:16px;padding:10px 0;text-align:center;cursor:pointer}
.day span{display:block;font-size:12px;color:var(--muted);text-transform:uppercase}.day b{font-size:22px;display:block}
.day.on{background:var(--p);color:var(--on);border-color:var(--p)}.day.on span{color:var(--on)}
.day[disabled]{opacity:.35;cursor:default}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.chip{background:#fff;border:2px solid transparent;border-radius:999px;padding:10px 16px;font-weight:600;cursor:pointer}
.chip.on{border-color:var(--p);color:var(--p)}
.sec{margin-top:22px}.sec h3{font-size:18px}
.sum{background:#fff;border-radius:18px;padding:16px 18px;margin:16px 0;display:grid;gap:4px}
.sum b{font-size:1.1em}
.bar{position:fixed;left:0;right:0;bottom:0;background:#fff;box-shadow:0 -8px 24px rgba(0,0,0,.08);padding:14px}
.bar .in{width:min(640px,100%);margin:0 auto}
.done{text-align:center;padding:30px 10px}.done .ok{width:84px;height:84px;border-radius:50%;background:var(--p);color:var(--on);display:grid;place-items:center;font-size:44px;margin:0 auto 18px}
.done .btn{margin-top:12px}
.empty{text-align:center;padding:40px 10px}
footer{text-align:center;font-size:12px;color:var(--muted);margin-top:28px}footer a{color:inherit}`;
  const script = String.raw`
var S={si:0,svc:0,pro:'',plan:'',days:[],date:'',time:'',name:'',phone:'',email:'',busy:false,err:''};
var app=document.getElementById('app');
function steps(){var i=S.info,l=[];if(i.pros.length>1)l.push('pro');if(i.services.length>1)l.push('svc');l.push('day','time','data');return l}
function cur(){return steps()[S.si]}
function plans(){var i=S.info;return (i.particular?['Particular']:[]).concat(i.plans||[])}
function proName(){var p=S.info.pros.filter(function(x){return x.id===S.pro})[0];return p?p.name:''}
function load(){call('info',{slug:CFG.slug}).then(function(i){S.info=i;if(!i.open){draw();return}if(i.pros.length)S.pro=i.pros[0].id;var pl=plans();if(pl.length===1)S.plan=pl[0];if(i.pros.length>1&&CFG.big){draw();return}days()}).catch(function(e){S.err=e.message;draw()})}
function days(){S.days=null;draw();call('days',{slug:CFG.slug,service:S.svc,pro:S.pro}).then(function(d){S.days=d;var f=d.filter(function(x){return x.slots.length})[0];if(!CFG.big&&f&&!S.date)S.date=f.date;draw()}).catch(function(e){S.err=e.message;draw()})}
function svcLabel(s){var m=s.minutes;return m>=60?(Math.floor(m/60)+'h'+(m%60?String(m%60).padStart(2,'0'):'')):m+' min'}
function back(){S.err='';if(cur()==='data')S.time='';S.si=Math.max(0,S.si-1);draw()}
function next(){S.si=Math.min(steps().length-1,S.si+1)}
function pick(k,v){S[k]=v;S.err='';
 if(k==='pro'||k==='svc'){S.date='';S.time='';if(CFG.big)next();days();return}
 if(k==='date'){S.time='';if(CFG.big)next()}
 if(k==='time'&&CFG.big)next();
 draw()}
function keep(){var n=document.getElementById('n'),p=document.getElementById('p'),m=document.getElementById('m');if(n)S.name=n.value;if(p)S.phone=p.value;if(m)S.email=m.value}
function send(){keep();
 if(S.name.trim().length<2){S.err='Escreva o seu nome';draw();return}
 if(String(S.phone).replace(/\D/g,'').length<10){S.err='Escreva o seu WhatsApp com DDD';draw();return}
 if(S.info.plans.length&&!S.plan){S.err='Escolha particular ou o seu convênio';draw();return}
 S.busy=true;S.err='';draw();
 call('book',{slug:CFG.slug,service:S.svc,pro:S.pro,plan:S.plan,date:S.date,time:S.time,name:S.name,phone:S.phone,email:S.email}).then(function(){S.busy=false;S.done=true;draw()}).catch(function(e){S.busy=false;S.err=e.message;if(/ocupado/.test(e.message)){S.time='';if(CFG.big)S.si=steps().indexOf('time');days()}else draw()})}
function gcal(){var sv=S.info.services[S.svc];var s=new Date(Date.parse(S.date+'T'+S.time+':00-03:00'));var e=new Date(s.getTime()+sv.minutes*6e4);function f(d){return d.toISOString().replace(/[-:]/g,'').slice(0,15)+'Z'}return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(sv.name+' — '+(proName()||S.info.name))+'&dates='+f(s)+'/'+f(e)}
function err(){return S.err?'<div class="err">'+h(S.err)+'</div>':''}
function planPick(){var pl=plans();if(!S.info.plans.length)return '';return '<label>Atendimento</label><div class="chips">'+pl.map(function(x){return '<button class="chip'+(x===S.plan?' on':'')+'" onclick="keep();pick(\'plan\',this.textContent)">'+h(x)+'</button>'}).join('')+'</div>'}
function form(){return '<label for="n">Seu nome</label><input id="n" autocomplete="name" value="'+h(S.name)+'" placeholder="Nome e sobrenome">'+
 '<label for="p">Seu WhatsApp (com DDD)</label><input id="p" type="tel" inputmode="tel" autocomplete="tel" value="'+h(S.phone)+'" placeholder="(61) 99999-9999">'+
 '<label for="m">Seu e-mail <span class="muted" style="font-weight:400">(opcional)</span></label><input id="m" type="email" inputmode="email" autocomplete="email" value="'+h(S.email)+'" placeholder="seu@email.com">'+planPick()+
 '<p class="muted" style="font-size:.85em;margin-top:10px">Com e-mail, você recebe a confirmação agora e um lembrete 1 dia antes.</p>'}
function summary(){var sv=S.info.services[S.svc];return '<div class="sum"><span class="muted">'+h(sv.name)+' · '+svcLabel(sv)+(proName()?' · '+h(proName()):'')+'</span><b>'+h(dayNice(S.date,true))+' às '+h(S.time)+'</b></div>'}
function proOpts(cls){return S.info.pros.map(function(p){return cls==='opt'?'<button class="opt" onclick="pick(\'pro\',\''+p.id+'\')"><span><b>'+h(p.name)+'</b>'+(p.role?'<br><small>'+h(p.role)+'</small>':'')+'</span><span class="go">›</span></button>':'<button class="chip'+(p.id===S.pro?' on':'')+'" onclick="pick(\'pro\',\''+p.id+'\')">'+h(p.name)+(p.role?' · '+h(p.role):'')+'</button>'}).join('')}
function draw(){var i=S.info,o='';
 if(!i){app.innerHTML=S.err?err():'<p class="muted">Carregando a agenda…</p>';return}
 if(!i.open){var wl=waLink(i.whatsapp,'Olá! Quero marcar um horário.');app.innerHTML='<div class="empty card"><h2>Agenda online fechada</h2><p class="muted" style="margin:10px 0 18px">No momento os horários estão sendo marcados pelo WhatsApp.</p>'+(wl?'<a class="btn" href="'+wl+'">Chamar no WhatsApp</a>':'')+'</div>';return}
 if(S.done){var sv=i.services[S.svc];app.innerHTML='<div class="done"><div class="ok">✓</div><h1>Horário marcado!</h1><p class="muted" style="margin:8px 0 6px">'+h(sv.name)+' com '+h(proName()||i.name)+(S.plan?' · '+h(S.plan):'')+'</p><p style="font-size:1.25em;font-weight:700">'+h(dayNice(S.date,true))+' às '+h(S.time)+'</p><p class="muted" style="margin:14px 0">'+(S.email?'Mandamos a confirmação para '+h(S.email)+'. Um dia antes chega o lembrete.':'Anote o dia e o horário. Se precisar remarcar, chame no WhatsApp.')+'</p><a class="btn ghost wide" target="_blank" rel="noopener" href="'+gcal()+'">Salvar na minha agenda</a><a class="btn wide" href="'+h(CFG.site)+'">Voltar ao site</a></div>';return}
 if(CFG.big){var st=cur(),n=steps().length,bk=S.si>0?'<button class="back" onclick="back()">‹ Voltar</button>':'',lbl='<p class="step">Passo '+(S.si+1)+' de '+n+'</p>';
  if(st==='pro')o=bk+lbl+'<h1>Com quem você quer marcar?</h1><div class="list">'+proOpts('opt')+'</div>';
  else if(st==='svc')o=bk+lbl+'<h1>O que você quer marcar?</h1><div class="list">'+i.services.map(function(s,k){return '<button class="opt" onclick="pick(\'svc\','+k+')"><span><b>'+h(s.name)+'</b><br><small>'+svcLabel(s)+'</small></span><span class="go">›</span></button>'}).join('')+'</div>';
  else if(st==='day'){o=bk+lbl+'<h1>Qual dia é melhor?</h1>'+(proName()?'<p class="muted">'+h(proName())+'</p>':'');
   if(!S.days)o+='<p class="muted" style="margin-top:16px">Procurando horários livres…</p>';else{var free=S.days.filter(function(x){return x.slots.length});o+=free.length?'<div class="list">'+free.slice(0,14).map(function(x){return '<button class="opt" onclick="pick(\'date\',\''+x.date+'\')"><span><b>'+h(dayNice(x.date,true))+'</b><br><small>'+x.slots.length+(x.slots.length===1?' horário livre':' horários livres')+'</small></span><span class="go">›</span></button>'}).join('')+'</div>':'<div class="card empty" style="margin-top:16px"><p>Não há horários livres nos próximos dias.</p></div>'}}
  else if(st==='time'){var day=(S.days||[]).filter(function(x){return x.date===S.date})[0];o=bk+lbl+'<h1>'+h(dayNice(S.date,true))+'</h1><p class="muted">Escolha o horário</p><div class="times">'+(day?day.slots:[]).map(function(s){return '<button class="time" onclick="pick(\'time\',\''+s+'\')">'+s+'</button>'}).join('')+'</div>'}
  else o=bk+'<p class="step">Último passo</p><h1>Seus dados</h1>'+summary()+form()+err()+'<button class="btn wide" style="margin-top:18px" onclick="send()" '+(S.busy?'disabled':'')+'>'+(S.busy?'Marcando…':'Confirmar horário')+'</button>';
  app.innerHTML=o;return}
 o='<h1>Agende seu horário</h1><p class="muted">'+h(i.name)+'</p>';
 if(i.pros.length>1)o+='<div class="sec"><h3>Profissional</h3><div class="chips">'+proOpts('chip')+'</div></div>';
 if(i.services.length>1)o+='<div class="sec"><h3>Serviço</h3><div class="chips">'+i.services.map(function(s,k){return '<button class="chip'+(k===S.svc?' on':'')+'" onclick="pick(\'svc\','+k+')">'+h(s.name)+' · '+svcLabel(s)+'</button>'}).join('')+'</div></div>';
 o+='<div class="sec"><h3>Dia</h3>';
 if(!S.days)o+='<p class="muted">Procurando horários livres…</p>';else{o+='<div class="strip">'+S.days.map(function(x){var d=new Date(x.date+'T12:00:00Z');return '<button class="day'+(x.date===S.date?' on':'')+'" '+(x.slots.length?'onclick="pick(\'date\',\''+x.date+'\')"':'disabled')+'><span>'+WS[d.getUTCDay()]+'</span><b>'+d.getUTCDate()+'</b><span>'+MS[d.getUTCMonth()]+'</span></button>'}).join('')+'</div>';
  var cd=S.days.filter(function(x){return x.date===S.date})[0];o+='</div><div class="sec"><h3>Horário</h3>'+(cd&&cd.slots.length?'<div class="times">'+cd.slots.map(function(s){return '<button class="time'+(s===S.time?' on':'')+'" onclick="pick(\'time\',\''+s+'\')">'+s+'</button>'}).join('')+'</div>':'<p class="muted">Escolha um dia com horário livre.</p>')}
 o+='</div>';
 if(S.time)o+='<div class="sec"><h3>Seus dados</h3>'+summary()+form()+err()+'</div><div class="bar"><div class="in"><button class="btn wide" onclick="send()" '+(S.busy?'disabled':'')+'>'+(S.busy?'Marcando…':'Confirmar '+h(dayNice(S.date))+' às '+h(S.time))+'</button></div></div>';
 else o+=err();
 app.innerHTML=o}
load();`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agendar horário · ${esc(d.name)}</title><meta name="robots" content="noindex"><meta name="theme-color" content="${t.p}">
<meta property="og:title" content="Agende seu horário · ${esc(d.name)}"><meta property="og:description" content="Escolha o dia e o horário em poucos toques.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${t.f.url}&display=swap" rel="stylesheet"><style>${css}</style></head>
<body><div class="wrap"><header>${brand}<a href="${esc(d.site)}">Ver o site</a></header><main id="app"></main>
<footer>Agenda online por <a href="https://paginaspro.app.br" target="_blank" rel="noopener">PáginasPro</a></footer></div>
<script>var CFG=${json({ ...cfg, slug: d.slug, big: d.style !== "modern", site: d.site })};${COMMON}${script}</script></body></html>`;
}

/** Aba Agenda do painel /r/<token> (HTML + script; o painel decide onde mostrar). */
export function agendaPanel(d: AgendaTheme & { token: string }, cfg: AgendaCfg) {
  const t = theme(d);
  const css = `
#agenda{font-size:16px}
#agenda .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#agenda .seg{display:flex;background:#fff;border-radius:999px;padding:4px;gap:4px;margin:4px 0 14px;overflow-x:auto}
#agenda .seg button{flex:1;border:0;background:none;border-radius:999px;padding:10px 12px;font-weight:600;cursor:pointer;white-space:nowrap}
#agenda .seg button.on{background:${t.p};color:${t.on}}
#agenda .ap{background:#fff;border-radius:18px;padding:16px;margin-top:10px;border-left:6px solid var(--c,#ccc)}
#agenda .ap .t{font-family:${t.f.head};font-size:24px;line-height:1}
#agenda .ap .n{font-weight:700;font-size:18px;margin-top:6px}
#agenda .ap .acts{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}
#agenda .ap .acts button,#agenda .ap .acts a{border:0;border-radius:12px;padding:12px 8px;font-weight:700;cursor:pointer;text-align:center;text-decoration:none;font-size:15px;background:${t.soft};color:${t.ink}}
#agenda .ap .acts .pri{background:${t.p};color:${t.on}}
#agenda .tag{display:inline-block;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;background:var(--c,#ccc);color:#fff;vertical-align:middle;margin-left:6px}
#agenda .banner{border-radius:16px;padding:14px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
#agenda .week{display:grid;grid-template-columns:repeat(7,minmax(120px,1fr));gap:8px;overflow-x:auto;padding-bottom:6px}
#agenda .col{background:#fff;border-radius:14px;padding:10px;min-height:120px}
#agenda .col h4{font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;color:${mix(t.ink, "#ffffff", 0.35)}}
#agenda .col.today h4{color:${t.p}}
#agenda .mini{display:block;width:100%;text-align:left;border:0;border-left:4px solid var(--c,#ccc);background:${t.soft};border-radius:8px;padding:6px 8px;margin-bottom:6px;cursor:pointer;font-size:13px}
#agenda .mini b{display:block}
#agenda input,#agenda select{width:100%;border:2px solid ${mix(t.ink, "#ffffff", 0.85)};border-radius:12px;padding:12px;font:inherit;background:#fff}
#agenda label{display:block;font-weight:600;margin:12px 0 6px;font-size:14px}
#agenda .err{background:#fde8e8;color:#9b1c1c;border-radius:12px;padding:10px 12px;margin:10px 0;font-size:14px}
#agenda .sheet{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;z-index:50}
#agenda .sheet>div{background:${t.soft};width:min(560px,100%);max-height:90vh;overflow:auto;border-radius:22px 22px 0 0;padding:20px}
#agenda .hours .d{display:grid;grid-template-columns:62px 1fr;gap:8px;align-items:start;padding:10px 0;border-top:1px solid ${mix(t.ink, "#ffffff", 0.9)}}
#agenda .hours .d label{margin:8px 0 0;display:flex;align-items:center;gap:6px;text-transform:capitalize}
#agenda .hours .d label input{width:auto}
#agenda .hours .iv{display:grid;gap:6px;min-width:0}
#agenda .hours .ivr{display:flex;gap:6px;align-items:center}
#agenda .hours .ivr input{flex:1;width:0;min-width:0;padding:8px 6px;text-align:center}
#agenda .hours .ivr input::-webkit-calendar-picker-indicator{display:none}
#agenda .hours .x,#agenda .hours .add{border:0;background:none;color:${t.p};font-weight:700;cursor:pointer;padding:6px}
#agenda .hours .add{text-align:left}
#agenda .pick{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
#agenda .pick button{border:2px solid transparent;background:#fff;border-radius:16px;padding:14px;text-align:left;cursor:pointer}
#agenda .pick button.on{border-color:${t.p}}
#agenda .pick b{display:block}#agenda .pick small{color:${mix(t.ink, "#ffffff", 0.4)}}
#agenda .link{background:#fff;border-radius:12px;padding:10px 12px;font-size:13px;word-break:break-all}`;
  const script = String.raw`
(function(){
var KEY='ag:'+CFG.token,A={session:null,data:null,view:'today',tab:'list',week:0,err:'',sheet:null,mode:'login',pro:''};
try{A.session=localStorage.getItem(KEY)}catch(e){}
var el=document.getElementById('agenda');
var ST={booked:['Marcado','#64748b'],confirmed:['Confirmado','#15803d'],reschedule:['Remarcar','#d97706'],cancelled:['Cancelado','#b91c1c'],done:['Atendido','#0f766e'],noshow:['Faltou','#7c3aed'],block:['Bloqueado','#334155']};
function save(s){A.session=s;try{s?localStorage.setItem(KEY,s):localStorage.removeItem(KEY)}catch(e){}}
function api(action,data){return call(action,Object.assign({session:A.session},data||{})).catch(function(e){if(/sess|Entre de novo|desligada/i.test(e.message)){save(null);A.data=null}throw e})}
function refresh(){return api('panel').then(function(d){A.data=d;A.err='';draw()}).catch(function(e){A.err=e.message;draw()})}
window.agFail=function(e){A.err=e.message;draw()};
function auth(kind){var em=document.getElementById('ag-e').value,pw=document.getElementById('ag-p').value;if(kind==='setup'&&pw!==document.getElementById('ag-p2').value){A.err='As duas senhas não estão iguais';draw();return}
call(kind,{token:CFG.token,email:em,password:pw}).then(function(r){save(r.session);refresh()}).catch(window.agFail)}
window.agAuth=auth;
window.agMode=function(m){A.mode=m;A.err='';draw()};
window.agOut=function(){call('logout',{session:A.session});save(null);A.data=null;draw()};
window.agView=function(v){A.view=v;draw()};
window.agTab=function(v){A.tab=v;A.err='';draw()};
window.agWeek=function(n){A.week+=n;draw()};
window.agPro=function(id){A.pro=id;draw()};
function pros(){return A.data.settings.pros||[]}
function T(){return A.data.terms||{client:'cliente',clients:'clientes',all:'Todos',health:false}}
function proName(id){var p=pros().filter(function(x){return x.id===id})[0];return p?p.name:''}
function mine(a){return !A.pro||a.pro===A.pro||!a.pro}
window.agSet=function(id,st){if(st==='cancelled'&&!confirm('Cancelar este horário?'))return;api('appt',{id:id,status:st}).then(function(){A.sheet=null;refresh()}).catch(window.agFail)};
window.agOpen=function(id){A.sheet={id:id};draw()};
window.agNew=function(block){A.sheet={create:true,block:!!block};draw()};
window.agClose=function(){A.sheet=null;draw()};
window.agMove=function(id){A.sheet={id:id,move:true};draw()};
window.agSaveAppt=function(){var g=function(i){var x=document.getElementById(i);return x?x.value:undefined};var s=A.sheet;var body={date:g('ag-d'),time:g('ag-t')};
 if(s.create){body.status=s.block?'block':'booked';body.name=s.block?(g('ag-n')||'Bloqueado'):g('ag-n');body.phone=g('ag-f');body.service=g('ag-s');body.minutes=Number(g('ag-m')||0)||undefined;if(g('ag-pr')!==undefined)body.pro=g('ag-pr');if(g('ag-em'))body.email=g('ag-em');if(g('ag-pl')!==undefined)body.plan=g('ag-pl');if(!s.block&&(!body.name||body.name.length<2)){A.err='Escreva o nome';draw();return}}
 else body.id=s.id;
 api('appt',body).then(function(){A.sheet=null;A.err='';refresh()}).catch(window.agFail)};
window.agSub=function(){api('subscribe').then(function(r){location.href=r.url}).catch(window.agFail)};
window.agCopy=function(t){navigator.clipboard&&navigator.clipboard.writeText(t);alert('Link copiado!')};
window.agStyle=function(s){A.data.settings.style=s;draw()};
window.agSvc=function(op,i){var sv=A.data.settings.services;readCfg();if(op==='add')sv.push({name:'',minutes:60});else sv.splice(i,1);draw()};
function hoursOf(k){var s=A.data.settings;if(k<0){s.hours=s.hours||{};return s.hours}s.pros[k].hours=s.pros[k].hours||{};return s.pros[k].hours}
window.agIv=function(k,d,op,i){readCfg();var h=hoursOf(k);h[d]=h[d]||[];if(op==='add')h[d].push(['08:00','12:00']);else if(op==='del')h[d].splice(i,1);else h[d]=h[d].length?[]:[['08:00','12:00'],['14:00','18:00']];draw()};
window.agPros=function(op,k){readCfg();var s=A.data.settings;s.pros=s.pros||[];if(op==='add')s.pros.push({id:'p'+Date.now().toString(36),name:'',role:'',hours:JSON.parse(JSON.stringify(s.pros.length?s.pros[0].hours:s.hours||{}))});else if(confirm('Tirar este profissional da agenda?'))s.pros.splice(k,1);draw()};
window.agPlans=function(op,i){readCfg();var s=A.data.settings;s.plans=s.plans||[];if(op==='add')s.plans.push('');else s.plans.splice(i,1);draw()};
function readHours(k){var h=hoursOf(k);for(var d=0;d<7;d++){var l=h[d]||[];h[d]=l.map(function(iv,i){var a=document.getElementById('h'+k+'_'+d+'a'+i),b=document.getElementById('h'+k+'_'+d+'b'+i);return [a?a.value:iv[0],b?b.value:iv[1]]})}}
function readCfg(){var s=A.data.settings;s.services=s.services.map(function(x,i){var n=document.getElementById('sv-n'+i),m=document.getElementById('sv-m'+i);return {name:n?n.value:x.name,minutes:m?Number(m.value):x.minutes}});
 readHours(-1);(s.pros||[]).forEach(function(p,k){var n=document.getElementById('pp-n'+k),r=document.getElementById('pp-r'+k);if(n)p.name=n.value;if(r)p.role=r.value;readHours(k)});
 s.plans=(s.plans||[]).map(function(x,i){var e=document.getElementById('pl'+i);return e?e.value:x});var pa=document.getElementById('cf-part');if(pa)s.particular=pa.checked;
 var no=document.getElementById('cf-notice'),da=document.getElementById('cf-days'),stp=document.getElementById('cf-step');if(no)s.notice=Number(no.value);if(da)s.days=Number(da.value);if(stp)s.step=Number(stp.value)}
window.agSaveCfg=function(){readCfg();api('save',{settings:A.data.settings}).then(function(r){A.data.settings=r.settings;A.err='';alert('Configuração salva!');draw()}).catch(window.agFail)};
function tag(st){var x=ST[st]||[st,'#999'];return '<span class="tag" style="--c:'+x[1]+'">'+x[0]+'</span>'}
function remindMsg(a){var d=br(a.starts_at);return 'Olá, '+String(a.name).split(' ')[0]+'! Passando para lembrar do seu horário com '+(proName(a.pro)||A.data.name)+' amanhã, '+dayNice(dkey(d),true).replace(/^Amanhã, /,'')+', às '+hhmm(d)+'. Você confirma? Responda SIM para confirmar ou REMARCAR se precisar mudar.'}
function waMsg(a){var d=br(a.starts_at);return 'Olá, '+String(a.name).split(' ')[0]+'! Aqui é de '+A.data.name+'. Sobre o seu horário de '+dayNice(dkey(d),true)+' às '+hhmm(d)+': '}
function card(a){var d=br(a.starts_at),c=(ST[a.status]||['','#999'])[1];var wl=waLink(a.phone,waMsg(a));var acts='';
 if(a.status!=='block'){if(a.status==='booked'||a.status==='reschedule')acts+='<button class="pri" onclick="agSet(\''+a.id+'\',\'confirmed\')">✅ Confirmar</button>';
  var tm=dkey(new Date(Date.parse(dkey(br(new Date().toISOString()))+'T12:00:00Z')+864e5));
  if(a.status==='booked'&&dkey(d)===tm&&a.phone)acts+='<a class="pri" href="'+waLink(a.phone,remindMsg(a))+'" target="_blank" rel="noopener">🔔 Lembrar</a>';
  if(wl)acts+='<a href="'+wl+'" target="_blank" rel="noopener">💬 WhatsApp</a>';
  acts+='<button onclick="agMove(\''+a.id+'\')">🔁 Remarcar</button>';
  if(a.status!=='cancelled')acts+='<button onclick="agSet(\''+a.id+'\',\'cancelled\')">❌ Cancelar</button>';
  if(Date.parse(a.starts_at)<Date.now()&&a.status!=='done')acts+='<button onclick="agSet(\''+a.id+'\',\'done\')">✔️ Atendido</button><button onclick="agSet(\''+a.id+'\',\'noshow\')">🚫 Faltou</button>'}
 else acts+='<button onclick="agSet(\''+a.id+'\',\'cancelled\')">Liberar horário</button>';
 return '<div class="ap" style="--c:'+c+'"><div class="row" style="justify-content:space-between"><span class="t">'+hhmm(d)+'</span>'+tag(a.status)+'</div><div class="n">'+h(a.name||'—')+'</div><div class="muted" style="font-size:14px">'+h(a.service)+(a.pro&&proName(a.pro)?' · '+h(proName(a.pro)):a.status==='block'&&pros().length?' · '+h(T().all.toLowerCase()):'')+(a.plan?' · '+h(a.plan):'')+(a.phone?' · '+h(phoneNice(a.phone)):'')+(a.email?' · ✉️'+(a.email_reminded_at&&a.status==='booked'?' lembrete enviado':''):'')+(a.source==='site'?' · pelo site':'')+(a.reminder_sent_at&&a.status==='booked'?' · lembrete enviado':'')+'</div>'+(a.note?'<div class="muted" style="font-size:13px;margin-top:4px">'+h(a.note)+'</div>':'')+'<div class="acts">'+acts+'</div></div>'}
function sheet(){var s=A.sheet;if(!s)return '';var a=s.id?A.data.appointments.filter(function(x){return x.id===s.id})[0]:null;var o='<div class="sheet" onclick="if(event.target===this)agClose()"><div>';
 if(a&&!s.move){o+='<div class="row" style="justify-content:space-between"><h3>'+h(dayNice(dkey(br(a.starts_at)),true))+'</h3><button class="btn ghost" style="padding:8px 14px" onclick="agClose()">Fechar</button></div>'+card(a)}
 else{var sv=A.data.settings.services,today=dkey(br(new Date().toISOString()));var d0=a?dkey(br(a.starts_at)):today,t0=a?hhmm(br(a.starts_at)):'09:00';
  o+='<h3>'+(s.move?'Remarcar '+h(a.name):s.block?'Bloquear horário':'Marcar horário')+'</h3>';
  var ps=pros();if(s.create&&ps.length)o+='<label>Profissional</label><select id="ag-pr">'+(s.block?'<option value="">'+h(T().all)+'</option>':'')+ps.map(function(p){return '<option value="'+h(p.id)+'"'+(p.id===A.pro?' selected':'')+'>'+h(p.name)+'</option>'}).join('')+'</select>';
  if(s.create&&!s.block){o+='<label>Nome</label><input id="ag-n"><label>WhatsApp</label><input id="ag-f" type="tel" placeholder="(61) 99999-9999"><label>E-mail (opcional, para o lembrete)</label><input id="ag-em" type="email"><label>Serviço</label><select id="ag-s">'+sv.map(function(x){return '<option>'+h(x.name)+'</option>'}).join('')+'</select>';
   var pl=(A.data.settings.particular?['Particular']:[]).concat(A.data.settings.plans||[]);if((A.data.settings.plans||[]).length)o+='<label>Atendimento</label><select id="ag-pl">'+pl.map(function(x){return '<option>'+h(x)+'</option>'}).join('')+'</select>'}
  if(s.block)o+='<label>Motivo (opcional)</label><input id="ag-n" placeholder="Almoço, folga, compromisso…"><label>Duração (minutos)</label><input id="ag-m" type="number" value="60" min="10" step="10">';
  o+='<div class="row" style="flex-wrap:nowrap"><div style="flex:1"><label>Dia</label><input id="ag-d" type="date" value="'+d0+'" min="'+today+'"></div><div style="flex:1"><label>Hora</label><input id="ag-t" type="time" value="'+t0+'" step="300"></div></div>'+(A.err?'<div class="err">'+h(A.err)+'</div>':'')+
  '<div class="row" style="margin-top:16px"><button class="btn" style="flex:1" onclick="agSaveAppt()">Salvar</button><button class="btn ghost" onclick="agClose()">Voltar</button></div>'+(s.move?'<p class="muted" style="font-size:13px;margin-top:10px">Depois de remarcar, avise o '+T().client+' pelo botão do WhatsApp.</p>':'')}
 return o+'</div></div>'}
function proBar(){var ps=pros();if(ps.length<2)return '';return '<div class="seg">'+['<button class="'+(!A.pro?'on':'')+'" onclick="agPro(\'\')">Todos</button>'].concat(ps.map(function(p){return '<button class="'+(A.pro===p.id?'on':'')+'" onclick="agPro(\''+h(p.id)+'\')">'+h(p.name)+'</button>'})).join('')+'</div>'}
function listView(){var all=A.data.appointments.filter(function(a){return a.status!=='cancelled'&&mine(a)});var today=dkey(br(new Date().toISOString())),tm=dkey(new Date(Date.parse(today+'T12:00:00Z')+864e5));
 var pick=all.filter(function(a){var k=dkey(br(a.starts_at));return A.view==='today'?k===today:A.view==='tomorrow'?k===tm:k>=today&&k<=dkey(new Date(Date.parse(today+'T12:00:00Z')+7*864e5))});
 var rs=all.filter(function(a){return a.status==='reschedule'});
 var o='<div class="seg"><button class="'+(A.view==='today'?'on':'')+'" onclick="agView(\'today\')">Hoje</button><button class="'+(A.view==='tomorrow'?'on':'')+'" onclick="agView(\'tomorrow\')">Amanhã</button><button class="'+(A.view==='week'?'on':'')+'" onclick="agView(\'week\')">7 dias</button></div>';
 if(rs.length)o+='<div class="banner" style="background:#fef3c7"><b>'+rs.length+(rs.length===1?' '+T().client+' pediu':' '+T().clients+' pediram')+' para remarcar</b><button class="btn" style="padding:8px 14px" onclick="agView(\'week\')">Ver</button></div>';
 var last='';pick.forEach(function(a){var k=dkey(br(a.starts_at));if(A.view==='week'&&k!==last){o+='<h3 style="margin:18px 0 0">'+h(dayNice(k,true))+'</h3>';last=k}o+=card(a)});
 if(!pick.length)o+='<div class="card center" style="margin-top:10px"><p class="muted">Nenhum horário '+(A.view==='today'?'hoje':A.view==='tomorrow'?'amanhã':'nos próximos 7 dias')+'.</p></div>';
 return o}
function weekView(){var today=dkey(br(new Date().toISOString())),base=new Date(Date.parse(today+'T12:00:00Z'));base.setUTCDate(base.getUTCDate()-base.getUTCDay()+1+A.week*7);
 var o='<div class="row" style="justify-content:space-between;margin-bottom:10px"><button class="btn ghost" style="padding:8px 14px" onclick="agWeek(-1)">‹</button><b>Semana de '+base.getUTCDate()+' de '+MS[base.getUTCMonth()]+'</b><button class="btn ghost" style="padding:8px 14px" onclick="agWeek(1)">›</button></div><div class="week">';
 for(var i=0;i<7;i++){var d=new Date(base.getTime()+i*864e5),k=dkey(d);var list=A.data.appointments.filter(function(a){return a.status!=='cancelled'&&mine(a)&&dkey(br(a.starts_at))===k});
  o+='<div class="col'+(k===today?' today':'')+'"><h4>'+WS[d.getUTCDay()]+' '+d.getUTCDate()+'</h4>'+list.map(function(a){return '<button class="mini" style="--c:'+(ST[a.status]||['','#999'])[1]+'" onclick="agOpen(\''+a.id+'\')"><b>'+hhmm(br(a.starts_at))+'</b>'+h(a.name||'')+(!A.pro&&a.pro&&pros().length>1?'<br><small>'+h(proName(a.pro))+'</small>':'')+'</button>'}).join('')+'</div>'}
 return o+'</div>'}
function hoursEd(k,hs){var o='';for(var d=1;d<=7;d++){var w=d%7,l=hs[w]||[];o+='<div class="d"><label><input type="checkbox" '+(l.length?'checked':'')+' onchange="agIv('+k+','+w+',\'toggle\')">'+WS[w]+'</label><div class="iv">'+(l.length?l.map(function(iv,i){return '<div class="ivr"><input id="h'+k+'_'+w+'a'+i+'" type="time" value="'+iv[0]+'"><span>às</span><input id="h'+k+'_'+w+'b'+i+'" type="time" value="'+iv[1]+'"><button class="x" onclick="agIv('+k+','+w+',\'del\','+i+')" aria-label="Tirar">✕</button></div>'}).join('')+'<button class="add" onclick="agIv('+k+','+w+',\'add\')">+ intervalo</button>':'<span class="muted" style="font-size:14px;padding-top:8px">Fechado</span>')+'</div></div>'}return o}
function cfgView(){var s=A.data.settings,o='';
 o+='<div class="card"><h3>Link para os '+T().clients+'</h3><p class="muted" style="font-size:14px;margin-bottom:8px">Coloque na bio do Instagram e mande no WhatsApp. O botão "Agendar" do seu site já leva para cá.</p><div class="link">'+h(A.data.booking)+'</div><div class="row" style="margin-top:10px"><button class="btn" onclick="agCopy(\''+A.data.booking+'\')">Copiar link</button><a class="btn ghost" href="'+A.data.booking+'" target="_blank">Ver página</a></div></div>';
 o+='<div class="card"><h3>Jeito da agenda</h3><p class="muted" style="font-size:14px">Vale para a sua página de agendamento e para este painel.</p><div class="pick"><button class="'+(s.style==='simple'?'on':'')+'" onclick="agStyle(\'simple\')"><b>Simples</b><small>Letra grande, um passo por vez. Melhor para quem tem mais idade.</small></button><button class="'+(s.style==='modern'?'on':'')+'" onclick="agStyle(\'modern\')"><b>Moderno</b><small>Tudo numa tela, calendário da semana.</small></button></div></div>';
 o+='<div class="card"><h3>Serviços</h3>'+s.services.map(function(x,i){return '<div class="row" style="flex-wrap:nowrap;margin-top:8px"><input id="sv-n'+i+'" value="'+h(x.name)+'" placeholder="Ex.: Consulta"><input id="sv-m'+i+'" type="number" min="10" step="5" value="'+x.minutes+'" style="width:90px" title="minutos"><button class="btn ghost" style="padding:8px 12px" onclick="agSvc(\'del\','+i+')">✕</button></div>'}).join('')+'<p class="muted" style="font-size:12px;margin-top:4px">Nome e duração em minutos.</p><button class="btn ghost" style="margin-top:10px;padding:8px 14px" onclick="agSvc(\'add\')">+ Serviço</button></div>';
 var ps=s.pros||[];
 if(!ps.length)o+='<div class="card hours"><h3>Horário de atendimento</h3>'+hoursEd(-1,s.hours||{})+'<p class="muted" style="font-size:13px;margin-top:10px">Tem mais de um profissional? Cada um pode ter os próprios horários.</p><button class="btn ghost" style="margin-top:8px;padding:8px 14px" onclick="agPros(\'add\')">+ Profissional</button></div>';
 else{o+='<div class="card"><h3>Profissionais</h3><p class="muted" style="font-size:14px">Cada um com os próprios horários. O '+T().client+' escolhe com quem quer marcar.</p></div>';
  ps.forEach(function(p,k){o+='<div class="card hours"><div class="row" style="flex-wrap:nowrap"><input id="pp-n'+k+'" value="'+h(p.name)+'" placeholder="Nome (ex.: Dra. Ana)"><button class="btn ghost" style="padding:8px 12px" onclick="agPros(\'del\','+k+')">✕</button></div><input id="pp-r'+k+'" value="'+h(p.role)+'" placeholder="Especialidade (opcional)" style="margin-top:8px"><h3 style="margin-top:14px;font-size:16px">Horários de '+h(p.name||'quem atende')+'</h3>'+hoursEd(k,p.hours||{})+'</div>'});
  o+='<button class="btn ghost" style="margin-top:10px;padding:8px 14px" onclick="agPros(\'add\')">+ Profissional</button>'}
 var pl=s.plans||[];
 if(T().health||pl.length)o+='<div class="card"><h3>Convênios</h3><label style="display:flex;gap:8px;align-items:center;font-weight:600"><input id="cf-part" type="checkbox" style="width:auto" '+(s.particular!==false?'checked':'')+'> Atendo particular</label>'+pl.map(function(x,i){return '<div class="row" style="flex-wrap:nowrap;margin-top:8px"><input id="pl'+i+'" value="'+h(x)+'" placeholder="Ex.: Unimed, Amil, Bradesco Saúde"><button class="btn ghost" style="padding:8px 12px" onclick="agPlans(\'del\','+i+')">✕</button></div>'}).join('')+'<p class="muted" style="font-size:12px;margin-top:6px">'+(pl.length?'O '+T().client+' escolhe particular ou o convênio ao marcar, e o site mostra os convênios aceitos.':'Sem convênio cadastrado: só particular.')+'</p><button class="btn ghost" style="margin-top:10px;padding:8px 14px" onclick="agPlans(\'add\')">+ Convênio</button></div>';
 o+='<div class="card"><h3>Lembrete 1 dia antes</h3><div class="pick"><button class="on"><b>Pelo meu WhatsApp</b><small>Na véspera aparece o botão 🔔 Lembrar em cada '+T().client+': um toque e a mensagem abre pronta no seu WhatsApp.</small></button><button disabled style="opacity:.6;cursor:default"><b>Automático · em breve</b><small>Você conecta o WhatsApp da clínica lendo um QR Code e a IA manda os lembretes sozinha.</small></button></div></div>';
 o+='<div class="card"><h3>Regras</h3><label>Antecedência mínima (horas)</label><input id="cf-notice" type="number" min="0" max="72" value="'+s.notice+'"><label>Pode marcar até quantos dias à frente</label><input id="cf-days" type="number" min="1" max="90" value="'+s.days+'"><label>Intervalo entre horários</label><select id="cf-step">'+[10,15,20,30,45,60].map(function(n){return '<option value="'+n+'" '+(n===s.step?'selected':'')+'>'+n+' minutos</option>'}).join('')+'</select></div>';
 o+=(A.err?'<div class="err">'+h(A.err)+'</div>':'')+'<button class="btn" style="width:100%;margin-top:12px" onclick="agSaveCfg()">Salvar configuração</button>';
 return o}
function banner(){var d=A.data;if(d.status==='active')return '';var until=d.until?new Date(d.until):null;var trial=d.status==='trial'&&d.open;
 var msg=trial?'Teste grátis'+(until?' até '+until.getDate()+'/'+(until.getMonth()+1):''):'Agenda pausada: os '+T().clients+' não conseguem marcar pelo site';
 var btn=d.canSubscribe?'<button class="btn" style="padding:10px 16px" onclick="agSub()">Assinar R$ '+d.price+'/mês</button>':d.payLink?'<a class="btn" style="padding:10px 16px" target="_blank" rel="noopener" href="'+h(d.payLink)+'">Assinar R$ '+d.price+'/mês</a>':'';
 return '<div class="banner" style="background:'+(trial?'#e0f2fe':'#fee2e2')+'"><div><b>'+msg+'</b>'+(trial?'<div class="muted" style="font-size:13px">Depois, R$ '+d.price+' por mês no cartão.</div>':'')+'</div>'+btn+'</div>'}
function draw(){var o='';
 if(!A.session){var setup=A.mode==='setup';o='<div class="card" style="max-width:420px;margin:0 auto"><h2>'+(setup?'Criar meu acesso':'Entrar na agenda')+'</h2><p class="muted" style="font-size:14px">'+(setup?'Primeira vez aqui? Escolha o e-mail e uma senha para entrar na sua agenda.':'Use o e-mail e a senha que você criou.')+'</p>'+
  '<label>E-mail</label><input id="ag-e" type="email" autocomplete="email"><label>Senha</label><input id="ag-p" type="password" autocomplete="'+(setup?'new-password':'current-password')+'">'+(setup?'<label>Repita a senha</label><input id="ag-p2" type="password" autocomplete="new-password">':'')+
  (A.err?'<div class="err">'+h(A.err)+'</div>':'')+'<button class="btn" style="width:100%;margin-top:16px" onclick="agAuth(\''+(setup?'setup':'login')+'\')">'+(setup?'Criar acesso':'Entrar')+'</button>'+
  '<p style="text-align:center;margin-top:14px;font-size:14px"><a href="javascript:agMode(\''+(setup?'login':'setup')+'\')" style="color:inherit">'+(setup?'Já tenho senha':'Primeiro acesso? Criar senha')+'</a></p></div>';el.innerHTML=o;return}
 if(!A.data){el.innerHTML=A.err?'<div class="err">'+h(A.err)+'</div>':'<p class="muted">Carregando a agenda…</p>';return}
 var modern=A.data.settings.style==='modern';
 o+=banner()+'<div class="seg"><button class="'+(A.tab==='list'?'on':'')+'" onclick="agTab(\'list\')">Agenda</button>'+(modern?'<button class="'+(A.tab==='week'?'on':'')+'" onclick="agTab(\'week\')">Semana</button>':'')+'<button class="'+(A.tab==='cfg'?'on':'')+'" onclick="agTab(\'cfg\')">Configurar</button></div>';
 if(A.tab==='cfg')o+=cfgView();else{o+='<div class="row" style="margin-bottom:6px"><button class="btn" style="flex:1" onclick="agNew()">+ Marcar horário</button><button class="btn ghost" onclick="agNew(true)">Bloquear</button></div>'+(A.err&&!A.sheet?'<div class="err">'+h(A.err)+'</div>':'')+proBar()+(A.tab==='week'&&modern?weekView():listView())}
 o+='<p style="text-align:center;margin-top:20px;font-size:13px"><a href="javascript:agOut()" style="color:inherit">Sair</a></p>'+sheet();
 el.innerHTML=o}
if(A.session)refresh();draw();
})();`;
  return {
    css,
    html: `<section id="agenda"></section>`,
    script: `<script>var CFG=${json({ ...cfg, token: d.token })};${COMMON}${script}</script>`,
  };
}

/** paginaspro.app.br/entrar: e-mail + senha → painel do cliente (aba Agenda). */
export function renderLogin(cfg: AgendaCfg) {
  const t = theme({ name: "PáginasPro", content: { colors: { primary: "#111110", ink: "#111110", soft: "#F3F1EA" }, fonts: "jakarta" } });
  const script = String.raw`
function go(){var e=document.getElementById('e').value,p=document.getElementById('p').value,er=document.getElementById('er');er.textContent='';
call('login',{email:e,password:p}).then(function(r){try{localStorage.setItem('ag:'+r.token,r.session)}catch(x){}location.href='/r/'+r.token+'#agenda'}).catch(function(x){er.textContent=x.message})}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Entrar · PáginasPro</title><meta name="robots" content="noindex"><link href="https://fonts.googleapis.com/css2?${t.f.url}&display=swap" rel="stylesheet">
<style>${baseCss(t, false)}body{display:grid;place-items:center;min-height:100vh;padding:16px}.card{width:min(400px,100%)}h1{font-size:26px;margin-bottom:4px}#er{color:#b91c1c;font-size:14px;margin-top:10px;min-height:1em}</style></head>
<body><form class="card" onsubmit="go();return false"><h1>Entrar</h1><p class="muted">Sua agenda e o painel do seu site.</p>
<label for="e">E-mail</label><input id="e" type="email" autocomplete="email" required><label for="p">Senha</label><input id="p" type="password" autocomplete="current-password" required>
<div id="er"></div><button class="btn wide" style="margin-top:14px">Entrar</button>
<p class="muted" style="font-size:13px;margin-top:14px">Primeiro acesso ou esqueceu a senha? Abra o link do painel que você recebeu no WhatsApp.</p></form>
<script>var CFG=${json(cfg)};${COMMON}${script}</script></body></html>`;
}

/** paginaspro.app.br/confirmar/<token>?r=yes|no — página do botão do e-mail de lembrete. Nada muda só de abrir
 * (leitores de e-mail abrem links sozinhos): a pessoa toca no botão e o script chama a função "agenda". */
export function renderAnswer(
  d: (AgendaTheme & { whatsapp?: string | null; when: string; service: string; result: string }) | null,
  o: { cfg: AgendaCfg; token: string; want: "yes" | "no" },
) {
  const t = theme(d ?? { name: "Agenda" });
  const n = String(d?.whatsapp ?? "").replace(/\D/g, "");
  const wa = n ? `https://wa.me/${n.length <= 11 ? `55${n}` : n}?text=${encodeURIComponent(`Olá! Preciso remarcar o meu horário de ${d?.when ?? ""}.`)}` : "";
  const script = String.raw`
var R={confirmed:['✓','Presença confirmada!',CFG.service+' · '+CFG.when+'. Até lá!'],reschedule:['↺','Pedido de remarcação enviado','Avisamos '+CFG.name+' e vão falar com você para escolher outro horário.'],closed:['!','Este horário já passou ou foi cancelado','Para marcar outro, use a agenda online ou chame no WhatsApp.'],none:['?','Link inválido','Este link não existe mais. Fale direto com quem marcou o seu horário.']};
function show(k){var r=R[k]||R.none;document.getElementById('ic').textContent=r[0];document.getElementById('tt').textContent=r[1];document.getElementById('tx').textContent=r[2];document.getElementById('bt').innerHTML=(k==='reschedule'&&CFG.wa?'<a class="btn wide" style="margin-top:18px" href="'+h(CFG.wa)+'">Chamar no WhatsApp agora</a>':'')}
function go(r){var b=document.querySelectorAll('#bt button');for(var i=0;i<b.length;i++)b[i].disabled=true;call('answer',{token:CFG.token,reply:r}).then(function(x){show(x.result)}).catch(function(e){document.getElementById('tx').textContent=e.message;for(var i=0;i<b.length;i++)b[i].disabled=false})}
if(CFG.result!=='ask')show(CFG.result);`;
  const ask = d?.result === "ask";
  const first = o.want === "yes" ? ["yes", "✅ Confirmar presença"] : ["no", "Pedir para remarcar"];
  const second = o.want === "yes" ? ["no", "Preciso remarcar"] : ["yes", "Na verdade, vou: confirmar"];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(d?.name ?? "Agenda")}</title><link href="https://fonts.googleapis.com/css2?${t.f.url}&display=swap" rel="stylesheet">
<style>${baseCss(t, true)}body{display:grid;place-items:center;min-height:100vh;padding:16px;text-align:center}.card{width:min(440px,100%)}#ic{width:80px;height:80px;border-radius:50%;background:var(--p);color:var(--on);display:grid;place-items:center;font-size:40px;margin:0 auto 16px}h1{font-size:26px;margin-bottom:8px}#bt .btn{margin-top:12px}</style></head>
<body><div class="card"><div id="ic">📅</div><p class="muted" style="margin-bottom:6px">${esc(d?.name ?? "")}</p><h1 id="tt">${ask ? "Seu horário" : ""}</h1><p class="muted" id="tx">${ask ? `${esc(d!.service)} · ${esc(d!.when)}` : ""}</p>
<div id="bt">${ask ? `<button class="btn wide" onclick="go('${first[0]}')">${first[1]}</button><button class="btn ghost wide" onclick="go('${second[0]}')">${second[1]}</button>` : ""}</div></div>
<script>var CFG=${json({ ...o.cfg, token: o.token, result: d ? d.result : "none", name: d?.name ?? "", when: d?.when ?? "", service: d?.service ?? "", wa })};${COMMON}${script}</script></body></html>`;
}
