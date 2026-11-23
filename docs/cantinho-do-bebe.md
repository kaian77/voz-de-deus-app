# Cantinho do bebê (`/bebe`)

App instalável (PWA) para organizar tudo do bebê. Entrada do Vite `bebe` (`bebe.html` + `src/baby/`), no ar em
`voz-de-deus-app.vercel.app/bebe/` e `paginaspro.app.br/bebe/` (`/bebe` redireciona para `/bebe/`; noindex).

## Como está feito (versão 1)
- **Dados no aparelho** (`store.ts`): `localStorage` `cb_data` (bebês, itens, compras, sono, medidas, fraldas, agenda,
  remédios, guarda-roupa, orçamento, códigos de barras conhecidos) e fotos no IndexedDB `cantinho` (reduzidas para 900 px).
  Backup = baixar/restaurar JSON; "Apagar tudo". O app funciona sem conta e sem internet.
- **Conta, família e nuvem** (`cloud.ts` + função `bebe`, `_shared/bebe.ts`, migration `20261123000000_bebe.sql`): conta
  própria (e-mail + senha PBKDF2, sessão em `bebe_auth`, 180 dias; separada do Studio e do FORMA). Família = `bebe_families`
  (`data` = o mesmo JSON do aparelho, `version`), papéis em `bebe_members` (dono / edita / só ver). Sincronização: cada
  `save()` marca a hora de cada registro mudado (`mt`) e apagado (`del`); `sync()` baixa, junta (`merge`: em cada registro
  fica o mais novo, apagado depois da última edição continua apagado) e sobe com a versão que tinha (`family_save` só grava
  se ninguém salvou no meio; senão repete). Sobe 2,5 s depois de mudar, ao abrir, ao voltar a internet e a cada 1 min.
  Quem é "só ver" nunca sobe. Fotos das peças: bucket privado `bebe` (pasta = id da família); o celular pede links
  assinados (`photo_upload`, `photo_get`, 1 dia), sobe as suas e baixa as dos outros depois de cada sincronização
  (`syncPhotos`, lista do que já subiu em `cb_up_<família>`); 1x por dia `photo_clean` apaga as sem item.
  Esqueci a senha: `reset_request` manda link por e-mail (Resend; remetente var `BEBE_EMAIL_FROM`, se o domínio for
  recusado tenta `AGENDA_EMAIL_FROM` e `REVIEW_EMAIL_FROM`; até 3 por hora; mesma resposta com ou sem conta) para
  `/bebe/#nova-senha/<token>` (vale 1 h, uma vez; `reset_confirm` troca a senha e derruba as outras sessões). Convite: link `/bebe/?convite=CODIGO` (WhatsApp) ou código;
  o dono troca o acesso, remove, troca o código. Sair da família / apagar conta (LGPD; família sem ninguém é apagada).
- **Avisos no celular** (Web Push, mesmas chaves VAPID do Studio; `bebe_push` com `prefs` e `sent` do dia): cron
  `runBebeReminders` no `publish-scheduled` (Brasília): mêsversário 9h, fraldas para ≤3 dias 10h, roupinhas para conferir
  domingo 10h30, soneca não registrada 21h (desligado por padrão), compromisso na véspera 19h e 1 h antes, remédio nos
  horários marcados. Silêncio (padrão 22h-7h) não bloqueia remédio. Na tela bloqueada nunca sai nome de remédio nem o que é
  o compromisso.
- **Guarda-roupa 3D** (`wardrobe3d.ts`, three.js feito por código, sem modelo para baixar): portas giram 105° na dobradiça,
  3 gavetas deslizam 36 cm, cabideiro, 2 prateleiras, sapateira, plaquinha com o nome, quarto com chão, tapete e estrelas,
  luz aconchegante/clara e 5 acabamentos. Cada compartimento (`COMPARTMENTS`) é ligado aos itens pelo campo `loc`; o que
  aparece dentro (roupa dobrada, cabides, sapatinhos) vem do inventário com a cor de cada peça. "Guardar aqui" move itens.
  Cada gaveta tem 3 divisórias = 4 espaços (padrão 0-3, 3-6, 6-9 e 9-12 meses; nomes editáveis em "Personalizar",
  `wardrobe.slots`, etiquetas no fundo da gaveta); a peça fica na divisão do campo `slot` ou, sem ele, pelo tamanho
  (`slotFor`: RN/P = 0-3, M = 3-6, G = 6-9, GG = 9-12). Na gaveta as roupas ficam dobradas em pé (até 15 por divisão).
  Toque numa roupinha (gaveta, cabide, prateleira ou sapato) = ela levanta e abre o cartão da peça (trocar de divisão,
  "Ficou pequena", "Doação", Editar); toque no chão de uma divisão = lista só dela.
  Modo simples 2D para celular sem WebGL (lembrado em `cb_2d`).
- **Nota fiscal** (`receipt.ts`): XML da NF-e/NFC-e (exato), foto (OCR no próprio celular com tesseract.js, português;
  o leitor é baixado na 1ª vez e o service worker guarda), texto colado e QR Code da NFC-e (pega a chave e abre o site da
  Fazenda; os itens não vêm no QR). `understand()` entende abreviações ("BODY INF M 2UN" → Body infantil M, 2 un;
  "FRALDA PAMPERS G 80UN" → pacote de 80). Tela de revisão com campos duvidosos em amarelo; só cadastra depois de
  confirmar; aviso de nota repetida (chave, CNPJ+número ou loja+data+total). Depois: itens no inventário (fralda soma no
  estoque pelo pacote), compra no histórico/gastos, código de barras lembrado e convite para guardar no guarda-roupa.
- **Código de barras**: `BarcodeDetector` do navegador (Chrome/Android); sem ele, digitar o número.
- Telas: início (idade, mêsversário, contadores, avisos de tamanho/fralda/peças sem lugar), itens (busca, categorias,
  estados de doação/venda/lembrança), gastos (mês, ano, 6 meses, categoria, loja, orçamento, CSV), compras
  (troca/devolução), sono (cronômetro, 7 dias), crescimento (gráfico; sem percentis da OMS até ter as tabelas oficiais),
  fraldas (trocas, estoque, quanto dura), agenda (+ mêsversários), remédios receitados (sem cálculo de dose), enxoval,
  mala de viagem, vários bebês, privacidade.
- Alerta de tamanho: idade E último peso (`SIZE_HINT`), sempre como "conferir", nunca "não serve".

Teste de ponta a ponta da nuvem: workflow `bebe-test.yml` (`scripts/bebe-test.mjs`: 2 contas de teste, família, convite,
conflito de versão, "só ver", apagar conta; limpa tudo no fim). Passou em 23/11/2026.

- **IA** (chave `ANTHROPIC_API_KEY` do projeto, só no servidor; limite 40 usos por pessoa por dia em `bebe_ai_usage`;
  gasto aparece em Studio → Uso): **nota fiscal por foto** (`receipt_ai`: o celular reduz a foto para 1600 px e manda em
  base64; a IA devolve loja, CNPJ, data, itens com nome/categoria/tamanho/quantidade/pacote/valores e os campos em dúvida,
  sem inventar; vai para a mesma tela de revisão; sem conta ou se a IA falhar, cai no leitor do celular) e **BabyBot**
  (`bot.ts`, `#babybot`, botão no início: resposta curta só com o resumo dos dados da família `familyBrief`, sem
  diagnóstico/remédio/dose; "adiciona 3 bodies M" volta como proposta e só entra no inventário no botão Confirmar).
  `generateJSON` (`_shared/claude.ts`) aceita imagem `data:image/...;base64`.

## Ainda não existe (próximas fases)
- Percentis da OMS; memórias/álbum; modelo do móvel feito no Blender (hoje é por código); Play Store.
