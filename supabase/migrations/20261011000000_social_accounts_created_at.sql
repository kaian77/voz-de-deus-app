-- O painel lista todas as tabelas ordenando por created_at; social_accounts não tinha essa coluna,
-- então a consulta falhava e as contas conectadas apareciam como "Não conectado".
alter table public.social_accounts add column if not exists created_at timestamptz not null default now();
