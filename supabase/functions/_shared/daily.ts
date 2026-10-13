// Resumo de vendas e pendências: usado na Visão geral do Studio e no resumo diário pelo WhatsApp.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ns, storeFor } from "./nuvemshop.ts";
import { ml, mlTokenFor } from "./mercadolivre.ts";
import { shopee, shopeeTokenFor } from "./shopee.ts";
import { sendWhatsAppTo } from "./sale-alerts.ts";

type Totals = { orders: number; revenue: number };
type Channel = "site" | "mercadolivre" | "shopee";
const CHANNELS: Channel[] = ["site", "mercadolivre", "shopee"];
const LABEL: Record<Channel, string> = { site: "site", mercadolivre: "ML", shopee: "Shopee" };
const TZ_OFFSET = 3 * 3600_000; // Brasília (UTC-3, sem horário de verão)

/** Meia-noite de hoje em Brasília, em UTC. */
function todayStart(now = Date.now()) {
  const local = new Date(now - TZ_OFFSET);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + TZ_OFFSET;
}
export function brasiliaNow(now = Date.now()) {
  const d = new Date(now - TZ_OFFSET);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}
const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

type Sale = { at: number; total: number };

async function siteSales(db: SupabaseClient, userId: string, since: number) {
  const store = await storeFor(db, userId);
  if (!store) return null;
  const params = new URLSearchParams({ created_at_min: new Date(since).toISOString(), payment_status: "paid", per_page: "200" });
  const list = await ns<any[]>(store.token, store.storeId, `orders?${params}`);
  const sales: Sale[] = (Array.isArray(list) ? list : []).filter((o) => o.status !== "cancelled").map((o) => ({ at: new Date(o.created_at).getTime(), total: Number(o.total ?? 0) }));
  // Para enviar: pedidos pagos e abertos dos últimos 30 dias que ainda não foram despachados
  const open = new URLSearchParams({ created_at_min: new Date(Date.now() - 30 * 86400_000).toISOString(), payment_status: "paid", status: "open", per_page: "200" });
  const pending = await ns<any[]>(store.token, store.storeId, `orders?${open}`).catch(() => []);
  const toShip = (Array.isArray(pending) ? pending : []).filter((o) => !["fulfilled", "shipped", "delivered"].includes(String(o.shipping_status))).length;
  return { sales, toShip };
}

async function mlSales(db: SupabaseClient, userId: string, since: number) {
  const { data: acc } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", "mercadolivre").order("connected_at").limit(1).maybeSingle();
  if (!acc) return null;
  const token = await mlTokenFor(db, acc.id);
  const from = encodeURIComponent(new Date(since).toISOString().replace("Z", "-00:00"));
  const r = await ml<{ results?: any[] }>(token, `/orders/search?seller=${acc.external_id}&order.status=paid&order.date_created.from=${from}&sort=date_desc&limit=50`);
  return { sales: (r.results ?? []).map((o) => ({ at: new Date(o.date_created).getTime(), total: Number(o.total_amount ?? 0) })) as Sale[], toShip: null };
}

async function shopeeSales(db: SupabaseClient, userId: string, since: number) {
  const { data: acc } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", "shopee").order("connected_at").limit(1).maybeSingle();
  if (!acc) return null;
  const token = await shopeeTokenFor(db, acc.id, acc.external_id);
  const list = await shopee<{ order_list?: { order_sn: string; order_status: string }[] }>(token, acc.external_id, "/api/v2/order/get_order_list", {
    params: { time_range_field: "create_time", time_from: Math.floor(since / 1000), time_to: Math.floor(Date.now() / 1000), page_size: 100, response_optional_fields: "order_status" },
  });
  const paid = (list.order_list ?? []).filter((o) => !["UNPAID", "CANCELLED", "IN_CANCEL"].includes(o.order_status));
  const sales: Sale[] = [];
  for (let i = 0; i < paid.length; i += 50) {
    const d = await shopee<{ order_list?: any[] }>(token, acc.external_id, "/api/v2/order/get_order_detail", {
      params: { order_sn_list: paid.slice(i, i + 50).map((o) => o.order_sn).join(","), response_optional_fields: "total_amount" },
    });
    for (const o of d.order_list ?? []) sales.push({ at: Number(o.create_time) * 1000, total: Number(o.total_amount ?? 0) });
  }
  return { sales, toShip: paid.filter((o) => o.order_status === "READY_TO_SHIP").length };
}

const sum = (sales: Sale[], from: number, to = Infinity): Totals => {
  const s = sales.filter((x) => x.at >= from && x.at < to);
  return { orders: s.length, revenue: Math.round(s.reduce((a, x) => a + x.total, 0) * 100) / 100 };
};

/** Vendas de hoje, de ontem e dos últimos 7 dias por canal, pedidos para enviar e pendências do Studio. */
export async function salesSummary(db: SupabaseClient, userId: string) {
  const today = todayStart();
  const yesterday = today - 86400_000;
  const week = today - 6 * 86400_000;
  const sources = { site: siteSales, mercadolivre: mlSales, shopee: shopeeSales } as const;
  const results = await Promise.all(CHANNELS.map((c) => sources[c](db, userId, week).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))));

  const channels: Record<string, { connected: boolean; error?: string; today: Totals; yesterday: Totals; week: Totals; to_ship: number | null }> = {};
  const total = { today: { orders: 0, revenue: 0 }, yesterday: { orders: 0, revenue: 0 }, week: { orders: 0, revenue: 0 }, to_ship: 0 };
  CHANNELS.forEach((c, i) => {
    const r = results[i];
    if (!r) return;
    if ("error" in r) {
      channels[c] = { connected: true, error: r.error, today: { orders: 0, revenue: 0 }, yesterday: { orders: 0, revenue: 0 }, week: { orders: 0, revenue: 0 }, to_ship: null };
      return;
    }
    const row = { connected: true, today: sum(r.sales, today), yesterday: sum(r.sales, yesterday, today), week: sum(r.sales, week), to_ship: r.toShip };
    channels[c] = row;
    for (const k of ["today", "yesterday", "week"] as const) {
      total[k].orders += row[k].orders;
      total[k].revenue = Math.round((total[k].revenue + row[k].revenue) * 100) / 100;
    }
    total.to_ship += row.to_ship ?? 0;
  });

  const [{ count: approvals }, { count: waiting }, { data: strategy }] = await Promise.all([
    db.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending_approval"),
    db.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "needs_human"),
    db.from("strategies").select("plan, created_at").eq("user_id", userId).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    at: new Date().toISOString(),
    channels,
    total,
    approvals: approvals ?? 0,
    waiting: waiting ?? 0,
    tasks: ((strategy?.plan as any)?.weekly_checklist ?? []).slice(0, 3) as string[],
  };
}

export function digestMessage(s: Awaited<ReturnType<typeof salesSummary>>, brand?: string | null) {
  const per = (k: "yesterday" | "week") =>
    CHANNELS.filter((c) => s.channels[c] && !s.channels[c].error).map((c) => `${LABEL[c]} ${s.channels[c][k].orders}`).join(" · ");
  const lines = [
    `☀️ *Bom dia! Resumo${brand ? ` da ${brand}` : ""}*`,
    `Ontem: ${s.total.yesterday.orders} venda${s.total.yesterday.orders === 1 ? "" : "s"} · ${brl(s.total.yesterday.revenue)}${per("yesterday") ? ` (${per("yesterday")})` : ""}`,
    `Últimos 7 dias: ${s.total.week.orders} vendas · ${brl(s.total.week.revenue)}`,
    s.total.to_ship ? `📦 Para enviar: ${s.total.to_ship} pedido${s.total.to_ship === 1 ? "" : "s"}` : "",
    s.approvals ? `✅ Para aprovar no Studio: ${s.approvals}` : "",
    s.waiting ? `💬 Mensagens esperando você: ${s.waiting}` : "",
    s.tasks.length ? `\n🎯 Tarefas da semana:\n${s.tasks.map((t) => `• ${t}`).join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Cron: às 8h de Brasília manda o resumo para quem ligou (uma vez por dia). */
export async function runDailyDigest(db: SupabaseClient) {
  const now = brasiliaNow();
  if (now.hour !== 8) return undefined;
  const { data: users } = await db.from("brand_settings").select("user_id, brand_name, sale_alert_phone, daily_digest_last")
    .eq("daily_digest", true).not("sale_alert_phone", "is", null);
  const out: Record<string, unknown>[] = [];
  for (const u of users ?? []) {
    if (u.daily_digest_last === now.date) continue;
    // Marca antes de mandar: se o cron rodar de novo no mesmo minuto, não repete
    const { data: claimed } = await db.from("brand_settings").update({ daily_digest_last: now.date }).eq("user_id", u.user_id)
      .or(`daily_digest_last.is.null,daily_digest_last.neq.${now.date}`).select("user_id").maybeSingle();
    if (!claimed) continue;
    try {
      const summary = await salesSummary(db, u.user_id);
      await sendWhatsAppTo(db, u.user_id, u.sale_alert_phone, digestMessage(summary, u.brand_name));
      out.push({ user: u.user_id, sent: true });
    } catch (e) {
      out.push({ user: u.user_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
