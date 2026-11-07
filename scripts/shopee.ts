// Shopee pelo GitHub Actions (workflow "Shopee"):
//   deno run -A scripts/shopee.ts probe   → mostra o anúncio modelo e testa o envio de foto (só leitura + 1 foto no banco de imagens)
import { adminClient, hmacHex } from "../supabase/functions/_shared/util.ts";
import { shopee, shopeeItems, shopeeTokenFor } from "../supabase/functions/_shared/shopee.ts";

const db = adminClient();
const cmd = Deno.args[0];
const { data: acc } = await db.from("social_accounts").select("*").eq("platform", "shopee").limit(1).single();
const token = await shopeeTokenFor(db, acc.id, acc.external_id);
const shop = acc.external_id;
const show = (label: string, v: unknown) => console.log(label, JSON.stringify(v, null, 1).slice(0, 4000));

if (cmd === "probe") {
  const ref = acc.meta?.analysis?.reference_id;
  console.log("modelo", ref);
  const base = await shopee(token, shop, "/api/v2/product/get_item_base_info", { params: { item_id_list: ref, need_tax_info: "true", need_complaint_policy: "false" } });
  show("base", base);
  const extra = await shopee(token, shop, "/api/v2/product/get_item_extra_info", { params: { item_id_list: ref } }).catch((e) => String(e));
  show("extra", extra);
  const unl = await shopee(token, shop, "/api/v2/product/get_item_list", { params: { offset: 0, page_size: 100, item_status: "UNLIST" } }).catch((e) => String(e));
  show("unlisted", unl);
  const items = await shopeeItems(token, shop, 300);
  console.log("ativos", items.length, "skus", items.filter((i) => i.item_sku).length);
  // envio de foto (banco de imagens da Shopee)
  const img = await fetch("https://dummyimage.com/800x800/ffffff/000000.jpg&text=teste").then((r) => r.arrayBuffer()).catch(() => null);
  if (img) {
    for (const withShop of [false, true]) {
      const path = "/api/v2/media_space/upload_image";
      const ts = Math.floor(Date.now() / 1000);
      const pid = Deno.env.get("SHOPEE_PARTNER_ID")!;
      const base = withShop ? `${pid}${path}${ts}${token}${shop}` : `${pid}${path}${ts}`;
      const url = new URL("https://partner.shopeemobile.com" + path);
      url.searchParams.set("partner_id", pid);
      url.searchParams.set("timestamp", String(ts));
      url.searchParams.set("sign", await hmacHex(Deno.env.get("SHOPEE_PARTNER_KEY")!, base));
      if (withShop) { url.searchParams.set("access_token", token); url.searchParams.set("shop_id", shop); }
      const form = new FormData();
      form.append("image", new Blob([img], { type: "image/jpeg" }), "t.jpg");
      const r = await fetch(url, { method: "POST", body: form });
      console.log("upload_image", withShop ? "com loja" : "sem loja", r.status, (await r.text()).slice(0, 500));
    }
  }
}
