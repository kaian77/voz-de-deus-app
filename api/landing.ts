// Landing page publicada de cliente (Renda extra): /p/<slug> (rewrite no vercel.json) -> HTML completo, com
// título e foto para a prévia do link no WhatsApp. Lê com a chave pública; a RLS só libera prévias e publicadas.
// Domínio próprio do cliente (qualquer host fora de *.vercel.app, rewrite no vercel.json): acha a página pelo domain.
// Prévia vencida (preview_until) não abre mais: a cliente não usa o link de prévia como site.
import type { IncomingMessage, ServerResponse } from "node:http";
import { renderLanding, type LandingData } from "../src/landing/render.js";
import { demoReport, renderReport, type ReportData } from "../src/landing/report.js";
import { renderAgency } from "../src/landing/agency.js";
import { renderAnswer, renderBooking, renderLogin } from "../src/landing/agenda.js";
import { mergeOffer } from "../src/studio/lib/offer.js";

const URL_ = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rrlxhnmfsmknzhqpfrhr.supabase.co";
const KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

const NOT_FOUND = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página não encontrada</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;color:#444"><p>Esta página não existe ou saiu do ar.</p></body></html>`;

const EXPIRED = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Prévia expirada</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;color:#444;text-align:center;padding:24px"><div><p style="font-size:20px;margin:0 0 8px">Esta prévia expirou.</p><p style="margin:0">Fale com quem criou o site para ver a versão final.</p></div></body></html>`;

// Colunas com leitura pública (migration 20261110000000_agenda.sql): nunca select=* (o anon não lê as colunas secretas)
const PUBLIC_COLS = "name,niche,city,whatsapp,instagram,address,registry,hours,photos,logo,rating,reviews,tier,widget,content,status,slug,preview_until,domain,agenda_status,agenda_until,agenda";

type Row = LandingData & { content: LandingData["content"] | null; status: string; slug: string; preview_until: string | null; domain: string | null };

function send(res: ServerResponse, status: number, html: string, cache: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(html);
}

/** De onde veio a visita (referrer ou utm_source) -> chave do painel. */
function source(ref: string) {
  const r = ref.toLowerCase();
  if (!r) return "direto";
  if (/google\./.test(r) || r === "google") return "google";
  if (/instagram/.test(r)) return "instagram";
  if (/facebook|fb\.|^fb$/.test(r)) return "facebook";
  if (/whatsapp|wa\.me/.test(r)) return "whatsapp";
  if (/tiktok/.test(r)) return "tiktok";
  return "outros";
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "https://x");
  const slug = (url.searchParams.get("slug") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "voz-de-deus-app.vercel.app").toLowerCase().split(":")[0];
  const own = !slug && !host.endsWith(".vercel.app") && !/(^|\.)paginaspro\.app\.br$/.test(host) ? host.replace(/^www\./, "").replace(/[^a-z0-9.-]/g, "") : "";
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

  // Site da PáginasPro (vitrine do dono): paginaspro.app.br (e o antigo paginaspro.vercel.app) -> /inicio (redirect no vercel.json)
  if (url.searchParams.get("home")) {
    const e = url.searchParams.get("e");
    if (e) {
      if (KEY && (e === "view" || e === "whatsapp")) {
        await fetch(`${URL_}/rest/v1/rpc/site_track`, {
          method: "POST", headers, body: JSON.stringify({ p_site: "paginaspro", p_event: e, p_source: source(url.searchParams.get("r") ?? "") }),
        }).catch(() => {});
      }
      res.statusCode = 204;
      res.setHeader("Cache-Control", "no-store");
      return res.end();
    }
    // preços, links e WhatsApp salvos no Studio ("Preços e links")
    const saved = KEY ? await fetch(`${URL_}/rest/v1/rpc/paginaspro_offer`, { method: "POST", headers, body: "{}" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
    return send(res, 200, renderAgency(mergeOffer(saved)), "public, s-maxage=60, stale-while-revalidate=600");
  }
  // Agenda online: /agendar/<slug> (paciente) e /entrar (login do profissional)
  const cfg = { api: `${URL_}/functions/v1/agenda`, key: KEY };
  if (url.searchParams.get("entrar")) return send(res, 200, renderLogin(cfg), "public, s-maxage=300");
  // Botão do e-mail de lembrete: /confirmar/<token>?r=yes|no
  const confirmar = (url.searchParams.get("confirmar") ?? "").replace(/[^a-f0-9]/g, "").slice(0, 64);
  if (confirmar && KEY) {
    const r = await fetch(cfg.api, { method: "POST", headers, body: JSON.stringify({ action: "answer", token: confirmar, reply: "peek" }) });
    return send(res, r.ok ? 200 : 404, renderAnswer(r.ok ? await r.json() : null, { cfg, token: confirmar, want: url.searchParams.get("r") === "yes" ? "yes" : "no" }), "no-store");
  }
  const agendar = (url.searchParams.get("agendar") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  if (agendar && KEY) {
    const r = await fetch(`${URL_}/rest/v1/landing_pages?slug=eq.${agendar}&status=in.(preview,published)&select=name,logo,slug,domain,content,agenda,agenda_status&limit=1`, { headers });
    const p = (r.ok ? ((await r.json()) as (Row & { agenda: { style?: string } | null; agenda_status: string })[]) : [])[0];
    if (!p || p.agenda_status === "off") return send(res, 404, NOT_FOUND, "no-store");
    const site = p.domain ? `https://${p.domain}/` : `https://paginaspro.app.br/p/${p.slug}`;
    return send(res, 200, renderBooking({ name: p.name, logo: p.logo, content: p.content, slug: p.slug, style: p.agenda?.style === "modern" ? "modern" : "simple", site }, cfg), "no-store");
  }
  // Painel do cliente (plano mensal): /r/<token>
  const token = (url.searchParams.get("report") ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
  if (token === "demo") return send(res, 200, renderReport(demoReport()), "public, s-maxage=3600");
  if (token && KEY) {
    const r = await fetch(`${URL_}/rest/v1/rpc/landing_report`, { method: "POST", headers, body: JSON.stringify({ p_token: token }) });
    const data = r.ok ? ((await r.json()) as ReportData | null) : null;
    return data ? send(res, 200, renderReport(data, { token, cfg }), "no-store") : send(res, 404, NOT_FOUND, "no-store");
  }
  // Aviso do navegador do visitante (visita, clique no WhatsApp, rota no mapa): conta só página publicada
  const event = url.searchParams.get("e");
  if (event && KEY) {
    if (["view", "whatsapp", "maps"].includes(event)) {
      await fetch(`${URL_}/rest/v1/rpc/landing_track`, {
        method: "POST", headers,
        body: JSON.stringify({ p_slug: slug, p_domain: own, p_event: event, p_source: source(url.searchParams.get("r") ?? "") }),
      }).catch(() => {});
    }
    res.statusCode = 204;
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  }
  if ((!slug && !own) || !KEY) return send(res, 404, NOT_FOUND, "no-store");
  const filter = own ? `domain=ilike.${own}&status=eq.published` : `slug=eq.${slug}&status=in.(preview,published)`;
  const r = await fetch(`${URL_}/rest/v1/landing_pages?${filter}&select=${PUBLIC_COLS}&limit=1`, { headers });
  const page = (r.ok ? ((await r.json()) as Row[]) : [])[0];
  if (!page?.content) return send(res, 404, NOT_FOUND, "no-store");
  if (page.status === "preview" && page.preview_until && new Date(page.preview_until).getTime() < Date.now()) return send(res, 410, EXPIRED, "no-store");
  // Prévia: visita contada aqui (sem cache); publicada: quem conta é o navegador (script com track)
  if (page.status === "preview") fetch(`${URL_}/rest/v1/rpc/landing_view`, { method: "POST", headers, body: JSON.stringify({ p_slug: page.slug }) }).catch(() => {});
  // Publicada com domínio próprio: o endereço oficial (Google) é o domínio
  const canonical = page.status === "published" && page.domain ? `https://${page.domain}/` : `https://${host}/p/${page.slug}`;
  const preview = page.status === "preview";
  send(res, 200, renderLanding(page, { url: canonical, preview, sample: preview, track: !preview }), preview ? "no-store" : "public, s-maxage=60, stale-while-revalidate=600");
}
