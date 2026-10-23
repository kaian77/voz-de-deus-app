-- The reference profiles page must remain usable even when older project migrations were skipped.
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

alter table public.competitors enable row level security;
drop policy if exists "own rows" on public.competitors;
create policy "own rows" on public.competitors
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.competitors to authenticated;

notify pgrst, 'reload schema';
