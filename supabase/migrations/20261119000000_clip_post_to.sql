-- Cortes: campanha que só aceita TikTok/Instagram Reels posta lá (posts do Studio) e não no YouTube.
alter table public.clip_sources add column if not exists post_to jsonb;
