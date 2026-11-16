// Barra "Gostei, quero o meu" no fim de toda prévia: o cliente escolhe à vista (link do Mercado Pago só dele: pagou,
// o site publica sozinho) ou mensal (assinatura; o clique fica marcado para o pagamento achar a página), ou chama o
// Bruno no WhatsApp para mudar algo antes, com o link da prévia na mensagem. Dados em landing_pages.checkout,
// gravados quando a prévia fica pronta (previewCheckout em supabase/functions/_shared/prospect.ts).
import { esc } from "./render.js";

export type Checkout = {
  oneTime: number;
  oneTimeLink?: string | null;
  monthly: number;
  monthlyLink?: string | null;
  /** WhatsApp do Bruno (só dígitos) para "quero mudar algo" */
  whatsapp?: string | null;
  upgrade?: boolean;
};

const money = (n: number) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });

export function checkoutHtml(name: string, c: Checkout, url?: string) {
  const wa = String(c.whatsapp ?? "").replace(/\D/g, "");
  const ask = (text: string) => (wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : "");
  const change = ask(`Oi, Bruno! Vi a prévia do site da ${name}${url ? ` (${url})` : ""} e quero fechar, mas queria mudar uma coisa: `);
  const doubt = ask(`Oi, Bruno! Vi a prévia do site da ${name}${url ? ` (${url})` : ""} e fiquei com uma dúvida: `);
  const paid = c.oneTimeLink || c.monthlyLink;
  return `
<style>
.ck-bar{position:fixed;left:0;right:0;bottom:0;z-index:60;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(17,17,16,.94);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;gap:10px;font-family:system-ui,-apple-system,sans-serif;color:#fff}
.ck-bar p{flex:1;min-width:0;font-size:12.5px;line-height:1.3;opacity:.85}
.ck-bar p b{display:block;font-size:14px;opacity:1}
.ck-go{flex:none;border:0;border-radius:999px;background:#d4ff3f;color:#111;font:700 15px system-ui,sans-serif;padding:13px 18px;cursor:pointer;animation:ckp 2.4s infinite}
@keyframes ckp{0%{box-shadow:0 0 0 0 rgba(212,255,63,.55)}70%{box-shadow:0 0 0 12px rgba(212,255,63,0)}100%{box-shadow:0 0 0 0 rgba(212,255,63,0)}}
.ck-sh{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center;font-family:system-ui,-apple-system,sans-serif}
.ck-sh.on{display:flex}
.ck-box{width:min(480px,100%);max-height:92vh;overflow:auto;background:#fff;color:#111;border-radius:22px 22px 0 0;padding:22px 18px calc(20px + env(safe-area-inset-bottom));animation:ckup .35s cubic-bezier(.2,.8,.2,1)}
@keyframes ckup{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
.ck-box h3{font-size:21px;line-height:1.2;margin:0 0 4px}
.ck-box .ck-s{font-size:14px;color:#555;margin:0 0 16px}
.ck-plan{display:block;border:1.5px solid #e5e5e5;border-radius:16px;padding:14px 16px;margin-bottom:10px;text-decoration:none;color:inherit;transition:border-color .2s,transform .2s}
.ck-plan:active{transform:scale(.98)}
.ck-plan.hl{border-color:#111;background:#fafaf7}
.ck-plan .ck-t{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-weight:700;font-size:15px}
.ck-plan .ck-t b{font-size:22px}
.ck-plan .ck-t b small{font-size:13px;font-weight:500;color:#666}
.ck-plan ul{margin:8px 0 0;padding:0;list-style:none;font-size:13px;color:#555}
.ck-plan li{margin-top:3px}
.ck-plan li:before{content:"✓ ";color:#16a34a;font-weight:700}
.ck-plan .ck-btn{display:block;margin-top:12px;text-align:center;background:#111;color:#fff;border-radius:999px;padding:12px;font-weight:700;font-size:15px}
.ck-plan.hl .ck-btn{background:#16a34a}
.ck-alt{display:block;text-align:center;border:1.5px solid #111;border-radius:999px;padding:12px;font-weight:600;font-size:14.5px;color:#111;text-decoration:none;margin-top:6px}
.ck-x{display:block;width:100%;border:0;background:none;color:#777;font:500 14px system-ui,sans-serif;padding:14px 0 0;cursor:pointer}
.ck-note{font-size:11.5px;color:#888;text-align:center;margin:10px 0 0}
body{padding-bottom:80px}
</style>
<div class="ck-bar" role="region" aria-label="Contratar este site">
  <p><b>Gostou do seu site?</b>Coloque no ar hoje mesmo.</p>
  <button class="ck-go" type="button" data-ck-open>Quero o meu</button>
</div>
<div class="ck-sh" data-ck-sheet role="dialog" aria-modal="true" aria-label="Escolha como quer o seu site">
  <div class="ck-box">
    <h3>Seu site no ar ${paid ? "assim que o pagamento cair" : "ainda hoje"}</h3>
    <p class="ck-s">Este mesmo site, com o seu endereço${c.upgrade ? ", no lugar do site atual" : ""}. Escolha como prefere:</p>
    ${c.oneTimeLink ? `<a class="ck-plan hl" href="${esc(c.oneTimeLink)}" target="_blank" rel="noopener">
      <span class="ck-t"><span>Pagamento único</span><b>R$ ${money(c.oneTime)}</b></span>
      <ul><li>Sem mensalidade</li><li>Pix, cartão ou boleto</li><li>O site entra no ar na hora, sozinho</li></ul>
      <span class="ck-btn">Pagar e publicar agora</span></a>` : ""}
    ${c.monthlyLink ? `<a class="ck-plan" href="${esc(c.monthlyLink)}" target="_blank" rel="noopener" data-ck-monthly>
      <span class="ck-t"><span>Mensal</span><b>R$ ${money(c.monthly)}<small>/mês</small></b></span>
      <ul><li>Alterações sempre que precisar</li><li>Painel com visitas e cliques no WhatsApp</li><li>No cartão, cancela quando quiser</li></ul>
      <span class="ck-btn">Assinar</span></a>` : ""}
    ${change ? `<a class="ck-alt" href="${esc(change)}" target="_blank" rel="noopener">Quero, mas quero mudar algo antes</a>` : ""}
    ${doubt ? `<a class="ck-alt" style="border-color:#ddd;color:#555" href="${esc(doubt)}" target="_blank" rel="noopener">Tenho uma dúvida</a>` : ""}
    <p class="ck-note">Pagamento seguro pelo Mercado Pago · PáginasPro</p>
    <button class="ck-x" type="button" data-ck-close>Continuar vendo o site</button>
  </div>
</div>
<script>
(function(){var sh=document.querySelector('[data-ck-sheet]');
document.querySelector('[data-ck-open]').addEventListener('click',function(){sh.classList.add('on')});
document.querySelector('[data-ck-close]').addEventListener('click',function(){sh.classList.remove('on')});
sh.addEventListener('click',function(e){if(e.target===sh)sh.classList.remove('on')});
var m=document.querySelector('[data-ck-monthly]');
// Mensal: marca o clique para o aviso da assinatura achar esta página e publicar sozinho
if(m)m.addEventListener('click',function(){var u=location.pathname.replace(/\\/$/,'')+'?e=checkout_monthly';try{navigator.sendBeacon?navigator.sendBeacon(u):fetch(u,{method:'POST',keepalive:true})}catch(x){}});
})();
</script>`;
}
