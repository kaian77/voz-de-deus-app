-- Canais de cortes conectados ficaram com o idioma padrão (pt): acerta pelo canal.
update public.yt_channels set language = 'en' where mode = 'clips' and title ilike '%unfiltered%' and language <> 'en';
update public.yt_channels set language = 'es' where mode = 'clips' and title ilike '%explotan%' and language <> 'es';
