// Landing page publicada de cliente (Renda extra): /p/<slug> (rewrite no vercel.json) -> HTML completo, com
// título e foto para a prévia do link no WhatsApp. Lê com a chave pública; a RLS só libera prévias e publicadas.
// Domínio próprio do cliente (qualquer host fora de *.vercel.app, rewrite no vercel.json): acha a página pelo domain.
// Prévia vencida (preview_until) não abre mais: a cliente não usa o link de prévia como site.
import type { IncomingMessage, ServerResponse } from "node:http";
import { renderLanding, type LandingData } from "../src/landing/render.js";

const URL_ = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rrlxhnmfsmknzhqpfrhr.supabase.co";
const KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

const NOT_FOUND = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página não encontrada</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;color:#444"><p>Esta página não existe ou saiu do ar.</p></body></html>`;

const EXPIRED = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Prévia expirada</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;color:#444;text-align:center;padding:24px"><div><p style="font-size:20px;margin:0 0 8px">Esta prévia expirou.</p><p style="margin:0">Fale com quem criou o site para ver a versão final.</p></div></body></html>`;

type Row = LandingData & { content: LandingData["content"] | null; status: string; slug: string; preview_until: string | null; domain: string | null };

function send(res: ServerResponse, status: number, html: string, cache: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(html);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "https://x");
  const slug = (url.searchParams.get("slug") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "voz-de-deus-app.vercel.app").toLowerCase().split(":")[0];
  const own = !slug && !host.endsWith(".vercel.app") ? host.replace(/^www\./, "").replace(/[^a-z0-9.-]/g, "") : "";
  if ((!slug && !own) || !KEY) return send(res, 404, NOT_FOUND, "no-store");
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
  const filter = own ? `domain=ilike.${own}&status=eq.published` : `slug=eq.${slug}&status=in.(preview,published)`;
  const r = await fetch(`${URL_}/rest/v1/landing_pages?${filter}&select=*&limit=1`, { headers });
  const page = (r.ok ? ((await r.json()) as Row[]) : [])[0];
  if (!page?.content) return send(res, 404, NOT_FOUND, "no-store");
  if (page.status === "preview" && page.preview_until && new Date(page.preview_until).getTime() < Date.now()) return send(res, 410, EXPIRED, "no-store");
  // Visita contada sem travar a resposta
  fetch(`${URL_}/rest/v1/rpc/landing_view`, { method: "POST", headers, body: JSON.stringify({ p_slug: page.slug }) }).catch(() => {});
  // Publicada com domínio próprio: o endereço oficial (Google) é o domínio
  const canonical = page.status === "published" && page.domain ? `https://${page.domain}/` : `https://${host}/p/${page.slug}`;
  const preview = page.status === "preview";
  send(res, 200, renderLanding(page, { url: canonical, preview, sample: preview }), preview ? "no-store" : "public, s-maxage=60, stale-while-revalidate=600");
}
