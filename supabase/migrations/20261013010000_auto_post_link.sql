-- Automação automática por post: cada post novo no Instagram ganha uma automação que manda o link do produto no direct
alter table public.brand_settings add column if not exists auto_post_link boolean not null default true;
alter table public.automations add column if not exists auto boolean not null default false;
