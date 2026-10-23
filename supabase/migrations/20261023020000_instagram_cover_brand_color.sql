-- Cor de marca persistente usada como base para as capas de Reels.
alter table public.brand_settings
  add column if not exists instagram_cover_accent text;
