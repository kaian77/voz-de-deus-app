-- Achadinhos (Renda extra): vídeos de produtos da Shopee com o link de afiliado do dono, para postar no Shopee Vídeo
-- (a Shopee não tem API de postagem: o dono baixa e posta pelo app). O workflow "Achadinhos" (video/deals.py) lê o
-- feed de produtos da Shopee Afiliados, escolhe os melhores, a IA escreve o texto e o motor cinema.py faz o vídeo.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  itemid text not null,
  title text not null,
  name text,
  price numeric,
  sale_price numeric,
  discount int,
  rating numeric,
  likes int,
  shop_name text,
  category text,
  image_url text,
  product_link text,
  aff_link text,
  caption text,
  brief jsonb,
  video_url text,
  thumb_url text,
  status text not null default 'rendering',
  error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, itemid)
);
create index if not exists deals_user_created on public.deals (user_id, created_at desc);

alter table public.deals drop constraint if exists deals_status_check;
alter table public.deals add constraint deals_status_check check (status in ('rendering', 'ready', 'posted', 'skipped', 'failed'));

alter table public.deals enable row level security;
drop policy if exists "own all" on public.deals;
create policy "own all" on public.deals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
