// Ações de IA chamadas pelo app (JWT do usuário): legendas, carrosséis, plano semanal,
// auditoria da vitrine e análise de concorrentes.
import { z } from "npm:zod@4";
import { adminClient, corsHeaders, handleError, HttpError, json, requireUser } from "../_shared/util.ts";
import { aiEnabled, brandContext, generateJSON } from "../_shared/claude.ts";
import { readWebPage, runTool } from "../_shared/agent-tools.ts";
import { ns, nsCategories, nsFillShopping, nsOrders, nsPages, nsProducts, nsStore, storeFor } from "../_shared/nuvemshop.ts";
import { createFromDraft, publishToMarketplaces, suggestProduct, templateFor } from "../_shared/products.ts";
import { postVideo, queueProductVideo, videoOptions } from "../_shared/product-video.ts";
import { aiVideoPost, aiVideoProviders, checkAiVideo, pollAiVideos, startAiVideo } from "../_shared/ai-video.ts";
import { analyzeMarketplace } from "../_shared/marketplaces.ts";
import { mlSyncStatus, startMlSync } from "../_shared/ml-sync.ts";
import { improveMlShowcase, setMlPremium } from "../_shared/ml-quality.ts";
import { generateIdeas } from "../_shared/content-ideas.ts";
import { finishStrategy, researchStrategy, startStrategy } from "../_shared/strategy.ts";
import { brasiliaNow, digestMessage, salesSummary } from "../_shared/daily.ts";
import { runVideosFor, videoAutopilotStatus } from "../_shared/video-autopilot.ts";
import { sendWhatsAppTo } from "../_shared/sale-alerts.ts";
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
    if (action === "store_products") {
      // Busca de produtos da loja para vincular a um post
      const store = await storeFor(db, userId);
      if (!store) throw new HttpError(400, "Conecte a Nuvemshop em Contas");
      const list = await nsProducts(store.token, store.storeId, { q: input.q ? String(input.q).slice(0, 80) : undefined, limit: 24 });
      return json(list.map((p) => ({ id: p.id, name: p.name, image: p.image, url: p.url })));
    }
    if (action === "store_product_pick") {
      // Produto escolhido: copia as fotos para o storage do Studio (o carrossel desenha no navegador e o post publica de lá)
      const store = await storeFor(db, userId);
      if (!store) throw new HttpError(400, "Conecte a Nuvemshop em Contas");
      const id = String(input.id ?? "").replace(/\D/g, "");
      if (!id) throw new HttpError(400, "Produto inválido");
      // deno-lint-ignore no-explicit-any
      const p = await ns<any>(store.token, store.storeId, `products/${id}`);
      if (!p || Array.isArray(p)) throw new HttpError(404, "Produto não encontrado");
      const images: string[] = [];
      // deno-lint-ignore no-explicit-any
      for (const [i, img] of (p.images ?? []).slice(0, 4).entries() as Iterable<[number, any]>) {
        const src = String(img?.src ?? "");
        if (!src) continue;
        const res = await fetch(src.startsWith("//") ? `https:${src}` : src).catch(() => null);
        if (!res?.ok) continue;
        const type = res.headers.get("content-type") ?? "image/jpeg";
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
        const path = `${userId}/produtos/${id}-${i}.${ext}`;
        const { error } = await db.storage.from("media").upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: type, upsert: true });
        if (!error) images.push(db.storage.from("media").getPublicUrl(path).data.publicUrl);
      }
      const txt = (v: unknown) => (typeof v === "string" ? v : (v as Record<string, string>)?.pt ?? "");
      return json({
        id: p.id, name: txt(p.name), url: p.canonical_url, images,
        description: txt(p.description).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 600),
      });
    }
    if (action === "store_product_video") {
      // Vídeo animado do produto escolhido no Criar post (vira Reels/TikTok em Aprovações quando fica pronto)
      const storage = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/media/${userId}/`;
      const images = (Array.isArray(input.images) ? input.images : []).filter((u: unknown) => typeof u === "string" && u.startsWith(storage)).slice(0, 4);
      const name = String(input.name ?? "").trim().slice(0, 120);
      if (!name || !images.length) throw new HttpError(400, "Escolha um produto com foto");
      const notes = String(input.topic ?? "").trim().slice(0, 500);
      return json(await queueProductVideo(db, userId, {
        name, images, url: typeof input.url === "string" ? input.url : undefined,
        description: [notes && `Tema do vídeo: ${notes}`, String(input.description ?? "").slice(0, 600)].filter(Boolean).join("\n") || undefined,
      }, { autopost: true, ...videoOptions(input) }));
    }
    if (action === "store_categories") {
      const store = await storeFor(db, userId);
      if (!store) throw new HttpError(404, "Conecte a Nuvemshop em Contas");
      return json(await nsCategories(store.token, store.storeId));
    }
    if (action === "product_create") return json(await createFromDraft(db, userId, String(input.draft_id)));
    if (action === "store_fill_shopping") {
      // MPN, faixa etária e gênero nos produtos que já estão na loja (uma página por chamada)
      const store = await storeFor(db, userId);
      if (!store) throw new HttpError(404, "Conecte a Nuvemshop em Contas");
      return json(await nsFillShopping(store.token, store.storeId, { page: Number(input.page) || 1, age_group: input.age_group, gender: input.gender }));
    }
    if (action === "ml_sync_start") return json(await startMlSync(db, userId));
    if (action === "ml_sync_status") return json(await mlSyncStatus(db, userId));
    if (action === "ml_quality") return json(await improveMlShowcase(db, userId, { fix: input.fix !== false }));
    if (action === "ml_premium") return json(await setMlPremium(db, userId));
    if (action === "marketplace_analyze") return json(await analyzeMarketplace(db, userId, input.platform === "shopee" ? "shopee" : "mercadolivre"));
    if (action === "marketplace_publish") {
      // Publica no Mercado Livre um produto já cadastrado na loja pelo Studio
      const { data: draft } = await db.from("product_drafts").select("*").eq("id", input.draft_id).eq("user_id", userId).single();
      if (!draft?.product_id) throw new HttpError(404, "Cadastre o produto na loja primeiro");
      const store = await storeFor(db, userId);
      if (!store) throw new HttpError(404, "Conecte a Nuvemshop em Contas");
      // deno-lint-ignore no-explicit-any
      const p = await ns<any>(store.token, store.storeId, `products/${draft.product_id}`);
      const v = p.variants?.[0] ?? {};
      const results = await publishToMarketplaces(db, userId, draft.id, {
        name: draft.name ?? "Produto",
        description: (p.description?.pt ?? "") as string,
        images: draft.images,
        price: Number(v.price),
        sku: v.sku || undefined,
        stock: v.stock ?? null,
      }, true);
      return json(results ?? {});
    }
    if (action === "product_video") {
      // Vídeo animado de um produto cadastrado pelo Studio (ou refazer um vídeo anterior)
      const { data: draft } = input.draft_id
        ? await db.from("product_drafts").select("name,images,product_url").eq("id", input.draft_id).eq("user_id", userId).single()
        : { data: null };
      const { data: previous } = input.video_id
        ? await db.from("product_videos").select("name,images,product_url,caption,autopost,brief").eq("id", input.video_id).eq("user_id", userId).single()
        : { data: null };
      const source = draft ?? previous;
      if (!source?.images?.length) throw new HttpError(404, "Produto não encontrado");
      return json(await queueProductVideo(db, userId, {
        name: source.name ?? "Produto",
        images: source.images,
        url: source.product_url,
        description: previous?.brief?.notes || undefined,
      }, { autopost: previous ? previous.autopost !== false : true, ...videoOptions(input, previous?.brief) }));
    }
    if (action === "video_only") {
      // Vídeo avulso: só a foto e o nome, para baixar (não vira post nem cadastra produto)
      const name = String(input.name ?? "").trim().slice(0, 80);
      const storage = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/media/${userId}/`;
      const images = (Array.isArray(input.images) ? input.images : []).filter((u: unknown) => typeof u === "string" && u.startsWith(storage)).slice(0, 7);
      if (!name) throw new HttpError(400, "Dê um nome para o produto");
      if (!images.length) throw new HttpError(400, "Envie pelo menos uma foto");
      const notes = String(input.description ?? "").trim().slice(0, 800);
      return json(await queueProductVideo(db, userId, { name, images, description: notes || undefined }, { autopost: false, ...videoOptions(input) }));
    }
    if (action === "content_ideas") {
      // "Criar ideias agora": carrosséis vão para Aprovações; vídeos entram na fila e chegam lá quando ficam prontos
      const r = await generateIdeas(db, userId, { count: Number(input.count) || 4, focus: input.focus ? String(input.focus).slice(0, 500) : undefined });
      await db.from("brand_settings").update({ autopilot_last_run: new Date().toISOString(), autopilot_error: null }).eq("user_id", userId);
      return json(r);
    }
    if (action === "video_post") {
      // Transforma um vídeo pronto (ex.: avulso) em post de Reels + TikTok
      const { data: v } = await db.from("product_videos").select("*").eq("id", input.video_id).eq("user_id", userId).single();
      if (!v || v.status !== "ready" || !v.video_url) throw new HttpError(400, "O vídeo ainda não está pronto");
      if (v.post_id) {
        const { data: existing } = await db.from("posts").select("id,status").eq("id", v.post_id).maybeSingle();
        if (existing) return json({ post: existing });
      }
      const post = await postVideo(db, v);
      if (!post) throw new HttpError(400, "Conecte o Instagram ou o TikTok em Contas para postar");
      return json({ post });
    }
    // Vídeos IA (Kling / Higgsfield)
    if (action === "ai_video_providers") return json(aiVideoProviders());
    if (action === "ai_video_create") return json(await startAiVideo(db, userId, input));
    if (action === "ai_video_check") {
      if (input.id) {
        const { data: v } = await db.from("ai_videos").select("*").eq("id", input.id).eq("user_id", userId).maybeSingle();
        if (!v) throw new HttpError(404, "Vídeo não encontrado");
        return json(await checkAiVideo(db, v));
      }
      return json(await pollAiVideos(db, userId));
    }
    if (action === "ai_video_post") return json({ post: await aiVideoPost(db, userId, String(input.id), input.caption ? String(input.caption) : undefined) });
    if (action === "ai_video_delete") {
      const { data: v } = await db.from("ai_videos").select("id,video_url").eq("id", input.id).eq("user_id", userId).maybeSingle();
      if (!v) throw new HttpError(404, "Vídeo não encontrado");
      if (v.video_url?.includes(`/storage/v1/object/public/media/${userId}/ia/`)) await db.storage.from("media").remove([`${userId}/ia/${v.id}.mp4`]);
      await db.from("ai_videos").delete().eq("id", v.id);
      return json({ ok: true });
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
    if (action === "sales_summary") return json(await salesSummary(db, userId));
    // Vídeos diários do TikTok
    if (action === "video_autopilot_status") return json(await videoAutopilotStatus(db, userId));
    if (action === "video_autopilot_save") {
      const perDay = Math.min(Math.max(Number(input.per_day) || 0, 0), 20);
      await db.from("brand_settings").upsert({ user_id: userId, video_daily: perDay }, { onConflict: "user_id" });
      return json(await videoAutopilotStatus(db, userId));
    }
    if (action === "video_autopilot_restart") {
      const { data: st } = await db.from("brand_settings").select("video_cycle").eq("user_id", userId).maybeSingle();
      await db.from("brand_settings").update({ video_cycle: (st?.video_cycle ?? 1) + 1, video_cycle_done_at: null, video_daily_last: null }).eq("user_id", userId);
      return json(await videoAutopilotStatus(db, userId));
    }
    if (action === "video_autopilot_run") {
      // Faz os de hoje agora; o das 9h de hoje não roda de novo
      await db.from("brand_settings").update({ video_daily_last: brasiliaNow().date }).eq("user_id", userId);
      const result = await runVideosFor(db, userId);
      return json({ ...result, status: await videoAutopilotStatus(db, userId) });
    }
    if (action === "digest_now") {
      // Manda o resumo do dia agora (teste), para o número dos avisos de venda
      const { data: st } = await db.from("brand_settings").select("brand_name, sale_alert_phone").eq("user_id", userId).maybeSingle();
      if (!st?.sale_alert_phone) throw new HttpError(400, "Salve primeiro o número em Contas → Avisos no WhatsApp");
      await sendWhatsAppTo(db, userId, st.sale_alert_phone, digestMessage(await salesSummary(db, userId), st.brand_name));
      return json({ ok: true });
    }
    // Estratégia em 3 etapas (cada uma cabe no tempo da function): vendas -> pesquisa de mercado -> plano
    if (action === "strategy_start" || action === "strategy_research" || action === "strategy_finish") {
      if (!aiEnabled()) throw new HttpError(400, "Configure ANTHROPIC_API_KEY para usar a IA.");
      if (action === "strategy_start") return json(await startStrategy(db, userId, { tiktok: typeof input.tiktok === "string" ? input.tiktok : undefined, goal: input.goal }));
      if (action === "strategy_research") return json(await researchStrategy(db, userId, String(input.strategy_id), input.fresh === true));
      return json(await finishStrategy(db, userId, String(input.strategy_id)));
    }
    if (action === "strategy_videos") {
      // Um vídeo por produto escolhido pela estratégia; a IA escreve os textos aos poucos pelo cron
      const { data: st } = await db.from("strategies").select("*").eq("id", input.strategy_id).eq("user_id", userId).single();
      if (!st) throw new HttpError(404, "Estratégia não encontrada");
      const ids = Array.isArray(input.product_ids) ? new Set(input.product_ids.map(Number)) : null;
      const picks = (st.video_picks as any[]).filter((p) => !ids || ids.has(Number(p.id))).slice(0, 50);
      const platforms = Array.isArray(input.platforms) && input.platforms.length ? input.platforms.map(String) : ["tiktok"];
      let queued = 0;
      for (const p of picks) {
        if (!p.images?.length) continue;
        await queueProductVideo(db, userId, { name: p.name, images: p.images, url: p.url, description: p.description },
          { defer: true, autopost: true, platforms, why: "Vídeo da estratégia de vendas" });
        queued++;
      }
      await db.from("strategies").update({ videos_queued_at: new Date().toISOString() }).eq("id", st.id);
      return json({ queued });
    }
    if (!aiEnabled()) throw new HttpError(400, "Configure ANTHROPIC_API_KEY nas secrets do Supabase para usar a IA.");

    const { data: settings } = await db.from("brand_settings").select("*").eq("user_id", userId).maybeSingle();
    const system = SYSTEM(brandContext(settings));

    switch (action) {
      case "caption":
        return json(await generateJSON(Caption, system,
          `Crie uma legenda para um post do tipo "${input.kind ?? "post"}" para ${(input.platforms ?? ["instagram"]).join(" e ")}.\n` +
          `Tema/briefing: ${input.topic}\n` +
          (input.product?.name ? `Produto da loja divulgado no post: "${String(input.product.name).slice(0, 120)}". Cite-o pelo nome; não invente preço.\n` : "") +
          `Regras: primeira linha é o gancho; parágrafos curtos; termine com CTA; 5 a 12 hashtags relevantes (sem #) separadas no campo hashtags.`));

      case "caption_media": {
        // Legenda olhando a foto (ou um quadro do vídeo) — usada no agendamento em massa
        const storage = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/media/${userId}/`;
        const image = typeof input.image === "string" && input.image.startsWith(storage) ? [input.image] : [];
        return json(await generateJSON(Caption, system,
          `Crie uma legenda para um ${input.kind === "reel" ? "Reels/vídeo" : "post de foto"} para ${(input.platforms ?? ["instagram"]).join(" e ")}.\n` +
          `${image.length ? "Olhe a imagem anexada (é o post ou um quadro do vídeo) e escreva sobre o que aparece nela.\n" : ""}` +
          `${input.hint ? `Contexto do usuário: ${String(input.hint).slice(0, 600)}\n` : ""}` +
          `${input.name ? `Nome do arquivo (pode dar uma pista): ${String(input.name).slice(0, 80)}\n` : ""}` +
          `Regras: primeira linha é o gancho; parágrafos curtos; termine com CTA; 5 a 12 hashtags relevantes (sem #) separadas no campo hashtags. ` +
          `Não invente preços, medidas, materiais ou promoções que não estejam no contexto ou na imagem.`,
          "low", image));
      }

      case "carousel":
        return json(await generateJSON(Carousel, system,
          `Crie um carrossel de ${input.slides ?? 7} slides sobre: ${input.topic}\n` +
          (input.product?.name
            ? `Produto da loja que deve ser divulgado neste carrossel: "${String(input.product.name).slice(0, 120)}"` +
              `${input.product.description ? ` (${String(input.product.description).slice(0, 500)})` : ""}. ` +
              `A foto dele aparece na capa e no último slide: cite o produto pelo nome, ligue o tema a ele e use o CTA para comprar. Não invente preço.\n`
            : "") +
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
