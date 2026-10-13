-- Motor de estratégia: planos gerados pela IA a partir das vendas (site, Mercado Livre, TikTok)
create table if not exists public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  input jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  plan jsonb not null default '{}'::jsonb,
  video_picks jsonb not null default '[]'::jsonb,
  videos_queued_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists strategies_user_created on public.strategies (user_id, created_at desc);
alter table public.strategies enable row level security;
-- O navegador só lê e apaga; quem cria é o servidor
drop policy if exists "own read" on public.strategies;
drop policy if exists "own delete" on public.strategies;
create policy "own read" on public.strategies for select using (auth.uid() = user_id);
create policy "own delete" on public.strategies for delete using (auth.uid() = user_id);
revoke all on public.strategies from anon;
revoke insert, update on public.strategies from authenticated;
