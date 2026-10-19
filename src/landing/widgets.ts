// Animações interativas por ramo (Premium e site da PáginasPro). Desenho e código próprios, sem serviço pago.
// Conteúdo educativo e dentro das regras dos conselhos: sem antes/depois, sem promessa de resultado, sem diagnóstico.
// Cada widget usa as variáveis --wp (cor principal), --wi (texto) e --ws (fundo claro), definidas no .wg.
// Uso: widgetFor(ramo) -> tipo ou null; widgetHtml(tipo) -> HTML; WIDGET_CSS e WIDGET_JS uma vez por página.

export type WidgetKind = "plate" | "tooth" | "body" | "breath" | "skin";

export function widgetFor(niche: string): WidgetKind | null {
  const n = niche.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/nutri/.test(n)) return "plate";
  if (/odonto|dent|ortodon|sorriso/.test(n)) return "tooth";
  if (/psico|terapeuta|psiquiat|terapia/.test(n)) return "breath";
  if (/estet|dermat|pele|biomed|cosmet/.test(n)) return "skin";
  if (/fisio|pilates|quiropr|ortoped|osteop|reabilit|clinica|medic|saude|acupunt|massag/.test(n)) return "body";
  return null;
}

export const WIDGET_TITLE: Record<WidgetKind, [string, string]> = {
  plate: ["Monte seu prato", "Toque nos grupos de alimentos e veja como fica um prato equilibrado."],
  tooth: ["Conheça o seu dente", "Mexa no dente e toque em cada camada para ver o que cuida dela."],
  body: ["Onde está o incômodo?", "Toque no ponto do corpo e veja como a avaliação ajuda."],
  breath: ["Respire com a gente", "Um minuto de respiração guiada para desacelerar agora."],
  skin: ["Por dentro da sua pele", "Toque em cada camada e veja quais cuidados agem nela."],
};

const PLATE = `
<div class="wg-plate">
  <div class="wg-stage">
    <svg viewBox="0 0 240 240" class="wg-dish" aria-label="Prato">
      <circle cx="120" cy="120" r="112" fill="#fff" stroke="var(--wl)" stroke-width="3"/>
      <circle cx="120" cy="120" r="92" fill="#fafaf7" stroke="var(--wl)" stroke-width="1.5"/>
      <path class="wg-part" data-part="veg" d="M120 120 L120 28 A92 92 0 0 0 120 212 Z" fill="#7FB069"/>
      <path class="wg-part" data-part="prot" d="M120 120 L120 212 A92 92 0 0 0 212 120 Z" fill="#D9825B"/>
      <path class="wg-part" data-part="carb" d="M120 120 L212 120 A92 92 0 0 0 120 28 Z" fill="#E8C468"/>
      <circle cx="120" cy="120" r="92" fill="none" stroke="#fff" stroke-width="0"/>
    </svg>
    <span class="wg-side wg-fruit" data-part="fruit">🍎</span>
    <span class="wg-side wg-water" data-part="water">💧</span>
  </div>
  <div class="wg-panel">
    <div class="wg-chips">
      <button type="button" data-add="veg"><i style="background:#7FB069"></i>Verduras e legumes</button>
      <button type="button" data-add="prot"><i style="background:#D9825B"></i>Proteínas</button>
      <button type="button" data-add="carb"><i style="background:#E8C468"></i>Carboidratos</button>
      <button type="button" data-add="fruit"><i style="background:#E05A5A"></i>Fruta</button>
      <button type="button" data-add="water"><i style="background:#5AA9E6"></i>Água</button>
    </div>
    <p class="wg-msg" aria-live="polite">Toque nos grupos para montar o prato.</p>
    <div class="wg-water-calc">
      <label>Quanto de água por dia? <b><span class="wg-kg">70</span> kg</b></label>
      <input type="range" min="30" max="150" value="70" class="wg-range" aria-label="Seu peso">
      <p class="wg-big"><span class="wg-l">2,5</span> litros <small>estimativa geral (35 ml por kg); a nutricionista ajusta para você</small></p>
    </div>
  </div>
</div>`;

const TOOTH = `
<div class="wg-tooth">
  <div class="wg-stage wg-tilt">
    <svg viewBox="0 0 220 300" class="wg-svg" aria-label="Dente em camadas">
      <path class="wg-layer" data-l="root" d="M58 150 C58 210 66 270 84 288 C96 276 100 230 110 200 C120 230 124 276 136 288 C154 270 162 210 162 150 Z" fill="#EFE3C8"/>
      <path class="wg-layer" data-l="enamel" d="M48 150 C40 98 46 40 80 26 C96 20 104 30 110 30 C116 30 124 20 140 26 C174 40 180 98 172 150 Z" fill="#FBFBF7" stroke="#e6e2d6" stroke-width="2"/>
      <path class="wg-layer" data-l="dentin" d="M64 150 C58 106 62 58 86 46 C98 42 104 50 110 50 C116 50 122 42 134 46 C158 58 162 106 156 150 Z" fill="#F1E2B8"/>
      <path class="wg-layer" data-l="pulp" d="M92 150 C90 120 94 86 104 78 C108 76 112 76 116 78 C126 86 130 120 128 150 L122 230 C118 246 112 252 110 252 C108 252 102 246 98 230 Z" fill="#E88A8A"/>
      <path class="wg-layer" data-l="gum" d="M10 150 C40 128 70 140 110 136 C150 140 180 128 210 150 L210 175 L10 175 Z" fill="#F2A7A7" fill-opacity=".92"/>
    </svg>
  </div>
  <div class="wg-panel">
    <div class="wg-chips">
      <button type="button" data-pick="enamel">Esmalte</button><button type="button" data-pick="dentin">Dentina</button><button type="button" data-pick="pulp">Polpa</button><button type="button" data-pick="root">Raiz</button><button type="button" data-pick="gum">Gengiva</button>
    </div>
    <div class="wg-card" aria-live="polite"><h4>Toque numa camada</h4><p>Cada parte do dente tem um cuidado diferente. Na avaliação, o dentista vê o que o seu sorriso precisa.</p></div>
  </div>
</div>`;

const BODY = `
<div class="wg-body">
  <div class="wg-stage">
    <svg viewBox="0 0 200 340" class="wg-svg" aria-label="Corpo humano">
      <g fill="#fff" stroke="var(--wl)" stroke-width="2">
        <rect x="40" y="70" width="20" height="116" rx="10" transform="rotate(10 50 74)"/>
        <rect x="140" y="70" width="20" height="116" rx="10" transform="rotate(-10 150 74)"/>
        <rect x="70" y="170" width="27" height="156" rx="13"/>
        <rect x="103" y="170" width="27" height="156" rx="13"/>
        <rect x="60" y="64" width="80" height="122" rx="28"/>
        <rect x="91" y="50" width="18" height="20" rx="6"/>
        <circle cx="100" cy="32" r="22"/>
      </g>
      <g class="wg-dots">
        <circle data-spot="neck" cx="100" cy="60" r="8"/><circle data-spot="shoulder" cx="66" cy="78" r="8"/><circle data-spot="back" cx="100" cy="150" r="8"/>
        <circle data-spot="wrist" cx="168" cy="176" r="8"/><circle data-spot="knee" cx="84" cy="252" r="8"/><circle data-spot="ankle" cx="116" cy="314" r="8"/>
      </g>
    </svg>
  </div>
  <div class="wg-panel">
    <div class="wg-card" aria-live="polite"><h4>Toque num ponto</h4><p>Dor que volta ou que limita o seu dia merece uma avaliação. Toque no corpo para ver como ela funciona.</p></div>
    <p class="wg-note">Conteúdo informativo, não substitui consulta.</p>
  </div>
</div>`;

const BREATH = `
<div class="wg-breath">
  <div class="wg-stage">
    <div class="wg-ring"><div class="wg-orb"></div><span class="wg-say">Toque em começar</span></div>
  </div>
  <div class="wg-panel">
    <p class="wg-lead">Inspire em 4 tempos, segure 4, solte em 6. Respirar devagar pode ajudar a acalmar o corpo.</p>
    <button type="button" class="wg-go">Começar</button>
    <p class="wg-count" aria-live="polite"></p>
    <p class="wg-note">Para ansiedade que atrapalha a rotina, conversar com um profissional faz diferença.</p>
  </div>
</div>`;

const SKIN = `
<div class="wg-skin">
  <div class="wg-stage">
    <svg viewBox="0 0 300 220" class="wg-svg" aria-label="Camadas da pele">
      <path class="wg-layer" data-l="hypo" d="M10 140 L290 140 L290 210 L10 210 Z" fill="#F6D9A8"/>
      <path class="wg-layer" data-l="derm" d="M10 70 L290 70 L290 140 L10 140 Z" fill="#F1B7A6"/>
      <path class="wg-layer" data-l="epi" d="M10 40 C60 30 100 46 150 38 C200 30 240 46 290 38 L290 70 L10 70 Z" fill="#F7D0C2"/>
      <g stroke="#C9776A" stroke-width="2" fill="none" opacity=".55"><path d="M60 70 C64 95 56 115 62 138"/><path d="M150 70 C146 92 156 112 150 138"/><path d="M230 70 C236 96 226 116 232 138"/></g>
      <g fill="#fff" opacity=".7"><circle cx="40" cy="170" r="12"/><circle cx="80" cy="182" r="14"/><circle cx="130" cy="168" r="11"/><circle cx="180" cy="182" r="15"/><circle cx="230" cy="170" r="12"/><circle cx="270" cy="186" r="10"/></g>
    </svg>
  </div>
  <div class="wg-panel">
    <div class="wg-chips"><button type="button" data-pick="epi">Epiderme</button><button type="button" data-pick="derm">Derme</button><button type="button" data-pick="hypo">Hipoderme</button></div>
    <div class="wg-card" aria-live="polite"><h4>Toque numa camada</h4><p>Cada cuidado age numa profundidade da pele. Na avaliação, a profissional indica o que faz sentido para você.</p></div>
  </div>
</div>`;

const HTML: Record<WidgetKind, string> = { plate: PLATE, tooth: TOOTH, body: BODY, breath: BREATH, skin: SKIN };

export function widgetHtml(kind: WidgetKind) {
  return `<div class="wg" data-wg="${kind}">${HTML[kind]}</div>`;
}

export const WIDGET_CSS = `
.wg{--wl:color-mix(in srgb,var(--wi) 16%,transparent);background:#fff;border:1px solid var(--wl);border-radius:30px;padding:clamp(18px,3vw,34px);color:var(--wi);font-size:16px;line-height:1.5}
.wg>div{display:grid;grid-template-columns:1fr 1fr;gap:clamp(18px,4vw,44px);align-items:center}
.wg-stage{position:relative;display:grid;place-items:center;min-height:300px;background:var(--ws);border-radius:24px;padding:20px;perspective:900px}
.wg-svg,.wg-dish{width:100%;max-width:300px;height:auto;overflow:visible}
.wg-chips{display:flex;flex-wrap:wrap;gap:8px}
.wg-chips button{font:inherit;font-size:14px;font-weight:600;display:inline-flex;align-items:center;gap:8px;border:1.5px solid var(--wl);background:#fff;color:var(--wi);border-radius:999px;padding:9px 14px;cursor:pointer;transition:background .2s,border-color .2s,transform .15s}
.wg-chips button:active{transform:scale(.96)}
.wg-chips button i{width:10px;height:10px;border-radius:50%}
.wg-chips button[aria-pressed=true]{border-color:var(--wp);background:var(--ws)}
.wg-card{margin-top:16px;background:var(--ws);border-radius:20px;padding:18px 20px;min-height:132px}
.wg-card h4{font-size:19px;margin-bottom:6px;color:var(--wi)}
.wg-card p{color:color-mix(in srgb,var(--wi) 70%,#fff)}
.wg-card .wg-tag{display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:var(--wp)}
.wg-note{margin-top:12px;font-size:12.5px;color:color-mix(in srgb,var(--wi) 55%,#fff)}
.wg-msg{margin-top:14px;font-weight:600;min-height:48px}
.wg-part{transform-origin:120px 120px;transform:scale(0);transition:transform .55s cubic-bezier(.2,.9,.2,1.25)}
.wg-part.on{transform:scale(1)}
.wg-side{position:absolute;font-size:38px;transform:scale(0);transition:transform .5s cubic-bezier(.2,.9,.2,1.3)}
.wg-side.on{transform:scale(1)}
.wg-fruit{left:6%;bottom:8%}.wg-water{right:6%;top:8%}
.wg-water-calc{margin-top:18px;border-top:1px solid var(--wl);padding-top:16px}
.wg-water-calc label{display:flex;justify-content:space-between;font-size:14px}
.wg-range{width:100%;margin:12px 0 6px;accent-color:var(--wp)}
.wg-big{font-size:15px}.wg-big .wg-l{font-size:34px;font-weight:800;color:var(--wp)}
.wg-big small{display:block;font-size:12px;color:color-mix(in srgb,var(--wi) 55%,#fff)}
.wg-tilt .wg-svg{transition:transform .4s cubic-bezier(.2,.8,.2,1);transform:rotateY(-12deg) rotateX(6deg);filter:drop-shadow(0 24px 24px rgba(0,0,0,.14))}
.wg-layer{cursor:pointer;transition:opacity .3s,transform .4s cubic-bezier(.2,.9,.2,1.2),filter .3s}
.wg-pick .wg-layer{opacity:.5}
.wg-pick .wg-layer.on{opacity:1;stroke:var(--wp);stroke-width:3}
.wg-skin .wg-layer.on{transform:translateY(-6px)}
.wg-dots circle{fill:var(--wp);cursor:pointer;transform-box:fill-box;transform-origin:center;animation:wgp 1.8s ease-in-out infinite}
.wg-dots circle.on{fill:var(--wi);animation:none;transform:scale(1.3)}
@keyframes wgp{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.35);opacity:.65}}
.wg-ring{width:min(240px,70vw);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;position:relative;background:radial-gradient(circle,#fff 0,var(--ws) 70%)}
.wg-orb{position:absolute;inset:18%;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,var(--wp));opacity:.85;transform:scale(.55);transition:transform 4s cubic-bezier(.45,0,.55,1)}
.wg-say{position:relative;font-weight:700;font-size:18px;color:var(--wi);text-align:center;padding:0 18px}
.wg-lead{font-size:16px}
.wg-go{margin-top:16px;font:inherit;font-weight:700;border:0;border-radius:999px;padding:13px 22px;background:var(--wp);color:#fff;cursor:pointer}
.wg-count{margin-top:10px;font-size:14px;font-weight:600;color:var(--wp);min-height:22px}
@media (max-width:760px){.wg>div{grid-template-columns:1fr}.wg-stage{min-height:240px}}
@media (prefers-reduced-motion:reduce){.wg *{animation:none!important;transition:none!important}}
`;

const T = {
  tooth: {
    enamel: ["Esmalte", "A camada mais dura do corpo, que protege o dente. É a camada envolvida no clareamento, na limpeza e nas lentes e facetas.", "Clareamento · facetas · prevenção"],
    dentin: ["Dentina", "Fica logo abaixo do esmalte e é mais sensível. Quando a cárie chega aqui, a restauração (por exemplo, com resina) reconstrói a parte perdida.", "Restauração · sensibilidade"],
    pulp: ["Polpa", "O centro vivo do dente, com nervos e vasos. Quando inflama, o tratamento de canal é uma das opções que o dentista avalia.", "Tratamento de canal"],
    root: ["Raiz", "Prende o dente no osso. Quando um dente se perde, o implante é uma das formas de substituir a raiz, depois de avaliação.", "Implantes · prótese"],
    gum: ["Gengiva", "Protege a raiz. Sangramento ao escovar é sinal de alerta: quanto antes o dentista avaliar, mais simples costuma ser o cuidado.", "Limpeza · periodontia"],
  },
  skin: {
    epi: ["Epiderme", "A camada de fora, que se renova sozinha. Limpeza de pele, peeling e hidratação são cuidados dessa camada.", "Limpeza de pele · peeling · hidratação"],
    derm: ["Derme", "Onde ficam o colágeno e a elasticidade. Procedimentos como microagulhamento e bioestimuladores são feitos pensando nessa camada.", "Microagulhamento · bioestimuladores"],
    hypo: ["Hipoderme", "A camada de gordura que dá suporte e contorno. É a região considerada em drenagem e protocolos corporais.", "Drenagem · protocolos corporais"],
  },
  body: {
    neck: ["Pescoço", "Tensão de celular e computador costuma pesar aqui. Na avaliação vemos postura, movimento e o que alivia no seu dia a dia."],
    shoulder: ["Ombro", "Dor ao levantar o braço ou para dormir de lado tem várias causas. Testes simples na avaliação mostram o caminho do tratamento."],
    back: ["Coluna e lombar", "A dor nas costas é das queixas mais comuns. A avaliação ajuda a entender a causa e a montar exercícios e cuidados para a sua rotina."],
    wrist: ["Punho e mão", "Formigamento ou dor ao digitar merece atenção cedo. A avaliação vê força, movimento e o que mudar no trabalho."],
    knee: ["Joelho", "Estalo, inchaço ou dor para subir escada merecem atenção. A avaliação mostra o que está envolvido e quais exercícios são indicados para você."],
    ankle: ["Tornozelo e pé", "Torção que não sarou direito ou dor ao pisar: a avaliação identifica o que falta e orienta a reabilitação."],
  },
  plate: {
    veg: "Verduras e legumes: metade do prato. Fibras, vitaminas e saciedade.",
    prot: "Proteínas: um quarto do prato. Carnes, ovos, feijão, lentilha.",
    carb: "Carboidratos: um quarto do prato. Arroz, batata, mandioca, massa.",
    fruit: "Fruta de sobremesa: doce natural e mais fibras.",
    water: "Água ao longo do dia. Veja quanto abaixo.",
    all: "Prato equilibrado! Cada pessoa tem necessidades diferentes: a nutricionista monta o plano certo para você.",
  },
};

export const WIDGET_JS = `
(function(){
  var T = ${JSON.stringify(T)};
  function card(root, h, p, tag){ var c = root.querySelector('.wg-card'); c.innerHTML = '<h4>' + h + '</h4><p>' + p + '</p>' + (tag ? '<span class="wg-tag">' + tag + '</span>' : ''); }
  function press(root, attr, v){ root.querySelectorAll('[' + attr + ']').forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute(attr) === v ? 'true' : 'false'); }); }
  document.querySelectorAll('.wg').forEach(function(root){
    var kind = root.getAttribute('data-wg');
    if (kind === 'plate') {
      var on = {};
      root.querySelectorAll('[data-add]').forEach(function(b){ b.onclick = function(){
        var k = b.getAttribute('data-add'); on[k] = !on[k];
        root.querySelectorAll('[data-part="' + k + '"]').forEach(function(el){ el.classList.toggle('on', !!on[k]); });
        b.setAttribute('aria-pressed', on[k] ? 'true' : 'false');
        var all = ['veg','prot','carb','fruit','water'].every(function(x){ return on[x]; });
        root.querySelector('.wg-msg').textContent = all ? T.plate.all : (on[k] ? T.plate[k] : 'Toque nos grupos para montar o prato.');
      }; });
      var r = root.querySelector('.wg-range');
      var upd = function(){ root.querySelector('.wg-kg').textContent = r.value; root.querySelector('.wg-l').textContent = (r.value * 0.035).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }); };
      r.oninput = upd; upd();
    }
    if (kind === 'tooth' || kind === 'skin') {
      var data = T[kind], svg = root.querySelector('.wg-svg');
      var pick = function(l){
        svg.classList.add('wg-pick');
        root.querySelectorAll('.wg-layer').forEach(function(el){ el.classList.toggle('on', el.getAttribute('data-l') === l); });
        press(root, 'data-pick', l); card(root, data[l][0], data[l][1], data[l][2]);
      };
      root.querySelectorAll('.wg-layer').forEach(function(el){ el.addEventListener('click', function(){ pick(el.getAttribute('data-l')); }); });
      root.querySelectorAll('[data-pick]').forEach(function(b){ b.onclick = function(){ pick(b.getAttribute('data-pick')); }; });
      var st = root.querySelector('.wg-tilt');
      if (st) {
        st.addEventListener('pointermove', function(e){ var b = st.getBoundingClientRect(); svg.style.transform = 'rotateY(' + (((e.clientX - b.left) / b.width - .5) * 50) + 'deg) rotateX(' + (-((e.clientY - b.top) / b.height - .5) * 30) + 'deg)'; });
        st.addEventListener('pointerleave', function(){ svg.style.transform = ''; });
      }
    }
    if (kind === 'body') {
      root.querySelectorAll('[data-spot]').forEach(function(c){ c.addEventListener('click', function(){
        var k = c.getAttribute('data-spot');
        root.querySelectorAll('[data-spot]').forEach(function(x){ x.classList.toggle('on', x === c); });
        card(root, T.body[k][0], T.body[k][1], 'Agende sua avaliação');
      }); });
    }
    if (kind === 'breath') {
      var orb = root.querySelector('.wg-orb'), say = root.querySelector('.wg-say'), cnt = root.querySelector('.wg-count'), btn = root.querySelector('.wg-go'), timer = null;
      var steps = [['Inspire', 4000, 1], ['Segure', 4000, 1], ['Solte o ar', 6000, .55]];
      function stop(){ clearTimeout(timer); timer = null; orb.style.transitionDuration = '1s'; orb.style.transform = 'scale(.55)'; say.textContent = 'Toque em começar'; btn.textContent = 'Começar'; cnt.textContent = ''; }
      btn.onclick = function(){
        if (timer) return stop();
        var i = 0, round = 0; btn.textContent = 'Parar';
        (function next(){
          var s = steps[i % 3]; say.textContent = s[0];
          orb.style.transitionDuration = (s[1] / 1000) + 's'; orb.style.transform = 'scale(' + s[2] + ')';
          if (i % 3 === 0) { round++; cnt.textContent = 'Ciclo ' + round + ' de 4'; }
          i++;
          timer = setTimeout(function(){ if (i >= 12) { stop(); say.textContent = 'Muito bem'; } else next(); }, s[1]);
        })();
      };
    }
  });
})();
`;
