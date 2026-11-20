-- FORMA sem personal humano (pedido do dono em 20/11/2026: o foco é não depender de personal).
-- Tira o que era do modo personal; idempotente (o deploy roda todas as migrations de novo).
drop table if exists public.forma_videos;
drop index if exists public.forma_users_personal;
alter table public.forma_users drop column if exists personal_id;
alter table public.forma_users drop column if exists role;
