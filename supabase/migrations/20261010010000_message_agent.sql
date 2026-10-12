-- Agente de mensagens: DMs do Instagram e WhatsApp respondidas pela IA, com passagem para humano.

-- O deploy reaplica todas as migrations a cada execução: esta lista precisa conter todas as plataformas
-- aceitas hoje (igual à de 20261012000000_nuvemshop.sql), senão falha com contas já conectadas.
alter table public.social_accounts drop constraint if exists social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check
  check (platform in ('instagram', 'tiktok', 'whatsapp', 'nuvemshop', 'mercadolivre', 'shopee'));

alter table public.brand_settings
  add column if not exists agent_enabled boolean not null default false,
  add column if not exists agent_instructions text,          -- como o agente deve atender
  add column if not exists agent_knowledge text,             -- FAQ, links, preços, horários…
  add column if not exists agent_handoff_message text default 'Vou chamar alguém da equipe para te responder, só um instante 🙏';

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.social_accounts (id) on delete cascade,
  channel text not null check (channel in ('instagram', 'whatsapp')),
  contact_id text not null,                                  -- IGSID ou número do WhatsApp
  contact_name text,
  contact_username text,
  ai_enabled boolean not null default true,
  status text not null default 'open' check (status in ('open', 'needs_human', 'closed')),
  handoff_reason text,
  unread integer not null default 0,
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,                               -- janela de 24h para responder
  created_at timestamptz not null default now(),
  unique (account_id, contact_id)
);
create index if not exists conversations_user_idx on public.conversations (user_id, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  sender text not null check (sender in ('contact', 'ai', 'human', 'agent')),  -- agent = Claude via MCP
  text text not null default '',
  external_id text unique,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['conversations','messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Atualização em tempo real na caixa de entrada
do $$
begin
  alter publication supabase_realtime add table public.messages;
  alter publication supabase_realtime add table public.conversations;
exception when others then null;
end $$;

-- WhatsApp via WAHA (self-hosted): segredo do webhook por conta
alter table public.account_tokens add column if not exists webhook_secret text;
