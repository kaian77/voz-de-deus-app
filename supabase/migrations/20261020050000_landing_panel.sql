-- Painel do cliente liberado também no avulso (panel = true), além do plano mensal
alter table public.landing_pages add column if not exists panel boolean not null default false;

create or replace function public.landing_report(p_token text) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'name', p.name, 'logo', p.logo, 'niche', p.niche, 'slug', p.slug, 'domain', p.domain, 'status', p.status,
    'plan', p.plan, 'panel', p.panel, 'content', jsonb_build_object('colors', p.content -> 'colors', 'fonts', p.content -> 'fonts'),
    'support', (select b.sale_alert_phone from brand_settings b where b.user_id = p.user_id limit 1),
    'stats', case when p.plan = 'monthly' or p.panel then coalesce((
      select jsonb_agg(jsonb_build_object('day', s.day, 'views', s.views, 'whatsapp', s.whatsapp, 'maps', s.maps, 'sources', s.sources) order by s.day)
      from landing_stats s where s.page_id = p.id and s.day > current_date - 62), '[]'::jsonb) else null end)
  from landing_pages p where p.report_token = p_token and p_token <> '' limit 1;
$$;
grant execute on function public.landing_report(text) to anon;
