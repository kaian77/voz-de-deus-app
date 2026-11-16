// Prospecção automática da PáginasPro (Leads): o cron pega os leads novos com WhatsApp, monta a prévia de cada um
// (sem site = site novo; com site = "upgrade", com o que o site atual tem de real nas notas) e deixa a mensagem
// pronta numa fila de 1 toque em Leads → o dono envia pelo WhatsApp dele (sem robô no número pessoal: não leva ban).
// A prévia em si sai pelo mesmo caminho do atendente (landing_pages.auto_status = queued → runPaginasproJobs).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://paginaspro.app.br";
const DEFAULT: Record<string, number> = { oneTime: 297, monthly: 49, upgradeOneTime: 247, upgradeMonthly: 49 };

type Audit = { ok: boolean; https: boolean; mobile: boolean; whatsapp: boolean; slow: boolean; title?: string; text?: string; error?: string };

/** Olha o site atual de verdade (só o que dá para conferir): abre? tem https, ajuste para celular, botão de WhatsApp? */
export async function auditSite(url: string): Promise<Audit> {
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const t0 = Date.now();
  try {
    const res = await fetch(href, { headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const html = (await res.text()).slice(0, 400_000);
    const ms = Date.now() - t0;
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
    return {
      ok: res.ok,
      https: res.url.startsWith("https://"),
      mobile: /<meta[^>]+name=["']viewport["']/i.test(html),
      whatsapp: /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(html),
      slow: ms > 6000,
      title: html.match(/<title[^>]*>([^<]{1,120})/i)?.[1]?.trim(),
      text: text.slice(0, 1500),
    };
  } catch (e) {
    return { ok: false, https: false, mobile: false, whatsapp: false, slow: true, error: e instanceof Error ? e.message.slice(0, 120) : "não abriu" };
  }
}

/** Problemas reais do site atual, em linguagem de gente (só o que o auditSite conferiu). */
function issues(a: Audit | null) {
  if (!a) return [];
  if (!a.ok) return ["o site não abriu quando testei"];
  return [
    !a.mobile && "não está ajustado para celular",
    !a.whatsapp && "não tem botão direto para o WhatsApp",
    !a.https && "aparece como \"não seguro\" no navegador",
    a.slow && "demorou para abrir",
  ].filter(Boolean) as string[];
}

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

/** Mensagem da 1ª abordagem (sem promessa: só a prévia pronta, o que é verdade sobre o site atual e o preço). */
export function prospectMessage(lead: Record<string, any>, url: string, offer: Record<string, unknown>) {
  const o = (k: string) => Number(offer?.[k]) > 0 ? Number(offer[k]) : DEFAULT[k];
  const name = String(lead.name ?? "").split(/\s[-|·]\s/)[0].trim();
  const stars = lead.rating && lead.reviews >= 5 ? ` (vi as ${lead.reviews} avaliações, nota ${String(lead.rating).replace(".", ",")} 👏)` : "";
  if (lead.kind === "upgrade") {
    const site = String(lead.website ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    const found = issues(lead.site_audit);
    return `Oi, tudo bem? Aqui é o Bruno, da PáginasPro. Achei ${name} no Google Maps${stars} e dei uma olhada no site de vocês (${site}).` +
      (found.length ? ` Reparei que ele ${found.slice(0, 2).join(" e ")}.` : "") +
      `\n\nTomei a liberdade de montar uma versão nova, feita para o celular e com botão direto para o WhatsApp. É só uma prévia, sem compromisso:\n${url}` +
      `\n\nSe gostarem, faço a troca por ${brl(o("upgradeOneTime"))} (uma vez só) ou ${brl(o("upgradeMonthly"))}/mês com alterações inclusas. Se não fizer sentido, sem problema!`;
  }
  return `Oi, tudo bem? Aqui é o Bruno, da PáginasPro. Achei ${name} no Google Maps${stars} e vi que vocês ainda não têm um site.` +
    `\n\nTomei a liberdade de montar uma prévia de como ficaria, com os dados que já estão no Google, sem compromisso:\n${url}` +
    `\n\nSe gostarem, deixo no ar por ${brl(o("oneTime"))} (uma vez só) ou ${brl(o("monthly"))}/mês com alterações inclusas. Se não fizer sentido, sem problema!`;
}

const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) + "T03:00:00Z"; // meia-noite de Brasília

/** Cron: põe a prévia de 1 lead por rodada na fila, até o limite do dia, para cada dono com a prospecção ligada. */
export async function runProspecting(db: SupabaseClient) {
  const { data: owners } = await db.from("brand_settings").select("user_id,prospect_per_day").eq("prospect_enabled", true).limit(5);
  const out = [];
  for (const o of owners ?? []) {
    // Só 1 prévia montando por vez (cada uma custa uma chamada da IA)
    const { count: busy } = await db.from("leads").select("id", { count: "exact", head: true }).eq("user_id", o.user_id).eq("prospect_status", "building");
    if (busy) continue;
    const { count: done } = await db.from("leads").select("id", { count: "exact", head: true }).eq("user_id", o.user_id).gte("prospect_at", today());
    if ((done ?? 0) >= (o.prospect_per_day ?? 15)) continue;
    const { data: lead } = await db.from("leads").select("*").eq("user_id", o.user_id).eq("status", "new").is("prospect_status", null)
      .not("whatsapp", "is", null).order("reviews", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (!lead) continue;
    const { data: claimed } = await db.from("leads").update({ prospect_status: "building", prospect_at: new Date().toISOString() })
      .eq("id", lead.id).is("prospect_status", null).select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const audit = lead.kind === "upgrade" && lead.website ? await auditSite(lead.website) : null;
      const { data: search } = lead.search_id ? await db.from("lead_searches").select("query,place").eq("id", lead.search_id).maybeSingle() : { data: null };
      const ig = String(lead.social ?? "").includes("instagram.com") ? lead.social : null;
      const notes = audit ? [
        `Este negócio JÁ TEM site (${lead.website}); a página nova é um upgrade: mais bonita, feita para o celular e com WhatsApp.`,
        audit.title && `Título do site atual: ${audit.title}`,
        audit.text && `Texto do site atual (use só o que for informação real: serviços, especialidades, diferenciais, anos de atuação):\n${audit.text}`,
      ].filter(Boolean).join("\n") : null;
      const { data: existing } = await db.from("landing_pages").select("id,status").eq("lead_id", lead.id).maybeSingle();
      let pageId = existing?.id;
      if (!existing) {
        const { data: page, error } = await db.from("landing_pages").insert({
          user_id: o.user_id, slug: `rascunho-${crypto.randomUUID()}`, lead_id: lead.id, name: lead.name,
          niche: search?.query?.split(",")[0]?.trim() || lead.category || "", city: search?.place ?? null, whatsapp: lead.whatsapp,
          instagram: ig, address: lead.address, rating: lead.rating, reviews: lead.reviews, photos: [], notes,
          tier: lead.kind === "upgrade" ? "premium" : "normal", auto_status: "queued",
        }).select("id").single();
        if (error) throw error;
        pageId = page.id;
      } else if (existing.status === "draft") {
        await db.from("landing_pages").update({ auto_status: "queued", ...(notes ? { notes } : {}) }).eq("id", existing.id);
      }
      await db.from("leads").update({ landing_id: pageId, site_audit: audit }).eq("id", lead.id);
      // Página já pronta (feita à mão antes): a mensagem sai na hora
      if (existing && existing.status !== "draft") await prospectReady(db, existing.id);
      out.push({ lead: lead.id, page: pageId });
    } catch (e) {
      await db.from("leads").update({ prospect_status: "failed", prospect_message: e instanceof Error ? e.message.slice(0, 300) : String(e) }).eq("id", lead.id);
    }
  }
  return out;
}

/** Prévia do lead pronta (chamado pelo runPaginasproJobs): escreve a mensagem e põe na fila de envio. */
export async function prospectReady(db: SupabaseClient, pageId: string) {
  const { data: page } = await db.from("landing_pages").select("id,user_id,slug,status,domain,lead_id").eq("id", pageId).maybeSingle();
  if (!page?.lead_id) return;
  const { data: lead } = await db.from("leads").select("*").eq("id", page.lead_id).maybeSingle();
  if (!lead || !["building", null].includes(lead.prospect_status)) return;
  const { data: settings } = await db.from("brand_settings").select("landing_offer").eq("user_id", page.user_id).maybeSingle();
  const url = page.status === "published" && page.domain ? `https://${page.domain}` : `${SITE}/p/${page.slug}`;
  await db.from("leads").update({ prospect_status: "ready", prospect_message: prospectMessage(lead, url, settings?.landing_offer ?? {}), landing_id: page.id }).eq("id", lead.id);
}

/** Prévia do lead falhou: o lead sai da fila (não trava o motor). */
export async function prospectFailed(db: SupabaseClient, leadId: string, error: string) {
  await db.from("leads").update({ prospect_status: "failed", prospect_message: error.slice(0, 300) }).eq("id", leadId).eq("prospect_status", "building");
}
