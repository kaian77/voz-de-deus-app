-- Piloto de notícias: o @lula__nao vira conta "Notícias" uma vez só (news_init), sem desfazer mudança feita depois em Contas
update social_accounts
set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('brand', 'noticias', 'news_init', true)
where platform = 'instagram' and lower(username) = 'lula__nao' and coalesce(meta->>'news_init', '') = '';
