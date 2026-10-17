// Formulário público "Avalie e ganhe 10%" (página /avaliar do Studio): valida o pedido na Nuvemshop e manda o cupom.
import { adminClient, corsHeaders, handleError, json } from "../_shared/util.ts";
import { submitReview } from "../_shared/reviews.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ ok: true });
    return json(await submitReview(adminClient(), await req.json()));
  } catch (e) {
    return handleError(e);
  }
});
