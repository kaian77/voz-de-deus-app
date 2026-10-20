// Mercado Pago da PáginasPro: pagou → publica.
// Com o secret MERCADOPAGO_ACCESS_TOKEN, cada cliente recebe links de pagamento só dele (preferência do Checkout Pro com
// external_reference "lp:<landing_id>:<plano>"); o Mercado Pago avisa a função mercadopago-webhook, que confere o pagamento
// na API (nunca confia no corpo do aviso), publica o site e manda o link final na conversa.
// Assinatura mensal: a API de assinatura exige o e-mail do pagador, que a conversa não tem; o link mensal continua o
// fixo de "Preços e links" e o aviso de assinatura nova vai para o Bruno ligar o site (sem saber de qual cliente é).
// Sem o token: tudo continua com os links fixos de "Preços e links".
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { publishPatch } from "./landing.ts";
import { sendMessage } from "./inbox.ts";
import { notify } from "./push.ts";
import { functionsUrl } from "./util.ts";

const API = "https://api.mercadopago.com";
const SITE = "https://paginaspro.app.br";

export const mpEnabled = () => Boolean(Deno.env.get("MERCADOPAGO_ACCESS_TOKEN"));

// deno-lint-ignore no-explicit-any
async function mp(path: string, body?: unknown): Promise<any> {
  const res = await fetch(API + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
      ...(body ? { "X-Idempotency-Key": crypto.randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${String(data?.message ?? "").slice(0, 200)}`);
  return data;
}

type Offer = Record<string, number | string>;
const ONE_TIME = { oneTime: "Site PáginasPro", premiumOneTime: "Site Premium PáginasPro" } as const;
type OneTimePlan = keyof typeof ONE_TIME;

/** Links de pagamento à vista só deste cliente (guardados em landing_pages.pay_links; refeitos se o preço mudar).
 * Devolve a oferta com os links trocados; sem token ou se o Mercado Pago falhar, a oferta fica como está. */
export async function clientOffer(db: SupabaseClient, page: { id: string; name: string; pay_links?: Record<string, unknown> | null }, offer: Offer) {
  if (!mpEnabled()) return offer;
  const cached = (page.pay_links ?? {}) as Record<string, { url: string; price: number }>;
  const links: Record<string, { url: string; price: number }> = {};
  let changed = false;
  for (const plan of Object.keys(ONE_TIME) as OneTimePlan[]) {
    const price = Number(offer[plan]);
    if (cached[plan]?.url && cached[plan].price === price) {
      links[plan] = cached[plan];
      continue;
    }
    try {
      const pref = await mp("/checkout/preferences", {
        items: [{ title: `${ONE_TIME[plan]} — ${page.name}`.slice(0, 250), quantity: 1, unit_price: price, currency_id: "BRL" }],
        external_reference: `lp:${page.id}:${plan}`,
        back_urls: { success: `${SITE}/inicio?pago=1`, pending: `${SITE}/inicio`, failure: `${SITE}/inicio` },
        auto_return: "approved",
        notification_url: functionsUrl("mercadopago-webhook"),
        statement_descriptor: "PAGINASPRO",
      });
      links[plan] = { url: pref.init_point, price };
      changed = true;
    } catch (e) {
      console.error("mercadopago", e);
    }
  }
  if (changed) await db.from("landing_pages").update({ pay_links: { ...cached, ...links } }).eq("id", page.id);
  return {
    ...offer,
    ...(links.oneTime ? { oneTimeLink: links.oneTime.url } : {}),
    ...(links.premiumOneTime ? { premiumOneTimeLink: links.premiumOneTime.url } : {}),
  };
}

/** Aviso do Mercado Pago (pagamento ou assinatura): confere na API e, se aprovado, publica o site do cliente. */
export async function handleMpNotification(db: SupabaseClient, kind: string, id: string) {
  if (!mpEnabled() || !/^\d+$|^[\w-]{6,64}$/.test(id)) return { skipped: true };
  if (kind === "payment") return await onPayment(db, id);
  if (kind === "preapproval" || kind === "subscription_preapproval") return await onSubscription(db, id);
  return { skipped: kind };
}

async function claim(db: SupabaseClient, row: Record<string, unknown>) {
  const { data } = await db.from("landing_payments").upsert(row, { onConflict: "id", ignoreDuplicates: true }).select("id");
  return Boolean(data?.length); // false = esse pagamento já foi processado
}

async function onPayment(db: SupabaseClient, id: string) {
  const pay = await mp(`/v1/payments/${id}`);
  if (pay.status !== "approved") return { status: pay.status };
  const ref = String(pay.external_reference ?? "");
  const m = ref.match(/^lp:([0-9a-f-]{36}):(oneTime|premiumOneTime)$/);
  if (!m) return { ignored: "sem referência de landing" }; // pagamento pelos links fixos: o Bruno confere ("paguei" → aviso)
  const [, pageId, plan] = m;
  const { data: page } = await db.from("landing_pages").select("*").eq("id", pageId).maybeSingle();
  if (!page) return { ignored: "landing não existe" };
  const amount = Number(pay.transaction_amount ?? 0);
  if (!(await claim(db, { id: `payment:${id}`, user_id: page.user_id, page_id: page.id, plan, amount, status: pay.status }))) return { duplicate: true };

  // Valor menor que o da preferência (não deveria acontecer): não publica, só avisa
  const expected = Number((page.pay_links as Record<string, { price: number }> | null)?.[plan]?.price ?? 0);
  if (expected && amount + 0.01 < expected) {
    await notify(db, page.user_id, `⚠️ Pagamento menor que o plano: ${page.name}`, `Recebido R$ ${amount}; o plano é R$ ${expected}. Site não publicado.`, "/studio/landing");
    return { short: amount };
  }
  return await publishPaid(db, page, plan === "premiumOneTime" ? { tier: "premium" } : {}, amount);
}

async function onSubscription(db: SupabaseClient, id: string) {
  const sub = await mp(`/preapproval/${id}`);
  if (sub.status !== "authorized") return { status: sub.status };
  const amount = Number(sub.auto_recurring?.transaction_amount ?? 0);
  const m = String(sub.external_reference ?? "").match(/^lp:([0-9a-f-]{36}):(monthly|premiumMonthly)$/);
  const { data: page } = m ? await db.from("landing_pages").select("*").eq("id", m[1]).maybeSingle() : { data: null };
  if (!page) {
    // Assinatura pelo link fixo: não dá para saber de qual cliente é; avisa o Bruno uma vez
    const { data: owner } = await db.from("social_accounts").select("user_id").eq("meta->>brand", "paginaspro").limit(1).maybeSingle();
    if (!owner) return { ignored: "sem dono" };
    if (!(await claim(db, { id: `preapproval:${id}`, user_id: owner.user_id, plan: "monthly", amount, status: sub.status }))) return { duplicate: true };
    await notify(db, owner.user_id, `💳 Assinatura nova: R$ ${amount}/mês`, `${sub.payer_email ?? ""} · ligue o plano mensal na landing do cliente e publique`, "/studio/landing");
    return { unmatched: true };
  }
  if (!(await claim(db, { id: `preapproval:${id}`, user_id: page.user_id, page_id: page.id, plan: m![2], amount, status: sub.status }))) return { duplicate: true };
  return await publishPaid(db, page, { plan: "monthly", ...(m![2] === "premiumMonthly" ? { tier: "premium" } : {}) }, amount);
}

// deno-lint-ignore no-explicit-any
async function publishPaid(db: SupabaseClient, page: any, extra: Record<string, unknown>, amount: number) {
  if (!page.content) {
    await notify(db, page.user_id, `💳 Pagamento recebido: ${page.name} R$ ${amount}`, "A página ainda não tem conteúdo; gere e publique no Studio.", "/studio/landing");
    return { paid: true, published: false };
  }
  const patch = { ...(await publishPatch(db, page, "published")), ...extra, paid_at: new Date().toISOString() };
  const { data: saved } = await db.from("landing_pages").update(patch).eq("id", page.id).select().single();
  const p = saved ?? { ...page, ...patch };
  const url = p.domain ? `https://${p.domain}` : `${SITE}/p/${p.slug}`;
  if (page.conversation_id) {
    // O "paguei" do cliente tinha chamado o Bruno; com o pagamento conferido a IA volta a atender
    await db.from("conversations").update({ status: "open", handoff_reason: null }).eq("id", page.conversation_id).ilike("handoff_reason", "%pag%");
    await sendMessage(db, page.conversation_id, `Pagamento confirmado, muito obrigado! ✅\n\nSeu site já está no ar: ${url}\n\nPode divulgar no Instagram, no Google e no status do WhatsApp. Qualquer ajuste, é só me chamar aqui.`, "ai")
      .catch((e) => console.error("mercadopago send", e));
  }
  await notify(db, page.user_id, `💳 Pagamento recebido: ${page.name} R$ ${amount.toLocaleString("pt-BR")}`, `Site publicado: ${url}`, "/studio/landing");
  return { paid: true, published: true, url };
}
