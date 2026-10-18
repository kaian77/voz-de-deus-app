-- Transcrição dos cortes (JSON) guardada no storage para o "Refazer" não transcrever de novo.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/json']
where id = 'media';
