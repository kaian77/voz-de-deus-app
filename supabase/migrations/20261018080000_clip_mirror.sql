-- Cortes: link reserva (cópia do episódio no Drive do dono) para quando o Drive da campanha bloqueia downloads.
alter table public.clip_sources add column if not exists mirror_url text;
