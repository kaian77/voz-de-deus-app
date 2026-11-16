-- Mensal de R$ 29,99 (site novo e upgrade) com o link de assinatura que o dono criou (uma vez só: o marcador
-- priceSet impede que rodar as migrations de novo desfaça uma mudança feita depois em "Preços e links")
update public.brand_settings
set landing_offer = coalesce(landing_offer, '{}'::jsonb) || '{"monthly": 29.99, "upgradeMonthly": 29.99, "monthlyLink": "https://mpago.la/2AgY1c3", "priceSet": "20261116"}'::jsonb
where coalesce(landing_offer->>'priceSet', '') < '20261116';
