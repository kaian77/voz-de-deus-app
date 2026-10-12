-- Limpeza do storage: vídeos antigos (já baixados ou publicados) são apagados para não estourar o espaço grátis.
alter table public.product_videos add column if not exists file_deleted_at timestamptz;
