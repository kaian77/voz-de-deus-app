-- Resumo diário pelo WhatsApp (8h de Brasília) para o número dos avisos de venda
alter table public.brand_settings add column if not exists daily_digest boolean not null default false;
alter table public.brand_settings add column if not exists daily_digest_last date;
