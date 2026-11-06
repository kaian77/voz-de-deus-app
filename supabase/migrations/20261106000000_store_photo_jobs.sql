-- Fotos temáticas dos produtos que já estão na loja (Produtos → Produtos da loja → "Foto temática"): a foto de fundo
-- branco do site vira uma foto com cenário do tema (fal.ai, workflow store-photos.yml → video/store_photos.py);
-- o dono vê a prévia e aplica (vira a capa no site; o Mercado Livre continua com fundo branco).
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.store_photo_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id bigint not null,
  name text,
  url text,
  source_url text not null,
  theme text,
  status text not null default 'queued', -- queued | processing | ready | applied | failed | discarded
  result_url text,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index if not exists store_photo_jobs_status on public.store_photo_jobs (status);
alter table public.store_photo_jobs enable row level security;
drop policy if exists "own all" on public.store_photo_jobs;
create policy "own all" on public.store_photo_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- auto_apply: aplica sozinho no site quando fica pronta (pedido "trocar todas"); skipped = capa já não era fundo branco
alter table public.store_photo_jobs add column if not exists auto_apply boolean not null default false;
