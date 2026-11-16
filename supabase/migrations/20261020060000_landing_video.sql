-- Modelo "Link da bio": vídeo curto no topo da página (MP4 no storage)
alter table public.landing_pages add column if not exists video text;
