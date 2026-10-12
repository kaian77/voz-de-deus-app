-- Piloto automático de conteúdo: toda semana o Studio cria posts (carrosséis e vídeos) com as datas
-- comemorativas e os produtos da loja, e deixa tudo em Aprovações.
alter table public.brand_settings add column if not exists autopilot_enabled boolean not null default true;
alter table public.brand_settings add column if not exists autopilot_per_week int not null default 4;
alter table public.brand_settings add column if not exists autopilot_last_run timestamptz;
