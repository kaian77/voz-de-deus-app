// Dados e respostas simuladas do MODO DEMO (sem Supabase configurado).
import type { TableMap, TableName } from "./types";

const day = 24 * 3600 * 1000;
const at = (offsetDays: number, hour: number, minute = 0) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const now = () => new Date().toISOString();

export function demoSeed(): { [K in TableName]: TableMap[K][] } {
  const igId = "demo-ig";
  return {
    social_accounts: [
      {
        id: igId, platform: "instagram", external_id: "178414", username: "minhamarca", display_name: "Minha Marca",
        avatar_url: null, followers_count: 12840, meta: { biography: "Uma palavra de Deus para você todos os dias 🙏\nReceba a sua 👇", website: "https://minhamarca.com", media_count: 214 },
        connected_at: now(),
      },
      {
        id: "demo-wa", platform: "whatsapp", external_id: "waha:demo:default", username: "5511988887777", display_name: "Minha Marca (WAHA)",
        avatar_url: null, followers_count: null, meta: { provider: "waha" }, connected_at: now(),
      },
      {
        id: "demo-shop", platform: "nuvemshop", external_id: "123456", username: "minhamarca.com", display_name: "Minha Marca Loja",
        avatar_url: null, followers_count: null, meta: { url: "https://minhamarca.com" }, connected_at: now(),
      },
    ],
    posts: [
      {
        id: "demo-p1", title: "Salmo 23 — carrossel", caption: "O Senhor é o meu pastor, nada me faltará 🙏\n\nSalve para ler de novo quando precisar.\n\n#fé #salmo23 #palavradedeus",
        kind: "carousel", platforms: ["instagram", "tiktok"], media: [], design: { theme: "divino", handle: "@minhamarca" },
        slides: [
          { title: "5 promessas do Salmo 23 para hoje", body: "Arraste para o lado →" },
          { title: "Nada te faltará", body: "Ele conhece cada necessidade sua, antes mesmo de você pedir." },
          { title: "Descanso", body: "Ele te faz repousar em pastos verdejantes." },
          { title: "Comente AMÉM", body: "e receba uma oração no seu direct 🙏" },
        ],
        scheduled_at: at(1, 19, 30), status: "pending_approval", results: {}, options: {}, created_by: "agent",
        notes: "Carrosséis de promessas tiveram 2,3x mais salvamentos que a média nos últimos 30 dias. Horário escolhido: pico de engajamento às 19h–21h.",
        published_at: null, created_at: now(), updated_at: now(),
      },
      {
        id: "demo-p2", title: "Reels devocional", caption: "Deus tem uma palavra para você hoje. Comente PALAVRA 👇", kind: "reel", platforms: ["instagram"],
        media: [], slides: null, design: null, scheduled_at: at(2, 12), status: "draft", results: {}, options: {}, created_by: "user",
        notes: null, published_at: null, created_at: now(), updated_at: now(),
      },
      {
        id: "demo-p3", title: "Versículo do dia", caption: "Tudo posso naquele que me fortalece. Filipenses 4:13", kind: "image", platforms: ["instagram"],
        media: [], slides: [{ title: "Tudo posso naquele que me fortalece", body: "Filipenses 4:13" }], design: { theme: "papel" },
        scheduled_at: at(-1, 8), status: "published", results: { instagram: { status: "published", permalink: "https://instagram.com" } },
        options: {}, created_by: "user", notes: null, published_at: at(-1, 8), created_at: now(), updated_at: now(),
      },
    ],
    automations: [
      {
        id: "demo-a1", account_id: igId, name: "Oração no direct", active: true, keywords: ["amém", "oração", "quero"], match_mode: "contains",
        media_ids: [], reply_variants: ["Amém, {username}! Te mandei uma oração no direct 🙏", "Deus te abençoe, {username}! Olha seu direct 💌"],
        dm_message: "Oi {username}! Que bom ter você aqui 🙏\n\nAqui está a sua palavra de hoje: https://minhamarca.com", use_ai: false,
        ai_instructions: null, once_per_user: true, triggered_count: 342, created_at: now(),
      },
    ],
    comment_events: [
      { id: "c1", automation_id: "demo-a1", comment_id: "1", media_id: "m1", from_username: "maria.fe", text: "Amém!! 🙏", reply_text: "Amém, @maria.fe! Te mandei uma oração no direct 🙏", dm_text: "Oi @maria.fe! ...", status: "replied", error: null, created_at: at(0, 9, 12) },
      { id: "c2", automation_id: "demo-a1", comment_id: "2", media_id: "m1", from_username: "joao_oliveira", text: "quero a oração", reply_text: "Deus te abençoe, @joao_oliveira! Olha seu direct 💌", dm_text: "Oi @joao_oliveira! ...", status: "replied", error: null, created_at: at(0, 8, 40) },
      { id: "c3", automation_id: null, comment_id: "3", media_id: "m2", from_username: "ana.l", text: "Que lindo ❤️", reply_text: null, dm_text: null, status: "ignored", error: "Nenhuma automação correspondente", created_at: at(-1, 22, 5) },
    ],
    competitors: [
      { id: "demo-c1", platform: "instagram", username: "exemplo.devocional", notes: "Posta reels diários com narração.", snapshot: { name: "Devocional Exemplo", followers_count: 85400, media_count: 1320, biography: "Devocionais diários 📖" }, analysis: null, synced_at: now(), created_at: now() },
    ],
    profile_audits: [],
    conversations: [
      { id: "demo-cv1", account_id: igId, channel: "instagram", contact_id: "1", contact_name: "Maria Fé", contact_username: "maria.fe", ai_enabled: true, status: "open", handoff_reason: null, unread: 0, last_message_at: at(0, 9, 14), last_inbound_at: at(0, 9, 13), created_at: at(0, 9, 13) },
      { id: "demo-cv2", account_id: "demo-wa", channel: "whatsapp", contact_id: "5511999990000@c.us", contact_name: "Carlos", contact_username: null, ai_enabled: true, status: "needs_human", handoff_reason: "Quer falar sobre parceria paga", unread: 1, last_message_at: at(0, 8, 2), last_inbound_at: at(0, 8, 1), created_at: at(-1, 20) },
    ],
    messages: [
      { id: "dm1", conversation_id: "demo-cv1", direction: "in", sender: "contact", text: "Oi! Vocês têm grupo de oração?", error: null, created_at: at(0, 9, 13) },
      { id: "dm2", conversation_id: "demo-cv1", direction: "out", sender: "ai", text: "Oi, Maria! Temos sim 🙏 Toda quarta às 20h, ao vivo aqui no Instagram. Quer que eu te avise quando começar?", error: null, created_at: at(0, 9, 14) },
      { id: "dm3", conversation_id: "demo-cv2", direction: "in", sender: "contact", text: "Boa noite, tenho uma marca e queria fechar uma parceria paga com vocês", error: null, created_at: at(-1, 20) },
      { id: "dm4", conversation_id: "demo-cv2", direction: "out", sender: "ai", text: "Que bom seu interesse, Carlos! Vou chamar alguém da equipe para te responder, só um instante 🙏", error: null, created_at: at(-1, 20, 1) },
      { id: "dm5", conversation_id: "demo-cv2", direction: "in", sender: "contact", text: "Fico no aguardo!", error: null, created_at: at(0, 8, 1) },
    ],
    api_keys: [],
    product_templates: [
      {
        id: "demo-tpl", name: "Pin padrão", is_default: true, created_at: now(),
        data: {
          name_pattern: "Pin {nome}", price: 29.9, stock: null, weight: 0.05, width: 4, height: 4, depth: 1, sku_prefix: "PIN-",
          category_ids: [1], description: "Pin {nome} em metal esmaltado, com fecho de borboleta.\n\nEnviamos para todo o Brasil.",
          ai_description: true, published: true, free_shipping: false, seo_title: "Pin {nome} | Minha Marca",
        },
      },
    ],
    product_drafts: [],
    product_videos: [],
    brand_settings: [
      { brand_name: "Minha Marca", niche: "Conteúdo cristão / devocional", audience: "Cristãos 25–55 anos, maioria mulheres, Brasil", tone: "Acolhedor, esperançoso, simples", default_hashtags: "fé palavradedeus deus jesus oração", default_cta: "Comente AMÉM para receber uma oração no direct", approval_required: true, timezone: "America/Sao_Paulo",
        agent_enabled: true, agent_instructions: "Atenda com carinho, ofereça oração, convide para o grupo de quarta 20h.", agent_knowledge: "Grupo de oração: quartas 20h, live no Instagram.\nApp: https://minhamarca.com", agent_handoff_message: "Vou chamar alguém da equipe para te responder, só um instante 🙏" },
    ],
  };
}

export function demoInvoke(fn: string, body: Record<string, unknown>): unknown {
  if (fn === "ai") {
    switch (body.action) {
      case "caption":
      case "caption_media":
        return {
          hook: "Deus não esqueceu de você.",
          caption: `Deus não esqueceu de você. 🙏\n\nMesmo quando parece que nada está mudando, Ele está agindo em silêncio. ${body.topic ? `\n\n${body.topic}` : ""}\n\nComente AMÉM se você crê!`,
          hashtags: ["fé", "deus", "palavradedeus", "oração", "jesus", "devocional"],
        };
      case "carousel":
        return {
          title: body.topic ?? "Carrossel",
          slides: [
            { title: "3 verdades que vão acalmar seu coração", body: "Arraste →" },
            { title: "Ele está no controle", body: "Nada foge das mãos de Deus, nem o que te tira o sono." },
            { title: "Você não está só", body: "\"Não temas, porque eu sou contigo.\" Isaías 41:10" },
            { title: "O melhor ainda vem", body: "O que Deus começou em você, Ele vai terminar." },
            { title: "Salve e compartilhe", body: "Comente AMÉM para receber uma oração 🙏" },
          ].slice(0, Number(body.slides ?? 5)),
          caption: "Leia até o fim e guarde no coração 🙏 Comente AMÉM!",
          hashtags: ["fé", "deus", "esperança", "versículo"],
        };
      case "plan":
        return {
          posts: Array.from({ length: Number(body.days ?? 7) }, (_, i) => ({
            day: new Date(Date.now() + (i + 1) * day).toISOString().slice(0, 10),
            time: i % 2 ? "12:00" : "19:30",
            kind: (["reel", "carousel", "photos", "story"] as const)[i % 4],
            platforms: i % 4 === 2 ? ["tiktok"] : ["instagram", "tiktok"],
            idea: ["Versículo narrado com b-roll", "5 promessas para quem está ansioso", "Fotos: frases de fé", "Caixinha de pedidos de oração"][i % 4],
            hook: ["Se você está lendo isso, é pra você.", "Guarde isso para os dias difíceis.", "Qual dessas é pra você hoje?", "Me conta: pelo que posso orar?"][i % 4],
          })),
        };
      case "audit_profile":
        return {
          id: crypto.randomUUID(), account_id: "demo-ig", source: "ai", created_at: now(),
          analysis: {
            score: 72,
            summary: "Perfil com propósito claro e boa frequência. A bio não diz o que a pessoa ganha ao seguir e a grade alterna estilos sem padrão visual.",
            bio_suggestions: [
              "📖 Uma palavra de Deus pra você todo dia\n🙏 Comente AMÉM e receba uma oração\n👇 Sua palavra de hoje",
              "Devocionais de 1 minuto para fortalecer sua fé ✨\nNovo reels todo dia às 19h",
              "Deus tem uma palavra pra você hoje 🙏\nToque no link e receba a sua 👇",
            ],
            highlight_ideas: ["Comece aqui", "Pedidos de oração", "Testemunhos", "Salmos", "Sobre nós"],
            grid_feedback: "Use 2 ou 3 templates fixos (versículo, carrossel, reels) com a mesma paleta azul/dourado para a grade ficar reconhecível.",
            content_pillars: ["Versículo do dia", "Promessas para momentos difíceis", "Oração guiada", "Testemunhos"],
            best_times: ["Seg–Sex 19h–21h", "Domingo 8h–10h"],
            quick_wins: ["Fixar os 3 posts com mais salvamentos", "Criar destaque 'Comece aqui'", "Automação AMÉM em todos os reels"],
          },
        };
      case "analyze_competitor":
        return {
          id: body.id,
          analysis: {
            summary: "Cresce com reels narrados diariamente e CTA de comentário.",
            strengths: ["Consistência diária", "Narração emocional", "Legendas curtas"],
            content_patterns: ["Reels de 20–35s", "Gancho nos 2 primeiros segundos", "Versículo na tela"],
            opportunities: ["Não usa carrosséis", "Não responde comentários", "Não tem conteúdo no TikTok"],
            ideas_to_adapt: ["Série 'Uma promessa por dia'", "Carrossel de oração guiada", "Responder comentários com DM automática"],
          },
        };
      case "profile":
        return {
          profile: { username: "minhamarca", name: "Minha Marca", followers_count: 12840, follows_count: 210, media_count: 214, biography: "Uma palavra de Deus para você todos os dias 🙏\nReceba a sua 👇", website: "https://minhamarca.com" },
          media: Array.from({ length: 12 }, (_, i) => ({
            id: `m${i + 1}`, caption: ["Salmo 23 🙏", "Não temas", "Oração da manhã", "Filipenses 4:13"][i % 4], media_type: i % 3 ? "IMAGE" : "VIDEO",
            media_product_type: i % 3 ? "FEED" : "REELS", like_count: 300 + ((i * 137) % 900), comments_count: 20 + ((i * 53) % 180),
            timestamp: new Date(Date.now() - (i + 1) * day).toISOString(), permalink: "https://instagram.com",
          })),
          best_times: [{ slot: "quinta-feira 19h", avg_engagement: 1240, posts: 3 }, { slot: "domingo 08h", avg_engagement: 1105, posts: 2 }],
        };
      case "tiktok_creator":
        return {
          creator_nickname: "Minha Marca", creator_username: "minhamarca", creator_avatar_url: undefined,
          privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
          comment_disabled: false, duet_disabled: false, stitch_disabled: true, max_video_post_duration_sec: 600,
        };
      case "store_orders": {
        const orders = [
          { number: 1042, customer: "Ana Souza", status: "open", payment: "pago", shipping: "enviado", shipping_option: "Correios PAC", tracking_number: "QB123456789BR", tracking_url: "https://rastreamento.correios.com.br", total: "R$ 89,70", items: ["2x Pin Coração", "1x Pin Estrela"], h: 5 },
          { number: 1041, customer: "Bruno Lima", status: "open", payment: "pago", shipping: "aguardando embalagem", shipping_option: "Correios SEDEX", total: "R$ 59,80", items: ["2x Pin Lua"], h: 20 },
          { number: 1040, customer: "Carla Dias", status: "open", payment: "aguardando pagamento", shipping: "ainda não enviado", shipping_option: "Correios PAC", total: "R$ 29,90", items: ["1x Pin Sol"], h: 30 },
          { number: 1038, customer: "Diego Alves", status: "closed", payment: "pago", shipping: "entregue", shipping_option: "Correios PAC", tracking_number: "QB987654321BR", total: "R$ 149,50", items: ["5x Pin Coleção"], h: 120 },
          { number: 1037, customer: "Elisa Rocha", status: "cancelled", payment: "cancelado", shipping: "ainda não enviado", total: "R$ 29,90", items: ["1x Pin Sol"], h: 150 },
        ].map(({ h, ...o }) => ({ ...o, id: 9000000000 + o.number, created_at: new Date(Date.now() - h * 3600_000).toISOString() }));
        const q = String(body.q ?? "").toLowerCase();
        return orders.filter((o) => (body.status === "any" || o.status === body.status) && (!q || `${o.number} ${o.customer}`.toLowerCase().includes(q)));
      }
      case "knowledge_from_store":
        return {
          knowledge: "Loja: https://minhamarca.com\nPagamento: Pix (5% de desconto), cartão em até 3x sem juros.\nFrete: Correios PAC e SEDEX para todo o Brasil; grátis acima de R$ 150.\nPrazo de postagem: até 2 dias úteis após o pagamento.\nTrocas: até 7 dias após o recebimento, pelo e-mail contato@minhamarca.com.",
        };
      case "store_categories":
        return [{ id: 1, name: "Pins", parent: null }, { id: 2, name: "Combos", parent: null }, { id: 3, name: "Saúde", parent: 1 }];
      case "product_suggest":
        return { name: "Coração Dourado", description: "Pin Coração Dourado em metal esmaltado, com brilho delicado.\n\nEnviamos para todo o Brasil." };
      case "product_create":
        throw new Error("No modo demo não há loja conectada para cadastrar o produto.");
      case "content_ideas":
        throw new Error("No modo demo o piloto automático não cria posts.");
      case "product_video":
      case "video_only":
      case "video_post":
        throw new Error("No modo demo os vídeos não são gerados.");
      case "sync_competitor":
        throw new Error("No modo demo não há conexão com o Instagram.");
    }
  }
  if (fn === "inbox") {
    if (body.action === "suggest") return { reply: "Amém! Fico muito feliz com sua mensagem 🙏 Posso orar por algo específico?", handoff: false, handoff_reason: "" };
    if (body.action === "send") return { ok: true };
    throw new Error("Modo demo: configure o Supabase para conectar o WhatsApp de verdade.");
  }
  if (fn === "publish-scheduled") return { status: "published", results: { instagram: { status: "published", permalink: "https://instagram.com" } } };
  if (fn.startsWith("oauth-")) throw new Error("Modo demo: configure o Supabase e as chaves dos apps (veja SETUP_SOCIAL_STUDIO.md) para conectar contas reais.");
  throw new Error(`Função ${fn} indisponível no modo demo`);
}
