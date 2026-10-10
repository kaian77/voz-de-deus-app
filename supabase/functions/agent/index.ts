// API do agente (Claude). Autenticação por chave criada em Studio > Claude & API.
//
//   GET  /functions/v1/agent/tools                 -> lista as ferramentas
//   POST /functions/v1/agent/tools/<ferramenta>    -> executa (corpo JSON = parâmetros)
//   POST /functions/v1/agent/mcp/<chave>           -> servidor MCP (Streamable HTTP, sem estado)
//
// A chave vai em "Authorization: Bearer <chave>", em ?key=<chave> ou no fim da URL do MCP.
import { adminClient, corsHeaders, handleError, HttpError, json, sha256Hex } from "../_shared/util.ts";
import { runTool, toolList } from "../_shared/agent-tools.ts";

const SERVER_INFO = { name: "social-studio", title: "Social Studio (Instagram + TikTok)", version: "1.0.0" };
const SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

async function authenticate(req: Request, segments: string[]) {
  const url = new URL(req.url);
  const key = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("key") ||
    (segments[0] === "mcp" ? segments[1] : undefined);
  if (!key?.startsWith("sst_")) throw new HttpError(401, "Chave de API ausente ou inválida");
  const db = adminClient();
  const { data } = await db.from("api_keys").select("id,user_id").eq("key_hash", await sha256Hex(key)).maybeSingle();
  if (!data) throw new HttpError(401, "Chave de API inválida");
  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { db, userId: data.user_id as string };
}

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };

async function handleRpc(ctx: Awaited<ReturnType<typeof authenticate>>, msg: RpcRequest) {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });

  switch (msg.method) {
    case "initialize": {
      const requested = msg.params?.protocolVersion;
      return reply({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Você opera o Social Studio do usuário (Instagram + TikTok). Comece com get_overview para ver contas, marca e agenda. " +
          "Posts que você cria podem exigir aprovação do usuário. Horários sempre em ISO 8601 com fuso (padrão America/Sao_Paulo). " +
          "Para carrosséis com design, envie slides (o app renderiza). Para mídia própria, use import_media.",
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: toolList() });
    case "tools/call": {
      try {
        const result = await runTool(ctx, msg.params?.name, msg.params?.arguments);
        return reply({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        return reply({ content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });
      }
    }
    default:
      if (msg.id === undefined) return null; // notificação (ex: notifications/initialized)
      return fail(-32601, `Método não suportado: ${msg.method}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const path = new URL(req.url).pathname.split("/").filter(Boolean);
    const segments = path.slice(path.indexOf("agent") + 1);

    if (segments[0] === "mcp") {
      if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...corsHeaders, Allow: "POST" } });
      const ctx = await authenticate(req, segments);
      const body = await req.json();
      if (Array.isArray(body)) {
        const out = (await Promise.all(body.map((m) => handleRpc(ctx, m)))).filter(Boolean);
        return out.length ? json(out) : new Response(null, { status: 202, headers: corsHeaders });
      }
      const out = await handleRpc(ctx, body);
      return out ? json(out) : new Response(null, { status: 202, headers: corsHeaders });
    }

    if (segments[0] === "tools") {
      const ctx = await authenticate(req, segments);
      if (!segments[1]) return json({ tools: toolList() });
      const args = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      try {
        return json({ result: await runTool(ctx, segments[1], args) });
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : String(e));
      }
    }

    return json({ ok: true, server: SERVER_INFO, endpoints: ["GET /agent/tools", "POST /agent/tools/<nome>", "POST /agent/mcp/<chave>"] });
  } catch (err) {
    return handleError(err);
  }
});
