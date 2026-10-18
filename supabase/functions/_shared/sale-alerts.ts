// Aviso de venda no WhatsApp: o cron procura vendas novas no Mercado Livre, na Shopee e no site (Nuvemshop)
// e manda uma mensagem para o número escolhido, pelo WhatsApp conectado (de preferência o WAHA).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ml, mlTokenFor } from "./mercadolivre.ts";
import { shopee, shopeeTokenFor } from "./shopee.ts";
import { ns, orderSummary, storeFor } from "./nuvemshop.ts";
import { waSendText, wahaChatIdFor, wahaSendText } from "./whatsapp.ts";
import { notify } from "./push.ts";

export type SaleChannel = "mercadolivre" | "shopee" | "nuvemshop";
type Sale = { channel: SaleChannel; id: string; number: string; items: string[]; total?: string; buyer?: string };

const LABEL: Record<SaleChannel, string> = { mercadolivre: "Mercado Livre", shopee: "Shopee", nuvemshop: "Site (Nuvemshop)" };
const brl = (v: unknown) => (v == null || v === "" ? undefined : `R$ ${Number(v).toFixed(2).replace(".", ",")}`);

export function saleMessage(s: Sale) {
  return [
    `🛒 *Nova venda — ${LABEL[s.channel]}*`,
    `Pedido ${s.number}`,
    ...s.items.slice(0, 10),
    s.total ? `Total: ${s.total}` : "",
    s.buyer ? `Comprador: ${s.buyer}` : "",
  ].filter(Boolean).join("\n");
}

async function account(db: SupabaseClient, userId: string, platform: string) {
  const { data } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", platform).order("connected_at").limit(1).maybeSingle();
  return data;
}

async function mlSales(db: SupabaseClient, userId: string, since: Date): Promise<Sale[]> {
  const acc = await account(db, userId, "mercadolivre");
  if (!acc) return [];
  const token = await mlTokenFor(db, acc.id);
  const from = since.toISOString().replace("Z", "-00:00");
  const r = await ml<{ results?: any[] }>(token, `/orders/search?seller=${acc.external_id}&order.date_created.from=${encodeURIComponent(from)}&sort=date_desc&limit=50`);
  return (r.results ?? []).filter((o) => o.status === "paid").map((o) => ({
    channel: "mercadolivre" as const,
    id: String(o.id),
    number: String(o.pack_id ?? o.id),
    items: (o.order_items ?? []).map((i: any) => `${i.quantity}x ${i.item?.title ?? "item"}`),
    total: brl(o.total_amount),
    buyer: o.buyer?.nickname,
  }));
}

async function shopeeSales(db: SupabaseClient, userId: string, since: Date): Promise<Sale[]> {
  const acc = await account(db, userId, "shopee");
  if (!acc) return [];
  const token = await shopeeTokenFor(db, acc.id, acc.external_id);
  const list = await shopee<{ order_list?: { order_sn: string; order_status: string }[] }>(token, acc.external_id, "/api/v2/order/get_order_list", {
    params: { time_range_field: "create_time", time_from: Math.floor(since.getTime() / 1000), time_to: Math.floor(Date.now() / 1000), page_size: 50, response_optional_fields: "order_status" },
  });
  const paid = (list.order_list ?? []).filter((o) => !["UNPAID", "CANCELLED", "IN_CANCEL"].includes(o.order_status));
  if (!paid.length) return [];
  const detail = await shopee<{ order_list?: any[] }>(token, acc.external_id, "/api/v2/order/get_order_detail", {
    params: { order_sn_list: paid.map((o) => o.order_sn).join(","), response_optional_fields: "item_list,total_amount,buyer_username" },
  });
  return (detail.order_list ?? []).map((o) => ({
    channel: "shopee" as const,
    id: o.order_sn,
    number: o.order_sn,
    items: (o.item_list ?? []).map((i: any) => `${i.model_quantity_purchased ?? 1}x ${i.item_name}`),
    total: brl(o.total_amount),
    buyer: o.buyer_username,
  }));
}

async function siteSales(db: SupabaseClient, userId: string, since: Date): Promise<Sale[]> {
  const store = await storeFor(db, userId);
  if (!store) return [];
  const params = new URLSearchParams({ created_at_min: since.toISOString(), payment_status: "paid", per_page: "50" });
  const list = await ns<any[]>(store.token, store.storeId, `orders?${params}`);
  return (Array.isArray(list) ? list : []).map(orderSummary).map((o) => ({
    channel: "nuvemshop" as const,
    id: String(o.id),
    number: `#${o.number}`,
    items: o.items,
    total: o.total,
    buyer: o.customer,
  }));
}

/** Manda uma mensagem de WhatsApp para um telefone qualquer pelo número conectado (WAHA de preferência). */
export async function sendWhatsAppTo(db: SupabaseClient, userId: string, phone: string, text: string) {
  // Número brasileiro sem DDI (61 99133-1525) ganha o 55
  const digits = phone.replace(/\D/g, "");
  phone = digits.length <= 11 ? `55${digits}` : digits;
  const { data: accounts } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", "whatsapp").order("connected_at");
  const acc = (accounts ?? []).find((a) => a.meta?.provider === "waha") ?? accounts?.[0];
  if (!acc) throw new Error("Conecte um WhatsApp em Contas");
  const { data: tok } = await db.from("account_tokens").select("access_token").eq("account_id", acc.id).maybeSingle();
  if (acc.meta?.provider === "waha") {
    const cfg = { base_url: acc.meta.base_url, session: acc.meta.session, api_key: tok?.access_token || null };
    return wahaSendText(cfg, await wahaChatIdFor(cfg, phone), text);
  }
  if (!tok) throw new Error("WhatsApp sem token — reconecte em Contas");
  return waSendText(tok.access_token, acc.external_id, phone.replace(/\D/g, ""), text);
}

const SOURCES: Record<SaleChannel, (db: SupabaseClient, userId: string, since: Date) => Promise<Sale[]>> = {
  mercadolivre: mlSales,
  shopee: shopeeSales,
  nuvemshop: siteSales,
};

/** Roda no cron: avisa as vendas novas de cada usuário que configurou um número. */
export async function runSaleAlerts(db: SupabaseClient) {
  const { data: users } = await db.from("brand_settings").select("user_id, sale_alert_phone, sale_alert_channels, sale_alert_since").not("sale_alert_phone", "is", null);
  const out: Record<string, unknown>[] = [];
  for (const u of users ?? []) {
    if (!u.sale_alert_phone) continue;
    // Só vendas depois de ligar o aviso, e no máximo dos últimos 2 dias
    const since = new Date(Math.max(new Date(u.sale_alert_since ?? Date.now()).getTime(), Date.now() - 2 * 86400_000));
    for (const channel of (u.sale_alert_channels ?? []) as SaleChannel[]) {
      if (!SOURCES[channel]) continue;
      const sales = await SOURCES[channel](db, u.user_id, since).catch((e) => {
        out.push({ user: u.user_id, channel, error: e instanceof Error ? e.message : String(e) });
        return [] as Sale[];
      });
      for (const sale of sales) {
        const text = saleMessage(sale);
        // Registra antes de mandar: se o cron rodar duas vezes, a segunda não repete
        const { error: dup } = await db.from("sale_alerts").insert({ user_id: u.user_id, channel, order_id: sale.id, summary: text });
        if (dup) continue;
        await notify(db, u.user_id, `🛒 Nova venda — ${LABEL[channel]}`,
          [sale.total, sale.items[0]].filter(Boolean).join(" · "), "/studio/pedidos").catch(() => {});
        const result = await sendWhatsAppTo(db, u.user_id, u.sale_alert_phone, text).then(() => null, (e) => (e instanceof Error ? e.message : String(e)));
        await db.from("sale_alerts").update(result ? { error: result } : { sent_at: new Date().toISOString() })
          .eq("user_id", u.user_id).eq("channel", channel).eq("order_id", sale.id);
        out.push({ user: u.user_id, channel, order: sale.id, error: result ?? undefined });
      }
    }
  }
  return out;
}
