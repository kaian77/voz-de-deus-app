-- PáginasPro: preços, links do Mercado Pago e WhatsApp editáveis no Studio (Landing pages → "Preços e links").
-- O site da PáginasPro (api/landing.ts, sem login) lê pela função paginaspro_offer; as mensagens dos leads leem direto.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
alter table public.brand_settings add column if not exists landing_offer jsonb;

create or replace function public.paginaspro_offer() returns jsonb
language sql security definer set search_path = public as $$
  select landing_offer from brand_settings where landing_offer is not null order by updated_at desc nulls last limit 1;
$$;
grant execute on function public.paginaspro_offer() to anon;
