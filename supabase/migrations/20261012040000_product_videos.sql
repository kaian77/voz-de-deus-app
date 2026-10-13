-- Vídeos animados dos produtos (Reels/TikTok), renderizados pelo GitHub Actions (video/worker.py).
-- Fila: queued -> rendering -> rendered (MP4 no storage) -> ready (post criado) | failed.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente e também ajusta a tabela
-- criada pela integração antiga com a HeyGen (removida).
alter table public.brand_settings add column if not exists video_enabled boolean not null default false;
alter table public.brand_settings
  drop column if exists video_style,
  drop column if exists video_presenter_name,
  drop column if exists video_notes,
  drop column if exists heygen_avatar_id,
  drop column if exists heygen_voice_id;

create table if not exists public.product_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  product_url text,
  images text[] not null default '{}',
  brief jsonb not null default '{}'::jsonb,
  caption text,
  status text not null default 'queued',
  attempts int not null default 0,
  video_url text,
  post_id uuid references public.posts (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_videos add column if not exists brief jsonb not null default '{}'::jsonb;
alter table public.product_videos add column if not exists attempts int not null default 0;
alter table public.product_videos
  drop column if exists style,
  drop column if exists script,
  drop column if exists heygen_session_id,
  drop column if exists heygen_video_id,
  drop column if exists thumbnail_url;
alter table public.product_videos drop constraint if exists product_videos_status_check;
update public.product_videos set status = 'failed' where status not in ('pending_brief', 'queued', 'rendering', 'rendered', 'ready', 'failed');
alter table public.product_videos add constraint product_videos_status_check
  check (status in ('pending_brief', 'queued', 'rendering', 'rendered', 'ready', 'failed'));
alter table public.product_videos alter column status set default 'queued';

alter table public.product_videos enable row level security;
-- O navegador só lê e apaga; quem cria e atualiza é o servidor (service role).
drop policy if exists "own read" on public.product_videos;
drop policy if exists "own delete" on public.product_videos;
create policy "own read" on public.product_videos for select using (auth.uid() = user_id);
create policy "own delete" on public.product_videos for delete using (auth.uid() = user_id);
revoke all on public.product_videos from anon;
revoke insert, update on public.product_videos from authenticated;

drop trigger if exists product_videos_touch on public.product_videos;
create trigger product_videos_touch before update on public.product_videos for each row execute function public.touch_updated_at();

create index if not exists product_videos_status on public.product_videos (status, created_at);
create index if not exists product_videos_user on public.product_videos (user_id, created_at desc);
