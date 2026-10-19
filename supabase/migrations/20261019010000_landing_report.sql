-- Landing pages: plano mensal (painel de resultados + suporte) e contagem por dia.
-- landing_stats: uma linha por página por dia (visitas, cliques no WhatsApp, rota no mapa, de onde vieram).
-- Quem conta é o navegador do visitante (api/landing.ts recebe o aviso e chama landing_track); robôs não contam.
-- Painel do cliente: /r/<report_token> (landing_report devolve só totais, e só se o plano mensal estiver ligado).
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
alter table public.landing_pages add column if not exists plan text not null default 'none';
alter table public.landing_pages add column if not exists report_token text;
create unique index if not exists landing_pages_report_token on public.landing_pages (report_token) where report_token is not null;
alter table public.landing_pages drop constraint if exists landing_pages_plan_check;
alter table public.landing_pages add constraint landing_pages_plan_check check (plan in ('none', 'monthly'));

create table if not exists public.landing_stats (
  page_id uuid not null references public.landing_pages (id) on delete cascade,
  day date not null,
  views int not null default 0,
  whatsapp int not null default 0,
  maps int not null default 0,
  -- {"google": 3, "instagram": 5, "whatsapp": 1, "direto": 9}
  sources jsonb not null default '{}',
  primary key (page_id, day)
);
alter table public.landing_stats enable row level security;
drop policy if exists "own read" on public.landing_stats;
create policy "own read" on public.landing_stats for select
  using (exists (select 1 from public.landing_pages p where p.id = page_id and p.user_id = auth.uid()));

create or replace function public.landing_track(p_slug text, p_domain text, p_event text, p_source text) returns void
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  d date := (now() at time zone 'America/Sao_Paulo')::date;
  src text := case when p_source in ('google', 'instagram', 'facebook', 'whatsapp', 'tiktok', 'outros') then p_source else 'direto' end;
begin
  if p_event not in ('view', 'whatsapp', 'maps') then return; end if;
  select id into pid from landing_pages
    where status = 'published' and ((p_slug <> '' and slug = p_slug) or (p_domain <> '' and lower(domain) = lower(p_domain))) limit 1;
  if pid is null then return; end if;
  insert into landing_stats (page_id, day) values (pid, d) on conflict do nothing;
  if p_event = 'view' then
    update landing_stats set views = views + 1, sources = jsonb_set(sources, array[src], to_jsonb(coalesce((sources ->> src)::int, 0) + 1))
      where page_id = pid and day = d;
    update landing_pages set views = views + 1 where id = pid;
  elsif p_event = 'whatsapp' then
    update landing_stats set whatsapp = whatsapp + 1 where page_id = pid and day = d;
  else
    update landing_stats set maps = maps + 1 where page_id = pid and day = d;
  end if;
end $$;
grant execute on function public.landing_track(text, text, text, text) to anon;

create or replace function public.landing_report(p_token text) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'name', p.name, 'logo', p.logo, 'niche', p.niche, 'slug', p.slug, 'domain', p.domain, 'status', p.status,
    'plan', p.plan, 'content', jsonb_build_object('colors', p.content -> 'colors', 'fonts', p.content -> 'fonts'),
    'support', (select b.sale_alert_phone from brand_settings b where b.user_id = p.user_id limit 1),
    'stats', case when p.plan = 'monthly' then coalesce((
      select jsonb_agg(jsonb_build_object('day', s.day, 'views', s.views, 'whatsapp', s.whatsapp, 'maps', s.maps, 'sources', s.sources) order by s.day)
      from landing_stats s where s.page_id = p.id and s.day > current_date - 62), '[]'::jsonb) else null end)
  from landing_pages p where p.report_token = p_token and p_token <> '' limit 1;
$$;
grant execute on function public.landing_report(text) to anon;
