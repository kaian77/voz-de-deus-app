-- A partir de 30/10/2026 o Supabase deixa de liberar sozinho a Data API para tabelas novas
-- do schema public. Este arquivo roda antes de todos (o deploy refaz as migrations em ordem)
-- e mantém o comportamento antigo: toda tabela nova já nasce com as permissões de sempre,
-- e o RLS de cada tabela continua decidindo quem vê o quê.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
