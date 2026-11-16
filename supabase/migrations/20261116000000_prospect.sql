-- Prospecção automática (Leads): quem já tem site vira lead de "upgrade"; o motor monta a prévia de cada lead
-- e deixa a mensagem pronta numa fila de 1 toque (o dono envia pelo WhatsApp dele).
alter table public.leads add column if not exists website text;
alter table public.leads add column if not exists kind text not null default 'new';
alter table public.leads add column if not exists site_audit jsonb;
alter table public.leads add column if not exists prospect_status text;
alter table public.leads add column if not exists prospect_message text;
alter table public.leads add column if not exists prospect_at timestamptz;
alter table public.leads add column if not exists landing_id uuid references public.landing_pages (id) on delete set null;
create index if not exists leads_prospect on public.leads (user_id, prospect_status);

alter table public.brand_settings add column if not exists prospect_enabled boolean not null default false;
alter table public.brand_settings add column if not exists prospect_per_day int not null default 15;

-- Preços escolhidos para a prospecção (uma vez só: depois o dono muda em "Preços e links")
update public.brand_settings
set landing_offer = coalesce(landing_offer, '{}'::jsonb) || '{"oneTime": 297, "monthly": 49, "upgradeOneTime": 247, "upgradeMonthly": 49}'::jsonb
where not (coalesce(landing_offer, '{}'::jsonb) ? 'upgradeOneTime');
