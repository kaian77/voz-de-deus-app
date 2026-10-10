// IA do app (legendas, carrosséis, respostas de comentários, auditoria de perfil) via Claude API.
import Anthropic from "npm:@anthropic-ai/sdk@0.133";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.133/helpers/zod";
import type { z } from "npm:zod@4";
import { env } from "./util.ts";

const MODEL = () => env("CLAUDE_MODEL", "claude-opus-5-5");

let client: Anthropic | null = null;
function anthropic() {
  client ??= new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  return client;
}

export function aiEnabled() {
  return Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
}

type Effort = "low" | "medium" | "high";

export async function generateJSON<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  prompt: string,
  effort: Effort = "medium",
): Promise<z.infer<T>> {
  const response = await anthropic().messages.parse({
    model: MODEL(),
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort, format: zodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") throw new Error("A IA recusou este pedido. Reformule e tente de novo.");
  if (!response.parsed_output) throw new Error("A IA não retornou um resultado válido.");
  return response.parsed_output;
}

export async function generateText(system: string, prompt: string, effort: Effort = "low"): Promise<string> {
  const response = await anthropic().messages.create({
    model: MODEL(),
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort },
  });
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
