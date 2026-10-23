-- Foto opcional do perfil usada no modelo visual das capas de Reels.
alter table public.brand_settings
  add column if not exists instagram_cover_photo_url text;
