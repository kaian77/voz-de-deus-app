-- Aviso de venda no WhatsApp: a cada venda (Mercado Livre, Shopee, site) manda mensagem para um número
alter table public.brand_settings add column if not exists sale_alert_phone text;
alter table public.brand_settings add column if not exists sale_alert_channels text[] not null default '{mercadolivre,shopee,nuvemshop}';
alter table public.brand_settings add column if not exists sale_alert_since timestamptz;

-- Pedidos já avisados (evita mensagem repetida)
create table if not exists public.sale_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null,
  order_id text not null,
  summary text,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (user_id, channel, order_id)
);
alter table public.sale_alerts enable row level security;
drop policy if exists "own read" on public.sale_alerts;
create policy "own read" on public.sale_alerts for select using (auth.uid() = user_id);
revoke all on public.sale_alerts from anon;
