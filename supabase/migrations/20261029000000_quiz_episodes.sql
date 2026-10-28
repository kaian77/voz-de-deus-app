-- Desafio da Bíblia (Facebook/Kwai, postado à mão): episódios de quiz criados pela IA e renderizados pelo workflow
-- quiz-video.yml (video/quiz.py --auto). O Studio mostra o vídeo para baixar e a legenda para copiar.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.quiz_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  number int not null,
  theme text,
  questions jsonb not null default '[]'::jsonb,
  status text not null default 'queued', -- queued | rendering | ready | posted | failed
  video_url text,
  duration real,
  caption text,
  error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quiz_episodes_status on public.quiz_episodes (status);
alter table public.quiz_episodes enable row level security;
drop policy if exists "own all" on public.quiz_episodes;
create policy "own all" on public.quiz_episodes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- piloto: mantém `quiz_buffer` episódios prontos e não postados; `quiz_request` = pedido do botão "Fazer mais agora"
alter table public.brand_settings add column if not exists quiz_autopilot boolean not null default true;
alter table public.brand_settings add column if not exists quiz_buffer int not null default 3;
alter table public.brand_settings add column if not exists quiz_request int not null default 0;
