/**
 * Avaliações do site com cupom: o cliente informa o número do pedido e o e-mail da compra; se baterem com
 * um pedido da Nuvemshop, a avaliação é salva (pendente de aprovação do dono) e o cupom vai na hora e por e-mail.
 * E-mail pelo Resend (RESEND_API_KEY; remetente REVIEW_EMAIL_FROM, domínio verificado no Resend).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { nsFindOrder } from "./nuvemshop.ts";
import { HttpError } from "./util.ts";

const FROM = Deno.env.get("REVIEW_EMAIL_FROM") ?? "Brax Pins Mania <contato@braxpinsmania.com.br>";
const SITE = "https://braxpinsmania.com.br";

export type ReviewInput = { store: string; name: string; email: string; order: string; rating: number; comment?: string };

const clean = (s: unknown, max: number) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);

/** A loja (Nuvemshop) do formulário → dono e token. */
async function storeByExternalId(db: SupabaseClient, storeId: string) {
  const { data: account } = await db.from("social_accounts").select("id,user_id,external_id").eq("platform", "nuvemshop").eq("external_id", storeId).maybeSingle();
  if (!account) return null;
  const { data: tok } = await db.from("account_tokens").select("access_token").eq("account_id", account.id).maybeSingle();
  return tok ? { userId: account.user_id as string, token: tok.access_token as string, storeId } : null;
}

export async function submitReview(db: SupabaseClient, input: ReviewInput) {
  const name = clean(input.name, 80);
  const email = clean(input.email, 160).toLowerCase();
  const comment = clean(input.comment, 1500);
  const rating = Math.round(Number(input.rating));
  if (!name) throw new HttpError(400, "Escreva seu nome.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "E-mail inválido.");
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, "Escolha de 1 a 5 estrelas.");
  const store = await storeByExternalId(db, clean(input.store, 20));
  if (!store) throw new HttpError(404, "Loja não encontrada.");

  const order = await nsFindOrder(store.token, store.storeId, clean(input.order, 20)).catch(() => null);
  if (!order || String(order.email ?? "").toLowerCase() !== email) {
    throw new HttpError(400, "Não achamos um pedido com esse número e esse e-mail. Use o e-mail da compra e o número do pedido (está no e-mail de confirmação).");
  }
  if (order.status === "cancelled" || !["pago", "pagamento autorizado"].includes(String(order.payment))) {
    throw new HttpError(400, "Esse pedido ainda não foi pago ou foi cancelado.");
  }

  const { data: settings } = await db.from("brand_settings").select("review_coupon").eq("user_id", store.userId).maybeSingle();
  const coupon = settings?.review_coupon || "AVALIA10";
  const row = {
    user_id: store.userId, order_id: String(order.id), order_number: String(order.number), name, email, rating,
    comment: comment || null, products: (order.items ?? []).join(", ").slice(0, 500), coupon,
  };
  const { data: existing } = await db.from("site_reviews").select("id,emailed_at").eq("user_id", store.userId).eq("order_id", row.order_id).maybeSingle();
  if (existing) return { ok: true, already: true, coupon, emailed: !!existing.emailed_at };
  const { data: saved, error } = await db.from("site_reviews").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  const emailed = await emailCoupon(db, saved.id, { name, email, coupon });
  return { ok: true, coupon, emailed };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function couponEmail(p: { name: string; coupon: string }) {
  const first = esc(p.name.split(" ")[0]);
  p = { ...p, coupon: esc(p.coupon) };
  return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#111111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-top:5px solid #E3262E;border-radius:8px">
<tr><td style="background:#111111;padding:20px 24px"><span style="font-family:Impact,'Arial Narrow',sans-serif;font-size:24px;letter-spacing:.5px;color:#ffffff;text-transform:uppercase">Brax <span style="color:#E3262E">Pins</span> Mania</span></td></tr>
<tr><td style="padding:28px 24px 8px">
<p style="margin:0 0 12px;font-size:18px;font-weight:bold">Obrigado pela avaliação, ${first}!</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333333">Sua opinião ajuda outros clientes a escolher o pin certo. Como agradecimento, aqui está <b>10% de desconto</b> na sua próxima compra:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px"><tr><td style="border:2px dashed #FFC72C;background:#111111;border-radius:8px;padding:14px 28px;text-align:center">
<span style="display:block;font-size:12px;letter-spacing:.14em;color:#FFC72C;text-transform:uppercase">Seu cupom</span>
<span style="display:block;font-family:Impact,'Arial Narrow',sans-serif;font-size:32px;letter-spacing:2px;color:#ffffff">${p.coupon}</span></td></tr></table>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#333333">É só digitar o cupom no carrinho, no campo "Cupom de desconto".</p>
<p style="margin:0 0 28px;text-align:center"><a href="${SITE}/lancamentos/" style="display:inline-block;background:#E3262E;color:#ffffff;font-weight:bold;text-decoration:none;padding:14px 26px;border-radius:6px">Ver os lançamentos</a></p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eeeeee;font-size:12px;color:#777777;line-height:1.5">Brax Pins Mania · Brasília – DF · <a href="mailto:contato@braxpinsmania.com.br" style="color:#777777">contato@braxpinsmania.com.br</a><br>Você recebeu este e-mail porque avaliou um pedido no nosso site.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Manda o cupom por e-mail e registra o resultado na avaliação. */
async function emailCoupon(db: SupabaseClient, reviewId: string, p: { name: string; email: string; coupon: string }) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    await db.from("site_reviews").update({ email_error: "RESEND_API_KEY não configurada" }).eq("id", reviewId);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [p.email], reply_to: "contato@braxpinsmania.com.br", subject: `Seu cupom de 10%: ${p.coupon}`, html: couponEmail(p) }),
  });
  if (!res.ok) {
    await db.from("site_reviews").update({ email_error: `${res.status}: ${(await res.text()).slice(0, 300)}` }).eq("id", reviewId);
    return false;
  }
  await res.body?.cancel();
  await db.from("site_reviews").update({ emailed_at: new Date().toISOString(), email_error: null }).eq("id", reviewId);
  return true;
}

/** Cron: reenvia os cupons que não saíram (ex.: e-mail configurado depois). */
export async function sendPendingReviewEmails(db: SupabaseClient) {
  if (!Deno.env.get("RESEND_API_KEY")) return { skipped: "sem RESEND_API_KEY" };
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await db.from("site_reviews").select("id,name,email,coupon").is("emailed_at", null).gte("created_at", since).limit(20);
  let sent = 0;
  for (const r of data ?? []) if (await emailCoupon(db, r.id, { name: r.name, email: r.email, coupon: r.coupon ?? "AVALIA10" })) sent++;
  return { sent, pending: (data?.length ?? 0) - sent };
}
