// Prospecção automática da PáginasPro (Leads): o cron pega os leads novos com WhatsApp, monta a prévia de cada um
// (sem site = site novo; com site = "upgrade", com o que o site atual tem de real nas notas) e deixa a mensagem
// pronta numa fila de 1 toque em Leads → o dono envia pelo WhatsApp dele (sem robô no número pessoal: não leva ban).
// A prévia em si sai pelo mesmo caminho do atendente (landing_pages.auto_status = queued → runPaginasproJobs).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { igPublicProfile } from "./instagram.ts";
import { wahaChatIdFor, wahaSendText } from "./whatsapp.ts";

const SITE = "https://paginaspro.app.br";

type Audit = { ok: boolean; https: boolean; mobile: boolean; whatsapp: boolean; slow: boolean; title?: string; text?: string; instagram?: string; error?: string };

// Endereços que não são site próprio (iguais aos do video/leads.py): quem só tem isso é lead de site novo
const NOT_A_SITE = /instagram\.com|facebook\.com|fb\.com|fb\.me|wa\.me|wa\.link|whatsapp\.com|linktr\.ee|linkbio|bio\.link|beacons\.ai|business\.site|linkin\.bio|lnk\.bio|taplink|doctoralia|boaconsulta|agendor|google\.com|goo\.gl|bit\.ly|tiktok\.com|youtube\.com|ifood|sympla/i;
export const ownSite = (url?: string | null) => Boolean(url && /\./.test(url) && !NOT_A_SITE.test(url));

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
      instagram: html.match(/instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/|share)([A-Za-z0-9_.]{2,30})/i)?.[1],
      text: text.slice(0, 1500),
    };
  } catch (e) {
    return { ok: false, https: false, mobile: false, whatsapp: false, slow: true, error: e instanceof Error ? e.message.slice(0, 120) : "não abriu" };
  }
}

/** O que o site atual tem de errado, em linguagem de gente (só o que o auditSite conferiu). */
function issues(a: Audit | null) {
  if (!a) return [];
  if (!a.ok) return ["não abriu aqui para mim"];
  return [
    !a.mobile && "no celular ele fica desajustado",
    !a.whatsapp && "não tem um botão direto para o WhatsApp",
    !a.https && "aparece como \"não seguro\" no navegador",
    a.slow && "demora um pouco para abrir",
  ].filter(Boolean) as string[];
}

/** Variação fixa por lead (mensagens diferentes entre si parecem gente, não robô). */
const pick = <T,>(arr: T[], seed: string) => arr[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % arr.length];

/** 1ª abordagem, curta e natural: quem é, onde achou, a prévia pronta e uma pergunta. Sem preço (vai quando a pessoa
 * responder) e sem promessa. {saudacao} vira "Bom dia/Boa tarde/Boa noite" na hora de enviar (Studio). */
export function prospectMessage(lead: Record<string, any>, url: string, theme?: string | null) {
  const tema = String(theme ?? lead.category ?? "").split(",")[0].trim().toLowerCase();
  // "faço sites para nutricionistas": só com tema de uma palavra (plural simples); senão fica "faço sites" e pronto
  const forWho = /^[a-zà-ú]+$/.test(tema) ? ` para ${/s$/.test(tema) ? tema : tema + (/[aeiou]$/.test(tema) ? "s" : "es")}` : " para negócios locais";
  const stars = lead.rating >= 4.5 && lead.reviews >= 10 ? pick([` (e que avaliações, hein! ${String(lead.rating).replace(".", ",")} ⭐)`, ` (${lead.reviews} avaliações, parabéns!)`], lead.id ?? "") : "";
  if (lead.kind === "upgrade") {
    const site = String(lead.website ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
    const found = issues(lead.site_audit).slice(0, 2);
    const why = found.length ? ` Reparei que ${found.join(" e ")}, então` : " Fiquei com vontade de mostrar uma ideia, então";
    return pick([
      `{saudacao}! Tudo bem? Aqui é o Bruno 🙂\nAchei vocês no Google${stars} e entrei no site (${site}).${why} montei uma versão nova, pensada para o celular:\n${url}\n\nAbre aí no celular e me fala o que achou?`,
      `{saudacao}! Sou o Bruno, faço sites${forWho}.\nVi o site de vocês (${site}).${why} fiz uma versão nova para vocês compararem, sem compromisso:\n${url}\n\nO que acham?`,
    ], lead.id ?? lead.name ?? "");
  }
  return pick([
    `{saudacao}! Tudo bem? Aqui é o Bruno 🙂\nAchei vocês no Google Maps${stars} e vi que ainda não têm site, aí montei um rapidinho para verem como ficaria:\n${url}\n\nAbre no celular e me fala o que achou?`,
    `{saudacao}! Sou o Bruno, faço sites${forWho}.\nVi vocês no Google Maps${stars} e tomei a liberdade de montar uma prévia do site de vocês, sem compromisso:\n${url}\n\nSe quiser mudar alguma coisa, é só me dizer 😉`,
    `Oi, tudo certo? Bruno aqui 👋\nEstava vendo${forWho.replace(" para", "")} da região no Google e vocês me chamaram atenção${stars}. Fiz uma prévia de site para vocês:\n${url}\n\nDá uma olhadinha quando puder?`,
  ], lead.id ?? lead.name ?? "");
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
      // Instagram do lead (link no Maps): a bio pode ter site próprio → vira upgrade
      let igUser = String(lead.instagram ?? lead.social ?? "").match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i)?.[1] ?? null;
      if (igUser && lead.kind !== "upgrade") {
        const profile = await igPublicProfile(igUser).catch(() => null);
        if (profile && ownSite(profile.website)) {
          Object.assign(lead, { kind: "upgrade", website: profile.website });
          await db.from("leads").update({ kind: "upgrade", website: profile.website }).eq("id", lead.id);
        }
      }
      const audit = lead.kind === "upgrade" && lead.website ? await auditSite(lead.website) : null;
      // Site com link do Instagram: a página puxa as fotos e a bio de lá também
      if (!igUser && audit?.instagram) igUser = audit.instagram;
      if (igUser) await db.from("leads").update({ instagram: `https://instagram.com/${igUser}` }).eq("id", lead.id);
      const { data: search } = lead.search_id ? await db.from("lead_searches").select("query,place").eq("id", lead.search_id).maybeSingle() : { data: null };
      const ig = igUser ? `@${igUser}` : null;
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
          niche: (search?.query?.includes(",") ? lead.category : search?.query) || lead.category || "", city: search?.place ?? null, whatsapp: lead.whatsapp,
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
  const { data: search } = lead.search_id ? await db.from("lead_searches").select("query").eq("id", lead.search_id).maybeSingle() : { data: null };
  const url = page.status === "published" && page.domain ? `https://${page.domain}` : `${SITE}/p/${page.slug}`;
  await db.from("leads").update({ prospect_status: "ready", prospect_message: prospectMessage(lead, url, search?.query?.includes(",") ? lead.category : search?.query), landing_id: page.id }).eq("id", lead.id);
}

/** Prévia do lead falhou: o lead sai da fila (não trava o motor). */
export async function prospectFailed(db: SupabaseClient, leadId: string, error: string) {
  await db.from("leads").update({ prospect_status: "failed", prospect_message: error.slice(0, 300) }).eq("id", leadId).eq("prospect_status", "building");
}

// ---------------------------------------------------------------------------
// "Enviar todos": o Studio põe os leads na fila (send_after espaçado 4 a 9 min, send_text com {saudacao}); o cron
// manda 1 por vez pelo WhatsApp conectado no WAHA, só de seg a sáb das 8h às 20h (Brasília), no máximo 30 por dia
// e com pelo menos 3 min entre um e outro. 3 erros seguidos pausam a fila e avisam no celular.
// ---------------------------------------------------------------------------
const BOT_DAILY_MAX = 30;

function brasilia() {
  const d = new Date(Date.now() - 3 * 3600_000);
  return { hour: d.getUTCHours(), day: d.getUTCDay() };
}

const greetingNow = () => {
  const h = brasilia().hour;
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

export async function runProspectSends(db: SupabaseClient) {
  const { hour, day } = brasilia();
  if (day === 0 || hour < 8 || hour >= 20) return null;
  const now = new Date().toISOString();
  const { data: next } = await db.from("leads").select("*").not("send_after", "is", null).lte("send_after", now).order("send_after").limit(1).maybeSingle();
  if (!next) return null;
  // Espaço mínimo e limite do dia (contando tudo o que o robô mandou)
  const { count: recent } = await db.from("leads").select("id", { count: "exact", head: true }).eq("user_id", next.user_id).gte("bot_sent_at", new Date(Date.now() - 3 * 60_000).toISOString());
  if (recent) return null;
  const { count: today } = await db.from("leads").select("id", { count: "exact", head: true }).eq("user_id", next.user_id).gte("bot_sent_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  if ((today ?? 0) >= BOT_DAILY_MAX) return null;

  const { data: acc } = await db.from("social_accounts").select("id,meta").eq("user_id", next.user_id).eq("platform", "whatsapp").eq("meta->>provider", "waha").limit(1).maybeSingle();
  if (!acc) {
    await pauseOutbox(db, next.user_id, "Conecte seu WhatsApp em Contas → WhatsApp (QR code) para o envio automático.");
    return { paused: "sem whatsapp" };
  }
  const { data: token } = await db.from("account_tokens").select("access_token").eq("account_id", acc.id).maybeSingle();
  const cfg = { base_url: acc.meta.base_url, session: acc.meta.session, api_key: token?.access_token || null };
  // Trava: tira da fila antes de mandar (outra rodada do cron não manda duas vezes)
  const { data: claimed } = await db.from("leads").update({ send_after: null, bot_sent_at: now }).eq("id", next.id).not("send_after", "is", null).select("id").maybeSingle();
  if (!claimed) return null;
  try {
    const chatId = await wahaChatIdFor(cfg, String(next.whatsapp ?? ""));
    await wahaSendText(cfg, chatId, String(next.send_text ?? "").split("{saudacao}").join(greetingNow()));
    const first = next.status === "new";
    await db.from("leads").update({
      send_text: null, send_error: null, last_touch_at: now,
      ...(first ? { status: "contacted", prospect_status: "sent", contacted_at: now } : { followups: (next.followups ?? 0) + 1 }),
    }).eq("id", next.id);
    return { sent: next.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const noWhats = /não tem WhatsApp/.test(msg);
    await db.from("leads").update({ send_text: null, send_error: msg.slice(0, 200), ...(noWhats ? { status: "lost", lost_reason: "Número sem WhatsApp", closed_at: now } : {}) }).eq("id", next.id);
    if (!noWhats) {
      const { count: errors } = await db.from("leads").select("id", { count: "exact", head: true }).eq("user_id", next.user_id).not("send_error", "is", null).gte("bot_sent_at", new Date(Date.now() - 30 * 60_000).toISOString());
      if ((errors ?? 0) >= 3) await pauseOutbox(db, next.user_id, `3 envios falharam seguidos (${msg.slice(0, 80)}). Confira o WhatsApp em Contas.`);
    }
    return { error: msg };
  }
}

/** Para a fila (os leads voltam para onde estavam) e avisa no celular. */
async function pauseOutbox(db: SupabaseClient, userId: string, why: string) {
  await db.from("leads").update({ send_after: null, send_text: null, send_error: why.slice(0, 200) }).eq("user_id", userId).not("send_after", "is", null);
  const { notify } = await import("./push.ts");
  await notify(db, userId, "⏸️ Envio automático pausado", why, "/studio/crm").catch(() => undefined);
}
