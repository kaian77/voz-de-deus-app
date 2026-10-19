-- Landing pages: prévia que expira (a cliente não usa o link de prévia como site de graça) e domínio próprio.
-- O deploy roda todas as migrations de novo: tudo aqui é idempotente.
alter table public.landing_pages add column if not exists preview_until timestamptz;
alter table public.landing_pages add column if not exists domain text;
create unique index if not exists landing_pages_domain on public.landing_pages (lower(domain)) where domain is not null;
