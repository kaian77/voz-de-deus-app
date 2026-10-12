// Ações de IA chamadas pelo app (JWT do usuário): legendas, carrosséis, plano semanal,
// auditoria da vitrine e análise de concorrentes.
import { z } from "npm:zod@4";
import { adminClient, corsHeaders, handleError, HttpError, json, requireUser } from "../_shared/util.ts";
import { aiEnabled, brandContext, generateJSON } from "../_shared/claude.ts";
import { readWebPage, runTool } from "../_shared/agent-tools.ts";
import { nsCategories, nsOrders, nsPages, nsProducts, nsStore, storeFor } from "../_shared/nuvemshop.ts";
import { createFromDraft, suggestProduct, templateFor } from "../_shared/products.ts";
import { startProductVideo } from "../_shared/product-video.ts";
import { hgLooks, hgVoices } from "../_shared/heygen.ts";
import { ttCreatorInfo, ttTokenFor } from "../_shared/tiktok.ts";

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
    if (action === "tiktok_creator") {
      const { data: account } = await db.from("social_accounts").select("id").eq("user_id", userId).eq("platform", "tiktok").order("connected_at").limit(1).maybeSingle();
      if (!account) throw new HttpError(404, "Conecte o TikTok em Contas");
      return json(await ttCreatorInfo(await ttTokenFor(db, account.id)));
    }
    if (action === "store_orders") {
      const store = await storeFor(db, userId);
      if (!store) throw new HttpError(404, "Conecte a Nuvemshop em Contas");
      return json(await nsOrders(store.token, store.storeId, { status: input.status, q: input.q, limit: input.limit ?? 50 }));
    }
    if (action === "store_categories") {
      const store = await storeFor(db, userId);
      if (!store) throw new HttpError(404, "Conecte a Nuvemshop em Contas");
      return json(await nsCategories(store.token, store.storeId));
    }
    if (action === "product_create") return json(await createFromDraft(db, userId, String(input.draft_id)));
    if (action === "heygen_options") {
      const [avatars, voices] = await Promise.all([hgLooks(), hgVoices()]);
      return json({ avatars, voices });
    }
    if (action === "product_video") {
      // Vídeo de um produto já cadastrado pelo Studio (rascunho) — ou de um vídeo anterior, para refazer
      const { data: draft } = input.draft_id
        ? await db.from("product_drafts").select("name,images,overrides,product_url").eq("id", input.draft_id).eq("user_id", userId).single()
        : { data: null };
      const { data: previous } = input.video_id
        ? await db.from("product_videos").select("name,images,product_url").eq("id", input.video_id).eq("user_id", userId).single()
        : { data: null };
      const source = draft
        ? { name: draft.name ?? "Produto", images: draft.overrides?.social_images?.length ? draft.overrides.social_images : draft.images, url: draft.product_url }
        : previous
        ? { name: previous.name, images: previous.images, url: previous.product_url }
        : null;
      if (!source) throw new HttpError(404, "Produto não encontrado");
      return json(await startProductVideo(db, userId, source, { style: input.style, force: true }));
    }
    if (action === "product_suggest") {
      const { data: draft } = await db.from("product_drafts").select("images,name,template_id").eq("id", input.draft_id).eq("user_id", userId).single();
      if (!draft) throw new HttpError(404, "Rascunho não encontrado");
      const template = await templateFor(db, userId, draft.template_id);
      const suggestion = await suggestProduct(db, userId, draft.images, template?.data, draft.name || undefined);
      if ("listing" in suggestion) {
        // Guarda o cadastro gerado para o "Cadastrar" usar sem gerar de novo
        const { data: current } = await db.from("product_drafts").select("overrides").eq("id", input.draft_id).single();
        await db.from("product_drafts").update({ name: suggestion.name, overrides: { ...(current?.overrides ?? {}), ai: suggestion.listing } }).eq("id", input.draft_id);
      }
      return json(suggestion);
    }
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
        let { data: competitor } = await db.from("competitors").select("*").eq("id", input.id).eq("user_id", userId).single();
        if (!competitor) throw new HttpError(404, "Concorrente não encontrado");
        // Sem dados ainda: pesquisa o perfil antes de analisar
        if (!competitor.snapshot) competitor = await runTool(ctx, "sync_competitor", { username: competitor.username, platform: competitor.platform }) as typeof competitor;
        const analysis = await generateJSON(CompetitorAnalysis, system,
          `Analise o concorrente @${competitor.username} (${competitor.platform}) e compare com a nossa marca. ` +
          `Aponte forças, padrões de conteúdo (formatos, ganchos, temas, frequência), oportunidades que eles não exploram e ideias para adaptarmos (sem copiar).\n\n` +
          `Anotações: ${competitor.notes ?? "-"}\nDados: ${JSON.stringify(competitor.snapshot ?? {}).slice(0, 60000)}`, "high");
        const { data } = await db.from("competitors").update({ analysis }).eq("id", competitor.id).select().single();
        return json(data);
      }

      case "knowledge_from_store": {
        // Junta o que existe de fonte confiável (Nuvemshop + site) e pede um texto de FAQ para o agente
        const sources: string[] = [];
        const store = await storeFor(db, userId);
        if (store) {
          const [info, pages, products] = await Promise.all([
            nsStore(store.token, store.storeId).catch(() => null),
            nsPages(store.token, store.storeId).catch(() => []),
            nsProducts(store.token, store.storeId, { limit: 60 }).catch(() => []),
          ]);
          if (info) sources.push(`Loja:\n${JSON.stringify(info)}`);
          for (const p of pages) sources.push(`Página "${p.title}":\n${p.text}`);
          if (products.length) sources.push(`Alguns produtos:\n${products.map((p) => `${p.name} — ${p.price ?? "?"}`).join("\n")}`);
        }
        const site = input.site_url || (store?.account.meta?.url as string | undefined);
        if (site) {
          const home = await readWebPage(site, 15000).catch(() => null);
          if (home) {
            sources.push(`Site (${home.url}):\n${home.text}`);
            const useful = home.links.filter((l) =>
              /troca|devolu|envio|entrega|frete|prazo|pagamento|faq|perguntas|d[uú]vidas|sobre|quem somos|contato|pol[ií]tica|atacado|personaliz/i.test(`${l.text} ${l.url}`) &&
              new URL(l.url).host === new URL(home.url).host,
            ).slice(0, 6);
            for (const l of useful) {
              const page = await readWebPage(l.url, 8000).catch(() => null);
              if (page) sources.push(`Página "${l.text}" (${page.url}):\n${page.text}`);
            }
          }
        }
        if (!sources.length) throw new HttpError(400, "Conecte a Nuvemshop em Contas ou informe o endereço do site.");
        const result = await generateJSON(z.object({ knowledge: z.string() }), system,
          `Monte a base de conhecimento do atendente virtual da loja a partir das fontes abaixo. ` +
          `Escreva em tópicos curtos e objetivos (texto puro, sem markdown pesado): link da loja, formas de pagamento, frete e prazos, ` +
          `trocas e devoluções, pedidos personalizados/atacado, contatos e horários, cupons/promoções vigentes e perguntas frequentes. ` +
          `Use SOMENTE o que estiver nas fontes; se uma informação não aparecer, não escreva o tópico. Não liste o catálogo inteiro ` +
          `(o agente já consulta os produtos ao vivo). Máximo de 3500 caracteres.\n\n${sources.join("\n\n---\n\n").slice(0, 80000)}`);
        return json(result);
      }

      default:
        throw new HttpError(400, `Ação desconhecida: ${action}`);
    }
  } catch (err) {
    return handleError(err);
  }
});
