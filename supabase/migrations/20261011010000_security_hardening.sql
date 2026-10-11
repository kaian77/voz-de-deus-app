-- Endurecimento de segurança.
-- Regra geral: o navegador só escreve o que a interface realmente edita. Tudo que vem de
-- integrações (contas conectadas, comentários, mensagens) é gravado só pelas edge functions
-- (service role), que ignoram RLS.

-- Contas conectadas: o navegador só lê e desconecta. Impede que alguém cadastre o
-- external_id de outra conta para desviar comentários/DMs dela para si.
drop policy if exists "own rows" on public.social_accounts;
drop policy if exists "own read" on public.social_accounts;
drop policy if exists "own delete" on public.social_accounts;
create policy "own read" on public.social_accounts for select using (auth.uid() = user_id);
create policy "own delete" on public.social_accounts for delete using (auth.uid() = user_id);

-- Comentários e mensagens: somente leitura no navegador.
drop policy if exists "own rows" on public.comment_events;
drop policy if exists "own read" on public.comment_events;
create policy "own read" on public.comment_events for select using (auth.uid() = user_id);

drop policy if exists "own rows" on public.messages;
drop policy if exists "own read" on public.messages;
create policy "own read" on public.messages for select using (auth.uid() = user_id);

-- Conversas: o navegador lê e altera só o estado de atendimento. Sem isso, dava para apontar
-- account_id para a conta de outra pessoa e enviar DMs com o token dela.
drop policy if exists "own rows" on public.conversations;
drop policy if exists "own read" on public.conversations;
drop policy if exists "own update" on public.conversations;
create policy "own read" on public.conversations for select using (auth.uid() = user_id);
create policy "own update" on public.conversations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke insert, update, delete on public.conversations from anon, authenticated;
grant update (ai_enabled, status, handoff_reason, unread) on public.conversations to authenticated;

-- Chaves de API: criar, listar e revogar (sem editar).
drop policy if exists "own rows" on public.api_keys;
drop policy if exists "own read" on public.api_keys;
drop policy if exists "own insert" on public.api_keys;
drop policy if exists "own delete" on public.api_keys;
create policy "own read" on public.api_keys for select using (auth.uid() = user_id);
create policy "own insert" on public.api_keys for insert with check (auth.uid() = user_id);
create policy "own delete" on public.api_keys for delete using (auth.uid() = user_id);

-- Usuários anônimos (sem login) não acessam nenhuma tabela do Studio.
do $$
declare t text;
begin
  foreach t in array array['social_accounts','account_tokens','posts','automations','comment_events','competitors',
                           'profile_audits','brand_settings','api_keys','conversations','messages']
  loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Storage público: só imagens e vídeos (impede hospedar HTML/scripts no domínio do Supabase).
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
where id = 'media';
