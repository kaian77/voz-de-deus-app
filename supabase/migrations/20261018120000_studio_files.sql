-- Lista os arquivos de uma pasta do storage (botão "Otimizar agora": acha vídeos que ficaram sem dono).
-- Só a chave de serviço chama (a function ai confere o usuário antes).
create or replace function public.studio_files(folder text)
returns table (name text, bytes bigint, created_at timestamptz)
language sql
security definer
set search_path = public, storage
as $$
  select o.name, coalesce((o.metadata->>'size')::bigint, 0), o.created_at
  from storage.objects o
  where o.bucket_id = 'media' and split_part(o.name, '/', 2) = folder
  order by o.created_at;
$$;
revoke all on function public.studio_files(text) from public, anon, authenticated;
