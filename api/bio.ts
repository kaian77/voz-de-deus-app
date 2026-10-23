import type { IncomingMessage, ServerResponse } from "node:http";
import { renderBioLink } from "../src/landing/bio.js";
import type { BioLink } from "../src/studio/lib/types.js";

const URL_ = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rrlxhnmfsmknzhqpfrhr.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const NOT_FOUND = "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Link não encontrado</title><body style=\"font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;color:#555\"><p>Este link não existe ou não está publicado.</p></body></html>";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const slug = new URL(req.url ?? "/", "https://x").searchParams.get("slug")?.toLowerCase() ?? "";
  if (!KEY || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(NOT_FOUND);
  }
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const response = await fetch(`${URL_}/rest/v1/bio_links?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*&limit=1`, { headers }).catch(() => null);
  const rows = response?.ok ? (await response.json() as BioLink[]) : [];
  const page = rows[0];
  res.statusCode = page ? 200 : 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", page ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store");
  res.end(page ? renderBioLink(page, `https://${req.headers.host ?? "instagram.paginaspro.app.br"}/bio/${slug}`) : NOT_FOUND);
}
