// Landing page publicada de cliente (Renda extra): /p/<slug> (rewrite no vercel.json) -> HTML completo, com
// título e foto para a prévia do link no WhatsApp. Lê com a chave pública; a RLS só libera prévias e publicadas.
import type { IncomingMessage, ServerResponse } from "node:http";
import { renderLanding, type LandingData } from "../src/landing/render.js";

const URL_ = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rrlxhnmfsmknzhqpfrhr.supabase.co";
const KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

const NOT_FOUND = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página não encontrada</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;color:#444"><p>Esta página não existe ou saiu do ar.</p></body></html>`;

function send(res: ServerResponse, status: number, html: string, cache: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(html);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "https://x");
  const slug = (url.searchParams.get("slug") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  if (!slug || !KEY) return send(res, 404, NOT_FOUND, "no-store");
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
  const r = await fetch(`${URL_}/rest/v1/landing_pages?slug=eq.${slug}&status=in.(preview,published)&select=*&limit=1`, { headers });
  const rows = r.ok ? ((await r.json()) as (LandingData & { content: LandingData["content"] | null; status: string })[]) : [];
  const page = rows[0];
  if (!page?.content) return send(res, 404, NOT_FOUND, "no-store");
  // Visita contada sem travar a resposta
  fetch(`${URL_}/rest/v1/rpc/landing_view`, { method: "POST", headers, body: JSON.stringify({ p_slug: slug }) }).catch(() => {});
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "voz-de-deus-app.vercel.app";
  send(res, 200, renderLanding(page, { url: `https://${host}/p/${slug}`, preview: page.status === "preview", sample: page.status === "preview" }), "public, s-maxage=60, stale-while-revalidate=600");
}
