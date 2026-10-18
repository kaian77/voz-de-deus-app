-- Estilo cinemático (filme bíblico realista) vira o padrão dos canais bíblicos.
-- (o check de style com 'cinematic' fica na migration do youtube, que roda antes a cada deploy)
do $$
begin
  -- Só na 1ª vez (a Action roda todas as migrations de novo): depois o dono pode trocar o estilo no Studio
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'yt_channels'
                 and column_name = 'style' and column_default like '%cinematic%') then
    update public.yt_channels set style = 'cinematic' where mode = 'bible';
    alter table public.yt_channels alter column style set default 'cinematic';
  end if;
end $$;
