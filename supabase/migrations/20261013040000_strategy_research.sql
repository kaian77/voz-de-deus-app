-- Estratégia em etapas (vendas -> pesquisa de mercado na web -> plano)
alter table public.strategies add column if not exists research jsonb;
alter table public.strategies add column if not exists status text not null default 'done';
