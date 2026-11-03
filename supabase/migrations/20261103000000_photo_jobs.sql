-- Fotos de produto (Studio → Loja → Fotos de produto): lote de fotos + tema → workflow product-photos.yml
-- (video/product_photos.py) recorta cada produto, separa prata/dourado e faz a foto de fundo branco e a do tema.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.photo_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  theme text,
  names text[] not null default '{}',
  source_urls text[] not null default '{}',
  status text not null default 'queued', -- queued | processing | ready | failed
  results jsonb not null default '[]'::jsonb, -- [{source, index, color, name, white_url, theme_url}]
  seed int,
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists photo_jobs_status on public.photo_jobs (status);
alter table public.photo_jobs enable row level security;
drop policy if exists "own all" on public.photo_jobs;
create policy "own all" on public.photo_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
