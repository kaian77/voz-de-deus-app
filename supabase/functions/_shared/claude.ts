// IA do app (legendas, carrosséis, respostas de comentários, auditoria de perfil) via Claude API.
import Anthropic from "npm:@anthropic-ai/sdk@0.133";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.133/helpers/zod";
import type { z } from "npm:zod@4";
import { adminClient, env } from "./util.ts";

const MODEL = () => env("CLAUDE_MODEL", "claude-opus-5-5");

let client: Anthropic | null = null;
function anthropic() {
  client ??= new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  return client;
}

/** Registra o consumo de cada chamada (página Uso do Studio). Nunca atrapalha a chamada. */
function track(source: string, response: { model: string; usage: { input_tokens: number; output_tokens: number } }) {
  adminClient().from("ai_usage").insert({
    source, model: response.model, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
  }).then(() => {}, () => {});
}

export function aiEnabled() {
  return Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
}

type Effort = "low" | "medium" | "high";

/** Tira metades soltas de emoji (um .slice() pode cortar um emoji ao meio e a API recusa o JSON). */
export function wellFormed(text: string) {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

export async function generateJSON<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  prompt: string,
  effort: Effort = "medium",
  images: string[] = [],
): Promise<z.infer<T>> {
  // Imagens por URL pública (ex.: fotos de produto no storage do Studio)
  prompt = wellFormed(prompt);
  const content = images.length
    ? [...images.slice(0, 8).map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })), { type: "text" as const, text: prompt }]
    : prompt;
  const response = await anthropic().messages.parse({
    model: MODEL(),
    max_tokens: 16000,
    system: wellFormed(system),
    messages: [{ role: "user", content }],
    output_config: { effort, format: zodOutputFormat(schema) },
  });
  track("textos", response);
  if (response.stop_reason === "refusal") throw new Error("A IA recusou este pedido. Reformule e tente de novo.");
  if (!response.parsed_output) throw new Error("A IA não retornou um resultado válido.");
  return response.parsed_output;
}

export async function generateText(system: string, prompt: string, effort: Effort = "low"): Promise<string> {
  const response = await anthropic().messages.create({
    model: MODEL(),
    max_tokens: 16000,
    system: wellFormed(system),
    messages: [{ role: "user", content: wellFormed(prompt) }],
    output_config: { effort },
  });
  track("textos", response);
  if (response.stop_reason === "refusal") throw new Error("A IA recusou este pedido.");
  return response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

export function brandContext(settings: Record<string, unknown> | null): string {
  if (!settings) return "Marca sem configurações definidas ainda.";
  const lines = [
    settings.brand_name && `Marca: ${settings.brand_name}`,
    settings.niche && `Nicho: ${settings.niche}`,
    settings.audience && `Público: ${settings.audience}`,
    settings.tone && `Tom de voz: ${settings.tone}`,
    settings.default_hashtags && `Hashtags da marca: ${settings.default_hashtags}`,
    settings.default_cta && `CTA padrão: ${settings.default_cta}`,
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "Marca sem configurações definidas ainda.";
}

/**
 * Pesquisa na web (ferramenta de busca do próprio Claude) e devolve o texto da pesquisa + as fontes.
 * O Claude Haiku usa a versão básica da ferramenta; os demais modelos, a versão com filtragem dinâmica.
 */
export async function researchWeb(system: string, prompt: string, maxUses = 5): Promise<{ text: string; sources: string[] }> {
  const model = MODEL();
  system = wellFormed(system);
  prompt = wellFormed(prompt);
  const tool = model.includes("haiku")
    ? { type: "web_search_20250305" as const, name: "web_search" as const, max_uses: maxUses }
    : { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: maxUses };
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let response = await anthropic().messages.create({ model, max_tokens: 16000, system, messages, tools: [tool] });
  track("pesquisa", response);
  // pause_turn: o loop de busca do servidor parou no limite; reenviar o turno retoma de onde parou
  for (let i = 0; i < 4 && response.stop_reason === "pause_turn"; i++) {
    messages.push({ role: "assistant", content: response.content });
    response = await anthropic().messages.create({ model, max_tokens: 16000, system, messages, tools: [tool] });
    track("pesquisa", response);
    messages.pop();
  }
  if (response.stop_reason === "refusal") throw new Error("A IA recusou esta pesquisa.");
  const sources = new Set<string>();
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) if (r.type === "web_search_result") sources.add(r.url);
    }
  }
  return { text: text.trim(), sources: [...sources].slice(0, 10) };
}

export type AgentTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  // deno-lint-ignore no-explicit-any
  run?: (input: any) => Promise<unknown>; // sem run = ferramenta final (encerra e devolve o input)
};

/**
 * Agente com ferramentas: o modelo consulta o que precisar (produtos, pedidos, cupons...) e termina
 * chamando a ferramenta final (a que não tem run), cujo input é o resultado.
 */
export async function runAgent<T>(system: string, prompt: string, tools: AgentTool[], effort: Effort = "low", maxSteps = 6): Promise<T> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: wellFormed(prompt) }];
  const defs = tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })) as Anthropic.Tool[];
  const final = tools.find((t) => !t.run)!;
  for (let step = 0; step < maxSteps; step++) {
    const last = step === maxSteps - 1;
    const response = await anthropic().messages.create({
      model: MODEL(),
      max_tokens: 16000,
      system: wellFormed(system),
      messages,
      tools: defs,
      tool_choice: last ? { type: "tool", name: final.name } : { type: "any" },
      output_config: { effort },
    });
    track("atendimento", response);
    if (response.stop_reason === "refusal") throw new Error("A IA recusou este pedido.");
    const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const done = calls.find((c) => c.name === final.name);
    if (done) {
      // A IA pode chamar uma ferramenta (ex.: montar_previa) e responder na mesma vez: roda as ferramentas antes
      for (const call of calls) {
        const tool = tools.find((t) => t.name === call.name);
        if (call !== done && tool?.run) await Promise.resolve(tool.run(call.input)).catch((e) => console.error("ferramenta", call.name, e));
      }
      return done.input as T;
    }
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const tool = tools.find((t) => t.name === call.name);
      let out: unknown;
      try {
        out = tool?.run ? await tool.run(call.input) : { erro: "ferramenta desconhecida" };
      } catch (e) {
        out = { erro: e instanceof Error ? e.message : String(e) };
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: wellFormed(JSON.stringify(out ?? null)).slice(0, 12000) });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("O agente não terminou a resposta.");
}
