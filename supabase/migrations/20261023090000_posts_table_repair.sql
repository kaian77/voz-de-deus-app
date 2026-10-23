-- Repair the core Reel draft table if the initial Social Studio migration was skipped.
create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  caption text not null default '',
  kind text not null check (kind in ('image', 'carousel', 'reel', 'story', 'video', 'photos')),
  platforms text[] not null default array['instagram'],
  media jsonb not null default '[]'::jsonb,
  slides jsonb,
  design jsonb,
  scheduled_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'failed')),
  results jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,
  created_by text not null default 'user' check (created_by in ('user', 'agent')),
  notes text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_due_idx on public.posts (status, scheduled_at);
alter table public.posts enable row level security;
drop policy if exists "own rows" on public.posts;
create policy "own rows" on public.posts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.posts to authenticated;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';
