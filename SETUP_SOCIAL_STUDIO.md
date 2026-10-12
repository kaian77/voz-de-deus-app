# Social Studio — guia de configuração

Painel em **`/studio`** para:

- **Agendar e publicar** posts, carrosséis, reels e stories no Instagram, e vídeos e fotos no TikTok.
- **Responder comentários sozinho**, como o ManyChat: a pessoa comenta uma palavra-chave e recebe uma resposta pública e uma DM.
- **Agente de mensagens**: a IA responde as DMs do Instagram e o WhatsApp, e chama você quando precisa de um humano.
- **Vitrine**: auditoria do perfil com sugestões de bio, destaques e grade, além dos melhores horários.
- **Concorrentes**: monitoramento e análise com IA.
- **Acesso do Claude** via MCP e API REST: você pede no chat e o Claude cria, agenda, analisa e responde.

Sem configurar nada, o `/studio` abre em **modo demo**, com dados de exemplo salvos só no navegador. Os passos abaixo ligam tudo de verdade.

---

## 0. Quanto custa

| Peça | Custo |
|---|---|
| Supabase (banco, funções, storage) | Plano grátis atende bem no começo |
| Hospedagem do site (Lovable/Vercel/Netlify) | Grátis |
| Instagram API e TikTok API | Grátis |
| WhatsApp via **WAHA Core** | Grátis (precisa de um servidor seu ligado 24h, veja o passo 7) |
| WhatsApp **API oficial da Meta** | **Responder** quem te chamou (até 24h depois) é grátis. Só são cobradas mensagens que você inicia com template |
| IA dentro do app (legendas, auditoria, agente de mensagens) | Claude API, cobrada por uso. Para gastar o mínimo, use `CLAUDE_MODEL=claude-haiku-5-5`, que custa centavos por milhares de respostas |
| Claude operando o Studio pelo conector MCP | Usa a sua assinatura do Claude, sem custo de API |

---

## 1. Supabase

> **Atalho (recomendado):** o GitHub instala o backend sozinho.
> 1. Gere um token em supabase.com → Account → Access Tokens.
> 2. No GitHub: Settings → Secrets and variables → Actions → New repository secret, com o nome `SUPABASE_ACCESS_TOKEN`.
> 3. Em Actions → **Supabase deploy** → Run workflow.
>
> O workflow (`scripts/supabase-deploy.sh`) cria as tabelas, publica as funções e gera os secrets internos. Também configura o endereço de login e o agendador. Por padrão ele usa o projeto `supabase-citron-window` e o site `https://voz-de-deus-app.vercel.app`; para trocar, crie as *variables* `SUPABASE_PROJECT_NAME` e `APP_URL`. Depois, só faltam os secrets dos apps (Instagram, TikTok, Anthropic), descritos no passo 2.

1. Crie um projeto em <https://supabase.com>. Se o projeto estiver no Lovable, pode conectar o Supabase por lá.
2. Instale a CLI e vincule o projeto:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref SEU_REF
   ```
3. Crie as tabelas:
   ```bash
   supabase db push
   ```
4. No site, configure as variáveis do front, com os valores de *Project Settings → API*:
   ```
   VITE_SUPABASE_URL=https://SEU_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   Se preferir, cole os valores em `src/studio/lib/config.ts`. A anon key é pública; quem protege os dados são as policies RLS.
5. Em *Authentication → URL Configuration*, coloque a URL do site em **Site URL**.

## 2. Secrets das funções

```bash
supabase secrets set \
  APP_URL=https://SEU-SITE.com \
  OAUTH_STATE_SECRET=$(openssl rand -hex 32) \
  CRON_SECRET=$(openssl rand -hex 32) \
  META_VERIFY_TOKEN=$(openssl rand -hex 16) \
  IG_APP_ID=... IG_APP_SECRET=... \
  TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=... \
  ANTHROPIC_API_KEY=sk-ant-...
```

Opcionais:

| Secret | Para quê |
|---|---|
| `CLAUDE_MODEL` | Modelo da IA do app. O padrão é `claude-opus-5-5`; `claude-haiku-5-5` é o mais barato |
| `META_GRAPH_VERSION` | Versão da Graph API (padrão `v24.0`) |
| `WHATSAPP_APP_SECRET` | App secret do app da Meta, **só para o WhatsApp oficial** |
| `META_FB_ACCESS_TOKEN` + `META_FB_IG_USER_ID` | Puxar dados de concorrentes automaticamente (Business Discovery, passo 8) |

Publique as funções:

```bash
supabase functions deploy oauth-instagram oauth-tiktok instagram-webhook whatsapp-webhook publish-scheduled agent ai inbox
```

## 3. Agendador (roda a cada minuto)

Em *Database → Extensions*, ative **pg_cron** e **pg_net**. Depois rode no *SQL Editor*:

```sql
select cron.schedule('publicar-posts', '* * * * *', $$
  select net.http_post(
    url := 'https://SEU_REF.supabase.co/functions/v1/publish-scheduled',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'SEU_CRON_SECRET'),
    body := '{}'::jsonb
  );
$$);
```

## 4. Instagram (publicar, comentários e DMs)

Requisitos: conta **Profissional** (Criador ou Empresa).

1. Em <https://developers.facebook.com>, crie um app do tipo **Business** e adicione o produto **Instagram → API setup with Instagram login**.
2. Copie o *Instagram App ID* e o *Instagram App Secret* para `IG_APP_ID` e `IG_APP_SECRET`.
3. Em **Business login settings → OAuth redirect URIs**, coloque
   `https://SEU_REF.supabase.co/functions/v1/oauth-instagram`
4. Em **Webhooks**:
   - Callback URL: `https://SEU_REF.supabase.co/functions/v1/instagram-webhook`
   - Verify token: o mesmo valor de `META_VERIFY_TOKEN`
   - Assine os campos **comments** e **messages**.
5. Permissões usadas: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages`, `instagram_business_manage_insights`.
   - Para usar só na **sua própria conta**, basta adicionar a conta como *Instagram Tester* em App roles. Não precisa de revisão.
   - Para outras contas, envie o app para *App Review*.
6. No Studio, entre em **Contas → Conectar Instagram**.

Regras do Instagram que o app respeita:

- DM automática a partir de comentário: 1 por comentário, até 7 dias depois.
- DMs comuns: resposta só até 24h após a última mensagem da pessoa.
- Bio, foto e destaques **não** podem ser alterados pela API. O Studio sugere e você aplica.

## 5. TikTok (publicar)

1. Em <https://developers.tiktok.com>, crie um app com **Login Kit** e **Content Posting API** (ative *Direct Post*).
2. Redirect URI: `https://SEU_REF.supabase.co/functions/v1/oauth-tiktok`
3. Escopos: `user.info.basic`, `video.publish`, `video.upload`.
4. Em *URL properties*, verifique o domínio do storage do Supabase (`SEU_REF.supabase.co`). O TikTok só puxa mídia de domínios verificados.
5. Enquanto o app não for aprovado na auditoria do TikTok, **os posts saem como privados** (só você vê). Peça a auditoria para publicar como público.
6. A API do TikTok **não permite responder comentários**. No TikTok, o Studio só agenda e publica.

## 6. Claude (IA do app e acesso do Claude ao Studio)

- **IA dentro do app**: precisa do secret `ANTHROPIC_API_KEY`.
- **Claude operando o Studio**:
  1. No Studio, abra **Claude & API → Gerar chave**.
  2. Copie a URL do MCP: `https://SEU_REF.supabase.co/functions/v1/agent/mcp/sst_...`
  3. No Claude, vá em **Configurações → Conectores → Adicionar conector personalizado** e cole a URL.
  4. No Claude Code, rode `claude mcp add --transport http social-studio <URL>`.
- Em **Claude & API**, preencha o **perfil da marca** e o **agente de mensagens**. Defina também se os posts criados pelo Claude precisam da sua aprovação.

Ferramentas que o Claude recebe: `get_overview`, `create_post`, `update_post`, `publish_post_now`, `list_posts`, `upsert_automation`, `list_comments`, `get_instagram_profile`, `save_profile_audit`, `upsert_competitor`, `sync_competitor`, `list_conversations`, `get_conversation`, `send_message`, `update_conversation`, `import_media`, `update_brand_settings` e outras.

## 7. WhatsApp

Escolha **um** dos dois caminhos e conecte em **Studio → Contas → WhatsApp**.

### Opção A: WAHA (grátis, self-hosted)

O WAHA conecta o WhatsApp lendo um QR Code, como o WhatsApp Web.

> ⚠️ O WAHA **não é oficial**. O WhatsApp pode bloquear números que se comportem como robô. Use um número secundário no começo, responda só quem te chamou (é o que o agente faz) e nunca dispare mensagens em massa.

1. Num servidor com Docker, rode:
   ```bash
   docker run -d --name waha --restart unless-stopped -p 3000:3000 \
     -e WAHA_API_KEY=uma-senha-forte \
     -e WAHA_DASHBOARD_USERNAME=admin -e WAHA_DASHBOARD_PASSWORD=outra-senha \
     -v waha-sessions:/app/.sessions \
     devlikeapro/waha
   ```
   Opções de servidor grátis:
   - VM *Always Free* da Oracle Cloud.
   - Um PC seu ligado 24h.
2. Exponha o WAHA com HTTPS. O jeito mais fácil e grátis é o Cloudflare Tunnel:
   `cloudflared tunnel --url http://localhost:3000`
   Para uma URL fixa, crie um túnel nomeado.
3. Abra `https://SUA-URL/dashboard`, inicie a sessão `default` e escaneie o QR Code com o WhatsApp.
4. No Studio, em **Contas → WhatsApp → WAHA**, informe a URL, a sessão e a API key. O webhook é configurado sozinho. Se não der, o Studio mostra a URL para você colar no painel do WAHA (evento `message`).

A versão Core (grátis) do WAHA suporta **1 número** (sessão `default`).

### Opção B: API oficial da Meta (sem risco de bloqueio)

1. No mesmo app da Meta, adicione o produto **WhatsApp** e cadastre o número.
2. Crie um **usuário do sistema** em business.facebook.com com a permissão `whatsapp_business_messaging` e gere um token permanente.
3. Em **WhatsApp → Configuração**, configure o webhook:
   - URL `https://SEU_REF.supabase.co/functions/v1/whatsapp-webhook`
   - Token `META_VERIFY_TOKEN`
   - Campo **messages**
4. Defina `WHATSAPP_APP_SECRET` com o *App Secret* do app (em Configurações → Básico).
5. No Studio, em **Contas → WhatsApp → API oficial**, informe o Phone Number ID, o WABA ID e o token.

## 8. Loja Nuvemshop (pedidos, rastreio e catálogo para o agente)

Pedidos e clientes são só leitura (consultados na hora, sem guardar dados de clientes). Produtos: leitura e escrita, para cadastrar a partir das fotos.

1. Entre no [Portal de Parceiros da Nuvemshop](https://partners.nuvemshop.com.br) (crie a conta de parceiro com o mesmo e-mail, é grátis) e crie um **aplicativo**.
2. Configure o app:
   - **URL de redirecionamento**: `https://<ref>.supabase.co/functions/v1/oauth-nuvemshop`
   - **Permissões (escopos)**: produtos leitura **e escrita**, pedidos e clientes só leitura (`write_products`, `read_orders`, `read_customers`), ler conteúdo/páginas se existir.
   - **Webhooks de LGPD** (obrigatórios):
     - Loja removida: `https://<ref>.supabase.co/functions/v1/oauth-nuvemshop?lgpd=store_redact`
     - Apagar dados do cliente: `https://<ref>.supabase.co/functions/v1/oauth-nuvemshop?lgpd=customers_redact`
     - Dados do cliente: `https://<ref>.supabase.co/functions/v1/oauth-nuvemshop?lgpd=customers_data_request`
3. Copie o **ID do app** e o **Client Secret** para os secrets do GitHub `NUVEMSHOP_APP_ID` e `NUVEMSHOP_CLIENT_SECRET` (ou `supabase secrets set`).
4. No Studio: **Contas → Loja Nuvemshop → Conectar loja** e autorize.

Depois disso: a página **Pedidos** mostra pagamento, envio e rastreio; o agente de mensagens consulta produtos, preços e estoque
ao vivo e informa a situação de um pedido quando o cliente manda o **número do pedido e o e-mail da compra** (sem o e-mail certo,
nada do pedido é revelado). Em **Claude e API → Base de conhecimento**, o botão "Preencher com a loja e o site" monta o FAQ do agente
a partir das páginas da loja e do site. O Claude ganha as ferramentas `get_store_info`, `list_store_products`, `list_orders`,
`get_order` e `read_web_page`.

**Produtos a partir de fotos** (página Produtos): defina um *modelo de cadastro* (padrão do nome como `Pin {nome}`, preço, estoque,
peso, medidas, categorias, descrição-base, SEO; opcionalmente a IA escreve a descrição olhando a foto), envie as fotos e clique em
Cadastrar. Sem nome, a IA dá o nome olhando a foto. Cada produto cadastrado vira um post de divulgação no Instagram/TikTok com legenda
da IA no próximo horário nobre (13h/19h), em Aprovações se a marca exigir aprovação (desligável na página). O Claude ganha
`list_product_templates`, `save_product_template`, `list_store_categories`, `list_product_drafts`, `create_product_from_draft`,
`create_store_product` e `update_store_product` (edita pelo nome: preço, promoção, estoque, descrição, fotos...).

## 9. Concorrentes automáticos (opcional)

O *Business Discovery* da Meta lê dados públicos de outras contas profissionais. Ele só existe na API com **Facebook Login**:

1. Ligue sua conta do Instagram a uma Página do Facebook.
2. Gere um token de usuário do sistema com `instagram_basic`, `instagram_manage_insights` e `pages_read_engagement`.
3. Defina `META_FB_ACCESS_TOKEN` e `META_FB_IG_USER_ID` (o ID da sua conta IG na Graph API do Facebook).

Sem isso, você pode adicionar anotações ou pedir ao Claude para pesquisar e salvar os dados com `upsert_competitor`.

## 10. Vídeos animados dos produtos (Reels e TikTok)

Cada produto novo pode ganhar um vídeo vertical de ~15 s (foto do produto sem fundo, textos feitos pela IA, música original e efeitos), sem custo por vídeo:

1. O Studio põe o vídeo na fila (`product_videos`) com os textos escritos pela IA olhando a foto.
2. O workflow **Vídeos dos produtos** (`.github/workflows/product-videos.yml`) roda de hora em hora, das 8h às 20h, renderiza com `video/worker.py` (motor em `video/engine`) e envia o MP4 para o storage. Usa o mesmo secret `SUPABASE_ACCESS_TOKEN` do deploy. Para gerar na hora: **Actions → Vídeos dos produtos → Run workflow**.
3. O cron do Studio cria o post (Reels + TikTok) no próximo horário nobre livre, em Aprovações se a marca exigir aprovação.

Liga em **Produtos → Fazer também um vídeo animado**; cada produto cadastrado tem o botão **Vídeo**. Pelo Claude: `create_product_video` e `list_product_videos`. Os vídeos usam o tempo grátis do GitHub Actions (cada vídeo leva 1–3 minutos).

**Só o vídeo, para baixar:** em **Produtos → Vídeos dos produtos**, mande a foto e o nome do produto e clique em **Gerar vídeo**. Esse vídeo não cadastra produto nem vira post; quando fica pronto aparece o botão **Baixar** (e **Postar**, se quiser postar depois).

**Vídeo na hora (opcional):** sem configuração, o vídeo fica pronto na próxima rodada do workflow (até 1 hora). Para começar na hora, crie um token do GitHub em **Settings → Developer settings → Personal access tokens → Fine-grained tokens**, só com este repositório e a permissão **Actions: Read and write**, salve como secret `VIDEO_DISPATCH_TOKEN` do repositório e rode o deploy. Aí cada vídeo fica pronto em uns 5 minutos.

**Agendar em massa:** em **Publicar → Agendar em massa**, mande várias fotos e vídeos de uma vez. Cada arquivo vira um post (foto = post de imagem; vídeo = Reels e vídeo no TikTok), distribuído nos horários escolhidos a partir de um dia, pulando os horários que já têm post. A IA pode escrever as legendas olhando cada foto (ou um quadro do vídeo).

**Piloto automático de conteúdo:** em **Aprovações**, ligado por padrão. Uma vez por semana o Studio olha as datas comemorativas e campanhas dos próximos 21 dias (Outubro Rosa, Dia do Médico, Natal…), os produtos da loja e os posts que mais engajaram, e cria carrosséis com as fotos dos produtos (nas cores da marca, ou nas do tema) e vídeos quando um produto é a cara do tema. Os carrosséis chegam direto em Aprovações; os vídeos chegam quando terminam de renderizar. Dali: **Aprovar** (no horário sugerido), **Publicar agora** ou selecionar vários e **Agendar em massa** para escolher os dias. Botão **Criar ideias agora** para gerar na hora; pelo Claude: `create_content_ideas`.

## 11. Mercado Livre e Shopee

**Mercado Livre**
1. Em [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br) → **Minhas aplicações → Criar aplicação**:
   - Redirect URI: `https://<ref>.supabase.co/functions/v1/oauth-mercadolivre`
   - Escopos: leitura e escrita (*read*, *write*) e *offline_access*.
2. Secret do GitHub: `ML_CLIENT_SECRET` (o Client ID 5226202533888505 já está no workflow; `ML_APP_ID` só se trocar de app). Rode o deploy.
3. Em **Contas → Conectar Mercado Livre**. O Studio lê os anúncios ativos, compara com a loja e mostra a regra de preço.

**Shopee**
1. Em [open.shopee.com](https://open.shopee.com), cadastre-se como desenvolvedor e crie um app do tipo **Seller In-house System** (passa por aprovação da Shopee).
   - Redirect URL / domínio: `https://<ref>.supabase.co/functions/v1/oauth-shopee`
2. Secrets do GitHub: `SHOPEE_PARTNER_ID` e `SHOPEE_PARTNER_KEY` (Live). Rode o deploy.
3. Em **Contas → Conectar Shopee**.

Publicação: em **Produtos → Publicar também no Mercado Livre**, cada produto novo é publicado usando um anúncio seu como modelo (categoria, tipo de anúncio, frete, garantia e atributos gerais) e a regra de preço descoberta. Pelo Claude: `analyze_marketplace` e `publish_to_mercadolivre`.

---

## Arquitetura

```
src/studio/                 painel React (rotas /studio/*)
  lib/api.ts                dados: Supabase ou modo demo (localStorage)
  lib/carousel.ts           gera slides JPEG 1080x1350 no navegador
supabase/migrations/        tabelas + RLS + bucket "media"
supabase/functions/
  _shared/                  clientes Instagram, TikTok, WhatsApp/WAHA, Claude, publicador, caixa de entrada
  publish-scheduled         cron: publica posts vencidos (vídeos são retomados até terminar de processar)
  instagram-webhook         comentários (automações) + DMs (agente)
  whatsapp-webhook          WhatsApp oficial + WAHA (agente)
  agent                     API do Claude: REST + servidor MCP
  ai / inbox                ações do painel (IA, perfil, envio de mensagens, conexão do WhatsApp)
  oauth-instagram / oauth-tiktok
```
