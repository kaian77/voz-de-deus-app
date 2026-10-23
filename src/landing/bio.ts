import type { BioLink } from "../studio/lib/types";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const color = (value: string, fallback: string) => /^#[\da-f]{6}$/i.test(value ?? "") ? value : fallback;

function safeHref(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function renderBioLink(page: BioLink, url: string) {
  const accent = color(page.accent, "#7c3aed");
  const background = color(page.background, "#f5f3ff");
  const button = page.button_style === "pill" ? "999px" : page.button_style === "outline" ? "18px" : "12px";
  const links = (page.links ?? []).filter((item) => item.enabled && item.title?.trim() && safeHref(item.url));
  const items = links.map((item) => `<a class="link" href="${esc(safeHref(item.url))}" target="_blank" rel="noopener noreferrer"><span>${esc(item.title)}</span><b aria-hidden="true">↗</b></a>`).join("");
  const avatar = page.avatar_url && safeHref(page.avatar_url)
    ? `<img class="avatar" src="${esc(page.avatar_url)}" alt="Foto de ${esc(page.display_name)}">`
    : `<div class="avatar placeholder">${esc([...page.display_name.trim()][0]?.toUpperCase() ?? "@")}</div>`;
  const handle = page.username?.trim() ? `<p class="handle">@${esc(page.username.replace(/^@/, ""))}</p>` : "";
  const description = page.bio?.trim() ? `<p class="bio">${esc(page.bio).replace(/\n/g, "<br>")}</p>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${background}"><meta name="description" content="${esc(page.bio || `Links de ${page.display_name}`)}"><meta property="og:title" content="${esc(page.display_name)} · links"><meta property="og:description" content="${esc(page.bio || `Acesse os links de ${page.display_name}`)}">${page.avatar_url && safeHref(page.avatar_url) ? `<meta property="og:image" content="${esc(page.avatar_url)}">` : ""}<link rel="canonical" href="${esc(url)}"><title>${esc(page.display_name)} · links</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:40px 18px 30px;background:${background};color:#18181b;font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{width:min(100%,480px);margin:0 auto;text-align:center}.avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;margin:0 auto 18px;border:3px solid rgba(255,255,255,.88);box-shadow:0 8px 24px #18181b18}.placeholder{display:grid;place-items:center;background:${accent};color:#fff;font-size:36px;font-weight:700}.name{margin:0;font-size:25px;line-height:1.2;letter-spacing:-.03em}.handle{margin:6px 0 0;color:#71717a;font-size:14px}.bio{margin:12px auto 26px;max-width:38ch;color:#52525b;white-space:normal}.links{display:grid;gap:12px}.link{min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 18px;border:1px solid ${page.button_style === "outline" ? accent : "transparent"};border-radius:${button};background:${page.button_style === "outline" ? "transparent" : accent};color:${page.button_style === "outline" ? accent : "#fff"};font-weight:650;text-decoration:none;box-shadow:${page.button_style === "outline" ? "none" : "0 8px 20px #18181b14"};transition:transform .16s,filter .16s}.link:hover{transform:translateY(-2px);filter:brightness(.96)}.link b{font-size:17px}.footer{margin:30px 0 0;color:#71717a;font-size:11px}.footer a{color:inherit;text-decoration:none}@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important}}
</style></head><body><main class="wrap">${avatar}<h1 class="name">${esc(page.display_name)}</h1>${handle}${description}<nav class="links" aria-label="Links principais">${items || "<p>Os links desta página ainda não foram adicionados.</p>"}</nav><p class="footer">Criado com <a href="https://instagram.paginaspro.app.br">PáginasPro Instagram</a></p></main></body></html>`;
}
