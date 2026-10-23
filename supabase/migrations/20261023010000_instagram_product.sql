-- Preferências do calendário e páginas de links para a bio do Instagram.
alter table public.brand_settings
  add column if not exists calendar_appearance jsonb not null default '{"accent":"#8b5cf6","style":"soft"}'::jsonb;

create table if not exists public.bio_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  display_name text not null,
  username text,
  bio text,
  avatar_url text,
  background text not null default '#f5f3ff',
  accent text not null default '#7c3aed',
  button_style text not null default 'rounded' check (button_style in ('rounded', 'pill', 'outline')),
  links jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bio_links enable row level security;
drop policy if exists "own bio links" on public.bio_links;
drop policy if exists "public read published bio links" on public.bio_links;
create policy "own bio links" on public.bio_links for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public read published bio links" on public.bio_links for select to anon
  using (status = 'published');

drop trigger if exists bio_links_touch on public.bio_links;
create trigger bio_links_touch before update on public.bio_links
  for each row execute function public.touch_updated_at();
