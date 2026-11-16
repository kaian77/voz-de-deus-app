-- "Enviar todos" (CRM/Leads): fila de envio automático pelo WhatsApp conectado no WAHA, um por vez, espaçado
alter table public.leads add column if not exists send_after timestamptz;
alter table public.leads add column if not exists send_text text;
alter table public.leads add column if not exists send_error text;
alter table public.leads add column if not exists bot_sent_at timestamptz;
create index if not exists leads_outbox on public.leads (send_after) where send_after is not null;
