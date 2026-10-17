-- Landing pages de clientes (Renda extra). A IA escreve o conteúdo (content); o layout é fixo (src/landing/render.ts).
-- Publicada = qualquer pessoa vê em /p/<slug> (função da Vercel api/landing.ts lê com a chave pública).
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  slug text not null,
  name text not null,
  niche text not null,
  city text,
  whatsapp text,
  instagram text,
  address text,
  registry text,
  hours text,
  notes text,
  photos text[] not null default '{}',
  logo text,
  rating numeric,
  reviews int,
  content jsonb,
  status text not null default 'draft',
  views int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists landing_pages_slug on public.landing_pages (slug);

alter table public.landing_pages drop constraint if exists landing_pages_status_check;
alter table public.landing_pages add constraint landing_pages_status_check check (status in ('draft', 'published'));

alter table public.landing_pages enable row level security;
drop policy if exists "own all" on public.landing_pages;
drop policy if exists "public read published" on public.landing_pages;
create policy "own all" on public.landing_pages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public read published" on public.landing_pages for select to anon using (status = 'published');

-- Contador de visitas da página publicada (chamado pela função pública, sem expor escrita na tabela)
create or replace function public.landing_view(p_slug text) returns void
language sql security definer set search_path = public as $$
  update public.landing_pages set views = views + 1 where slug = p_slug and status = 'published';
$$;
grant execute on function public.landing_view(text) to anon;
