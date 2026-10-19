-- Site da PáginasPro (vitrine do dono em paginaspro.vercel.app): visitas e cliques no WhatsApp por dia.
-- Quem conta é o navegador do visitante (api/landing.ts -> site_track). Só o dono (logado no Studio) lê.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.site_stats (
  site text not null,
  day date not null,
  views int not null default 0,
  whatsapp int not null default 0,
  sources jsonb not null default '{}',
  primary key (site, day)
);
alter table public.site_stats enable row level security;
drop policy if exists "logged read" on public.site_stats;
create policy "logged read" on public.site_stats for select to authenticated using (true);

create or replace function public.site_track(p_site text, p_event text, p_source text) returns void
language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'America/Sao_Paulo')::date;
  src text := case when p_source in ('google', 'instagram', 'facebook', 'whatsapp', 'tiktok', 'outros') then p_source else 'direto' end;
begin
  if p_site <> 'paginaspro' or p_event not in ('view', 'whatsapp') then return; end if;
  insert into site_stats (site, day) values (p_site, d) on conflict do nothing;
  if p_event = 'view' then
    update site_stats set views = views + 1, sources = jsonb_set(sources, array[src], to_jsonb(coalesce((sources ->> src)::int, 0) + 1))
      where site = p_site and day = d;
  else
    update site_stats set whatsapp = whatsapp + 1 where site = p_site and day = d;
  end if;
end $$;
grant execute on function public.site_track(text, text, text) to anon;
