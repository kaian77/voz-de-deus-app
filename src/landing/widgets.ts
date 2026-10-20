// Animações interativas por ramo (Premium e site da PáginasPro). Desenho e código próprios, sem serviço pago.
// Conteúdo educativo e dentro das regras dos conselhos: sem antes/depois, sem promessa de resultado, sem diagnóstico.
// Cada widget usa as variáveis --wp (cor principal), --wi (texto) e --ws (fundo claro), definidas no .wg.
// Uso: widgetFor(ramo) -> tipo ou null; widgetHtml(tipo) -> HTML; WIDGET_CSS e WIDGET_JS uma vez por página.

export type WidgetKind = "plate" | "tooth" | "body" | "breath" | "skin" | "law" | "makeup";

export function widgetFor(niche: string): WidgetKind | null {
  const n = niche.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/nutri/.test(n)) return "plate";
  if (/advoca|advog|jurid|direito|escritorio de adv/.test(n)) return "law";
  if (/odonto|dent|ortodon|sorriso/.test(n)) return "tooth";
  if (/psico|terapeuta|psiquiat|terapia/.test(n)) return "breath";
  if (/maqui|makeup|make up|\bmake\b|noiva|beauty|beleza/.test(n)) return "makeup";
  if (/estet|dermat|pele|biomed|cosmet/.test(n)) return "skin";
  if (/fisio|pilates|quiropr|ortoped|osteop|reabilit|clinica|medic|saude|acupunt|massag/.test(n)) return "body";
  return null;
}

export const WIDGET_TITLE: Record<WidgetKind, [string, string]> = {
  plate: ["Monte seu prato", "Toque nos grupos de alimentos e veja como fica um prato equilibrado."],
  tooth: ["Conheça o seu dente", "Mexa no dente e toque em cada camada para ver o que cuida dela."],
  body: ["Onde está o incômodo?", "Toque no ponto do corpo e veja como a avaliação ajuda."],
  breath: ["Respire com a gente", "Um minuto de respiração guiada para desacelerar agora."],
  law: ["Como funciona o seu caso", "Escolha o assunto e toque em cada etapa para entender o caminho, do primeiro contato à solução."],
  skin: ["Por dentro da sua pele", "Toque em cada camada e veja quais cuidados agem nela."],
  makeup: ["Monte a make passo a passo", "Toque em cada etapa e veja como uma maquiagem profissional é construída, da pele à finalização."],
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

const LAW = `
<div class="wg-law">
  <div class="wg-stage wg-law-stage">
    <div class="wg-chips wg-areas"><button type="button" data-area="familia" aria-pressed="true">Família</button><button type="button" data-area="trabalho">Trabalhista</button><button type="button" data-area="consumidor">Consumidor</button><button type="button" data-area="inss">Previdenciário</button></div>
    <ol class="wg-line"></ol>
  </div>
  <div class="wg-panel">
    <div class="wg-card" aria-live="polite"><h4>Toque numa etapa</h4><p>Cada caso é único. A primeira conversa serve para entender a sua situação e explicar os caminhos possíveis.</p></div>
    <div class="wg-bring"><h5>O que levar na primeira conversa</h5><ul class="wg-list"></ul></div>
    <p class="wg-note">Conteúdo informativo. Prazos e resultados dependem de cada caso.</p>
  </div>
</div>`;


const MAKEUP = `
<div class="wg-mk">
  <div class="wg-stage">
    <svg viewBox="0 0 240 280" class="wg-svg wg-face" aria-label="Rosto com as etapas da maquiagem">
      <defs>
        <radialGradient id="wgGlow" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <ellipse cx="120" cy="112" rx="90" ry="100" fill="#3B2A24"/>
      <rect x="30" y="104" width="180" height="150" rx="44" fill="#3B2A24"/>
      <path d="M34 280 C44 244 86 236 120 236 C154 236 196 244 206 280 Z" fill="var(--wp)" opacity=".85"/>
      <rect x="99" y="190" width="42" height="56" rx="16" fill="#D6A782"/>
      <ellipse cx="120" cy="126" rx="64" ry="80" fill="#E2B794"/>
      <g data-raw="base" fill="#C99470" opacity=".55"><ellipse cx="97" cy="140" rx="13" ry="5"/><ellipse cx="143" cy="140" rx="13" ry="5"/><circle cx="82" cy="156" r="2.6"/><circle cx="160" cy="104" r="2.4"/><circle cx="150" cy="164" r="2.2"/></g>
      <ellipse data-mk="base" cx="120" cy="126" rx="64" ry="80" fill="#EBC5A4"/>
      <ellipse data-mk="prep" cx="120" cy="112" rx="58" ry="70" fill="url(#wgGlow)"/>
      <g data-mk="eyes"><ellipse cx="97" cy="122" rx="17" ry="10" fill="#A8707C"/><ellipse cx="143" cy="122" rx="17" ry="10" fill="#A8707C"/><ellipse cx="97" cy="118" rx="12" ry="5" fill="#D9A6A0" opacity=".8"/><ellipse cx="143" cy="118" rx="12" ry="5" fill="#D9A6A0" opacity=".8"/></g>
      <g fill="#fff"><ellipse cx="97" cy="128" rx="12" ry="6.5"/><ellipse cx="143" cy="128" rx="12" ry="6.5"/></g>
      <g fill="#3B2A24"><circle cx="97" cy="128" r="4.6"/><circle cx="143" cy="128" r="4.6"/></g>
      <g data-mk="eyes" fill="none" stroke="#1d1411" stroke-width="2.6" stroke-linecap="round"><path d="M84 126 C90 119 104 119 111 125 L114 122"/><path d="M156 126 C150 119 136 119 129 125 L126 122"/></g>
      <g fill="none" stroke="#3B2A24" stroke-width="3.4" stroke-linecap="round"><path d="M84 106 C92 100 104 100 110 104"/><path d="M156 106 C148 100 136 100 130 104"/></g>
      <path d="M120 132 C117 146 113 152 116 156 C119 158 122 158 125 156" fill="none" stroke="#B98463" stroke-width="2" stroke-linecap="round"/>
      <path d="M104 174 C110 168 116 170 120 172 C124 170 130 168 136 174 C130 182 124 185 120 185 C116 185 110 182 104 174 Z" fill="#C98C7E"/>
      <path data-mk="lips" d="M104 174 C110 168 116 170 120 172 C124 170 130 168 136 174 C130 182 124 185 120 185 C116 185 110 182 104 174 Z" fill="#B23A48"/>
      <path data-mk="lips" d="M106 174 C114 176 126 176 134 174" fill="none" stroke="#7d1f2c" stroke-width="1.4" stroke-linecap="round"/>
      <g data-mk="fix"><circle cx="82" cy="152" r="13" fill="#E88F8F" opacity=".45"/><circle cx="158" cy="152" r="13" fill="#E88F8F" opacity=".45"/><ellipse cx="86" cy="140" rx="9" ry="3.5" fill="#fff" opacity=".6"/><ellipse cx="154" cy="140" rx="9" ry="3.5" fill="#fff" opacity=".6"/></g>
      <g data-mk="fix" class="wg-spark" fill="#fff"><path d="M48 70 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M196 92 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4z"/><path d="M190 196 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/></g>
      <path d="M54 118 C52 66 88 34 126 38 C168 42 190 78 186 120 C178 96 160 74 132 66 C116 84 86 100 54 118 Z" fill="#3B2A24"/>
      <ellipse class="wg-focus" cx="120" cy="126" rx="74" ry="90" fill="none" stroke="var(--wp)" stroke-width="2.5" stroke-dasharray="6 7"/>
    </svg>
  </div>
  <div class="wg-panel">
    <div class="wg-chips wg-steps"><button type="button" data-step="0"><i>1</i>Pele</button><button type="button" data-step="1"><i>2</i>Base</button><button type="button" data-step="2"><i>3</i>Olhos</button><button type="button" data-step="3"><i>4</i>Boca</button><button type="button" data-step="4"><i>5</i>Finalização</button></div>
    <div class="wg-card" aria-live="polite"><h4>Toque numa etapa</h4><p>Uma make bem feita é construída em camadas. Toque em cada etapa ou veja tudo de uma vez.</p></div>
    <button type="button" class="wg-go">Montar a make</button>
    <p class="wg-note">Conteúdo informativo. Cada pele e cada ocasião pedem escolhas diferentes.</p>
  </div>
</div>`;

const HTML: Record<WidgetKind, string> = { plate: PLATE, tooth: TOOTH, body: BODY, breath: BREATH, skin: SKIN, law: LAW, makeup: MAKEUP };

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
.wg-law-stage{display:block;place-items:initial;min-height:0;padding:20px}
.wg-line{list-style:none;padding:0;margin-top:18px;position:relative;display:grid;gap:4px}
.wg-line:before{content:"";position:absolute;left:15px;top:14px;bottom:14px;width:3px;border-radius:3px;background:var(--wl)}
.wg-line:after{content:"";position:absolute;left:15px;top:14px;width:3px;border-radius:3px;background:var(--wp);height:var(--fill,0%);transition:height .6s cubic-bezier(.2,.8,.2,1)}
.wg-line li{position:relative;z-index:1}
.wg-line button{font:inherit;display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:none;border:0;padding:9px 0;cursor:pointer;color:var(--wi);font-weight:600;font-size:15.5px}
.wg-line button i{flex:none;width:33px;height:33px;border-radius:50%;background:#fff;border:3px solid var(--wl);display:grid;place-items:center;font-style:normal;font-size:13px;font-weight:800;color:color-mix(in srgb,var(--wi) 55%,#fff);transition:background .3s,border-color .3s,color .3s,transform .3s}
.wg-line li.done button i{border-color:var(--wp);color:var(--wp)}
.wg-line li.on button i{background:var(--wp);border-color:var(--wp);color:#fff;transform:scale(1.12)}
.wg-bring{margin-top:16px}
.wg-bring h5{font-size:14px;margin-bottom:8px}
.wg-list{list-style:none;padding:0;display:grid;gap:6px}
.wg-list li{display:flex;gap:10px;font-size:14.5px;cursor:pointer;user-select:none}
.wg-list li:before{content:"";flex:none;width:18px;height:18px;margin-top:2px;border-radius:5px;border:2px solid var(--wl);background:#fff;transition:background .2s,border-color .2s}
.wg-list li.ok:before{background:var(--wp);border-color:var(--wp);box-shadow:inset 0 0 0 3px #fff}
.wg-mk [data-mk]{opacity:0;transition:opacity .7s ease}
.wg-mk [data-mk].on{opacity:1}
.wg-mk [data-raw]{transition:opacity .7s ease}
.wg-mk [data-raw].off{opacity:0}
.wg-face{max-width:260px;filter:drop-shadow(0 18px 22px rgba(0,0,0,.12))}
.wg-focus{opacity:0;transition:opacity .3s;animation:wgdash 6s linear infinite}
.wg-focus.on{opacity:1}
@keyframes wgdash{to{stroke-dashoffset:-130}}
.wg-spark.on path{transform-box:fill-box;transform-origin:center;animation:wgtw 1.6s ease-in-out infinite}
.wg-spark path:nth-child(2){animation-delay:.5s!important}.wg-spark path:nth-child(3){animation-delay:1s!important}
@keyframes wgtw{0%,100%{transform:scale(.6);opacity:.5}50%{transform:scale(1.15);opacity:1}}
.wg-steps button i{width:auto;height:auto;border-radius:0;font-style:normal;font-weight:800;color:var(--wp)}
.wg-steps button.done{border-color:color-mix(in srgb,var(--wp) 45%,transparent)}
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
  law: {
    familia: { steps: [["Primeira conversa", "Você conta a situação (divórcio, guarda, pensão, partilha) e entende os caminhos possíveis, inclusive o acordo."], ["Documentos", "Reunimos certidões e comprovantes que mostram a situação da família e dos bens."], ["Tentativa de acordo", "Quando há diálogo, o acordo costuma ser o caminho mais rápido e menos desgastante. Pode ser feito em cartório em alguns casos."], ["Processo, se preciso", "Sem acordo, o pedido vai à Justiça. Você é informado de cada movimentação."], ["Decisão e cumprimento", "Com a decisão ou o acordo homologado, acompanhamos o cumprimento do que foi definido."]], bring: ["RG e CPF", "Certidão de casamento ou nascimento dos filhos", "Comprovantes de renda", "Documentos dos bens (se houver)"] },
    trabalho: { steps: [["Primeira conversa", "Você explica o que aconteceu no trabalho: verbas não pagas, horas extras, demissão, assédio."], ["Análise dos documentos", "Conferimos carteira, contracheques e rescisão para ver o que pode ser pedido."], ["Prazo", "A ação trabalhista tem prazo: até 2 anos depois de sair da empresa. Por isso vale não deixar para depois."], ["Audiência", "Há tentativa de acordo e, se não houver, a apresentação de provas e testemunhas."], ["Sentença", "O juiz decide; ainda pode haver recurso. Você acompanha cada etapa."]], bring: ["Carteira de trabalho", "Contracheques", "Termo de rescisão (TRCT)", "Prints e mensagens do trabalho"] },
    consumidor: { steps: [["Primeira conversa", "Cobrança indevida, produto com defeito, voo cancelado, nome negativado: você conta o problema."], ["Provas", "Notas, contratos, protocolos e prints mostram o que aconteceu."], ["Tentativa de solução", "Muitas vezes uma notificação ou reclamação formal resolve antes de ir à Justiça."], ["Ação, se preciso", "Dependendo do valor, o caso pode ir ao Juizado Especial, que costuma ser mais simples."], ["Decisão", "O juiz decide sobre devolução, conserto ou indenização, conforme cada caso."]], bring: ["RG e CPF", "Nota fiscal ou contrato", "Protocolos de atendimento", "Prints, e-mails e fotos"] },
    inss: { steps: [["Primeira conversa", "Aposentadoria, auxílio por incapacidade, BPC, pensão: você explica a situação."], ["Análise do histórico", "Conferimos o CNIS (seu histórico de contribuições) e os documentos."], ["Pedido no INSS", "O pedido é feito pelo Meu INSS, com os documentos certos desde o início."], ["Perícia ou análise", "Em benefícios por incapacidade há perícia; em outros, análise dos documentos."], ["Recurso ou ação", "Se o pedido for negado, ainda dá para recorrer ou entrar na Justiça, conforme o caso."]], bring: ["RG e CPF", "Carteira de trabalho e carnês", "Extrato do CNIS (Meu INSS)", "Laudos e exames (se for por saúde)"] },
  },
  makeup: [
    ["Preparação da pele", "Limpeza, hidratação e primer deixam a pele pronta para receber a maquiagem e ajudam a base a assentar de forma uniforme.", "Limpeza · hidratação · primer", [120, 118, 66, 82]],
    ["Base e corretivo", "A base uniformiza o tom e o corretivo cuida de olheiras e pontinhos. Cor, textura e cobertura são escolhidas para o seu tipo de pele.", "Tom da pele · textura · cobertura", [120, 126, 74, 90]],
    ["Olhos", "Sombra, delineado e máscara valorizam o formato dos olhos. Do natural ao marcado, o estilo acompanha a ocasião e o seu gosto.", "Sombra · delineado · cílios", [120, 122, 52, 20]],
    ["Boca", "Contorno e cor equilibram a make: tons nude para algo leve, cores fortes para destacar. Lábio hidratado antes ajuda o batom a assentar.", "Contorno · batom · gloss", [120, 177, 26, 14]],
    ["Finalização", "Blush, iluminador, pó e spray fixador fecham a make e ajudam a manter o acabamento para eventos, ensaios e festas.", "Blush · iluminador · fixador", [120, 128, 82, 98]],
  ],
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
    if (kind === 'law') {
      var area = 'familia', line = root.querySelector('.wg-line'), list = root.querySelector('.wg-list');
      var step = function(i){
        var steps = T.law[area].steps;
        line.querySelectorAll('li').forEach(function(li, j){ li.classList.toggle('on', j === i); li.classList.toggle('done', j < i); });
        line.style.setProperty('--fill', (steps.length > 1 ? (i / (steps.length - 1)) * 100 : 0) * .92 + '%');
        card(root, steps[i][0], steps[i][1], 'Etapa ' + (i + 1) + ' de ' + steps.length);
      };
      var load = function(a){
        area = a; press(root, 'data-area', a);
        line.innerHTML = T.law[a].steps.map(function(st, i){ return '<li><button type="button"><i>' + (i + 1) + '</i>' + st[0] + '</button></li>'; }).join('');
        line.querySelectorAll('button').forEach(function(b, i){ b.onclick = function(){ step(i); }; });
        list.innerHTML = T.law[a].bring.map(function(x){ return '<li>' + x + '</li>'; }).join('');
        list.querySelectorAll('li').forEach(function(li){ li.onclick = function(){ li.classList.toggle('ok'); }; });
        step(0);
      };
      root.querySelectorAll('[data-area]').forEach(function(b){ b.onclick = function(){ load(b.getAttribute('data-area')); }; });
      load('familia');
    }
    if (kind === 'body') {
      root.querySelectorAll('[data-spot]').forEach(function(c){ c.addEventListener('click', function(){
        var k = c.getAttribute('data-spot');
        root.querySelectorAll('[data-spot]').forEach(function(x){ x.classList.toggle('on', x === c); });
        card(root, T.body[k][0], T.body[k][1], 'Agende sua avaliação');
      }); });
    }
    if (kind === 'makeup') {
      var keys = ['prep', 'base', 'eyes', 'lips', 'fix'], focus = root.querySelector('.wg-focus'), go = root.querySelector('.wg-go'), auto = null;
      var show = function(i){
        root.querySelectorAll('[data-mk]').forEach(function(el){ el.classList.toggle('on', keys.indexOf(el.getAttribute('data-mk')) <= i); });
        root.querySelectorAll('[data-raw]').forEach(function(el){ el.classList.toggle('off', i >= 1); });
        root.querySelectorAll('[data-step]').forEach(function(b, j){ b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); b.classList.toggle('done', j < i); });
        var s = T.makeup[i], f = s[3];
        focus.setAttribute('cx', f[0]); focus.setAttribute('cy', f[1]); focus.setAttribute('rx', f[2]); focus.setAttribute('ry', f[3]); focus.classList.add('on');
        card(root, s[0], s[1], s[2]);
      };
      root.querySelectorAll('[data-step]').forEach(function(b){ b.onclick = function(){ clearTimeout(auto); auto = null; go.textContent = 'Montar a make'; show(+b.getAttribute('data-step')); }; });
      go.onclick = function(){
        if (auto) { clearTimeout(auto); auto = null; go.textContent = 'Montar a make'; return; }
        var i = 0; go.textContent = 'Parar';
        (function next(){ show(i); i++; auto = i < 5 ? setTimeout(next, 2200) : null; if (!auto) go.textContent = 'Ver de novo'; })();
      };
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
