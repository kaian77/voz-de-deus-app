-- Mensagens do Mercado Livre na caixa de entrada: perguntas dos anúncios e mensagens dos pedidos
alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check check (channel in ('instagram', 'whatsapp', 'mercadolivre'));
alter table public.conversations add column if not exists meta jsonb;
