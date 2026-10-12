-- Vídeo avulso: o usuário manda a foto e só baixa o vídeo (autopost = false não cria post).
alter table public.product_videos add column if not exists autopost boolean not null default true;
