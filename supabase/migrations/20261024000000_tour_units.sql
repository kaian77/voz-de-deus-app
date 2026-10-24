-- Tour 3D (paginaspro.app.br/3d/<slug>): situação de cada unidade (disponível/reservado/vendido).
-- Todo mundo lê (o tour é público); só quem tem o link de edição do tour (edit_token) ou o dono logado grava.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.tour_projects (
  slug text primary key,
  name text not null,
  edit_token text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table public.tour_projects enable row level security;
drop policy if exists "logged read" on public.tour_projects;
create policy "logged read" on public.tour_projects for select to authenticated using (true);
revoke all on public.tour_projects from anon;

create table if not exists public.tour_units (
  slug text not null references public.tour_projects (slug) on delete cascade,
  block text not null,
  unit int not null,
  status text not null check (status in ('disponivel', 'reservado', 'vendido')),
  updated_at timestamptz not null default now(),
  primary key (slug, block, unit)
);
alter table public.tour_units enable row level security;
drop policy if exists "public read" on public.tour_units;
create policy "public read" on public.tour_units for select to anon, authenticated using (true);
revoke insert, update, delete on public.tour_units from anon;

/** O link de edição vale para este tour? */
create or replace function public.tour_check(p_slug text, p_token text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from tour_projects where slug = p_slug and (edit_token = p_token or auth.uid() is not null));
$$;

/** Grava a situação de uma ou várias unidades: p_units = [{"block":"A","unit":302,"status":"vendido"}, ...]. */
create or replace function public.tour_set_units(p_slug text, p_token text, p_units jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not tour_check(p_slug, p_token) then raise exception 'link de edição inválido'; end if;
  if jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) > 2000 then raise exception 'lista inválida'; end if;
  insert into tour_units (slug, block, unit, status, updated_at)
  select p_slug, left(u ->> 'block', 8), (u ->> 'unit')::int, u ->> 'status', now()
  from jsonb_array_elements(p_units) u
  where u ->> 'status' in ('disponivel', 'reservado', 'vendido')
  on conflict (slug, block, unit) do update set status = excluded.status, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.tour_check(text, text) to anon, authenticated;
grant execute on function public.tour_set_units(text, text, jsonb) to anon, authenticated;

insert into public.tour_projects (slug, name) values ('chacara-bernadette', 'Chácara Bernadette Residencial') on conflict do nothing;
