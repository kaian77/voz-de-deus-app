-- PáginasPro no WhatsApp (app + API juntos) e no Instagram: atendente próprio que monta a prévia do site.
-- social_accounts.meta.brand = 'paginaspro' separa as contas da PáginasPro das da Brax Pins (sem coluna nova).
-- messages.media_url: foto que o cliente mandou (copiada para o storage), usada na prévia.
-- landing_pages.conversation_id/auto_status: prévia pedida pelo atendente; o cron monta e manda o link na conversa.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
alter table public.messages add column if not exists media_url text;
alter table public.landing_pages add column if not exists conversation_id uuid references public.conversations (id) on delete set null;
alter table public.landing_pages add column if not exists auto_status text;
alter table public.landing_pages add column if not exists auto_error text;
-- pedido de ajuste vindo da conversa ("troca a cor", "tira esse serviço"), aplicado pela IA na próxima rodada
alter table public.landing_pages add column if not exists auto_instructions text;
create index if not exists landing_pages_auto on public.landing_pages (auto_status) where auto_status is not null;
