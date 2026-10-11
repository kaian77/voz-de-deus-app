-- Cadastro de produtos na loja Nuvemshop.
-- Modelos de cadastro: tudo que se repete (preço, peso, medidas, categoria, descrição base...).
create table if not exists public.product_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fila de fotos enviadas para virar produto (o Studio ou o Claude cadastra na loja).
create table if not exists public.product_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  images text[] not null default '{}',
  name text,
  template_id uuid references public.product_templates (id) on delete set null,
  overrides jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'creating', 'created', 'failed')),
  product_id text,
  product_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_templates enable row level security;
alter table public.product_drafts enable row level security;

drop policy if exists "own rows" on public.product_templates;
create policy "own rows" on public.product_templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Rascunhos: o navegador cria, edita nome/modelo e apaga; o resultado (status, produto) só a função grava.
drop policy if exists "own read" on public.product_drafts;
drop policy if exists "own insert" on public.product_drafts;
drop policy if exists "own update" on public.product_drafts;
drop policy if exists "own delete" on public.product_drafts;
create policy "own read" on public.product_drafts for select using (auth.uid() = user_id);
create policy "own insert" on public.product_drafts for insert with check (auth.uid() = user_id and status = 'pending');
create policy "own update" on public.product_drafts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on public.product_drafts for delete using (auth.uid() = user_id);
revoke update on public.product_drafts from anon, authenticated;
grant update (name, template_id, overrides, images) on public.product_drafts to authenticated;

revoke all on public.product_templates from anon;
revoke all on public.product_drafts from anon;

drop trigger if exists product_templates_touch on public.product_templates;
create trigger product_templates_touch before update on public.product_templates for each row execute function public.touch_updated_at();
drop trigger if exists product_drafts_touch on public.product_drafts;
create trigger product_drafts_touch before update on public.product_drafts for each row execute function public.touch_updated_at();

create index if not exists product_drafts_user_status on public.product_drafts (user_id, status, created_at desc);

-- Divulgar automaticamente no Instagram/TikTok cada produto novo cadastrado pelo Studio.
alter table public.brand_settings add column if not exists product_autopost boolean not null default true;
