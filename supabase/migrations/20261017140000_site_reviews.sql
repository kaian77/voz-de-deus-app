-- Avaliações do site (formulário "Avalie e ganhe 10%"): só quem tem pedido na loja com o mesmo e-mail.
-- Cada pedido avalia uma vez; o cliente recebe o cupom na hora e por e-mail. O dono aprova antes de ir para o site.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.site_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id text not null,
  order_number text,
  name text not null,
  email text not null,
  rating int not null,
  comment text,
  products text,
  status text not null default 'pending',
  coupon text,
  emailed_at timestamptz,
  email_error text,
  created_at timestamptz not null default now(),
  unique (user_id, order_id)
);
alter table public.site_reviews drop constraint if exists site_reviews_rating_check;
alter table public.site_reviews add constraint site_reviews_rating_check check (rating between 1 and 5);
alter table public.site_reviews drop constraint if exists site_reviews_status_check;
alter table public.site_reviews add constraint site_reviews_status_check check (status in ('pending', 'approved', 'hidden'));
create index if not exists site_reviews_user_created on public.site_reviews (user_id, created_at desc);

alter table public.site_reviews enable row level security;
drop policy if exists "own read" on public.site_reviews;
create policy "own read" on public.site_reviews for select using (auth.uid() = user_id);
drop policy if exists "own update" on public.site_reviews;
create policy "own update" on public.site_reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own delete" on public.site_reviews;
create policy "own delete" on public.site_reviews for delete using (auth.uid() = user_id);
revoke all on public.site_reviews from anon;

-- Cupom para quem avalia (o dono cria o cupom na Nuvemshop com o mesmo nome)
alter table public.brand_settings add column if not exists review_coupon text not null default 'AVALIA10';
