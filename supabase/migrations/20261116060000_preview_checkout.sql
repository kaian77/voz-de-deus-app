-- Prévia com "Gostei, quero o meu": preços e links de pagamento do cliente (público, vai na página) e o clique no mensal
alter table public.landing_pages add column if not exists checkout jsonb;
alter table public.landing_pages add column if not exists monthly_intent_at timestamptz;

create or replace function public.landing_checkout_intent(p_slug text) returns void
language sql security definer set search_path = public as $$
  update landing_pages set monthly_intent_at = now() where slug = p_slug and status = 'preview';
$$;
grant execute on function public.landing_checkout_intent(text) to anon;

-- Leitura pública com as colunas novas (video, checkout): mesmo bloco da 20261110000000_agenda.sql
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols from information_schema.columns
  where table_schema = 'public' and table_name = 'landing_pages'
    and column_name not in ('report_token', 'agenda_pass', 'agenda_email', 'agenda_sub_id', 'pay_links', 'conversation_id', 'auto_instructions', 'notes', 'monthly_intent_at');
  execute 'revoke select on public.landing_pages from anon';
  execute format('grant select (%s) on public.landing_pages to anon', cols);
end $$;
