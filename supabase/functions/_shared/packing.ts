// Fila de separação: todos os pedidos pagos que ainda vão ser embalados, do Mercado Livre, da Shopee e do site
// (Nuvemshop), com a foto de cada item, para a tela que mostra e fala o que vai em cada pacote.
// Só lê: não muda pedido, envio nem anúncio. Do comprador vai só o primeiro nome.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ml, mlTokenFor } from "./mercadolivre.ts";
import { shopee, shopeeTokenFor } from "./shopee.ts";
import { ns, storeFor, txt } from "./nuvemshop.ts";

export type PackChannel = "mercadolivre" | "shopee" | "nuvemshop";
export type PackItem = { title: string; short: string; qty: number; variation?: string; image?: string };
export type PackOrder = {
  channel: PackChannel;
  id: string;
  number: string;
  name: string;
  created_at: string;
  status?: string;
  items: PackItem[];
  /** Códigos que podem estar no código de barras da etiqueta (envio, rastreio, número do pedido). */
  codes: string[];
};
export type PackChannelInfo = { channel: PackChannel; connected: boolean; count: number; error?: string };

const DAY = 86400_000;

/** Nome curto e fácil de falar: tira "Pin", "(Metal Esmaltado)" e o que vem depois de " - ". */
export function shortName(title: string) {
  let s = title.replace(/\s+/g, " ").trim();
  s = s.replace(/\((?:em )?metal esmaltado\)/gi, "").replace(/\bmetal esmaltado\b/gi, "");
  s = s.replace(/^(?:(?:pins?|bottons?|broches?)(?: de| do| da)?\s+)+/i, "");
  s = s.split(/ [-–|] /)[0];
  s = s.replace(/\s+(multicolorido|colorido)\b.*$/i, "");
  s = s.replace(/[,;:]+\s*$/, "").replace(/\s+/g, " ").trim();
  if (s.length > 48) s = s.slice(0, 48).replace(/\s+\S*$/, "");
  return s || title.slice(0, 48);
}

const firstName = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s || s.includes("*")) return "";
  const w = s.split(/\s+/)[0];
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
};

async function pool<T, R>(list: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, async () => {
    while (i < list.length) {
      const k = i++;
      out[k] = await fn(list[k]);
    }
  }));
  return out;
}

async function account(db: SupabaseClient, userId: string, platform: string) {
  const { data } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", platform).order("connected_at").limit(1).maybeSingle();
  return data;
}

// ---------- Mercado Livre ----------
const ML_TO_PACK = new Set(["ready_to_ship", "handling"]);

async function mlQueue(db: SupabaseClient, userId: string): Promise<PackOrder[] | null> {
  const acc = await account(db, userId, "mercadolivre");
  if (!acc) return null;
  const token = await mlTokenFor(db, acc.id);
  const from = new Date(Date.now() - 30 * DAY).toISOString().replace("Z", "-00:00");
  const orders: any[] = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const r = await ml<{ results?: any[]; paging?: { total?: number } }>(token,
      `/orders/search?seller=${acc.external_id}&order.status=paid&order.date_created.from=${encodeURIComponent(from)}&sort=date_asc&limit=50&offset=${offset}`);
    orders.push(...(r.results ?? []));
    if ((r.results ?? []).length < 50 || offset + 50 >= (r.paging?.total ?? 0)) break;
  }
  const paid = orders.filter((o) => o.status === "paid" && o.shipping?.id);

  // Envio de cada pedido: fica só o que ainda vai ser embalado aqui (sai o Full, que o ML manda do galpão dele)
  const shipIds = [...new Set(paid.map((o) => String(o.shipping.id)))];
  const ships = new Map<string, any>();
  await pool(shipIds, 8, async (id) => {
    const s = await ml(token, `/shipments/${id}`).catch(() => null);
    if (s) ships.set(id, s);
  });
  const open = paid.filter((o) => {
    const s = ships.get(String(o.shipping.id));
    return s && ML_TO_PACK.has(s.status) && s.logistic_type !== "fulfillment";
  });

  // Fotos: a da variação comprada, se houver, senão a primeira do anúncio
  const itemIds = [...new Set(open.flatMap((o) => (o.order_items ?? []).map((i: any) => i.item?.id)).filter(Boolean))] as string[];
  const items = new Map<string, any>();
  for (let k = 0; k < itemIds.length; k += 20) {
    const r = await ml<any[]>(token, `/items?ids=${itemIds.slice(k, k + 20).join(",")}&attributes=id,thumbnail,pictures,variations`).catch(() => []);
    for (const x of r ?? []) if (x?.body?.id) items.set(x.body.id, x.body);
  }
  const photo = (itemId: string, variationId?: number) => {
    const it = items.get(itemId);
    if (!it) return undefined;
    const pics: any[] = it.pictures ?? [];
    const v = variationId ? (it.variations ?? []).find((x: any) => x.id === variationId) : undefined;
    const pid = v?.picture_ids?.[0];
    const pic = (pid && pics.find((p) => p.id === pid)) || pics[0];
    return pic?.secure_url ?? pic?.url ?? it.thumbnail?.replace(/^http:/, "https:");
  };

  // Um carrinho com vários anúncios vira vários pedidos com o mesmo pack_id: junta num pacote só
  const packs = new Map<string, PackOrder>();
  for (const o of open) {
    const key = String(o.pack_id ?? o.id);
    const s = ships.get(String(o.shipping.id));
    const p: PackOrder = packs.get(key) ?? {
      channel: "mercadolivre",
      id: key,
      number: key,
      name: firstName(o.buyer?.first_name) || firstName(s?.receiver_address?.receiver_name) || String(o.buyer?.nickname ?? ""),
      created_at: o.date_created,
      status: s?.substatus === "printed" ? "etiqueta impressa" : "a enviar",
      items: [],
      codes: [],
    };
    for (const i of o.order_items ?? []) {
      const title = String(i.item?.title ?? "Item");
      const variation = (i.item?.variation_attributes ?? []).map((a: any) => a.value_name).filter(Boolean).join(" / ") || undefined;
      p.items.push({ title, short: shortName(title), qty: Number(i.quantity ?? 1), variation, image: photo(i.item?.id, i.item?.variation_id) });
    }
    p.codes.push(String(o.id), String(o.shipping.id), ...(s?.tracking_number ? [String(s.tracking_number)] : []));
    if (o.pack_id) p.codes.push(String(o.pack_id));
    if (o.date_created < p.created_at) p.created_at = o.date_created;
    packs.set(key, p);
  }
  return [...packs.values()].map((p) => ({ ...p, codes: [...new Set(p.codes)] }));
}

// ---------- Shopee ----------
async function shopeeQueue(db: SupabaseClient, userId: string): Promise<PackOrder[] | null> {
  const acc = await account(db, userId, "shopee");
  if (!acc) return null;
  const shopId = String(acc.external_id);
  const token = await shopeeTokenFor(db, acc.id, shopId);
  const sns = new Set<string>();
  const now = Math.floor(Date.now() / 1000);
  // A Shopee só aceita janelas de até 15 dias: olha os últimos 30 em duas
  for (const status of ["READY_TO_SHIP", "PROCESSED"]) {
    for (let w = 0; w < 2; w++) {
      const time_to = now - w * 15 * 86400;
      const time_from = time_to - 15 * 86400 + 1;
      let cursor = "";
      for (let page = 0; page < 10; page++) {
        const r = await shopee<{ order_list?: { order_sn: string }[]; more?: boolean; next_cursor?: string }>(token, shopId, "/api/v2/order/get_order_list", {
          params: { time_range_field: "create_time", time_from, time_to, page_size: 100, cursor, order_status: status },
        });
        for (const o of r?.order_list ?? []) sns.add(o.order_sn);
        if (!r?.more || !r.next_cursor) break;
        cursor = r.next_cursor;
      }
    }
  }
  const list = [...sns];
  const details: any[] = [];
  for (let k = 0; k < list.length; k += 50) {
    const r = await shopee<{ order_list?: any[] }>(token, shopId, "/api/v2/order/get_order_detail", {
      params: { order_sn_list: list.slice(k, k + 50).join(","), response_optional_fields: "item_list,buyer_username,recipient_address,package_list" },
    });
    details.push(...(r?.order_list ?? []));
  }
  const tracking = new Map<string, string>();
  await pool(details, 6, async (o) => {
    const t = await shopee<{ tracking_number?: string }>(token, shopId, "/api/v2/logistics/get_tracking_number", { params: { order_sn: o.order_sn } }).catch(() => null);
    if (t?.tracking_number) tracking.set(o.order_sn, t.tracking_number);
  });
  return details.map((o) => ({
    channel: "shopee" as const,
    id: o.order_sn,
    number: o.order_sn,
    name: firstName(o.recipient_address?.name) || String(o.buyer_username ?? ""),
    created_at: new Date(Number(o.create_time) * 1000).toISOString(),
    status: o.order_status === "PROCESSED" ? "etiqueta pronta" : "a enviar",
    items: (o.item_list ?? []).map((i: any) => ({
      title: String(i.item_name ?? "Item"),
      short: shortName(String(i.item_name ?? "Item")),
      qty: Number(i.model_quantity_purchased ?? 1),
      variation: i.model_name || undefined,
      image: i.image_info?.image_url || undefined,
    })),
    codes: [o.order_sn, ...(tracking.get(o.order_sn) ? [tracking.get(o.order_sn)!] : []),
      ...(o.package_list ?? []).map((p: any) => p.package_number).filter(Boolean)],
  }));
}

// ---------- Site (Nuvemshop) ----------
const NS_TO_PACK = new Set(["unpacked", "unfulfilled", "unshipped"]);

async function siteQueue(db: SupabaseClient, userId: string): Promise<PackOrder[] | null> {
  const store = await storeFor(db, userId);
  if (!store) return null;
  const all: any[] = [];
  for (let page = 1; page <= 5; page++) {
    const params = new URLSearchParams({ status: "open", payment_status: "paid", per_page: "100", page: String(page) });
    const list = await ns<any[]>(store.token, store.storeId, `orders?${params}`).catch((e) => {
      if (/404|Last page/i.test(String(e))) return [];
      throw e;
    });
    const got = Array.isArray(list) ? list : [];
    all.push(...got);
    if (got.length < 100) break;
  }
  return all.filter((o) => NS_TO_PACK.has(o.shipping_status)).map((o) => ({
    channel: "nuvemshop" as const,
    id: String(o.id),
    number: String(o.number),
    name: firstName(o.contact_name ?? o.customer?.name ?? o.billing_name),
    created_at: o.created_at,
    status: o.shipping_status === "unpacked" ? "a embalar" : "a enviar",
    items: (o.products ?? []).map((p: any) => {
      const title = txt(p.name);
      const values = (p.variant_values ?? []).map((v: unknown) => txt(v)).filter(Boolean).join(" / ");
      return {
        title,
        short: shortName(title.replace(/\s*\([^)]*\)\s*$/, (m) => (values ? "" : m))),
        qty: Number(p.quantity ?? 1),
        variation: values || undefined,
        image: p.image?.src || undefined,
      };
    }),
    codes: [String(o.number), String(o.id), ...(o.shipping_tracking_number ? [String(o.shipping_tracking_number)] : [])],
  }));
}

/** Todos os pacotes a embalar, do mais antigo para o mais novo. Um canal com erro não derruba os outros. */
export async function packingQueue(db: SupabaseClient, userId: string) {
  const runs: [PackChannel, (db: SupabaseClient, u: string) => Promise<PackOrder[] | null>][] = [
    ["mercadolivre", mlQueue],
    ["shopee", shopeeQueue],
    ["nuvemshop", siteQueue],
  ];
  const results = await Promise.all(runs.map(async ([channel, fn]) => {
    try {
      const orders = await fn(db, userId);
      return { info: { channel, connected: orders !== null, count: orders?.length ?? 0 } as PackChannelInfo, orders: orders ?? [] };
    } catch (e) {
      return { info: { channel, connected: true, count: 0, error: e instanceof Error ? e.message : String(e) } as PackChannelInfo, orders: [] };
    }
  }));
  const orders = results.flatMap((r) => r.orders).filter((o) => o.items.length)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return { orders, channels: results.map((r) => r.info), at: new Date().toISOString() };
}
