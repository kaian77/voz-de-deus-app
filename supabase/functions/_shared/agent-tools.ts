// Ferramentas que o Claude (ou qualquer agente) usa para operar o Studio.
// Expostas por REST (/agent/tools/<nome>) e por MCP (/agent/mcp) na função "agent".
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { businessDiscoveryEnabled, igBusinessDiscovery, igProfile, igRecentMedia, igTokenFor } from "./instagram.ts";
import { advancePost, validatePost } from "./publisher.ts";
import { sendMessage, transcript } from "./inbox.ts";

type Ctx = { db: SupabaseClient; userId: string };

const MediaInput = z.union([
  z.string().url(),
  z.object({ url: z.string().url(), type: z.enum(["image", "video"]).optional() }),
]);
const Kind = z.enum(["image", "carousel", "reel", "story", "video", "photos"]);
const Platform = z.enum(["instagram", "tiktok"]);
const Slide = z.object({
  title: z.string().describe("Texto principal do slide (curto, forte)"),
  body: z.string().optional().describe("Texto de apoio"),
  footer: z.string().optional(),
  image_url: z.string().url().optional().describe("Imagem de fundo opcional"),
});
const Design = z.object({
  theme: z.enum(["divino", "claro", "escuro", "papel", "vibrante"]).optional(),
  handle: z.string().optional().describe("@ exibido nos slides"),
}).optional();

function normalizeMedia(items: z.infer<typeof MediaInput>[] = []) {
  return items.map((m) => {
    const url = typeof m === "string" ? m : m.url;
    const type = typeof m === "string" || !m.type ? (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? "video" : "image") : m.type;
    return { url, type };
  });
}

async function settings(ctx: Ctx) {
  const { data } = await ctx.db.from("brand_settings").select("*").eq("user_id", ctx.userId).maybeSingle();
  return data;
}

async function instagramAccount(ctx: Ctx, accountId?: string) {
  let q = ctx.db.from("social_accounts").select("*").eq("user_id", ctx.userId).eq("platform", "instagram");
  if (accountId) q = q.eq("id", accountId);
  const { data } = await q.order("connected_at").limit(1);
  if (!data?.[0]) throw new Error("Nenhuma conta do Instagram conectada. Conecte em Studio > Contas.");
  return data[0];
}

export function bestTimes(media: { timestamp: string; like_count?: number; comments_count?: number }[], timeZone: string) {
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long", hour: "2-digit", hourCycle: "h23" });
  const buckets = new Map<string, { total: number; n: number }>();
  for (const m of media) {
    const parts = fmt.formatToParts(new Date(m.timestamp));
    const key = `${parts.find((p) => p.type === "weekday")?.value} ${parts.find((p) => p.type === "hour")?.value}h`;
    const b = buckets.get(key) ?? { total: 0, n: 0 };
    b.total += (m.like_count ?? 0) + 3 * (m.comments_count ?? 0);
    b.n++;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .map(([slot, b]) => ({ slot, avg_engagement: Math.round(b.total / b.n), posts: b.n }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement)
    .slice(0, 5);
}

const tools = {
  get_overview: {
    description: "Resumo do Studio: contas conectadas, configurações da marca, próximos posts, posts aguardando aprovação, automações, comentários recentes e conversas esperando humano. Comece por aqui.",
    input: z.object({}),
    run: async (ctx: Ctx) => {
      const now = new Date().toISOString();
      const [accounts, upcoming, pending, automations, comments, waiting] = await Promise.all([
        ctx.db.from("social_accounts").select("id,platform,username,display_name,followers_count").eq("user_id", ctx.userId),
        ctx.db.from("posts").select("id,title,kind,platforms,scheduled_at,status").eq("user_id", ctx.userId).eq("status", "scheduled").gte("scheduled_at", now).order("scheduled_at").limit(15),
        ctx.db.from("posts").select("id,title,kind,platforms,scheduled_at").eq("user_id", ctx.userId).eq("status", "pending_approval").limit(20),
        ctx.db.from("automations").select("id,name,active,keywords,triggered_count").eq("user_id", ctx.userId),
        ctx.db.from("comment_events").select("from_username,text,status,reply_text,created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(10),
        ctx.db.from("conversations").select("id,channel,contact_name,handoff_reason,last_message_at").eq("user_id", ctx.userId).eq("status", "needs_human").limit(20),
      ]);
      return {
        now,
        brand_settings: await settings(ctx),
        accounts: accounts.data,
        upcoming_posts: upcoming.data,
        pending_approval: pending.data,
        automations: automations.data,
        recent_comments: comments.data,
        conversations_needing_human: waiting.data,
      };
    },
  },

  update_brand_settings: {
    description: "Atualiza o perfil da marca (nicho, público, tom de voz, hashtags, CTA, se posts do agente exigem aprovação, fuso horário).",
    input: z.object({
      brand_name: z.string().optional(),
      niche: z.string().optional(),
      audience: z.string().optional(),
      tone: z.string().optional(),
      default_hashtags: z.string().optional(),
      default_cta: z.string().optional(),
      approval_required: z.boolean().optional(),
      timezone: z.string().optional(),
      agent_enabled: z.boolean().optional().describe("Liga/desliga o agente de IA que responde DMs e WhatsApp"),
      agent_instructions: z.string().optional().describe("Como o agente de mensagens deve atender"),
      agent_knowledge: z.string().optional().describe("Base de conhecimento: FAQ, links, preços, horários"),
      agent_handoff_message: z.string().optional(),
    }),
    run: async (ctx: Ctx, input: Record<string, unknown>) => {
      const { data, error } = await ctx.db.from("brand_settings").upsert({ user_id: ctx.userId, ...input, updated_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      return data;
    },
  },

  list_posts: {
    description: "Lista posts filtrando por status e período.",
    input: z.object({
      status: z.enum(["draft", "pending_approval", "scheduled", "publishing", "published", "failed"]).optional(),
      from: z.string().optional().describe("ISO 8601"),
      to: z.string().optional().describe("ISO 8601"),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    run: async (ctx: Ctx, input: { status?: string; from?: string; to?: string; limit?: number }) => {
      let q = ctx.db.from("posts").select("*").eq("user_id", ctx.userId);
      if (input.status) q = q.eq("status", input.status);
      if (input.from) q = q.gte("scheduled_at", input.from);
      if (input.to) q = q.lte("scheduled_at", input.to);
      const { data, error } = await q.order("scheduled_at", { ascending: true, nullsFirst: false }).limit(input.limit ?? 30);
      if (error) throw error;
      return data;
    },
  },

  create_post: {
    description:
      "Cria um post para Instagram e/ou TikTok. Use media (URLs públicas; use import_media antes se precisar) OU slides para um carrossel desenhado pelo app (o app renderiza as imagens quando o usuário aprovar). Se scheduled_at for informado e a marca não exigir aprovação, o post já fica agendado. kind: image, carousel, reel, story (só IG), video (TikTok/Reels), photos (carrossel de fotos do TikTok).",
    input: z.object({
      kind: Kind,
      platforms: z.array(Platform).min(1),
      caption: z.string().describe("Legenda completa, com hashtags e CTA"),
      title: z.string().optional().describe("Nome interno do post"),
      media: z.array(MediaInput).optional(),
      slides: z.array(Slide).max(10).optional(),
      design: Design,
      scheduled_at: z.string().optional().describe("ISO 8601 com fuso, ex: 2026-10-12T18:30:00-03:00"),
      notes: z.string().optional().describe("Raciocínio/estratégia para o usuário ler na aprovação"),
      tiktok_privacy: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]).optional(),
    }),
    run: async (ctx: Ctx, input: any) => {
      const media = normalizeMedia(input.media);
      const brand = await settings(ctx);
      const needsRender = Boolean(input.slides?.length) && media.length === 0;
      if (!needsRender) {
        const problem = validatePost({ kind: input.kind, platforms: input.platforms, media });
        if (problem) throw new Error(problem);
      }
      const approval = brand?.approval_required ?? true;
      const status = needsRender || approval ? "pending_approval" : input.scheduled_at ? "scheduled" : "draft";
      const { data, error } = await ctx.db.from("posts").insert({
        user_id: ctx.userId,
        kind: input.kind,
        platforms: input.platforms,
        caption: input.caption,
        title: input.title,
        media,
        slides: input.slides ?? null,
        design: input.design ?? null,
        scheduled_at: input.scheduled_at ?? null,
        notes: input.notes,
        status,
        created_by: "agent",
        options: input.tiktok_privacy ? { tiktok: { privacy_level: input.tiktok_privacy } } : {},
      }).select().single();
      if (error) throw error;
      return {
        post: data,
        message: status === "pending_approval"
          ? "Post criado e aguardando aprovação do usuário em Studio > Aprovações."
          : status === "scheduled" ? "Post agendado." : "Rascunho criado.",
      };
    },
  },

  update_post: {
    description: "Edita um post que ainda não foi publicado (legenda, horário, mídia, slides, status draft/scheduled).",
    input: z.object({
      id: z.string().uuid(),
      caption: z.string().optional(),
      title: z.string().optional(),
      scheduled_at: z.string().nullable().optional(),
      media: z.array(MediaInput).optional(),
      slides: z.array(Slide).max(10).optional(),
      design: Design,
      platforms: z.array(Platform).optional(),
      notes: z.string().optional(),
      status: z.enum(["draft", "scheduled"]).optional().describe("scheduled só é aceito se a marca não exigir aprovação"),
    }),
    run: async (ctx: Ctx, input: any) => {
      const { id, media, status, ...rest } = input;
      const { data: post } = await ctx.db.from("posts").select("*").eq("id", id).eq("user_id", ctx.userId).single();
      if (!post) throw new Error("Post não encontrado");
      if (["published", "publishing"].includes(post.status)) throw new Error("Post já publicado/publicando não pode ser editado");
      const patch: Record<string, unknown> = { ...rest };
      if (media) patch.media = normalizeMedia(media);
      if (status) {
        const brand = await settings(ctx);
        if (status === "scheduled" && (brand?.approval_required ?? true) && post.created_by === "agent" && post.status === "pending_approval") {
          throw new Error("A marca exige aprovação: o usuário precisa aprovar este post no app.");
        }
        patch.status = status;
      }
      const { data, error } = await ctx.db.from("posts").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
  },

  delete_post: {
    description: "Apaga um post não publicado.",
    input: z.object({ id: z.string().uuid() }),
    run: async (ctx: Ctx, input: { id: string }) => {
      const { error } = await ctx.db.from("posts").delete().eq("id", input.id).eq("user_id", ctx.userId).neq("status", "published");
      if (error) throw error;
      return { deleted: input.id };
    },
  },

  publish_post_now: {
    description: "Publica imediatamente um post já aprovado (status draft ou scheduled) que tenha mídia.",
    input: z.object({ id: z.string().uuid() }),
    run: async (ctx: Ctx, input: { id: string }) => {
      const { data: post } = await ctx.db.from("posts").select("*").eq("id", input.id).eq("user_id", ctx.userId).single();
      if (!post) throw new Error("Post não encontrado");
      if (!["draft", "scheduled", "failed"].includes(post.status)) throw new Error(`Post com status ${post.status} não pode ser publicado agora`);
      const { data: claimed } = await ctx.db.from("posts").update({ status: "publishing" }).eq("id", post.id).select().single();
      return advancePost(ctx.db, claimed);
    },
  },

  list_automations: {
    description: "Lista as automações de resposta a comentários (estilo ManyChat).",
    input: z.object({}),
    run: async (ctx: Ctx) => (await ctx.db.from("automations").select("*").eq("user_id", ctx.userId).order("created_at")).data,
  },

  upsert_automation: {
    description:
      "Cria ou atualiza (com id) uma automação: quando alguém comentar uma palavra-chave, responde publicamente e manda DM. Use {username} nos textos. match_mode: contains (padrão), exact, any (qualquer comentário). media_ids vazio = todos os posts.",
    input: z.object({
      id: z.string().uuid().optional(),
      name: z.string(),
      active: z.boolean().optional(),
      keywords: z.array(z.string()).optional(),
      match_mode: z.enum(["contains", "exact", "any"]).optional(),
      media_ids: z.array(z.string()).optional(),
      reply_variants: z.array(z.string()).optional().describe("Respostas públicas; uma é sorteada a cada comentário"),
      dm_message: z.string().optional().describe("Mensagem privada enviada a quem comentou (pode ter link)"),
      use_ai: z.boolean().optional().describe("Se true, a resposta pública é escrita pela IA"),
      ai_instructions: z.string().optional(),
      once_per_user: z.boolean().optional(),
    }),
    run: async (ctx: Ctx, input: any) => {
      const { id, ...fields } = input;
      if (!id) {
        const account = await instagramAccount(ctx).catch(() => null);
        const { data, error } = await ctx.db.from("automations").insert({ user_id: ctx.userId, account_id: account?.id ?? null, ...fields }).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await ctx.db.from("automations").update(fields).eq("id", id).eq("user_id", ctx.userId).select().single();
      if (error) throw error;
      return data;
    },
  },

  delete_automation: {
    description: "Apaga uma automação.",
    input: z.object({ id: z.string().uuid() }),
    run: async (ctx: Ctx, input: { id: string }) => {
      await ctx.db.from("automations").delete().eq("id", input.id).eq("user_id", ctx.userId);
      return { deleted: input.id };
    },
  },

  list_comments: {
    description: "Últimos comentários recebidos e o que a automação fez com cada um.",
    input: z.object({ status: z.enum(["pending", "replied", "ignored", "failed"]).optional(), limit: z.number().int().max(200).optional() }),
    run: async (ctx: Ctx, input: { status?: string; limit?: number }) => {
      let q = ctx.db.from("comment_events").select("*").eq("user_id", ctx.userId);
      if (input.status) q = q.eq("status", input.status);
      return (await q.order("created_at", { ascending: false }).limit(input.limit ?? 50)).data;
    },
  },

  get_instagram_profile: {
    description: "Dados ao vivo do perfil do Instagram (bio, seguidores) + últimos posts com curtidas/comentários e os melhores horários calculados. Use para auditar a vitrine e planejar conteúdo.",
    input: z.object({ account_id: z.string().uuid().optional(), media_limit: z.number().int().max(50).optional() }),
    run: async (ctx: Ctx, input: { account_id?: string; media_limit?: number }) => {
      const account = await instagramAccount(ctx, input.account_id);
      const token = await igTokenFor(ctx.db, account.id);
      const [profile, media] = await Promise.all([igProfile(token), igRecentMedia(token, account.external_id, input.media_limit ?? 24)]);
      const brand = await settings(ctx);
      return { profile, media, best_times: bestTimes(media, brand?.timezone ?? "America/Sao_Paulo") };
    },
  },

  save_profile_audit: {
    description: "Salva no app sua auditoria da vitrine (bio sugerida, destaques, grade, pilares de conteúdo, ações rápidas) para o usuário ver em Studio > Vitrine.",
    input: z.object({
      account_id: z.string().uuid().optional(),
      analysis: z.object({
        score: z.number().min(0).max(100),
        summary: z.string(),
        bio_suggestions: z.array(z.string()),
        highlight_ideas: z.array(z.string()),
        grid_feedback: z.string(),
        content_pillars: z.array(z.string()),
        best_times: z.array(z.string()),
        quick_wins: z.array(z.string()),
      }),
    }),
    run: async (ctx: Ctx, input: any) => {
      const account = await instagramAccount(ctx, input.account_id).catch(() => null);
      const { data, error } = await ctx.db.from("profile_audits").insert({
        user_id: ctx.userId,
        account_id: account?.id ?? null,
        source: "agent",
        analysis: input.analysis,
      }).select().single();
      if (error) throw error;
      return data;
    },
  },

  list_competitors: {
    description: "Lista concorrentes monitorados com o último snapshot e análise.",
    input: z.object({}),
    run: async (ctx: Ctx) => (await ctx.db.from("competitors").select("*").eq("user_id", ctx.userId).order("created_at")).data,
  },

  upsert_competitor: {
    description: "Adiciona/atualiza um concorrente. Pode salvar snapshot (dados coletados) e analysis (sua análise) diretamente.",
    input: z.object({
      username: z.string().describe("Sem @"),
      platform: Platform.optional(),
      notes: z.string().optional(),
      snapshot: z.record(z.string(), z.any()).optional(),
      analysis: z.object({
        summary: z.string(),
        strengths: z.array(z.string()),
        content_patterns: z.array(z.string()),
        opportunities: z.array(z.string()),
        ideas_to_adapt: z.array(z.string()),
      }).optional(),
    }),
    run: async (ctx: Ctx, input: any) => {
      const row: Record<string, unknown> = {
        user_id: ctx.userId,
        platform: input.platform ?? "instagram",
        username: input.username.replace(/^@/, "").toLowerCase(),
      };
      if (input.notes !== undefined) row.notes = input.notes;
      if (input.snapshot) Object.assign(row, { snapshot: input.snapshot, synced_at: new Date().toISOString() });
      if (input.analysis) row.analysis = input.analysis;
      const { data, error } = await ctx.db.from("competitors").upsert(row, { onConflict: "user_id,platform,username" }).select().single();
      if (error) throw error;
      return data;
    },
  },

  sync_competitor: {
    description: "Busca dados públicos atualizados de um concorrente do Instagram (perfil comercial/criador) via Business Discovery. Requer META_FB_ACCESS_TOKEN configurado.",
    input: z.object({ username: z.string() }),
    run: async (ctx: Ctx, input: { username: string }) => {
      if (!businessDiscoveryEnabled()) throw new Error("Business Discovery não configurado (META_FB_ACCESS_TOKEN / META_FB_IG_USER_ID). Pesquise o perfil por outra fonte e salve com upsert_competitor.");
      const username = input.username.replace(/^@/, "").toLowerCase();
      const snapshot = await igBusinessDiscovery(username);
      const { data, error } = await ctx.db.from("competitors").upsert({
        user_id: ctx.userId, platform: "instagram", username, snapshot, synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,platform,username" }).select().single();
      if (error) throw error;
      return data;
    },
  },

  list_conversations: {
    description: "Lista conversas da caixa de entrada (DMs do Instagram e WhatsApp). status needs_human = esperando atendimento humano.",
    input: z.object({ status: z.enum(["open", "needs_human", "closed"]).optional(), channel: z.enum(["instagram", "whatsapp"]).optional(), limit: z.number().int().max(100).optional() }),
    run: async (ctx: Ctx, input: { status?: string; channel?: string; limit?: number }) => {
      let q = ctx.db.from("conversations").select("id,channel,contact_name,contact_username,status,handoff_reason,ai_enabled,unread,last_message_at,last_inbound_at").eq("user_id", ctx.userId);
      if (input.status) q = q.eq("status", input.status);
      if (input.channel) q = q.eq("channel", input.channel);
      return (await q.order("last_message_at", { ascending: false }).limit(input.limit ?? 30)).data;
    },
  },

  get_conversation: {
    description: "Histórico de mensagens de uma conversa.",
    input: z.object({ id: z.string().uuid(), limit: z.number().int().max(200).optional() }),
    run: async (ctx: Ctx, input: { id: string; limit?: number }) => {
      const { data: conversation } = await ctx.db.from("conversations").select("*").eq("id", input.id).eq("user_id", ctx.userId).single();
      if (!conversation) throw new Error("Conversa não encontrada");
      return { conversation, messages: await transcript(ctx.db, input.id, input.limit ?? 50) };
    },
  },

  send_message: {
    description: "Envia uma mensagem numa conversa (DM do Instagram ou WhatsApp) em nome da marca. Nas APIs oficiais só funciona até 24h após a última mensagem do contato.",
    input: z.object({ conversation_id: z.string().uuid(), text: z.string().min(1) }),
    run: async (ctx: Ctx, input: { conversation_id: string; text: string }) => {
      const { data: conv } = await ctx.db.from("conversations").select("id").eq("id", input.conversation_id).eq("user_id", ctx.userId).single();
      if (!conv) throw new Error("Conversa não encontrada");
      return sendMessage(ctx.db, conv.id, input.text, "agent");
    },
  },

  update_conversation: {
    description: "Muda o status (open, needs_human, closed) ou liga/desliga a IA numa conversa.",
    input: z.object({ id: z.string().uuid(), status: z.enum(["open", "needs_human", "closed"]).optional(), ai_enabled: z.boolean().optional() }),
    run: async (ctx: Ctx, input: { id: string; status?: string; ai_enabled?: boolean }) => {
      const { id, ...patch } = input;
      const { data, error } = await ctx.db.from("conversations").update({ ...patch, ...(patch.status === "open" ? { handoff_reason: null } : {}) }).eq("id", id).eq("user_id", ctx.userId).select().single();
      if (error) throw error;
      return data;
    },
  },

  import_media: {
    description: "Copia uma imagem/vídeo (de uma URL ou base64) para o armazenamento público do Studio e retorna a URL para usar em create_post. Instagram aceita imagens JPEG.",
    input: z.object({
      url: z.string().url().optional(),
      data_base64: z.string().optional(),
      content_type: z.string().optional().describe("ex: image/jpeg, video/mp4"),
      filename: z.string().optional(),
    }),
    run: async (ctx: Ctx, input: { url?: string; data_base64?: string; content_type?: string; filename?: string }) => {
      let bytes: Uint8Array;
      let type = input.content_type;
      if (input.data_base64) {
        bytes = Uint8Array.from(atob(input.data_base64.replace(/^data:[^,]+,/, "")), (c) => c.charCodeAt(0));
      } else if (input.url) {
        const res = await fetch(input.url);
        if (!res.ok) throw new Error(`Não consegui baixar a mídia (${res.status})`);
        bytes = new Uint8Array(await res.arrayBuffer());
        type ??= res.headers.get("content-type") ?? undefined;
      } else throw new Error("Informe url ou data_base64");
      type ??= "image/jpeg";
      const ext = type.includes("png") ? "png" : type.includes("mp4") ? "mp4" : type.includes("quicktime") ? "mov" : "jpg";
      const path = `${ctx.userId}/${crypto.randomUUID()}-${(input.filename ?? `agente.${ext}`).replace(/[^\w.-]/g, "_")}`;
      const { error } = await ctx.db.storage.from("media").upload(path, bytes, { contentType: type });
      if (error) throw error;
      const { data } = ctx.db.storage.from("media").getPublicUrl(path);
      return { url: data.publicUrl, type: type.startsWith("video") ? "video" : "image" };
    },
  },
} satisfies Record<string, { description: string; input: z.ZodTypeAny; run: (ctx: Ctx, input: any) => Promise<unknown> }>;

export type ToolName = keyof typeof tools;

export function toolList() {
  return Object.entries(tools).map(([name, t]) => {
    const { $schema: _ignored, ...schema } = z.toJSONSchema(t.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    return { name, description: t.description, inputSchema: schema };
  });
}

export async function runTool(ctx: Ctx, name: string, args: unknown) {
  const tool = (tools as Record<string, (typeof tools)[ToolName]>)[name];
  if (!tool) throw new Error(`Ferramenta desconhecida: ${name}`);
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) throw new Error(`Parâmetros inválidos: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return tool.run(ctx, parsed.data as never);
}
