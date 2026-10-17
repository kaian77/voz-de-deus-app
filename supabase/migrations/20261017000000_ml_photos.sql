-- Fotos dos anúncios do Mercado Livre no padrão exigido (1200x1200, fundo branco, produto centralizado e grande).
-- Fila: queued -> done (foto pronta no storage) | failed. Quem processa é o workflow "Fotos do Mercado Livre"
-- (video/ml_photos.py, recorte com rembg). A sincronização com o ML usa result_url no lugar da foto da loja.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.ml_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_url text not null,
  -- cover: recorta o fundo e põe o produto grande no branco; extra: só deixa quadrada no fundo branco
  kind text not null default 'cover',
  status text not null default 'queued',
  result_url text,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ml_photos_source_kind on public.ml_photos (source_url, kind);
create index if not exists ml_photos_status on public.ml_photos (status);

alter table public.ml_photos drop constraint if exists ml_photos_status_check;
alter table public.ml_photos add constraint ml_photos_status_check check (status in ('queued', 'done', 'failed'));
alter table public.ml_photos drop constraint if exists ml_photos_kind_check;
alter table public.ml_photos add constraint ml_photos_kind_check check (kind in ('cover', 'extra', 'detail', 'angle'));

-- Só o servidor (service role) usa esta tabela
alter table public.ml_photos enable row level security;
