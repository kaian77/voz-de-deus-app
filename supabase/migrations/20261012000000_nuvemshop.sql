-- Loja Nuvemshop conectada como mais uma "conta" (token em account_tokens, como as redes).
alter table public.social_accounts drop constraint if exists social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check
  check (platform in ('instagram', 'tiktok', 'whatsapp', 'nuvemshop', 'mercadolivre', 'shopee'));
