-- Número que recebe no WhatsApp o aviso quando a IA passa a conversa para uma pessoa (a "chefe")
alter table public.brand_settings add column if not exists handoff_phone text;
