-- Vídeos dos produtos com a apresentadora da marca (avatar + voz na HeyGen) para Reels e TikTok.
alter table public.brand_settings add column if not exists video_enabled boolean not null default false;
alter table public.brand_settings add column if not exists video_style text not null default 'pov';
alter table public.brand_settings add column if not exists video_presenter_name text;
alter table public.brand_settings add column if not exists video_notes text;
alter table public.brand_settings add column if not exists heygen_avatar_id text;
alter table public.brand_settings add column if not exists heygen_voice_id text;

create table if not exists public.product_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  product_url text,
  images text[] not null default '{}',
  style text not null default 'pov',
  script text,
  caption text,
  status text not null default 'generating' check (status in ('generating', 'finishing', 'ready', 'failed')),
  heygen_session_id text,
  heygen_video_id text,
  video_url text,
  thumbnail_url text,
  post_id uuid references public.posts (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_videos enable row level security;
-- O navegador só lê e apaga; quem cria e atualiza é a função (service role).
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
