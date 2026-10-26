-- Canal do YouTube que também manda os vídeos para um TikTok (ex.: Pergaminho → TikTok do Pergaminho).
-- O workflow do YouTube cria um post só de TikTok (caixa de entrada do app) quando o vídeo vertical fica pronto.
alter table public.yt_channels add column if not exists tiktok_account uuid references public.social_accounts (id) on delete set null;
