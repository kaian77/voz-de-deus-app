-- Piloto automático do Instagram da PáginasPro (separado do da loja)
alter table public.brand_settings add column if not exists pp_autopilot_enabled boolean not null default true;
alter table public.brand_settings add column if not exists pp_autopilot_per_week int not null default 3;
alter table public.brand_settings add column if not exists pp_autopilot_last_run timestamptz;
alter table public.brand_settings add column if not exists pp_autopilot_error text;
