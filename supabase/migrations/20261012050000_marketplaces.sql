-- Mercado Livre e Shopee conectados como mais "contas" (tokens em account_tokens).
-- A lista de plataformas também foi atualizada nas migrations anteriores, porque o deploy roda todas de novo.
alter table public.social_accounts drop constraint if exists social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check
  check (platform in ('instagram', 'tiktok', 'whatsapp', 'nuvemshop', 'mercadolivre', 'shopee'));

-- Publicar cada produto novo também nos marketplaces conectados
alter table public.brand_settings add column if not exists marketplace_autopublish boolean not null default false;

-- Resultado da publicação em cada marketplace ({ mercadolivre: { id, permalink, price } | { error } })
alter table public.product_drafts add column if not exists marketplaces jsonb not null default '{}'::jsonb;
