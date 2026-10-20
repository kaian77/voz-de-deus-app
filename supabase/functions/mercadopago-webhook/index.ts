// Avisos do Mercado Pago (PáginasPro): pagamento aprovado → publica o site do cliente e manda o link na conversa.
// O corpo do aviso só diz o tipo e o id; o pagamento é conferido na API do Mercado Pago com o token (handleMpNotification).
// Responde 200 na hora (o Mercado Pago reenvia o que não recebe 200) e trabalha em segundo plano.
import { adminClient, json } from "../_shared/util.ts";
import { handleMpNotification } from "../_shared/mercadopago.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  const url = new URL(req.url);
  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => ({}));
  // Formatos: {type, data: {id}} (Webhooks), ?type=payment&data.id=1 ou ?topic=payment&id=1 (IPN antigo)
  const kind = String(body.type ?? body.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
  const id = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (kind && id) {
    const work = handleMpNotification(adminClient(), kind, id)
      .then((r) => console.log("mercadopago", kind, id, JSON.stringify(r)))
      .catch((e) => console.error("mercadopago", kind, id, e));
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;
  }
  return json({ ok: true });
});
