// Notificações no celular (Web Push no Studio instalado como app). As chaves VAPID nascem aqui na 1ª vez
// (tabela app_keys); notify() só enfileira e o cron chama sendPendingPush() a cada minuto.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

let server: webpush.ApplicationServer | null = null;
let publicKey = "";

async function vapid(db: SupabaseClient) {
  if (server) return server;
  let { data } = await db.from("app_keys").select("value").eq("name", "vapid").maybeSingle();
  if (!data) {
    const exported = await webpush.exportVapidKeys(await webpush.generateVapidKeys({ extractable: true }));
    // Duas execuções ao mesmo tempo: fica a primeira gravada
    await db.from("app_keys").upsert({ name: "vapid", value: exported }, { onConflict: "name", ignoreDuplicates: true });
    ({ data } = await db.from("app_keys").select("value").eq("name", "vapid").single());
  }
  const keys = await webpush.importVapidKeys(data!.value as webpush.ExportedVapidKeys, { extractable: true });
  publicKey = await webpush.exportApplicationServerKey(keys);
  server = await webpush.ApplicationServer.new({ contactInformation: "mailto:contato@braxpinsmania.com.br", vapidKeys: keys });
  return server;
}

/** Chave pública que o navegador usa para se inscrever. */
export async function pushPublicKey(db: SupabaseClient) {
  await vapid(db);
  return publicKey;
}

/** Enfileira um aviso para o dono (sai no próximo minuto do cron). */
export async function notify(db: SupabaseClient, userId: string, title: string, body = "", url = "/studio") {
  await db.from("notifications").insert({ user_id: userId, title: title.slice(0, 120), body: body.slice(0, 300), url });
}

/** Envia os avisos pendentes para todos os aparelhos inscritos do dono. */
export async function sendPendingPush(db: SupabaseClient) {
  const { data: pending } = await db.from("notifications").select("*").is("sent_at", null).order("created_at").limit(30);
  if (!pending?.length) return [];
  const app = await vapid(db);
  const out = [];
  const subsByUser = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();
  for (const n of pending) {
    if (!subsByUser.has(n.user_id)) {
      const { data } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", n.user_id);
      subsByUser.set(n.user_id, data ?? []);
    }
    const errors: string[] = [];
    for (const s of subsByUser.get(n.user_id)!) {
      try {
        await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(JSON.stringify({ title: n.title, body: n.body, url: n.url }), { urgency: webpush.Urgency.High, ttl: 86400 });
      } catch (e) {
        // Aparelho que desinstalou/desativou: sai da lista
        if (e instanceof webpush.PushMessageError && (e.isGone() || e.response.status === 404)) {
          await db.from("push_subscriptions").delete().eq("id", s.id);
        } else errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    await db.from("notifications").update({ sent_at: new Date().toISOString(), error: errors.join("; ").slice(0, 500) || null }).eq("id", n.id);
    out.push({ id: n.id, devices: subsByUser.get(n.user_id)!.length, error: errors[0] });
  }
  return out;
}
