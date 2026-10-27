// Arte do Castle Rescue em SVG feito à mão (estilo desenho de jogo de celular: contorno escuro, degradê e brilho).
// Cada desenho vira uma imagem uma vez só; o jogo desenha as imagens no canvas.

const OUT = "#2d1b4e"; // contorno

const kingBody = (arms: string) => `
  <ellipse cx="60" cy="152" rx="34" ry="6" fill="rgba(0,0,0,0.25)"/>
  <defs>
    <linearGradient id="robe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b5cf0"/><stop offset="1" stop-color="#5a2aa8"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff07a"/><stop offset="0.5" stop-color="#ffc21f"/><stop offset="1" stop-color="#d98a00"/></linearGradient>
    <radialGradient id="skin" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#ffe2c8"/><stop offset="1" stop-color="#f4b48a"/></radialGradient>
  </defs>
  <path d="M30 150 Q26 112 38 84 L82 84 Q94 112 90 150 Z" fill="url(#robe)" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M57 86 L63 86 L63 150 L57 150 Z" fill="url(#gold)" stroke="${OUT}" stroke-width="2"/>
  <path d="M28 140 Q60 152 92 140 L92 150 Q60 160 28 150 Z" fill="#fff" stroke="${OUT}" stroke-width="3"/>
  <circle cx="40" cy="147" r="1.6" fill="${OUT}"/><circle cx="52" cy="150" r="1.6" fill="${OUT}"/><circle cx="68" cy="150" r="1.6" fill="${OUT}"/><circle cx="80" cy="147" r="1.6" fill="${OUT}"/>
  ${arms}
  <path d="M34 88 Q40 76 60 78 Q80 76 86 88 Q80 96 60 94 Q40 96 34 88 Z" fill="#fff" stroke="${OUT}" stroke-width="3"/>
  <circle cx="46" cy="88" r="1.5" fill="${OUT}"/><circle cx="60" cy="90" r="1.5" fill="${OUT}"/><circle cx="74" cy="88" r="1.5" fill="${OUT}"/>`;

const kingHead = (face: string) => `
  <circle cx="60" cy="52" r="27" fill="url(#skin)" stroke="${OUT}" stroke-width="3.5"/>
  <path d="M36 58 Q34 84 60 92 Q86 84 84 58 Q78 70 72 66 Q66 74 60 68 Q54 74 48 66 Q42 70 36 58 Z" fill="#f7f4ee" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>
  ${face}
  <path d="M34 34 L30 10 L44 22 L60 4 L76 22 L90 10 L86 34 Z" fill="url(#gold)" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>
  <rect x="33" y="28" width="54" height="9" rx="3" fill="url(#gold)" stroke="${OUT}" stroke-width="3"/>
  <circle cx="60" cy="18" r="4.5" fill="#e8384b" stroke="${OUT}" stroke-width="2"/>
  <circle cx="44" cy="32.5" r="2.6" fill="#3b8cff" stroke="${OUT}" stroke-width="1.5"/>
  <circle cx="76" cy="32.5" r="2.6" fill="#3b8cff" stroke="${OUT}" stroke-width="1.5"/>
  <path d="M40 14 L42 10" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`;

const hand = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="7" fill="url(#skin)" stroke="${OUT}" stroke-width="3"/>`;
const sleeve = (d: string) => `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="15" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#7d43d6" stroke-width="9.5" stroke-linecap="round"/>`;

const KING = {
  idle: kingBody(sleeve("M38 96 Q26 110 30 122") + hand(30, 124) + sleeve("M82 96 Q94 110 90 122") + hand(90, 124)) + kingHead(`
    <circle cx="44" cy="58" r="5" fill="#ff9aa0" opacity="0.7"/><circle cx="76" cy="58" r="5" fill="#ff9aa0" opacity="0.7"/>
    <ellipse cx="50" cy="48" rx="4.5" ry="5.5" fill="#fff" stroke="${OUT}" stroke-width="2"/><ellipse cx="70" cy="48" rx="4.5" ry="5.5" fill="#fff" stroke="${OUT}" stroke-width="2"/>
    <circle cx="51" cy="49" r="2.6" fill="${OUT}"/><circle cx="71" cy="49" r="2.6" fill="${OUT}"/><circle cx="52" cy="48" r="0.9" fill="#fff"/><circle cx="72" cy="48" r="0.9" fill="#fff"/>
    <path d="M44 40 Q50 37 55 40 M65 40 Q70 37 76 40" stroke="${OUT}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="60" cy="56" rx="4.5" ry="3.8" fill="#f29a76" stroke="${OUT}" stroke-width="2"/>
    <path d="M48 64 Q54 60 60 64 Q66 60 72 64 Q66 68 60 65 Q54 68 48 64 Z" fill="#fff" stroke="${OUT}" stroke-width="2"/>
    <path d="M54 72 Q60 77 66 72" stroke="${OUT}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`),
  scared: kingBody(sleeve("M38 96 Q30 80 38 66") + hand(38, 64) + sleeve("M82 96 Q90 80 82 66") + hand(82, 64)) + kingHead(`
    <ellipse cx="50" cy="47" rx="6.5" ry="8" fill="#fff" stroke="${OUT}" stroke-width="2"/><ellipse cx="70" cy="47" rx="6.5" ry="8" fill="#fff" stroke="${OUT}" stroke-width="2"/>
    <circle cx="50" cy="48" r="2" fill="${OUT}"/><circle cx="70" cy="48" r="2" fill="${OUT}"/>
    <path d="M42 36 Q49 31 55 35 M65 35 Q71 31 78 36" stroke="${OUT}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="60" cy="57" rx="4.5" ry="3.8" fill="#f29a76" stroke="${OUT}" stroke-width="2"/>
    <ellipse cx="60" cy="73" rx="6" ry="8" fill="#5a1d2a" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M85 34 Q90 42 86 46 Q81 44 85 34 Z" fill="#7cc8ff" stroke="${OUT}" stroke-width="1.5"/>`),
  happy: kingBody(sleeve("M38 96 Q22 80 22 62") + hand(22, 60) + sleeve("M82 96 Q98 80 98 62") + hand(98, 60)) + kingHead(`
    <circle cx="44" cy="58" r="5.5" fill="#ff8a95" opacity="0.8"/><circle cx="76" cy="58" r="5.5" fill="#ff8a95" opacity="0.8"/>
    <path d="M44 50 Q50 42 56 50 M64 50 Q70 42 76 50" stroke="${OUT}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="60" cy="57" rx="4.5" ry="3.8" fill="#f29a76" stroke="${OUT}" stroke-width="2"/>
    <path d="M48 66 Q60 86 72 66 Z" fill="#5a1d2a" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M53 75 Q60 81 67 75 Q60 72 53 75 Z" fill="#ff6b7a"/>`),
};

const DRAGON = (hurt: boolean) => `
  <defs>
    <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7be06a"/><stop offset="1" stop-color="#2f9a3e"/></linearGradient>
    <linearGradient id="belly" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b8"/><stop offset="1" stop-color="#f2c96a"/></linearGradient>
  </defs>
  <path d="M40 34 L30 4 L56 26 Z M120 34 L130 4 L104 26 Z" fill="#fff0c8" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M62 18 L70 4 L76 18 Z M84 18 L90 4 L98 18 Z" fill="#ff7a3d" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M24 120 Q16 70 40 36 Q80 6 120 36 Q144 70 136 120 Z" fill="url(#dg)" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M44 120 Q46 92 80 88 Q114 92 116 120 Z" fill="url(#belly)" stroke="${OUT}" stroke-width="3"/>
  <path d="M50 100 L110 100 M48 110 L112 110" stroke="#d9a94a" stroke-width="2"/>
  ${hurt
    ? `<path d="M46 50 L64 60 M64 50 L46 60 M96 50 L114 60 M114 50 L96 60" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>`
    : `<ellipse cx="55" cy="54" rx="13" ry="12" fill="#fff36b" stroke="${OUT}" stroke-width="3"/><ellipse cx="105" cy="54" rx="13" ry="12" fill="#fff36b" stroke="${OUT}" stroke-width="3"/>
       <ellipse cx="57" cy="56" rx="3.2" ry="8" fill="${OUT}"/><ellipse cx="103" cy="56" rx="3.2" ry="8" fill="${OUT}"/>
       <circle cx="52" cy="50" r="2.4" fill="#fff"/><circle cx="100" cy="50" r="2.4" fill="#fff"/>
       <path d="M38 38 L66 46 M122 38 L94 46" stroke="${OUT}" stroke-width="5" stroke-linecap="round"/>`}
  <ellipse cx="70" cy="74" rx="3" ry="2.2" fill="${OUT}"/><ellipse cx="90" cy="74" rx="3" ry="2.2" fill="${OUT}"/>
  <path d="M52 80 Q80 ${hurt ? 92 : 98} 108 80" fill="${hurt ? "none" : "#7a1d2a"}" stroke="${OUT}" stroke-width="3.5" stroke-linecap="round"/>
  ${hurt ? "" : `<path d="M60 83 L64 91 L68 85 Z M92 85 L96 91 L100 83 Z" fill="#fff" stroke="${OUT}" stroke-width="1.5"/>`}`;

const ICON = [
  // coroa
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff38a"/><stop offset="0.55" stop-color="#ffc21f"/><stop offset="1" stop-color="#e08a00"/></linearGradient></defs>
   <path d="M6 30 L4 11 L13 18 L20 6 L27 18 L36 11 L34 30 Z" fill="url(#g)" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>
   <rect x="6" y="27" width="28" height="6" rx="2" fill="#f0a400" stroke="${OUT}" stroke-width="2.5"/>
   <circle cx="20" cy="21" r="3" fill="#e8384b" stroke="${OUT}" stroke-width="1.5"/><path d="M9 15 L11 21" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`,
  // folha
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9af07a"/><stop offset="1" stop-color="#1f9a45"/></linearGradient></defs>
   <path d="M6 32 Q4 10 32 6 Q36 30 6 32 Z" fill="url(#g)" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>
   <path d="M8 30 Q18 20 30 9" stroke="#176b31" stroke-width="2" fill="none" stroke-linecap="round"/>
   <path d="M12 14 Q16 10 22 9" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.7"/>`,
  // rubi
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a95"/><stop offset="0.5" stop-color="#e8384b"/><stop offset="1" stop-color="#a51b2e"/></linearGradient></defs>
   <path d="M11 5 L29 5 L36 14 L20 35 L4 14 Z" fill="url(#g)" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>
   <path d="M4 14 L36 14 M11 5 L15 14 L20 35 L25 14 L29 5" stroke="#b3203a" stroke-width="1.5" fill="none"/>
   <path d="M12 8 L16 8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.9"/>`,
  // gota
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd0ff"/><stop offset="1" stop-color="#1f6fe0"/></linearGradient></defs>
   <path d="M20 3 Q33 18 33 25 A13 13 0 0 1 7 25 Q7 18 20 3 Z" fill="url(#g)" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>
   <ellipse cx="14" cy="24" rx="3" ry="5" fill="#fff" opacity="0.75"/>`,
];

const ROCKET = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb35a"/><stop offset="1" stop-color="#e8551f"/></linearGradient></defs>
  <path d="M4 20 L12 12 L12 16 L28 16 L28 12 L36 20 L28 28 L28 24 L12 24 L12 28 Z" fill="url(#g)" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="20" cy="20" r="4" fill="#ffe07a" stroke="${OUT}" stroke-width="2"/>`;

function svgImage(svg: string, vb: string, w: number, h: number) {
  const img = new Image();
  img.width = w;
  img.height = h;
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">${svg}</svg>`);
  return img;
}

export const ART = {
  king: { idle: svgImage(KING.idle, "0 0 120 160", 240, 320), scared: svgImage(KING.scared, "0 0 120 160", 240, 320), happy: svgImage(KING.happy, "0 0 120 160", 240, 320) },
  dragon: { idle: svgImage(DRAGON(false), "0 0 160 122", 320, 244), hurt: svgImage(DRAGON(true), "0 0 160 122", 320, 244) },
  icons: ICON.map((s) => svgImage(s, "0 0 40 40", 120, 120)),
  rocket: svgImage(ROCKET, "0 0 40 40", 120, 120),
};
export const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;
