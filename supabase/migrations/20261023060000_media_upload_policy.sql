-- Authenticated users may upload files only to their own media folder.
drop policy if exists "media upload own folder" on storage.objects;
create policy "media upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
