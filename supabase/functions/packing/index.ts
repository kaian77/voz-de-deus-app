// Separação pela equipe, sem login: a página /studio/separacao/<chave> manda a chave e recebe só a fila
// de pacotes a embalar (primeiro nome, itens, fotos e códigos da etiqueta). Não lê nem muda mais nada.
import { adminClient, corsHeaders, handleError, HttpError, json } from "../_shared/util.ts";
import { packingQueue } from "../_shared/packing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ ok: true });
    const body = await req.json().catch(() => ({}));
    const key = String(body?.key ?? "");
    if (!/^[A-Za-z0-9_-]{24,64}$/.test(key)) throw new HttpError(404, "Este link não vale mais. Peça o link novo da Separação.");
    const db = adminClient();
    const { data } = await db.from("brand_settings").select("user_id").eq("packing_key", key).maybeSingle();
    if (!data?.user_id) throw new HttpError(404, "Este link não vale mais. Peça o link novo da Separação.");
    return json(await packingQueue(db, data.user_id));
  } catch (e) {
    return handleError(e);
  }
});
