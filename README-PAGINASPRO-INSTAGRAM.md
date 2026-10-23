# PáginasPro Instagram — branch isolado

Este branch parte do mesmo commit do projeto principal, mas mantém a interface deste produto focada em Instagram. O branch `main` e a pasta de trabalho original não foram modificados por esta separação.

## O que esta versão mostra

- criação, revisão, agendamento e calendário de conteúdo para Instagram;
- conexão de conta, comentários, direct e automações;
- análise do perfil e concorrentes, configurações da marca;
- calendário em mês, semana ou lista, com cor e estilo visual ajustáveis;
- construtor “Link na bio” com botões, cores, estilos e prévia para celular.

Os módulos de TikTok, WhatsApp, Mercado Livre, Nuvemshop, YouTube, páginas de venda e geração de vídeos por serviços externos ficam fora da navegação deste produto. O Composer ainda aceita que o cliente envie seus próprios arquivos de imagem e vídeo.

## Endereço sugerido

Se o domínio `paginaspro.app.br` estiver sob seu controle, o nome `instagram.paginaspro.app.br` pode ser usado como subdomínio sem comprar outro domínio. A configuração de DNS e a associação do subdomínio a uma hospedagem ainda precisam ser feitas no provedor do domínio e na hospedagem.

## Antes de abrir para outras pessoas

Este branch é uma separação de interface e código para revisão; ele não está publicado e não separa automaticamente os dados. Antes de oferecer contas a clientes, criar uma implantação separada com:

1. um projeto Supabase próprio, com as tabelas, políticas de acesso, armazenamento e funções deste app;
2. as variáveis de ambiente apontando para esse Supabase;
3. credenciais Meta e URLs de OAuth/callback configuradas para o novo endereço;
4. teste de isolamento entre usuários e revisão das páginas de privacidade, termos e exclusão de dados;
5. plano de hospedagem compatível com uso comercial e com o volume esperado.

As novas tabelas/colunas deste produto estão em `supabase/migrations/20261023010000_instagram_product.sql`. O endpoint público do Link na bio usa `/bio/<slug>`.

Não reutilize o Supabase de produção do PáginasPro para clientes deste produto: o modo Instagram esconde áreas da interface, mas a separação visual não substitui isolamento de dados no servidor.

## Meta e as contas de teste

O status de revisão da Meta é independente deste branch. Contas próprias ou adicionadas como função/testador do app podem ser usadas em desenvolvimento quando a conta Instagram for profissional e tiver concedido as permissões necessárias. O acesso de clientes externos e algumas permissões, especialmente mensagens, podem exigir análise e acesso avançado aprovados pela Meta. Confirme o modo e as permissões no painel do app antes de convidar clientes.
