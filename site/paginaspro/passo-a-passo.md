# PáginasPro — passo a passo para terminar sozinho

Ordem: 1 → 2 → 3 → 4 → 5. Nunca mande senha/token no chat; secrets só no GitHub (Settings → Secrets and variables → Actions).

## 1. Domínio paginaspro.app.br
- Registro.br → paginaspro.app.br → Configurar endereçamento. Precisam estar SALVAS (recarregue a página e confira):
  - A · (nome em branco) · 216.198.79.1
  - CNAME · www · a7cb6491a190fa6b.vercel-dns-017.com.
- Vercel → voz-de-deus-app → Settings → Domains → Refresh até ficar "Valid Configuration" (pode levar até 6 h).
- Teste: abrir https://paginaspro.app.br (deve abrir seu site).

## 2. Meta: chamadas de teste (fazer HOJE, levam até 24 h para contar)
App PáginasPro (ID 1631317141868990), portfólio 2325341407931833.

**Teste do whatsapp_business_messaging**
- Casos de uso → Conectar-se com clientes pelo WhatsApp → Etapa 1. Experimente → destinatário = seu celular → Enviar mensagem (usa número de TESTE da Meta, não o seu). Chegou "Hello World" = feito.

**Testes do business_management e whatsapp_business_management**
- Analisar → Teste → botão "Abrir o Explorador da Graph API".
- À direita: App da Meta = PáginasPro · Usuário ou página = Token do usuário.
- Permissões: business_management, whatsapp_business_management, whatsapp_business_messaging → Generate Access Token → aceitar tudo.
- Método GET, cole e toque Enviar:
  1. `me/businesses`
  2. `2325341407931833/owned_whatsapp_business_accounts`
  3. Pegue o "id" que voltou no 2 e envie: `<ESSE_ID>/phone_numbers`
- Se der erro de permissão: gere o token de novo marcando as 3 permissões.
- Em Analisar → Teste, cada linha deve virar "1 de 1" (até 24 h).

## 3. Meta: enviar para análise (depois que os testes contarem)
Analisar → Análise do app → Uso permitido. Em todas, "Descrição do negócio":
> PáginasPro builds simple websites for small local businesses in Brazil and talks to its clients through its own WhatsApp Business number.

**whatsapp_business_messaging**
> PáginasPro builds websites for small local businesses. We use this permission to receive and reply to messages that potential clients send to our own WhatsApp Business number. Our assistant asks for the client's business details (Instagram handle, photos, address, opening hours, services), builds a website preview and sends the link and pricing in the same conversation. The business owner (us) can also reply manually from the WhatsApp Business app (coexistence).

**whatsapp_business_management**
> We use this permission to connect our own WhatsApp Business account and phone number through Embedded Signup (WhatsApp Business app coexistence), subscribe our app to the account's webhooks and read the phone number details needed to send and receive messages.

**business_management**
> Needed during WhatsApp Embedded Signup to access the business portfolio that owns our own WhatsApp Business account and phone number, so we can connect it to our app and receive messages from potential clients.

**Tratamento de dados**: quem processa = sua empresa · compartilha com processadores = Sim: Supabase (banco), Vercel (hospedagem), Anthropic (IA) · transfere para fora do Brasil = Sim (EUA) · pedido de autoridade = Não.

**Instruções da análise**
- Crie uma conta de teste no Studio (voz-de-deus-app.vercel.app/studio → criar conta, e-mail seu + senha nova). Digite e-mail/senha só na Meta.
> Open https://voz-de-deus-app.vercel.app/studio and log in with: [EMAIL] / [SENHA]. Go to "Contas" (Accounts) → WhatsApp → click "Conectar com Facebook". This opens Embedded Signup (WhatsApp Business app coexistence). After connecting, messages sent to the number appear in "Inbox" and our assistant replies automatically. The screencast shows the full flow.

**Vídeo (1–2 min, gravar a tela do PC; Windows: tecla Windows + Alt + R)** — o mesmo vídeo serve para as 3 permissões:
1. Abrir o Studio e fazer login.
2. Contas → WhatsApp → "Conectar com Facebook" → mostrar a janela da Meta abrindo e escolhendo a conta/número.
3. Mostrar a Caixa de entrada com uma conversa (pode ser do Instagram) e a resposta automática.
4. Mostrar Landing pages com uma prévia de site.

Enviar. Resposta em ~1 a 5 dias.

## 4. Depois de aprovado: conectar o WhatsApp (modo coexistência)
- Studio no PC → Contas → WhatsApp → Conectar com Facebook.
- NUNCA escolher "Insira um novo número de telefone" (tira o número do app do celular). Escolher "Conectar o app do WhatsApp Business existente", número 61 99100-3735, ler o QR no celular, aceitar compartilhar histórico.
- No celular: desligar "mensagem de ausência" e "saudação" do WhatsApp Business.
- Studio → Landing pages → Seu site · PáginasPro → Preços e links → WhatsApp = 5561991003735.
- Teste: de outro celular mandar "oi, quero um site".

## 5. Enquanto espera a Meta
- **Instagram @paginasproo**: Studio → Contas → conectar Instagram com o @paginasproo (entra sozinho como PáginasPro). A IA já atende no direct.
- **Mercado Pago**: token já cadastrado (pagou → publica no avulso R$ 397 e Premium R$ 997). Nos 4 links fixos, troque o endereço de retorno para https://paginaspro.app.br/inicio?pago=1.
- **Prospectar**: Leads → buscar "maquiadora", "barbearia", "manicure", "sobrancelha", "pet shop" em Sobradinho / Planaltina (nutri e pediatra quase todos já têm site). Botão "Chamar" → 1ª mensagem é sua; depois a IA segue.
- Repositório no GitHub está público (minutos grátis ilimitados). Senhas ficam nos Secrets e não aparecem.
