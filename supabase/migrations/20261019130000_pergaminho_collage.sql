-- Pergaminho (canal bíblico em português) passa para o estilo Colagem — uma vez só: a marca em app_keys impede que
-- o deploy (que roda as migrations de novo) desfaça uma troca feita depois pelo dono no Studio.
do $$
begin
  if not exists (select 1 from public.app_keys where name = 'migr_pt_collage') then
    update public.yt_channels set style = 'collage' where mode = 'bible' and language = 'pt';
    insert into public.app_keys (name, value) values ('migr_pt_collage', 'true'::jsonb);
  end if;
end $$;
