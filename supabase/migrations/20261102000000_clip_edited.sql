-- Cortes: campanha que já manda cortes prontos (vídeos curtos com legenda na tela). O clips.py faz um corte nosso de
-- cada vídeo (inteiro em pé com fundo desfocado, gancho e título próprios) sem recortar o rosto nem pôr legenda por cima.
alter table public.clip_sources add column if not exists edited boolean not null default false;
