-- Diagnóstico: registro de cada notificação recebida da Meta (sem conteúdo das mensagens).
-- Só as edge functions (service role) leem e escrevem.
create table if not exists public.webhook_log (
  id bigint generated always as identity primary key,
  platform text not null,
  status text not null,              -- ok | bad_signature | unknown_account
  account_external_id text,
  kinds text[] not null default '{}', -- ex.: {comments,messages}
  received_at timestamptz not null default now()
);
alter table public.webhook_log enable row level security;
revoke all on public.webhook_log from anon, authenticated;
create index if not exists webhook_log_received on public.webhook_log (received_at desc);
