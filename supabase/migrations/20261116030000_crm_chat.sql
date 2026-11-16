-- CRM: conversa do lead no WhatsApp pessoal do dono (colada no Studio) para a IA sugerir a resposta com contexto
alter table public.leads add column if not exists chat jsonb not null default '[]'::jsonb;
