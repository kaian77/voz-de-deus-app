-- Prospecção (Renda Extra): buscas de empresas no Google Maps e os leads encontrados.
-- Fila: queued -> running -> done | failed. Quem processa é o workflow "Leads do Google Maps"
-- (prospect/leads.py, robô gosom/google-maps-scraper). Só entram empresas sem site e com celular (WhatsApp).
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.lead_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  query text not null,
  place text not null,
  wanted int not null default 30,
  status text not null default 'queued',
  found int not null default 0,
  lat double precision,
  lng double precision,
  -- [sul, norte, oeste, leste] da área pesquisada (desenhada no mapa)
  bbox jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_searches_status on public.lead_searches (status);

alter table public.lead_searches drop constraint if exists lead_searches_status_check;
alter table public.lead_searches add constraint lead_searches_status_check check (status in ('queued', 'running', 'done', 'failed'));

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  search_id uuid references public.lead_searches (id) on delete set null,
  place_id text not null,
  name text not null,
  category text,
  phone text,
  -- celular no formato internacional, só dígitos (5561999999999)
  whatsapp text,
  -- o que a empresa tem no lugar de site (Instagram, Facebook...), se tiver
  social text,
  address text,
  lat double precision,
  lng double precision,
  rating numeric,
  reviews int,
  maps_url text,
  status text not null default 'new',
  notes text,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leads_user_place on public.leads (user_id, place_id);
create index if not exists leads_user_status on public.leads (user_id, status);

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in ('new', 'contacted', 'replied', 'won', 'lost'));

alter table public.lead_searches enable row level security;
alter table public.leads enable row level security;
drop policy if exists "own all" on public.lead_searches;
drop policy if exists "own all" on public.leads;
create policy "own all" on public.lead_searches for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own all" on public.leads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
