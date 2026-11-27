-- Separação sem login: link secreto da equipe (/studio/separacao/<chave>), só para ler a fila de pacotes.
-- Trocar a chave no Studio desliga o link antigo.
alter table public.brand_settings add column if not exists packing_key text;
create unique index if not exists brand_settings_packing_key on public.brand_settings (packing_key) where packing_key is not null;
