-- Fotos geradas para o anúncio ter pelo menos 3 (regra de qualidade do ML):
-- detail = close no pin, angle = pin de lado; as duas a partir da capa. Idempotente.
alter table public.ml_photos drop constraint if exists ml_photos_kind_check;
alter table public.ml_photos add constraint ml_photos_kind_check check (kind in ('cover', 'extra', 'detail', 'angle'));
