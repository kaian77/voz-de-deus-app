// Ações de IA chamadas pelo app (JWT do usuário): legendas, carrosséis, plano semanal,
// auditoria da vitrine e análise de concorrentes.
import { z } from "npm:zod@4";
import { adminClient, corsHeaders, handleError, HttpError, json, requireUser } from "../_shared/util.ts";
import { aiEnabled, brandContext, generateJSON } from "../_shared/claude.ts";
import { runTool } from "../_shared/agent-tools.ts";

const SYSTEM = (brand: string) =>
  `Você é estrategista de conteúdo e social media sênior, especialista em Instagram e TikTok no Brasil. ` +
  `Escreve em português do Brasil, com ganchos fortes, linguagem natural e CTAs claros. Nunca invente números.\n\nContexto da marca:\n${brand}`;

const Caption = z.object({ hook: z.string(), caption: z.string(), hashtags: z.array(z.string()) });
const Carousel = z.object({
  title: z.string(),
  slides: z.array(z.object({ title: z.string(), body: z.string() })),
  caption: z.string(),
  hashtags: z.array(z.string()),
});
const Plan = z.object({
  posts: z.array(z.object({
    day: z.string(),
    time: z.string(),
    kind: z.enum(["image", "carousel", "reel", "story", "video", "photos"]),
    platforms: z.array(z.enum(["instagram", "tiktok"])),
    idea: z.string(),
    hook: z.string(),
  })),
});
const Audit = z.object({
  score: z.number(),
  summary: z.string(),
  bio_suggestions: z.array(z.string()),
  highlight_ideas: z.array(z.string()),
  grid_feedback: z.string(),
  content_pillars: z.array(z.string()),
  best_times: z.array(z.string()),
  quick_wins: z.array(z.string()),
});
const CompetitorAnalysis = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  content_patterns: z.array(z.string()),
  opportunities: z.array(z.string()),
  ideas_to_adapt: z.array(z.string()),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const userId = await requireUser(req);
    const db = adminClient();
    const ctx = { db, userId };
    const { action, ...input } = await req.json();

    // Ações sem IA (dados ao vivo do Instagram)
    if (action === "sync_competitor") return json(await runTool(ctx, "sync_competitor", input));
    if (action === "profile") return json(await runTool(ctx, "get_instagram_profile", input));
    if (!aiEnabled()) throw new HttpError(400, "Configure ANTHROPIC_API_KEY nas secrets do Supabase para usar a IA.");

    const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
    const system = SYSTEM(brandContext(settings));

    switch (action) {
      case "caption":
        return json(await generateJSON(Caption, system,
          `Crie uma legenda para um post do tipo "${input.kind ?? "post"}" para ${(input.platforms ?? ["instagram"]).join(" e ")}.\n` +
          `Tema/briefing: ${input.topic}\n` +
          `Regras: primeira linha é o gancho; parágrafos curtos; termine com CTA; 5 a 12 hashtags relevantes (sem #) separadas no campo hashtags.`));

      case "carousel":
        return json(await generateJSON(Carousel, system,
          `Crie um carrossel de ${input.slides ?? 7} slides sobre: ${input.topic}\n` +
          `Slide 1 = capa com gancho irresistível (título até 8 palavras). Slides do meio = 1 ideia por slide, título curto + corpo até 25 palavras. ` +
          `Último slide = CTA (salvar, compartilhar, comentar palavra-chave). Também escreva a legenda e hashtags (sem #).`));

      case "plan":
        return json(await generateJSON(Plan, system,
          `Monte um calendário de ${input.days ?? 7} dias começando em ${input.start ?? "amanhã"}, com ${input.per_day ?? 1} post(s) por dia, ` +
          `misturando formatos (reels, carrossel, fotos no TikTok, stories). Objetivo: ${input.goal ?? "crescer seguidores e engajamento"}. ` +
          `Use horários no formato HH:MM. Dias no formato AAAA-MM-DD.`));

      case "audit_profile": {
        const data = await runTool(ctx, "get_instagram_profile", { account_id: input.account_id }) as any;
        const analysis = await generateJSON(Audit, system,
          `Audite a "vitrine" deste perfil do Instagram (bio, nome, link, grade, consistência visual, formatos, engajamento por post, horários). ` +
          `Dê nota de 0 a 100, 3 opções de bio (até 150 caracteres cada), ideias de destaques, feedback da grade, pilares de conteúdo, ` +
          `melhores horários (com base nos dados) e ações rápidas.\n\nDados:\n${JSON.stringify(data).slice(0, 60000)}`, "high");
        const account = await db.from("social_accounts").select("id").eq("user_id", userId).eq("platform", "instagram").limit(1).maybeSingle();
        const { data: saved } = await db.from("profile_audits").insert({
          user_id: userId, account_id: input.account_id ?? account.data?.id ?? null, source: "ai", snapshot: data.profile, analysis,
        }).select().single();
        return json(saved);
      }

      case "analyze_competitor": {
        const { data: competitor } = await db.from("competitors").select("*").eq("id", input.id).eq("user_id", userId).single();
        if (!competitor) throw new HttpError(404, "Concorrente não encontrado");
        if (!competitor.snapshot && !competitor.notes) throw new HttpError(400, "Sincronize ou adicione anotações sobre o concorrente antes de analisar.");
        const analysis = await generateJSON(CompetitorAnalysis, system,
          `Analise o concorrente @${competitor.username} (${competitor.platform}) e compare com a nossa marca. ` +
          `Aponte forças, padrões de conteúdo (formatos, ganchos, temas, frequência), oportunidades que eles não exploram e ideias para adaptarmos (sem copiar).\n\n` +
          `Anotações: ${competitor.notes ?? "-"}\nDados: ${JSON.stringify(competitor.snapshot ?? {}).slice(0, 60000)}`, "high");
        const { data } = await db.from("competitors").update({ analysis }).eq("id", competitor.id).select().single();
        return json(data);
      }

      default:
        throw new HttpError(400, `Ação desconhecida: ${action}`);
    }
  } catch (err) {
    return handleError(err);
  }
});
