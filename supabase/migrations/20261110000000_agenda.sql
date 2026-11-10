-- Agenda online da PáginasPro (adicional de R$ 29/mês): o paciente agenda pela página /agendar/<slug> (sem login),
-- o profissional controla no painel /r/<token> (aba Agenda, com senha) e a IA manda o lembrete no WhatsApp 1 dia antes.
-- Tudo passa pela função "agenda" (service role): as tabelas novas não têm policy para anon.
alter table public.landing_pages add column if not exists agenda_status text not null default 'off';
alter table public.landing_pages drop constraint if exists landing_pages_agenda_status_check;
alter table public.landing_pages add constraint landing_pages_agenda_status_check check (agenda_status in ('off', 'trial', 'active', 'paused'));
-- fim do teste grátis (trial) ou do último mês pago
alter table public.landing_pages add column if not exists agenda_until timestamptz;
-- login do profissional (e-mail + senha; a senha é criada no 1º acesso pelo link do painel)
alter table public.landing_pages add column if not exists agenda_email text;
alter table public.landing_pages add column if not exists agenda_pass text;
-- assinatura do Mercado Pago (preapproval)
alter table public.landing_pages add column if not exists agenda_sub_id text;
-- serviços, horários, estilo (simple/modern), antecedência
alter table public.landing_pages add column if not exists agenda jsonb not null default '{}'::jsonb;

create table if not exists public.agenda_appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  page_id uuid not null references public.landing_pages (id) on delete cascade,
  service text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  name text not null default '',
  phone text not null default '',
  note text,
  -- booked = marcado; confirmed = paciente confirmou; reschedule = pediu para remarcar; block = horário bloqueado
  status text not null default 'booked',
  source text not null default 'site',
  reminder_sent_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agenda_appointments drop constraint if exists agenda_appointments_status_check;
alter table public.agenda_appointments add constraint agenda_appointments_status_check
  check (status in ('booked', 'confirmed', 'reschedule', 'cancelled', 'done', 'noshow', 'block'));
-- Particular ou o convênio que o paciente escolheu
alter table public.agenda_appointments add column if not exists plan text;
-- Profissional da clínica (id em landing_pages.agenda.pros); vazio = agenda única ou bloqueio da clínica toda
alter table public.agenda_appointments add column if not exists pro text;
create index if not exists agenda_appointments_page on public.agenda_appointments (page_id, starts_at);
create index if not exists agenda_appointments_reminder on public.agenda_appointments (starts_at) where reminder_sent_at is null;
create index if not exists agenda_appointments_phone on public.agenda_appointments (phone);
alter table public.agenda_appointments enable row level security;
drop policy if exists "own all" on public.agenda_appointments;
create policy "own all" on public.agenda_appointments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sessões do painel do profissional (token aleatório guardado só como hash)
create table if not exists public.agenda_sessions (
  token_hash text primary key,
  page_id uuid not null references public.landing_pages (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.agenda_sessions enable row level security;

-- painel do cliente: mostra a aba Agenda quando ligada
create or replace function public.landing_report(p_token text) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'name', p.name, 'logo', p.logo, 'niche', p.niche, 'slug', p.slug, 'domain', p.domain, 'status', p.status,
    'plan', p.plan, 'panel', p.panel, 'content', jsonb_build_object('colors', p.content -> 'colors', 'fonts', p.content -> 'fonts'),
    'support', (select b.sale_alert_phone from brand_settings b where b.user_id = p.user_id limit 1),
    'agenda', p.agenda_status,
    'stats', case when p.plan = 'monthly' or p.panel then coalesce((
      select jsonb_agg(jsonb_build_object('day', s.day, 'views', s.views, 'whatsapp', s.whatsapp, 'maps', s.maps, 'sources', s.sources) order by s.day)
      from landing_stats s where s.page_id = p.id and s.day > current_date - 62), '[]'::jsonb) else null end)
  from landing_pages p where p.report_token = p_token and p_token <> '' limit 1;
$$;
grant execute on function public.landing_report(text) to anon;

-- Leitura pública das landing pages (api/landing.ts com a chave anon): só as colunas que a página mostra.
-- O link do painel (report_token), o login da agenda, os links de pagamento e as notas do cliente ficam fora.
-- Coluna nova em landing_pages não entra na leitura pública sozinha: se a página precisar dela, rode este bloco de novo
-- (ele roda a cada deploy, depois do default_grants que devolve tudo).
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols from information_schema.columns
  where table_schema = 'public' and table_name = 'landing_pages'
    and column_name not in ('report_token', 'agenda_pass', 'agenda_email', 'agenda_sub_id', 'pay_links', 'conversation_id', 'auto_instructions', 'notes');
  execute 'revoke select on public.landing_pages from anon';
  execute format('grant select (%s) on public.landing_pages to anon', cols);
end $$;
