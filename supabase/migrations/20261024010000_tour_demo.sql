-- Tour 3D: demonstração com prazo (demo_until) até o cliente pagar (paid), e contagem de visitas.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
alter table public.tour_projects add column if not exists demo_until timestamptz;
alter table public.tour_projects add column if not exists paid boolean not null default false;
alter table public.tour_projects add column if not exists views int not null default 0;
alter table public.tour_projects add column if not exists last_view_at timestamptz;

drop policy if exists "logged update" on public.tour_projects;
create policy "logged update" on public.tour_projects for update to authenticated using (true) with check (true);

-- demonstração nova começa com 7 dias (só quando ainda não tem prazo; pago nunca vence)
update public.tour_projects set demo_until = now() + interval '7 days' where demo_until is null and not paid;

/** Abre o tour: conta a visita (p_count) e diz se a demonstração já venceu. */
create or replace function public.tour_open(p_slug text, p_count boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tour_projects;
begin
  select * into t from tour_projects where slug = p_slug;
  if not found then return jsonb_build_object('found', false, 'expired', false); end if;
  if p_count then update tour_projects set views = views + 1, last_view_at = now() where slug = p_slug; end if;
  return jsonb_build_object('found', true, 'paid', t.paid, 'until', t.demo_until,
    'expired', not t.paid and t.demo_until is not null and t.demo_until < now());
end $$;
grant execute on function public.tour_open(text, boolean) to anon, authenticated;

-- demonstração vencida também não aceita edição de unidades
create or replace function public.tour_check(p_slug text, p_token text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from tour_projects
    where slug = p_slug and (edit_token = p_token or auth.uid() is not null)
      and (paid or demo_until is null or demo_until >= now() or auth.uid() is not null)
  );
$$;
