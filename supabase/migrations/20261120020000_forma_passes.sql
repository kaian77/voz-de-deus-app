-- FORMA: aviso "Fulano passou de você" no ranking da semana e nos desafios (uma vez por dia por pessoa/lugar).
create table if not exists public.forma_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.forma_users(id) on delete cascade,
  by_id uuid not null references public.forma_users(id) on delete cascade,
  by_name text not null default '',
  scope text not null default 'semana',
  title text not null default '',
  day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, by_id, scope, day)
);
create index if not exists forma_passes_user on public.forma_passes(user_id, created_at desc);
alter table public.forma_passes enable row level security;
revoke all on public.forma_passes from anon, authenticated;

-- avisos no celular: lembrete e "passou de você" ligam/desligam separados
alter table public.forma_push add column if not exists remind boolean not null default true;
alter table public.forma_push add column if not exists passes boolean not null default true;
