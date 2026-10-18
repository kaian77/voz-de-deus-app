-- Landing pages puxando os dados do cliente sozinhas (Instagram + Google Maps).
-- leads.details: o que o robô do Maps traz além do básico (horário, fotos, categoria, descrição).
-- leads.details_status: queued = a landing pediu os dados de um lead antigo (o workflow "Leads do Google Maps" busca).
-- landing_pages.imported: o que foi puxado e quando (fotos já copiadas, avisos do Instagram/Maps).
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
alter table public.leads add column if not exists details jsonb;
alter table public.leads add column if not exists details_status text;
alter table public.landing_pages add column if not exists imported jsonb;
