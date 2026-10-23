-- Sempre a última: avisa a Data API (PostgREST) para reler as tabelas e permissões depois das migrations.
notify pgrst, 'reload schema';
