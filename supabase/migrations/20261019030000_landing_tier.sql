-- Landing pages: modelo Premium (layout animado, src/landing/premium.ts), vendido mais caro.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
alter table public.landing_pages add column if not exists tier text not null default 'normal';
alter table public.landing_pages drop constraint if exists landing_pages_tier_check;
alter table public.landing_pages add constraint landing_pages_tier_check check (tier in ('normal', 'premium'));
