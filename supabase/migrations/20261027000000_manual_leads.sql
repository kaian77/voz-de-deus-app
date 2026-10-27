-- Prospecção da Montagem 3D (Renda Extra → Leads → "Manual ruim"): marcas de móveis com avaliações reclamando
-- do manual / da montagem. Fila: queued -> running -> done | failed.
-- Quem processa: Mercado Livre (Brasil, México, Argentina, Colômbia, Chile) na function `ai` (_shared/manual-leads.ts);
-- Google Maps (qualquer país) e Etsy no workflow "Leads do Google Maps" (video/manual_leads.py).
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.manual_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- ml | maps | etsy
  source text not null,
  -- site do Mercado Livre (MLB, MLM...) ou idioma do Maps (pt, en, es)
  site text,
  query text not null,
  -- cidade/país (Google Maps)
  place text,
  status text not null default 'queued',
  found int not null default 0,
  -- quantas avaliações foram lidas
  scanned int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manual_searches_status on public.manual_searches (status, source);

alter table public.manual_searches drop constraint if exists manual_searches_status_check;
alter table public.manual_searches add constraint manual_searches_status_check check (status in ('queued', 'running', 'done', 'failed'));
alter table public.manual_searches drop constraint if exists manual_searches_source_check;
alter table public.manual_searches add constraint manual_searches_source_check check (source in ('ml', 'maps', 'etsy'));

create table if not exists public.manual_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  search_id uuid references public.manual_searches (id) on delete set null,
  source text not null,
  -- marca/loja normalizada (uma linha por marca em cada fonte)
  key text not null,
  name text not null,
  -- BR, MX, AR, CO, CL, US...
  country text,
  url text,
  rating numeric,
  -- avaliações lidas e quantas reclamam do manual/montagem
  reviews_read int not null default 0,
  complaints int not null default 0,
  -- [{text, rate, product, url}] (até 6 frases reais)
  samples jsonb not null default '[]'::jsonb,
  -- {site, phone, instagram}
  contact jsonb,
  status text not null default 'new',
  notes text,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists manual_leads_user_key on public.manual_leads (user_id, source, key);
create index if not exists manual_leads_user_status on public.manual_leads (user_id, status);

alter table public.manual_leads drop constraint if exists manual_leads_status_check;
alter table public.manual_leads add constraint manual_leads_status_check check (status in ('new', 'contacted', 'replied', 'won', 'lost'));

alter table public.manual_searches enable row level security;
alter table public.manual_leads enable row level security;
drop policy if exists "own all" on public.manual_searches;
drop policy if exists "own all" on public.manual_leads;
create policy "own all" on public.manual_searches for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own all" on public.manual_leads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
