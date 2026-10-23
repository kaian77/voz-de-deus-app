-- Settings used by the brand profile and Reel cover generator.
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

alter table public.brand_settings enable row level security;
drop policy if exists "own rows" on public.brand_settings;
create policy "own rows" on public.brand_settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.brand_settings to authenticated;

notify pgrst, 'reload schema';
