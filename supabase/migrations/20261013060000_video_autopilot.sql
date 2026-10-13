-- Vídeos diários do TikTok: N produtos por dia, sem repetir no ciclo; para quando acabar e espera o dono recomeçar
alter table public.brand_settings add column if not exists video_daily int not null default 0;
alter table public.brand_settings add column if not exists video_cycle int not null default 1;
alter table public.brand_settings add column if not exists video_cycle_done_at timestamptz;
alter table public.brand_settings add column if not exists video_daily_last date;

create table if not exists public.video_autopilot_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle int not null,
  product_id bigint not null,
  name text,
  created_at timestamptz not null default now(),
  unique (user_id, cycle, product_id)
);
alter table public.video_autopilot_items enable row level security;
drop policy if exists "own read" on public.video_autopilot_items;
create policy "own read" on public.video_autopilot_items for select using (auth.uid() = user_id);
revoke all on public.video_autopilot_items from anon;
revoke insert, update, delete on public.video_autopilot_items from authenticated;
