-- App de treino FORMA (/treino): conta própria (e-mail + senha, separada do login do Studio), nuvem dos treinos,
-- desafios/ranking e lembrete no celular. (O modo personal saiu: 20261120010000_forma_no_personal.sql.)
-- Tudo passa pela função `forma` (service role); RLS ligado e sem policy = o anon não lê nada.

create table if not exists public.forma_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  pass text not null,
  name text not null default '',
  code text not null unique,
  data jsonb not null default '{}'::jsonb,
  data_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.forma_auth (
  token_hash text primary key,
  user_id uuid not null references public.forma_users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists public.forma_workouts (
  id text not null,
  user_id uuid not null references public.forma_users(id) on delete cascade,
  day date not null,
  data jsonb not null,
  reps int not null default 0,
  perfect int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists forma_workouts_day on public.forma_workouts(day);

create table if not exists public.forma_challenges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  ex text not null,
  starts date not null,
  ends date not null,
  owner uuid not null references public.forma_users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.forma_challenge_members (
  challenge_id uuid not null references public.forma_challenges(id) on delete cascade,
  user_id uuid not null references public.forma_users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table if not exists public.forma_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.forma_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  remind_at text not null default '18:00',
  days int[] not null default '{1,2,3,4,5}',
  last_sent date,
  created_at timestamptz not null default now()
);

alter table public.forma_users enable row level security;
alter table public.forma_auth enable row level security;
alter table public.forma_workouts enable row level security;
alter table public.forma_challenges enable row level security;
alter table public.forma_challenge_members enable row level security;
alter table public.forma_push enable row level security;

revoke all on public.forma_users, public.forma_auth, public.forma_workouts,
  public.forma_challenges, public.forma_challenge_members, public.forma_push from anon, authenticated;
