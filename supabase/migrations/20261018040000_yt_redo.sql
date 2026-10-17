-- Refazer / apagar vídeos do YouTube pelo Studio (status 'redo' e 'deleted' já estão no check da migration do YouTube)
alter table public.yt_videos add column if not exists redo_note text;
