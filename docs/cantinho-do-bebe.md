# Cantinho do bebê (`/bebe`)

App instalável (PWA) para organizar tudo do bebê. Entrada do Vite `bebe` (`bebe.html` + `src/baby/`), no ar em
`voz-de-deus-app.vercel.app/bebe/` e `paginaspro.app.br/bebe/` (`/bebe` redireciona para `/bebe/`; noindex).

## Como está feito (versão 1)
- **Dados só no aparelho** (`store.ts`): `localStorage` `cb_data` (bebês, itens, compras, sono, medidas, fraldas, agenda,
  remédios, guarda-roupa, orçamento, códigos de barras conhecidos) e fotos no IndexedDB `cantinho` (reduzidas para 900 px).
  Backup = baixar/restaurar JSON; "Apagar tudo". Sem login e sem servidor ainda.
- **Guarda-roupa 3D** (`wardrobe3d.ts`, three.js feito por código, sem modelo para baixar): portas giram 105° na dobradiça,
  3 gavetas deslizam 36 cm, cabideiro, 2 prateleiras, sapateira, plaquinha com o nome, quarto com chão, tapete e estrelas,
  luz aconchegante/clara e 5 acabamentos. Cada compartimento (`COMPARTMENTS`) é ligado aos itens pelo campo `loc`; o que
  aparece dentro (roupa dobrada, cabides, sapatinhos) vem do inventário com a cor de cada peça. "Guardar aqui" move itens.
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

## Ainda não existe (próximas fases)
- Conta e nuvem (Supabase) para sincronizar entre celulares e o **modo família**; notificações push (hoje não há aviso
  com o app fechado); BabyBot (IA); leitura de nota por IA no servidor (mais precisa que o OCR do celular);
  percentis da OMS; memórias/álbum; modelo do móvel feito no Blender (hoje é por código); Play Store.
