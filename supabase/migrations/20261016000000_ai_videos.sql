-- Vídeos gerados por IA (Kling, Higgsfield) na seção "Vídeos IA" do Studio.
-- Fila: processing (enviado ao provedor) -> done (MP4 copiado para o storage) | failed.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.ai_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  model text not null,
  prompt text not null default '',
  image_url text,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'processing',
  task_id text,
  status_url text,
  video_url text,
  error text,
  attempts int not null default 0,
  post_id uuid references public.posts (id) on delete set null,
  file_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_videos drop constraint if exists ai_videos_status_check;
alter table public.ai_videos add constraint ai_videos_status_check check (status in ('processing', 'done', 'failed'));
alter table public.ai_videos drop constraint if exists ai_videos_provider_check;
alter table public.ai_videos add constraint ai_videos_provider_check check (provider in ('kling', 'higgsfield'));

alter table public.ai_videos enable row level security;
-- O navegador só lê e apaga; quem cria e atualiza é o servidor (service role).
drop policy if exists "own read" on public.ai_videos;
drop policy if exists "own delete" on public.ai_videos;
create policy "own read" on public.ai_videos for select using (auth.uid() = user_id);
create policy "own delete" on public.ai_videos for delete using (auth.uid() = user_id);
revoke all on public.ai_videos from anon;
revoke insert, update on public.ai_videos from authenticated;

drop trigger if exists ai_videos_touch on public.ai_videos;
create trigger ai_videos_touch before update on public.ai_videos for each row execute function public.touch_updated_at();

create index if not exists ai_videos_status on public.ai_videos (status, created_at);
create index if not exists ai_videos_user on public.ai_videos (user_id, created_at desc);
