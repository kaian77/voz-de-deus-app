// Manda uma mensagem pelo WhatsApp da loja (WAHA) para o número que recebe os avisos do atendente (brand_settings.handoff_phone).
// Workflow "WhatsApp: mensagem para a chefe" (wa-boss.yml), texto no input `text`.
import { adminClient } from "../supabase/functions/_shared/util.ts";
import { sendWhatsAppTo } from "../supabase/functions/_shared/sale-alerts.ts";

const db = adminClient();
const text = (Deno.env.get("TEXT") ?? "").trim();
if (!text) throw new Error("texto vazio");
const { data: rows } = await db.from("brand_settings").select("user_id,handoff_phone").not("handoff_phone", "is", null);
if (!rows?.length) throw new Error("nenhum handoff_phone configurado");
for (const r of rows) {
  const id = await sendWhatsAppTo(db, r.user_id, r.handoff_phone, text);
  console.log("enviado para", r.handoff_phone.replace(/\d(?=\d{4})/g, "•"), id ?? "");
}
