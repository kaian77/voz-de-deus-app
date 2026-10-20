-- O Instagram da loja (@braxpinsmania) nunca é da PáginasPro: desfaz a marcação feita por engano no seletor de marca
update public.social_accounts
set meta = meta - 'brand'
where platform = 'instagram' and lower(username) = 'braxpinsmania' and meta->>'brand' = 'paginaspro';
