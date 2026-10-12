-- Piloto automático de conteúdo: toda semana o Studio cria posts (carrosséis e vídeos) com as datas
-- comemorativas e os produtos da loja, e deixa tudo em Aprovações.
alter table public.brand_settings add column if not exists autopilot_enabled boolean not null default true;
alter table public.brand_settings add column if not exists autopilot_per_week int not null default 4;
alter table public.brand_settings add column if not exists autopilot_last_run timestamptz;
-- Erro da última rodada (aparece em Aprovações); vazio quando deu certo
alter table public.brand_settings add column if not exists autopilot_error text;
-- Rodada interrompida (ex.: por um deploy no meio) sem nenhum post criado: libera para rodar de novo
update public.brand_settings b set autopilot_last_run = null
where b.autopilot_last_run is not null and b.autopilot_error is null
  and not exists (select 1 from public.posts p where p.user_id = b.user_id and p.options ? 'idea'
                  and p.created_at >= b.autopilot_last_run - interval '1 minute')
  and not exists (select 1 from public.product_videos v where v.user_id = b.user_id and v.brief ? 'idea_key'
                  and v.created_at >= b.autopilot_last_run - interval '1 minute');
