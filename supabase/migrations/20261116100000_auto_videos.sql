-- Liga/desliga os vídeos automáticos da loja (piloto automático e vídeos diários); o dono faz os vídeos à mão
alter table public.brand_settings add column if not exists auto_videos boolean not null default true;
