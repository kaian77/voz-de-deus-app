-- PáginasPro: pagou → publica. Com o secret MERCADOPAGO_ACCESS_TOKEN o atendente manda links de pagamento só daquele
-- cliente (landing_pages.pay_links) e o webhook do Mercado Pago (função mercadopago-webhook) publica o site sozinho.
-- landing_payments: um registro por pagamento/assinatura do Mercado Pago (o mesmo id nunca é processado duas vezes).
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
alter table public.landing_pages add column if not exists pay_links jsonb;
alter table public.landing_pages add column if not exists paid_at timestamptz;

create table if not exists public.landing_payments (
  id text primary key, -- "payment:<id>" ou "preapproval:<id>"
  user_id uuid references auth.users (id) on delete cascade,
  page_id uuid references public.landing_pages (id) on delete set null,
  plan text,
  amount numeric,
  status text,
  created_at timestamptz not null default now()
);
alter table public.landing_payments enable row level security;
drop policy if exists "own read" on public.landing_payments;
create policy "own read" on public.landing_payments for select using (user_id = auth.uid());
