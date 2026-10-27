-- Block Pop: ranking de pontos e aviso "Fulano passou de você".
-- Sem login: o jogo cria um id aleatório no navegador. As tabelas não têm policy (só as funções abaixo mexem).
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.blockpop_players (
  id uuid primary key,
  name text not null,
  best int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blockpop_players_best on public.blockpop_players (best desc);
alter table public.blockpop_players enable row level security;

create table if not exists public.blockpop_passes (
  id bigserial primary key,
  victim uuid not null,
  by_name text not null,
  by_score int not null,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists blockpop_passes_victim on public.blockpop_passes (victim) where not seen;
alter table public.blockpop_passes enable row level security;

/** Nome limpo para o ranking: 2 a 16 letras, sem link. */
create or replace function public.blockpop_clean(p text) returns text
language sql immutable as $$
  select case
    when n is null or length(n) < 2 or n ~* '(https?|www\.|\.com|\.br|\.net|/)' then null
    else n end
  from (select left(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), 16) as n) x;
$$;

/** Manda o recorde. Se subiu, avisa quem ficou para trás (os 30 mais perto) e devolve a posição. */
create or replace function public.blockpop_submit(p_id uuid, p_name text, p_score int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n text := blockpop_clean(p_name);
  old int;
  passed text[];
  my int;
begin
  if n is null then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if p_score is null or p_score < 0 or p_score > 2000000 then return jsonb_build_object('ok', false, 'error', 'score'); end if;
  select best into old from blockpop_players where id = p_id;
  if p_score > coalesce(old, 0) then
    select array_agg(name order by best desc) into passed from (
      select name, best from blockpop_players
      where id <> p_id and best > coalesce(old, 0) and best < p_score
      order by best desc limit 30
    ) v;
    insert into blockpop_passes (victim, by_name, by_score)
      select id, n, p_score from (
        select id from blockpop_players
        where id <> p_id and best > coalesce(old, 0) and best < p_score
        order by best desc limit 30
      ) v;
  end if;
  insert into blockpop_players (id, name, best) values (p_id, n, greatest(p_score, 0))
    on conflict (id) do update set name = excluded.name, best = greatest(blockpop_players.best, excluded.best), updated_at = now();
  select best into my from blockpop_players where id = p_id;
  return jsonb_build_object('ok', true, 'name', n, 'best', my,
    'rank', (select count(*) + 1 from blockpop_players where best > my),
    'total', (select count(*) from blockpop_players),
    'passed', coalesce(to_jsonb(passed[1:3]), '[]'::jsonb));
end $$;
grant execute on function public.blockpop_submit(uuid, text, int) to anon, authenticated;

/** Ranking (os 50 primeiros) + a posição de quem pede. */
create or replace function public.blockpop_board(p_id uuid) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'best', best, 'me', id = p_id) order by best desc, updated_at)
      from (select * from blockpop_players order by best desc, updated_at limit 50) t), '[]'::jsonb),
    'me', (select jsonb_build_object('name', name, 'best', best, 'rank', (select count(*) + 1 from blockpop_players b where b.best > p.best))
      from blockpop_players p where id = p_id),
    'total', (select count(*) from blockpop_players));
$$;
grant execute on function public.blockpop_board(uuid) to anon, authenticated;

/** Quem passou de você desde a última vez (marca como visto). */
create or replace function public.blockpop_news(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('name', by_name, 'score', by_score) order by created_at desc), '[]'::jsonb) into r
    from (select * from blockpop_passes where victim = p_id and not seen order by created_at desc limit 5) x;
  update blockpop_passes set seen = true where victim = p_id and not seen;
  delete from blockpop_passes where seen and created_at < now() - interval '30 days';
  return r;
end $$;
grant execute on function public.blockpop_news(uuid) to anon, authenticated;
