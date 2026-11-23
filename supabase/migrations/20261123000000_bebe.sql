-- App Cantinho do bebê (/bebe/): conta própria (e-mail + senha, separada do Studio e do FORMA), família com os dados
-- do bebê na nuvem (um JSON por família, com versão para não perder edição de dois celulares) e avisos no celular.
-- Tudo passa pela função `bebe` (service role); RLS ligado e sem policy = o anon não lê nada.

create table if not exists public.bebe_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  pass text not null,
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.bebe_auth (
  token_hash text primary key,
  user_id uuid not null references public.bebe_users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists public.bebe_families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Família',
  invite text not null unique,
  owner uuid references public.bebe_users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.bebe_members (
  family_id uuid not null references public.bebe_families(id) on delete cascade,
  user_id uuid not null references public.bebe_users(id) on delete cascade,
  role text not null default 'edita' check (role in ('dono', 'edita', 've')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index if not exists bebe_members_user on public.bebe_members(user_id);

create table if not exists public.bebe_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.bebe_users(id) on delete cascade,
  family_id uuid not null references public.bebe_families(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}'::jsonb,
  sent jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bebe_push_family on public.bebe_push(family_id);

alter table public.bebe_users enable row level security;
alter table public.bebe_auth enable row level security;
alter table public.bebe_families enable row level security;
alter table public.bebe_members enable row level security;
alter table public.bebe_push enable row level security;

-- Recuperar senha (link por e-mail, vale 1 h, só uma vez)
create table if not exists public.bebe_resets (
  token_hash text primary key,
  user_id uuid not null references public.bebe_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.bebe_resets enable row level security;

-- Fotos das peças na nuvem: bucket privado; só a função `bebe` entrega links assinados para quem é da família
insert into storage.buckets (id, name, public) values ('bebe', 'bebe', false) on conflict (id) do nothing;

-- IA do app (leitura de nota e BabyBot): limite por pessoa por dia
create table if not exists public.bebe_ai_usage (
  user_id uuid not null references public.bebe_users(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.bebe_ai_usage enable row level security;
