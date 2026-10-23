-- Columns used by the Instagram Reel cover editor.
alter table public.brand_settings
  add column if not exists instagram_cover_accent text,
  add column if not exists instagram_cover_photo_url text;

notify pgrst, 'reload schema';
