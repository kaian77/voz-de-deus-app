-- Social Studio: agendamento de posts, automações de comentários (estilo ManyChat),
-- concorrentes, auditoria de perfil e acesso do agente (Claude) via API/MCP.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Contas conectadas (sem tokens — os tokens ficam em account_tokens)
-- ---------------------------------------------------------------------------
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok')),
  external_id text not null,
  username text,
  display_name text,
  avatar_url text,
  followers_count integer,
  meta jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  unique (platform, external_id)
);

-- Tokens OAuth: só acessíveis pelas edge functions (service role). Sem policies = sem acesso do navegador.
create table if not exists public.account_tokens (
  account_id uuid primary key references public.social_accounts (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Posts / agendamentos
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  caption text not null default '',
  kind text not null check (kind in ('image', 'carousel', 'reel', 'story', 'video', 'photos')),
  platforms text[] not null default array['instagram'],
  media jsonb not null default '[]'::jsonb,        -- [{ "url": "...", "type": "image" | "video" }]
  slides jsonb,                                    -- design do carrossel (renderizado no app)
  design jsonb,                                    -- tema do carrossel
  scheduled_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'failed')),
  results jsonb not null default '{}'::jsonb,      -- { instagram: {...}, tiktok: {...} }
  options jsonb not null default '{}'::jsonb,      -- opções por plataforma (privacidade TikTok etc.)
  created_by text not null default 'user' check (created_by in ('user', 'agent')),
  notes text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_due_idx on public.posts (status, scheduled_at);

-- ---------------------------------------------------------------------------
-- Automações de comentários (palavra-chave -> resposta pública + DM)
-- ---------------------------------------------------------------------------
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.social_accounts (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  keywords text[] not null default '{}',           -- vazio = qualquer comentário
  match_mode text not null default 'contains' check (match_mode in ('contains', 'exact', 'any')),
  media_ids text[] not null default '{}',          -- vazio = todos os posts
  reply_variants text[] not null default '{}',     -- respostas públicas (uma é sorteada)
  dm_message text,                                 -- mensagem privada (private reply)
  use_ai boolean not null default false,
  ai_instructions text,
  once_per_user boolean not null default true,
  triggered_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.social_accounts (id) on delete cascade,
  automation_id uuid references public.automations (id) on delete set null,
  platform text not null default 'instagram',
  comment_id text not null unique,
  media_id text,
  from_id text,
  from_username text,
  text text,
  reply_text text,
  dm_text text,
  status text not null default 'pending' check (status in ('pending', 'replied', 'ignored', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists comment_events_user_idx on public.comment_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Concorrentes, auditorias de perfil, configurações da marca, chaves de API
-- ---------------------------------------------------------------------------
create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'instagram' check (platform in ('instagram', 'tiktok')),
  username text not null,
  notes text,
  snapshot jsonb,
  analysis jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, platform, username)
);

create table if not exists public.profile_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.social_accounts (id) on delete cascade,
  source text not null default 'ai' check (source in ('ai', 'agent')),
  snapshot jsonb,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.brand_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  brand_name text,
  niche text,
  audience text,
  tone text,
  default_hashtags text,
  default_cta text,
  approval_required boolean not null default true,
  timezone text not null default 'America/Sao_Paulo',
  updated_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,                   -- sha256 hex da chave
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: cada usuário só enxerga as próprias linhas
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['social_accounts','posts','automations','comment_events','competitors','profile_audits','brand_settings','api_keys']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

alter table public.account_tokens enable row level security;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts for each row execute function public.touch_updated_at();
drop trigger if exists automations_touch on public.automations;
create trigger automations_touch before update on public.automations for each row execute function public.touch_updated_at();

create or replace function public.increment_automation(automation uuid) returns void language sql security definer as $$
  update public.automations set triggered_count = triggered_count + 1 where id = automation;
$$;
revoke execute on function public.increment_automation(uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket público para mídias (Instagram e TikTok exigem URL pública)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media upload own folder" on storage.objects;
create policy "media upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "media delete own folder" on storage.objects;
create policy "media delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
