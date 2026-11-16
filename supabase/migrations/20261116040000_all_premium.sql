-- Modelo "Link da bio" aceito pelo banco (a regra antiga só deixava normal/premium)
alter table public.landing_pages drop constraint if exists landing_pages_tier_check;
alter table public.landing_pages add constraint landing_pages_tier_check check (tier in ('normal', 'premium', 'bio'));
-- Todo site novo sai no modelo Premium (pedido do dono em 16/11/2026)
alter table public.landing_pages alter column tier set default 'premium';
-- Prévias que ainda não estão no ar passam para o Premium (as publicadas ficam como estão)
update public.landing_pages set tier = 'premium' where tier = 'normal' and status in ('draft', 'preview');
