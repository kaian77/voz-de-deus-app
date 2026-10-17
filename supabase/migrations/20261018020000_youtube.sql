-- Canal automático no YouTube (Renda extra): pesquisa o que mais dá audiência no nicho, a IA escreve o roteiro e o
-- workflow "Vídeos do YouTube" (video/youtube.py) narra, anima, legenda, faz a capa e envia.
-- Fluxo de yt_videos: draft (tema escolhido) -> scripting -> queued (roteiro pronto) -> rendering -> uploaded | failed.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.yt_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_id text not null,
  title text,
  thumbnail text,
  enabled boolean not null default false,
  niche text not null default 'Curiosidades da Bíblia',
  shorts_per_day int not null default 2,
  long_per_week int not null default 2,
  voice text not null default 'pt-BR-AntonioNeural',
  -- vídeos que mais deram audiência no nicho (pesquisa diária): [{id, title, channel, views, published_at, kind}]
  trends jsonb,
  trends_at timestamptz,
  planned_on date,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists yt_channels_channel on public.yt_channels (channel_id);
-- Idioma do canal (um canal por idioma: o YouTube recomenda melhor canal de uma língua só)
alter table public.yt_channels add column if not exists language text not null default 'pt';
alter table public.yt_channels drop constraint if exists yt_channels_language_check;
alter table public.yt_channels add constraint yt_channels_language_check check (language in ('pt', 'en', 'es'));
-- Estilo da animação: parallax (2.5D, personagem recortado sobre o fundo), whiteboard (desenho à mão), classic (zoom)
alter table public.yt_channels add column if not exists style text not null default 'parallax';
alter table public.yt_channels drop constraint if exists yt_channels_style_check;
alter table public.yt_channels add constraint yt_channels_style_check check (style in ('parallax', 'whiteboard', 'classic'));

-- Tokens ficam numa tabela à parte, só para o servidor
create table if not exists public.yt_tokens (
  channel_ref uuid primary key references public.yt_channels (id) on delete cascade,
  access_token text,
  refresh_token text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.yt_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_ref uuid not null references public.yt_channels (id) on delete cascade,
  kind text not null default 'short',
  status text not null default 'draft',
  topic text,
  angle text,
  -- vídeos de referência que inspiraram o tema (só o tema/formato; o conteúdo é original)
  inspiration jsonb,
  script jsonb,
  title text,
  publish_at timestamptz,
  youtube_id text,
  thumbnail_url text,
  duration_s numeric,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists yt_videos_status on public.yt_videos (status);
-- Cópia leve do vídeo para assistir no Studio antes de publicar (apagada em 7 dias pela limpeza do storage)
alter table public.yt_videos add column if not exists preview_url text;

alter table public.yt_videos drop constraint if exists yt_videos_status_check;
alter table public.yt_videos add constraint yt_videos_status_check check (status in ('draft', 'scripting', 'queued', 'rendering', 'uploaded', 'failed'));
alter table public.yt_videos drop constraint if exists yt_videos_kind_check;
alter table public.yt_videos add constraint yt_videos_kind_check check (kind in ('short', 'long', 'clip'));

alter table public.yt_channels enable row level security;
alter table public.yt_tokens enable row level security;
alter table public.yt_videos enable row level security;
drop policy if exists "own all" on public.yt_channels;
drop policy if exists "own all" on public.yt_videos;
create policy "own all" on public.yt_channels for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own all" on public.yt_videos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
