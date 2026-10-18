-- Página "Uso" do Studio: consumo da IA (cada chamada registrada pelas functions e pelos workflows),
-- espaço do storage e do banco. O tempo do GitHub Actions vem da API do GitHub (ação usage_report).
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  source text not null,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_created on public.ai_usage (created_at);
alter table public.ai_usage enable row level security;

-- Resumo para a página (só a chave de serviço chama: a function ai confere o usuário antes)
create or replace function public.studio_usage(since timestamptz)
returns jsonb
language sql
security definer
set search_path = public, storage
as $$
  select jsonb_build_object(
    'storage', coalesce((
      select jsonb_agg(jsonb_build_object('folder', folder, 'bytes', bytes, 'files', files) order by bytes desc)
      from (
        select coalesce(nullif(split_part(name, '/', 2), ''), 'outros') as folder,
               sum(coalesce((metadata->>'size')::bigint, 0)) as bytes, count(*) as files
        from storage.objects where bucket_id = 'media' group by 1
      ) s
    ), '[]'::jsonb),
    'db_bytes', pg_database_size(current_database()),
    'ai', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'model', model, 'calls', calls, 'input', inp, 'output', outp))
      from (
        select source, model, count(*) as calls, sum(input_tokens) as inp, sum(output_tokens) as outp
        from public.ai_usage where created_at >= since group by source, model
      ) a
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.studio_usage(timestamptz) from public, anon, authenticated;
