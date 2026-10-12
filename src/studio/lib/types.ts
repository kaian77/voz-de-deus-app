export type Platform = "instagram" | "tiktok";
export type PostKind = "image" | "carousel" | "reel" | "story" | "video" | "photos";
export type PostStatus = "draft" | "pending_approval" | "scheduled" | "publishing" | "published" | "failed";

export interface MediaItem {
  url: string;
  type: "image" | "video";
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
  meta: { biography?: string; website?: string; media_count?: number; provider?: "meta" | "waha"; url?: string; analysis?: MarketplaceAnalysis };
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
  error: string | null;
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
