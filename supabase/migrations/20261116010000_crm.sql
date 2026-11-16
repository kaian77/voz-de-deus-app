-- CRM da prospecção (Studio → CRM): negócio fechado/perdido, follow-ups e resposta do lead
alter table public.leads add column if not exists deal_value numeric;
alter table public.leads add column if not exists deal_plan text;
alter table public.leads add column if not exists closed_at timestamptz;
alter table public.leads add column if not exists lost_reason text;
alter table public.leads add column if not exists followups int not null default 0;
alter table public.leads add column if not exists last_touch_at timestamptz;
alter table public.leads add column if not exists replied_at timestamptz;
alter table public.leads add column if not exists instagram text;
