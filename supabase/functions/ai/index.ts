// Ações de IA chamadas pelo app (JWT do usuário): legendas, carrosséis, plano semanal,
// auditoria da vitrine e análise de concorrentes.
import { z } from "npm:zod@4";
import { adminClient, corsHeaders, handleError, HttpError, json, requireUser } from "../_shared/util.ts";
import { aiEnabled, brandContext, generateJSON } from "../_shared/claude.ts";
import { readWebPage, runTool } from "../_shared/agent-tools.ts";
import { ns, nsCategories, nsFillShopping, nsOrders, nsPages, nsProducts, nsStore, storeFor } from "../_shared/nuvemshop.ts";
import { createFromDraft, publishToMarketplaces, suggestProduct, templateFor } from "../_shared/products.ts";
import { dispatchRender, postVideo, queueProductVideo, videoOptions } from "../_shared/product-video.ts";
import { aiVideoPost, aiVideoProviders, checkAiVideo, pollAiVideos, startAiVideo } from "../_shared/ai-video.ts";
import { cleanDomain, DNS_RECORDS, importClientData, publishPatch, vercelDomain, vercelDomainStatus, writeLanding } from "../_shared/landing.ts";
import { optimizeStorage, removeStudioFiles } from "../_shared/storage-cleanup.ts";
import { planDay, ytDeleteVideo, ytResearch, ytToken } from "../_shared/youtube.ts";
import { analyzeMarketplace } from "../_shared/marketplaces.ts";
import { mlSyncStatus, startMlSync } from "../_shared/ml-sync.ts";
import { improveMlShowcase, setMlPremium } from "../_shared/ml-quality.ts";
import { generateIdeas } from "../_shared/content-ideas.ts";
import { finishStrategy, researchStrategy, startStrategy } from "../_shared/strategy.ts";
import { brasiliaNow, digestMessage, salesSummary } from "../_shared/daily.ts";
import { runVideosFor, videoAutopilotStatus } from "../_shared/video-autopilot.ts";
import { sendWhatsAppTo } from "../_shared/sale-alerts.ts";
import { ttCreatorInfo, ttTokenFor } from "../_shared/tiktok.ts";
import { notify, pushPublicKey, sendPendingPush } from "../_shared/push.ts";

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
    if (action === "clips_parse_campaign") {
      // Cortes: lê o que o dono colou (texto da campanha e/ou links do Whop, briefing no Google Docs) e preenche o formulário
      const pasted = String(input.text ?? "").slice(0, 20000);
      const urls = [...new Set(pasted.match(/https?:\/\/[^\s)"'<>]+/g) ?? [])];
      if (!pasted.trim()) throw new HttpError(400, "Cole o texto ou o link da campanha");
      const pages: string[] = [];
      for (const u of urls.slice(0, 4)) {
        if (/drive\.google\.com/.test(u)) continue; // pasta dos vídeos: só o link interessa
        const doc = u.match(/docs\.google\.com\/document\/d\/([\w-]+)/)?.[1];
        try {
          const page = await readWebPage(doc ? `https://docs.google.com/document/d/${doc}/export?format=txt` : u, 15000);
          pages.push(`### ${u}\n${page.text}`);
        } catch (e) {
          pages.push(`### ${u}\n(não abriu: ${(e as Error).message})`);
        }
      }
      const found = [pasted, ...pages].join("\n\n");
      const drive = found.match(/https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders|file\/d)\/[\w-]+/)?.[0] ?? "";
      // Só o link da pasta: não há texto para a IA ler, só preenche o link
      const rest = found.replace(/https?:\/\/\S+/g, "").trim();
      if (rest.length < 20) {
        if (!drive) throw new HttpError(400, "Não consegui ler nada nesse link. Cole o texto das regras da campanha ou o link do briefing (Google Docs).");
        return json({ campaign: "", credit: "", hashtags: "", rules: "", url: drive, only_link: true });
      }
      const parsed = await generateJSON(
        z.object({
          campaign: z.string().describe("Nome curto da campanha (ex.: Stream House LA)"),
          credit: z.string().describe("Crédito para a descrição: nome do programa/marca — canal/rede (ex.: Stream House LA — CWETV)"),
          hashtags: z.string().describe("Hashtags obrigatórias separadas por espaço, com #, ou vazio"),
          rules: z.string().describe("Regras e briefing em tópicos curtos, no idioma original: que momentos cortar, estilo, título/logo/CTA obrigatórios, proibições, público"),
        }),
        "Você organiza campanhas de clipping (Whop Content Rewards e parecidas) para um editor de cortes. Use só o que está nas fontes; não invente regras nem hashtags. Campo sem informação nas fontes = string vazia (nunca escreva avisos ou pedidos nos campos).",
        `Fontes da campanha:\n\n${found}`,
        "low",
      );
      return json({ ...parsed, url: drive });
    }
    if (action === "usage_report") {
      // Página Uso: storage/banco/IA (função studio_usage) + minutos do GitHub Actions no mês (estimativa pelas execuções)
      const now = new Date();
      const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const { data: usage, error } = await db.rpc("studio_usage", { since });
      if (error) throw new HttpError(500, error.message);
      const token = Deno.env.get("VIDEO_DISPATCH_TOKEN");
      const repo = Deno.env.get("VIDEO_REPO") || "kaian77/voz-de-deus-app";
      const actions: Record<string, { runs: number; minutes: number }> = {};
      let actionsError: string | null = token ? null : "Sem o token do GitHub (VIDEO_DISPATCH_TOKEN)";
      for (let page = 1; token && page <= 10; page++) {
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=100&page=${page}&created=%3E%3D${since.slice(0, 10)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "BraxStudio", "X-GitHub-Api-Version": "2022-11-28" },
        });
        if (!res.ok) {
          actionsError = `GitHub ${res.status}`;
          break;
        }
        const { workflow_runs: runs = [] } = await res.json();
        for (const r of runs) {
          if (r.status !== "completed" || !r.run_started_at) continue;
          // O GitHub cobra cada job arredondado para cima (mínimo 1 min); os nossos workflows têm 1 job
          const minutes = Math.max(1, Math.ceil((new Date(r.updated_at).getTime() - new Date(r.run_started_at).getTime()) / 60000));
          const w = (actions[r.name] ??= { runs: 0, minutes: 0 });
          w.runs++;
          w.minutes += minutes;
        }
        if (runs.length < 100) break;
      }
      return json({ since, ...usage, actions, actions_error: actionsError });
    }
    if (action === "usage_optimize") {
      // Botão "Otimizar agora" (Studio → Uso): tira do storage os vídeos antigos que já não servem
      const days = Math.min(30, Math.max(1, Number(input.days) || 3));
      return json(await optimizeStorage(db, days));
    }
    if (action === "push_key") return json({ key: await pushPublicKey(db) });
    if (action === "push_subscribe") {
      // Celular/computador que ativou os avisos do Studio (Web Push)
      const sub = input.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
      if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new HttpError(400, "Inscrição inválida");
      const { error } = await db.from("push_subscriptions").upsert({
        user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
        user_agent: String(input.user_agent ?? "").slice(0, 200) || null,
      }, { onConflict: "endpoint" });
      if (error) throw new HttpError(500, error.message);
      await notify(db, userId, "🔔 Avisos ligados", "Você vai receber aqui as vendas, os clientes que pedem atendimento e os vídeos prontos.");
      return json({ ok: true, sent: await sendPendingPush(db) });
    }
    if (action === "push_unsubscribe") {
      await db.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", String(input.endpoint ?? ""));
      return json({ ok: true });
    }
    if (action === "clips_add_source") {
      // Cortes: nova fonte (pasta/arquivo do Drive de uma campanha) entra na fila do workflow "Cortes"; com id, só atualiza os dados salvos
      const { data: channel } = await db.from("yt_channels").select("id").eq("user_id", userId).eq("id", String(input.channel_id ?? "")).maybeSingle();
      if (!channel) throw new HttpError(400, "Escolha o canal de cortes");
      const url = String(input.url ?? "").trim();
      if (!/^https?:\/\//.test(url)) throw new HttpError(400, "Cole o link da pasta ou do vídeo");
      const fields = {
        channel_ref: channel.id, url,
        campaign: String(input.campaign ?? "").trim().slice(0, 120) || "Campanha",
        hashtags: String(input.hashtags ?? "").trim().slice(0, 300) || null,
        credit: String(input.credit ?? "").trim().slice(0, 200) || null,
        rules: String(input.rules ?? "").trim().slice(0, 3000) || null,
        mirror_url: /^https?:\/\//.test(String(input.mirror_url ?? "").trim()) ? String(input.mirror_url).trim() : null,
        clips_wanted: Math.min(12, Math.max(1, Number(input.clips_wanted) || 6)),
        per_day: Math.min(6, Math.max(1, Number(input.per_day) || 3)),
      };
      if (input.id) {
        const { data: old } = await db.from("clip_sources").select("status, mirror_url").eq("id", String(input.id)).eq("user_id", userId).maybeSingle();
        if (!old) throw new HttpError(404, "Campanha não encontrada");
        // Campanha que falhou volta para a fila ao salvar (botão "Tentar de novo")
        const retry = old.status === "failed";
        // Link reserva novo: roda já (cortes esperando o Drive da campanha liberar)
        const mirrored = !!fields.mirror_url && fields.mirror_url !== old.mirror_url;
        const { data, error } = await db.from("clip_sources")
          .update({ ...fields, ...(retry ? { status: "queued", error: null } : {}), updated_at: new Date().toISOString() })
          .eq("id", String(input.id)).eq("user_id", userId).select().single();
        if (error || !data) throw new HttpError(500, error?.message ?? "Não salvou");
        return json({ ...data, started: retry || mirrored ? await dispatchRender("clips.yml") : false, updated: true });
      }
      const { data, error } = await db.from("clip_sources").insert({ user_id: userId, ...fields }).select().single();
      if (error) throw new HttpError(500, error.message);
      await db.from("yt_channels").update({ mode: "clips", enabled: false }).eq("id", channel.id);
      return json({ ...data, started: await dispatchRender("clips.yml") });
    }
    if (action === "yt_video_delete" || action === "yt_video_redo") {
      // Vídeo do YouTube (piloto bíblico ou corte): apagar = some do canal e do Studio; refazer = apaga e faz outro no lugar
      const { data: v } = await db.from("yt_videos").select("*").eq("id", String(input.id ?? "")).eq("user_id", userId).maybeSingle();
      if (!v || v.status === "deleted") throw new HttpError(404, "Vídeo não encontrado");
      if (["rendering", "scripting", "redo"].includes(v.status)) throw new HttpError(409, "Esse vídeo está sendo feito agora. Espere terminar.");
      if (v.youtube_id) {
        try {
          await ytDeleteVideo(await ytToken(db, v.channel_ref), v.youtube_id);
        } catch (e) {
          throw new HttpError(409, (e as Error).message);
        }
      }
      const now = new Date().toISOString();
      // Prévia e capa do vídeo antigo saem do storage na hora (o refeito ganha arquivos novos)
      await removeStudioFiles(db, [v.preview_url, v.thumbnail_url]);
      if (action === "yt_video_delete") {
        await db.from("yt_videos").update({ status: "deleted", youtube_id: null, preview_url: null, thumbnail_url: null, updated_at: now }).eq("id", v.id);
        return json({ deleted: true });
      }
      const note = String(input.note ?? "").trim().slice(0, 600) || null;
      // Data que já passou (ou muito em cima) vira daqui a 3 h para dar tempo de fazer o vídeo novo
      const soon = new Date(Date.now() + 3 * 3600000).toISOString();
      const publish_at = v.publish_at && v.publish_at > soon ? v.publish_at : soon;
      const patch = v.kind === "clip"
        ? { status: "redo", youtube_id: null, preview_url: null, thumbnail_url: null, redo_note: note, error: null, updated_at: now }
        : { status: "draft", youtube_id: null, preview_url: null, thumbnail_url: null, script: null, attempts: 0, redo_note: note, error: null, publish_at, updated_at: now };
      const { data, error } = await db.from("yt_videos").update(patch).eq("id", v.id).select().single();
      if (error) throw new HttpError(500, error.message);
      return json({ ...data, started: v.kind === "clip" ? await dispatchRender("clips.yml") : true });
    }
    if (action === "yt_generate_now") {
      // Canal do YouTube: um vídeo extra agora (o roteiro sai na próxima rodada do cron e o vídeo em seguida)
      const { data: channel } = await db.from("yt_channels").select("*").eq("user_id", userId).eq("id", String(input.channel_id ?? "")).maybeSingle();
      if (!channel) throw new HttpError(400, "Conecte o canal do YouTube primeiro");
      const kind = input.kind === "long" ? "long" : "short";
      return json({ created: await planDay(db, channel, new Date().toISOString().slice(0, 10), kind) });
    }
    if (action === "yt_research") {
      const { data: channel } = await db.from("yt_channels").select("*").eq("user_id", userId).eq("id", String(input.channel_id ?? "")).maybeSingle();
      if (!channel) throw new HttpError(400, "Conecte o canal do YouTube primeiro");
      const trends = await ytResearch(await ytToken(db, channel.id), channel.niche, channel.language);
      await db.from("yt_channels").update({ trends, trends_at: new Date().toISOString(), error: null }).eq("id", channel.id);
      return json({ trends });
    }
    if (action === "landing_delete" || action === "landing_remove_files") {
      // Espaço do storage: apagar a página (ou tirar uma foto) apaga os arquivos dela na hora
      const { data: page } = await db.from("landing_pages").select("id,photos,logo").eq("id", String(input.id ?? "")).eq("user_id", userId).maybeSingle();
      if (!page) throw new HttpError(404, "Página não encontrada");
      const keep = new Set(action === "landing_delete" ? [] : [...(page.photos ?? []), page.logo]);
      const urls = action === "landing_delete" ? [...(page.photos ?? []), page.logo] : ((input.urls as string[] | undefined) ?? []);
      // só arquivos do próprio dono que a página não usa mais
      await removeStudioFiles(db, urls.filter((u) => u && !keep.has(u) && String(u).includes(`/media/${userId}/`)));
      if (action === "landing_delete") await db.from("landing_pages").delete().eq("id", page.id);
      return json({ ok: true });
    }
    if (action === "landing_domain") {
      // Domínio próprio do cliente: salva, põe na Vercel (se houver VERCEL_TOKEN) e diz o que falta no DNS
      const { data: page } = await db.from("landing_pages").select("id,domain").eq("id", String(input.id ?? "")).eq("user_id", userId).maybeSingle();
      if (!page) throw new HttpError(404, "Página não encontrada");
      const domain = input.check ? page.domain : cleanDomain(input.domain);
      let vercelResult = "auto";
      if (!input.check && page.domain && page.domain !== domain) await vercelDomain(page.domain, true);
      if (!input.check) {
        if (domain) {
          const { data: taken } = await db.from("landing_pages").select("id").ilike("domain", domain).neq("id", page.id).maybeSingle();
          if (taken) throw new HttpError(400, "Esse domínio já está em outra página");
          vercelResult = await vercelDomain(domain);
          if (vercelResult !== "auto" && vercelResult !== "manual") throw new HttpError(400, `Vercel: ${vercelResult}`);
        }
        const { error } = await db.from("landing_pages").update({ domain: domain || null, updated_at: new Date().toISOString() }).eq("id", page.id);
        if (error) throw new HttpError(error.code === "23505" ? 400 : 500, error.code === "23505" ? "Esse domínio já está em outra página" : error.message);
      }
      const status = domain ? await vercelDomainStatus(domain) : null;
      return json({ domain: domain || null, vercel: vercelResult, status, records: DNS_RECORDS });
    }
    if (action === "landing_import") {
      // Puxa os dados reais do cliente (Instagram + Google Maps) para a página
      const { data: page } = await db.from("landing_pages").select("*").eq("id", String(input.id ?? "")).eq("user_id", userId).maybeSingle();
      if (!page) throw new HttpError(404, "Página não encontrada");
      const patch = await importClientData(db, page);
      const { data, error } = await db.from("landing_pages").update(patch).eq("id", page.id).select().single();
      if (error) throw new HttpError(500, error.message);
      return json(data);
    }
    if (action === "landing_generate" || action === "landing_publish") {
      // Landing page de cliente (Renda extra): a IA escreve o conteúdo; publicar dá o endereço /p/<slug>
      const { data: page } = await db.from("landing_pages").select("*").eq("id", String(input.id ?? "")).eq("user_id", userId).maybeSingle();
      if (!page) throw new HttpError(404, "Página não encontrada");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (action === "landing_generate") {
        // Primeira vez: puxa antes os dados reais do Instagram/Google (fotos, horário, bio)
        if (!page.imported && (page.instagram || page.lead_id)) {
          const imported = await importClientData(db, page);
          await db.from("landing_pages").update(imported).eq("id", page.id);
          Object.assign(page, imported);
        }
        if (!page.photos?.length) throw new HttpError(400, "Não achei fotos no Instagram/Google; envie pelo menos uma");
        patch.content = await writeLanding(input.fresh ? { ...page, content: null } : page, input.instructions ? String(input.instructions).slice(0, 1500) : undefined);
      } else {
        if (!page.content) throw new HttpError(400, "Gere a página antes de publicar");
        // mode: preview = link para a cliente ver (vale 7 dias a cada "Renovar"); published = no ar; draft = tira do ar
        const mode = input.unpublish ? "draft" : input.mode === "preview" ? "preview" : "published";
        Object.assign(patch, await publishPatch(db, page, mode));
      }
      const { data, error } = await db.from("landing_pages").update(patch).eq("id", page.id).select().single();
      if (error) throw new HttpError(500, error.message);
      return json(data);
    }
    if (action === "leads_search") {
      // Prospecção: entra na fila do workflow "Leads do Google Maps" (empresas sem site e com WhatsApp)
      if (input.retry_id) {
        const { data, error } = await db.from("lead_searches").update({ status: "queued", error: null, updated_at: new Date().toISOString() })
          .eq("id", String(input.retry_id)).eq("user_id", userId).eq("status", "failed").select().single();
        if (error || !data) throw new HttpError(404, "Busca não encontrada");
        return json({ ...data, started: await dispatchRender("leads.yml") });
      }
      const query = String(input.query ?? "").trim().slice(0, 80);
      const place = String(input.place ?? "").trim().slice(0, 120);
      if (!query || !place) throw new HttpError(400, "Diga o que procurar e onde (ex.: nutricionista, Sobradinho DF)");
      const wanted = Math.min(200, Math.max(1, Math.round(Number(input.wanted) || 30)));
      const { data, error } = await db.from("lead_searches").insert({ user_id: userId, query, place, wanted }).select().single();
      if (error) throw new HttpError(500, error.message);
      return json({ ...data, started: await dispatchRender("leads.yml") });
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
    if (action === "product_video_delete") {
      const { data: v } = await db.from("product_videos").select("id,video_url,status").eq("id", String(input.id ?? "")).eq("user_id", userId).maybeSingle();
      if (!v) throw new HttpError(404, "Vídeo não encontrado");
      await removeStudioFiles(db, [v.video_url]);
      await db.from("product_videos").delete().eq("id", v.id);
      return json({ ok: true });
    }
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
        const account = await db.from("social_accounts").select("id").eq("user_id", userId).eq("platform", "instagram").order("connected_at").limit(1).maybeSingle();
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
