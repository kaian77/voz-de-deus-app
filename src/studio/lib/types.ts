import type { LandingContent } from "@/landing/render";
export type Platform = "instagram" | "tiktok";
export type PostKind = "image" | "carousel" | "reel" | "story" | "video" | "photos";
export type PostStatus = "draft" | "pending_approval" | "scheduled" | "publishing" | "published" | "failed";

export interface MediaItem {
  url: string;
  type: "image" | "video";
  /** Arquivo apagado do storage depois de publicado (limpeza automática) */
  removed?: boolean;
}

export interface Slide {
  title: string;
  body?: string;
  footer?: string;
  image_url?: string;
  /** Foto do produto, mostrada inteira num cartão abaixo do texto */
  product_image?: string;
}

export type ThemeId = "marca" | "divino" | "claro" | "escuro" | "papel" | "vibrante";

export interface CarouselDesign {
  theme?: ThemeId;
  handle?: string;
  /** Cores de uma campanha (ex.: Outubro Rosa); quando existe, vale no lugar do tema */
  palette?: { primary: string; secondary: string; accent: string };
}

export interface PlatformResult {
  status?: "processing" | "published" | "failed";
  id?: string;
  permalink?: string;
  error?: string;
  inbox?: boolean; // TikTok: foi para a caixa de entrada do app (falta publicar pelo celular)
}

export interface Post {
  id: string;
  user_id?: string;
  title: string | null;
  caption: string;
  kind: PostKind;
  platforms: Platform[];
  media: MediaItem[];
  slides: Slide[] | null;
  design: CarouselDesign | null;
  scheduled_at: string | null;
  status: PostStatus;
  results: Partial<Record<Platform, PlatformResult>>;
  options: Record<string, unknown>;
  created_by: "user" | "agent";
  notes: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialAccount {
  id: string;
  platform: Platform | "whatsapp" | "nuvemshop" | "mercadolivre" | "shopee";
  external_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
  meta: { biography?: string; website?: string; media_count?: number; provider?: "meta" | "waha"; label?: string | null; agent?: boolean; agent_numbers?: string[]; agent_prompt?: string; status?: string; url?: string; analysis?: MarketplaceAnalysis; ml_sync?: MlSyncState; ml_quality?: MlQualityReport };
  connected_at: string;
}

export interface StoreOrder {
  id: number;
  number: number;
  created_at: string;
  customer?: string;
  email?: string;
  status: "open" | "closed" | "cancelled";
  payment?: string;
  shipping?: string;
  shipping_option?: string;
  shipping_days?: string;
  tracking_number?: string;
  tracking_url?: string;
  shipped_at?: string;
  total?: string;
  items: string[];
}

export interface ProductTemplateData {
  name_pattern?: string;
  price?: number;
  promotional_price?: number | null;
  stock?: number | null;
  weight?: number;
  width?: number;
  height?: number;
  depth?: number;
  sku_prefix?: string;
  category_ids?: number[];
  description?: string;
  ai_description?: boolean;
  tags?: string;
  brand?: string;
  published?: boolean;
  free_shipping?: boolean;
  seo_title?: string;
  seo_description?: string;
  ai_guide?: string;
  fiscal_ncm?: string;
  fiscal_origin?: string;
  fiscal_type?: string;
  age_group?: string;
  gender?: string;
}

export interface ProductTemplate {
  id: string;
  name: string;
  is_default: boolean;
  data: ProductTemplateData;
  created_at: string;
}

export interface ProductDraft {
  id: string;
  images: string[];
  name: string | null;
  template_id: string | null;
  overrides: Record<string, unknown>;
  status: "pending" | "creating" | "created" | "failed";
  marketplaces?: Record<string, { id?: string; permalink?: string; price?: number; error?: string }>;
  product_id: string | null;
  product_url: string | null;
  error: string | null;
  created_at: string;
}

export interface Automation {
  id: string;
  account_id: string | null;
  name: string;
  active: boolean;
  keywords: string[];
  match_mode: "contains" | "exact" | "any";
  media_ids: string[];
  reply_variants: string[];
  dm_message: string | null;
  use_ai: boolean;
  ai_instructions: string | null;
  once_per_user: boolean;
  triggered_count: number;
  created_at: string;
}

export interface CommentEvent {
  id: string;
  automation_id: string | null;
  comment_id: string;
  media_id: string | null;
  from_username: string | null;
  text: string | null;
  reply_text: string | null;
  dm_text: string | null;
  status: "pending" | "replied" | "ignored" | "failed";
  error: string | null;
  created_at: string;
}

export interface CompetitorAnalysis {
  summary: string;
  strengths: string[];
  content_patterns: string[];
  opportunities: string[];
  ideas_to_adapt: string[];
}

export interface Competitor {
  id: string;
  platform: Platform;
  username: string;
  notes: string | null;
  snapshot: {
    name?: string;
    biography?: string;
    followers_count?: number;
    media_count?: number;
    profile_picture_url?: string;
    media?: { caption?: string; like_count?: number; comments_count?: number; timestamp?: string; media_type?: string; permalink?: string }[];
    source?: "web";
    summary?: string;
    sources?: string[];
  } | null;
  analysis: CompetitorAnalysis | null;
  synced_at: string | null;
  created_at: string;
}

export interface ProfileAudit {
  id: string;
  account_id: string | null;
  source: "ai" | "agent";
  analysis: {
    score: number;
    summary: string;
    bio_suggestions: string[];
    highlight_ideas: string[];
    grid_feedback: string;
    content_pillars: string[];
    best_times: string[];
    quick_wins: string[];
  };
  created_at: string;
}

export interface BrandSettings {
  user_id?: string;
  brand_name: string | null;
  niche: string | null;
  audience: string | null;
  tone: string | null;
  default_hashtags: string | null;
  default_cta: string | null;
  product_autopost?: boolean;
  auto_post_link?: boolean;
  approval_required: boolean;
  timezone: string;
  agent_enabled?: boolean;
  agent_instructions?: string | null;
  agent_knowledge?: string | null;
  agent_handoff_message?: string | null;
  video_enabled?: boolean;
  marketplace_autopublish?: boolean;
  autopilot_enabled?: boolean;
  autopilot_per_week?: number;
  autopilot_last_run?: string | null;
  autopilot_error?: string | null;
  sale_alert_phone?: string | null;
  sale_alert_channels?: string[];
  sale_alert_since?: string | null;
  daily_digest?: boolean;
}

/** Sincronização da loja com o Mercado Livre (fila processada pelo cron). */
export interface MlSyncState {
  started_at: string;
  finished_at?: string | null;
  total: number;
  queue: number[];
  done: { id: number; name: string; ml_id?: string; status?: string; updated?: boolean; error?: string }[];
  errors: { id: number; name: string; error?: string }[];
  skipped: { id: number; name: string; reason?: string }[];
  inflight?: { ids: number[]; at: string } | null;
}

/** "Melhorar vitrine do ML": qualidade dos anúncios e o que foi/precisa ser feito */
/** Avaliação do formulário "Avalie e ganhe 10%" */
export interface SiteReview {
  id: string;
  user_id: string;
  order_id: string;
  order_number: string | null;
  name: string;
  email: string;
  rating: number;
  comment: string | null;
  products: string | null;
  status: "pending" | "approved" | "hidden";
  coupon: string | null;
  emailed_at: string | null;
  email_error: string | null;
  created_at: string;
}

export interface MlQualityReport {
  at: string;
  listings: number;
  score: number | null;
  levels: Record<string, number>;
  auto: { title: string; count: number; fix: string }[];
  owner: { title: string; count: number; todo: string }[];
  experience: { id: string; title: string; color: string; text: string }[];
  experience_summary?: string | null;
  worst: { id: string; title: string; score: number | null; level: string | null }[];
  queued: number;
  minutes: number;
  premium: number;
}

export interface MarketplaceAnalysis {
  at: string;
  listings: number;
  matched: number;
  rule_text: string;
  samples: { name: string; store: number; marketplace: number }[];
  errors: string[];
}

export interface ProductVideo {
  id: string;
  name: string;
  product_url: string | null;
  images: string[];
  brief: Record<string, unknown>;
  status: "queued" | "rendering" | "rendered" | "ready" | "failed";
  video_url: string | null;
  post_id: string | null;
  /** false = vídeo avulso, só para baixar */
  autopost: boolean;
  /** Arquivo apagado na limpeza automática (o "Refazer" gera de novo) */
  file_deleted_at?: string | null;
  error: string | null;
  created_at: string;
}

export type AiVideoProvider = "kling" | "higgsfield";

/** Busca de empresas no Google Maps (Renda Extra → Leads). */
export interface LeadSearch {
  id: string;
  query: string;
  place: string;
  wanted: number;
  status: "queued" | "running" | "done" | "failed";
  found: number;
  lat: number | null;
  lng: number | null;
  /** [sul, norte, oeste, leste] */
  bbox: [number, number, number, number] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadStatus = "new" | "contacted" | "replied" | "won" | "lost";

/** Empresa sem site e com WhatsApp encontrada numa busca. */
export interface Lead {
  id: string;
  search_id: string | null;
  place_id: string;
  name: string;
  category: string | null;
  phone: string | null;
  whatsapp: string | null;
  social: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviews: number | null;
  maps_url: string | null;
  /** Extras do Google Maps (horário, fotos, categoria, descrição) para a landing page */
  details: { hours?: string | null; photos?: string[]; category?: string | null; description?: string | null } | null;
  details_status: "queued" | "running" | "done" | "failed" | null;
  status: LeadStatus;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Landing page de cliente (Renda extra → Landing pages). O HTML sai de src/landing/render.ts. */
export interface LandingPage {
  id: string;
  lead_id: string | null;
  slug: string;
  name: string;
  niche: string;
  city: string | null;
  whatsapp: string | null;
  instagram: string | null;
  address: string | null;
  registry: string | null;
  hours: string | null;
  notes: string | null;
  photos: string[];
  logo: string | null;
  rating: number | null;
  reviews: number | null;
  content: LandingContent | null;
  /** O que foi puxado do Instagram/Google Maps (maps = "pending" enquanto o robô busca) */
  imported: { at?: string; sources?: string[]; instagram?: string; maps?: string } | null;
  status: "draft" | "preview" | "published";
  views: number;
  created_at: string;
  updated_at: string;
}

/** Canal do YouTube conectado (Renda extra → YouTube). Um canal por idioma. */
export interface YtChannel {
  id: string;
  channel_id: string;
  title: string | null;
  thumbnail: string | null;
  enabled: boolean;
  language: "pt" | "en" | "es";
  mode: "bible" | "clips";
  style: "parallax" | "whiteboard" | "classic" | "cinematic";
  niche: string;
  shorts_per_day: number;
  long_per_week: number;
  voice: string;
  trends: { id: string; title: string; channel: string; views: number; per_day: number; kind: "short" | "long" }[] | null;
  trends_at: string | null;
  planned_on: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface YtVideo {
  id: string;
  channel_ref: string;
  kind: "short" | "long" | "clip";
  status: "draft" | "scripting" | "queued" | "rendering" | "uploaded" | "failed" | "redo" | "deleted";
  redo_note?: string | null;
  topic: string | null;
  angle: string | null;
  inspiration: { id: string; title: string; views: number }[] | null;
  script: { title: string; scenes: { narration: string }[]; thumbnail_text: string } | null;
  title: string | null;
  publish_at: string | null;
  youtube_id: string | null;
  thumbnail_url: string | null;
  preview_url: string | null;
  duration_s: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Achadinho da Shopee (Renda extra → Achadinhos): vídeo de produto com o link de afiliado, para o Shopee Vídeo. */
export interface Deal {
  id: string;
  itemid: string;
  title: string;
  name: string | null;
  price: number | null;
  sale_price: number | null;
  discount: number | null;
  rating: number | null;
  likes: number | null;
  shop_name: string | null;
  category: string | null;
  image_url: string | null;
  product_link: string | null;
  aff_link: string | null;
  caption: string | null;
  video_url: string | null;
  thumb_url: string | null;
  status: "rendering" | "ready" | "posted" | "skipped" | "failed";
  error: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Fonte de cortes (pasta/arquivo do Drive de uma campanha de clipping) — Renda extra → Cortes. */
export interface ClipSource {
  id: string;
  channel_ref: string;
  campaign: string;
  url: string;
  hashtags: string | null;
  credit: string | null;
  rules: string | null;
  mirror_url: string | null;
  clips_wanted: number;
  per_day: number;
  status: "queued" | "processing" | "done" | "failed";
  clips_made: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Vídeo gerado por IA (Kling / Higgsfield) na seção Vídeos IA. */
export interface AiVideo {
  id: string;
  provider: AiVideoProvider;
  model: string;
  prompt: string;
  image_url: string | null;
  params: Record<string, unknown>;
  status: "processing" | "done" | "failed";
  video_url: string | null;
  error: string | null;
  post_id: string | null;
  file_deleted_at?: string | null;
  created_at: string;
}

export type Channel = "instagram" | "whatsapp";

export interface Conversation {
  id: string;
  account_id: string;
  channel: Channel;
  contact_id: string;
  contact_name: string | null;
  contact_username: string | null;
  ai_enabled: boolean;
  status: "open" | "needs_human" | "closed";
  handoff_reason: string | null;
  unread: number;
  last_message_at: string;
  last_inbound_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  sender: "contact" | "ai" | "human" | "agent";
  text: string;
  error: string | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export interface TableMap {
  posts: Post;
  social_accounts: SocialAccount;
  automations: Automation;
  comment_events: CommentEvent;
  competitors: Competitor;
  profile_audits: ProfileAudit;
  api_keys: ApiKey & { key_hash?: string };
  brand_settings: BrandSettings;
  conversations: Conversation;
  messages: Message;
  product_templates: ProductTemplate;
  product_drafts: ProductDraft;
  product_videos: ProductVideo;
  ai_videos: AiVideo;
  lead_searches: LeadSearch;
  leads: Lead;
  landing_pages: LandingPage;
  yt_channels: YtChannel;
  yt_videos: YtVideo;
  clip_sources: ClipSource;
  deals: Deal;
  strategies: Strategy;
  site_reviews: SiteReview;
}
export type TableName = keyof TableMap;

export interface IgMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

export interface IgProfileData {
  profile: {
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    biography?: string;
    website?: string;
  };
  media: IgMedia[];
  best_times: { slot: string; avg_engagement: number; posts: number }[];
}

/** Plano do motor de estratégia (gerado pela IA a partir das vendas). */
export interface StrategyPlan {
  summary: string;
  diagnosis: { title: string; detail: string }[];
  market?: { trends: string[]; competitors: { name: string; channel: string; insight: string }[]; prices: string; opportunities: string[] };
  priorities: { title: string; why: string; channel: string; actions: string[]; products: string[] }[];
  channels?: { channel: string; goal: string; actions: string[] }[];
  followers?: { strategy: string; rhythm: string; actions: string[] };
  tiktok_ads: { advice: string; roi_target: string; budget: string; products: string[] };
  kits: { name: string; products: string[]; why: string }[];
  content: { idea: string; format: string; channel: "tiktok" | "instagram" | "ambos"; product: string }[];
  dates: { date: string; name: string; action: string }[];
  weekly_checklist: string[];
}

export interface Strategy {
  id: string;
  input: { tiktok?: string | null; goal?: string };
  data: {
    period_days: number;
    products: number;
    products_without_sales: number;
    products_without_video: number;
    site: { orders: number; revenue: number };
    mercadolivre: { orders: number } | null;
    shopee?: { orders: number } | null;
    top: { name: string; site_qty: number; ml_qty: number; shopee_qty?: number; url: string | null; image: string | null }[];
  };
  plan: StrategyPlan;
  video_picks: { id: number; name: string; url: string | null; image: string | null; sold: number }[];
  videos_queued_at: string | null;
  research?: { text: string; sources: string[]; at: string } | null;
  status?: "research" | "plan" | "done";
  created_at: string;
}

/** Resumo de vendas e pendências (Visão geral e resumo diário no WhatsApp). */
export interface SalesSummary {
  at: string;
  channels: Partial<Record<"site" | "mercadolivre" | "shopee", {
    connected: boolean;
    error?: string;
    today: { orders: number; revenue: number };
    yesterday: { orders: number; revenue: number };
    week: { orders: number; revenue: number };
    to_ship: number | null;
  }>>;
  total: { today: { orders: number; revenue: number }; yesterday: { orders: number; revenue: number }; week: { orders: number; revenue: number }; to_ship: number };
  approvals: number;
  waiting: number;
  tasks: string[];
}
