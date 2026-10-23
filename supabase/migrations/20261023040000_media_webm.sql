-- Create the shared media bucket if this project's initial storage migration was not applied.
-- Browsers commonly record camera videos as WebM.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('media', 'media', true, array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/json'
])
on conflict (id) do update
set public = excluded.public,
    allowed_mime_types = excluded.allowed_mime_types;
