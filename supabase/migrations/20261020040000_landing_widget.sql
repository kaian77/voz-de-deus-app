-- Animação do Premium escolhida (vazio = pelo ramo; "none" = sem animação; ou o tipo: plate, tooth, body, breath, skin, law, makeup, social)
alter table public.landing_pages add column if not exists widget text;
