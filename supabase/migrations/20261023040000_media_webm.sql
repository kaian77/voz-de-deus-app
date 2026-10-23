-- Browsers commonly record camera videos as WebM.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/json'
]
where id = 'media';
