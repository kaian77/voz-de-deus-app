-- Studio no celular (PWA) com notificações (Web Push). As chaves VAPID são geradas pelo próprio servidor na 1ª vez
-- e guardadas em app_keys (só a chave de serviço lê). Qualquer parte do sistema (functions ou workflows) cria uma
-- linha em notifications; o cron publish-scheduled envia as pendentes. Tudo idempotente (o deploy roda de novo).
create table if not exists public.app_keys (
  name text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.app_keys enable row level security;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own all" on public.push_subscriptions;
create policy "own all" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  url text,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists notifications_pending on public.notifications (created_at) where sent_at is null;
alter table public.notifications enable row level security;
drop policy if exists "own read" on public.notifications;
create policy "own read" on public.notifications for select using (auth.uid() = user_id);
