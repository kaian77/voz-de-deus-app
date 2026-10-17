-- Cortes (Renda extra): canais que postam cortes de vídeos LIBERADOS (campanhas de clipping como Whop Content
-- Rewards, Creative Commons ou criadores que autorizaram). A pessoa cadastra a fonte (pasta/arquivo do Google Drive
-- da campanha + regras); o workflow "Cortes" (video/clips.py) baixa, transcreve, a IA escolhe os melhores momentos,
-- corta na vertical seguindo o rosto, aplica título, logo e legendas e envia ao canal. Cada corte vira um
-- yt_videos com kind = 'clip'. O deploy roda todas as migrations de novo: tudo aqui é idempotente.

-- Tipo do canal: bible = criador de vídeos com IA (piloto diário); clips = só cortes
alter table public.yt_channels add column if not exists mode text not null default 'bible';
alter table public.yt_channels drop constraint if exists yt_channels_mode_check;
alter table public.yt_channels add constraint yt_channels_mode_check check (mode in ('bible', 'clips'));

create table if not exists public.clip_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_ref uuid not null references public.yt_channels (id) on delete cascade,
  campaign text not null,
  -- pasta ou arquivo do Google Drive (compartilhado com "qualquer pessoa com o link") ou link direto de vídeo
  url text not null,
  hashtags text,
  -- crédito na descrição (ex.: "Stream House LA — CWETV")
  credit text,
  rules text,
  clips_wanted int not null default 6,
  per_day int not null default 3,
  status text not null default 'queued',
  clips_made int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clip_sources_status on public.clip_sources (status);

alter table public.clip_sources drop constraint if exists clip_sources_status_check;
alter table public.clip_sources add constraint clip_sources_status_check check (status in ('queued', 'processing', 'done', 'failed'));

alter table public.clip_sources enable row level security;
drop policy if exists "own all" on public.clip_sources;
create policy "own all" on public.clip_sources for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
