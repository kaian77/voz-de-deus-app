# WhatsApp, atendente de IA e automações

Leia só este arquivo para mexer em WhatsApp, respostas automáticas (WhatsApp/Instagram), aviso para a chefe e automações de post. Atualize aqui (não no CLAUDE.md) quando algo mudar.

## Estado atual (23/11/2026)
- WhatsApp da loja conectado: 556195175906 ("Brax pins mania"), pelo WAHA no **Render** grátis: serviço `waha:gows`, https://waha-gows-0d5r.onrender.com, sessão `default`, motor GOWS. Roda 24 h na nuvem (não precisa do PC do dono). `wahaKeepAlive` no cron pinga e religa a sessão. Se a sessão cair (FAILED), o dono escaneia o QR de novo no painel do WAHA (chave = `WAHA_API_KEY` nas variáveis do serviço no Render).
  - WAHA Core = 1 número só. Render grátis = 750 h/mês por conta (1 serviço 24 h).
  - `waha-space/Dockerfile` (Hugging Face) ficou sem uso: Spaces Docker passaram a ser pagos.
- Atendente de IA ligado (`brand_settings.agent_enabled` = true) no WhatsApp e no Instagram.
- `brand_settings.handoff_phone` = 6191009274 (a chefe): recebe o resumo de cada handoff.
- IA desligada (conversa tratada à mão, não responder): Instagram lurdiyear (03ce50ef-…), revendedora Lory (3b21ea23-…).

## Regras fixas do dono
- Número da loja **só responde**, nunca puxa conversa nem prospecta.
- Prospecção só de conta WAHA marcada `meta.brand = 'paginaspro'` (`_shared/prospect.ts`).
- Resposta tem que parecer humana (nada de cara de IA).
- Pedido: pede o número do pedido. Loja física / pontos de retirada que não estão no conhecimento, troca e defeito → manda para a chefe (handoff).
- Nunca informar preço (varia por modelo e kit): manda o link do produto/site.

## Como funciona (código)
- **Envio WAHA** (`_shared/whatsapp.ts`): resposta da IA marca como lida, mostra "digitando…" 2,5–12 s (`wahaTypeLikeHuman`) e só então manda.
- **Agente de DM** (`inbox.ts` `autoReply` → `draftReply` → `runAgent` em `claude.ts`). Ferramentas da Nuvemshop (`storeTools`): buscar_produtos, info_loja, cupons_ativos, consultar_pedido.
  - Responde uma vez só a mensagens seguidas.
  - Instagram: só dúvidas de produto/compra/pedido. Menção em story, post compartilhado, sem texto, cumprimento solto, elogio e assunto fora de compra = `ignore`. Dúvida que não sabe = handoff calado (needs_human, sem mensagem).
  - Produto: só manda link se `buscar_produtos` achou exatamente o pedido. Trava no código: link `/produtos/` que a busca não devolveu bloqueia a resposta.
  - Pedido: pede só o número. No WhatsApp, celular da conversa igual ao da compra (últimos 8 dígitos; `orderSummary` traz `phone`) confirma o comprador; senão pede e-mail ou nome completo.
  - Handoff: aviso no celular + `alertBoss()` manda pelo WhatsApp da loja um resumo (quem, canal, motivo, últimas mensagens) para `handoff_phone`. Mensagem ao cliente = `agent_handoff_message` ("Vou ver isso aqui rapidinho e já te retorno 😊").
  - Não responde mensagens vindas de `handoff_phone` nem `sale_alert_phone`.
  - Conversa continuada (mensagem anterior é da pessoa e está sem resposta no Studio há mais de 2 h = a equipe responde pelo app): não responde, vira `needs_human` calada + aviso + `alertBoss` (caso Lory "guardou os meus?", 16/11/2026).
- **Prompt e conhecimento** ficam no banco, não no código: `brand_settings.agent_instructions` (tom humano + seção "ENTENDA ANTES DE RESPONDER": não chutar; referência a combinado anterior = handoff calado) e `agent_knowledge` (respostas da chefe: retirada no Bloco G do Min. Saúde, Feirinha da Esplanada, às vezes Fiocruz/MEC/PO 700/FS UnB, 10h–18h; revenda mínimo 100; personalizado mínimo 200, 20 dias, cliente manda a imagem; pré-venda depende da fábrica; emite nota; cartão personalizado; troca/defeito = handoff; cupons PRIMEIRACOMPRA/COMPREAGORA). Editar pela ferramenta MCP `update_brand_settings` ou em Studio → Claude e API.
- **Mensagem para a chefe pelo GitHub**: `scripts/wa-boss.ts` + workflow `wa-boss.yml` (input TEXT → `handoff_phone`).
- **Mercado Livre na caixa de entrada**: ver `_shared/ml-inbox.ts` (descrito no CLAUDE.md, seção Mercado Livre). A IA não responde sozinha no ML.
- **Atendente da PáginasPro** (outra marca, `_shared/paginaspro-agent.ts`) e WhatsApp oficial em coexistência (`PaginasProWhatsApp.tsx`, "Conectar com Facebook"): descritos no CLAUDE.md, seção Landing pages.

## Automações
- **Automação por post** (`auto-link.ts`, cron a cada 5 min): post novo no IG → acha o produto (`options.product` ou IA pela legenda/foto) e cria automação só daquele post com a palavra da legenda e o link no direct. Liga/desliga: `brand_settings.auto_post_link`.
- Automações de comentário: ferramentas MCP `list_automations`/`upsert_automation`/`delete_automation`. Contas da PáginasPro ficam fora.
- **"Enviar todos" (prospecção)** (`SendAll.tsx`; cron `runProspectSends` em `_shared/prospect.ts`): até 30 leads na fila (`leads.send_after` 4–9 min aleatório, `send_text` com `{saudacao}`), 1 por vez pelo WAHA da PáginasPro, seg–sáb 8h–20h, mínimo 3 min entre envios, máx. 30/24 h. Número sem WhatsApp vira "Não fechou". 3 erros em 30 min ou nenhum WAHA = pausa + aviso. Sem WAHA = 1 a 1 pelo wa.me. Ainda não há número da PáginasPro conectado.

## Opções avaliadas (não feitas)
- **2º número (pessoal/PáginasPro)**: WAHA Core só aceita 1 sessão. Caminhos: 2º serviço no Render pago (~US$ 7/mês) ou OpenWA (vários números grátis, mas pesado — um navegador por número — e "roda local" exige PC ligado). Mesmo risco de banimento (não oficial).
- **API oficial (Cloud API / MCP `mcp.facebook.com/whatsapp_business_tools`, beta)**: sem risco de "ferramenta pirata", mas a 1ª mensagem para quem nunca falou precisa de modelo aprovado (marketing, ~R$ 0,35/msg). Faltaria: criar o modelo e o "Enviar todos" usar o modelo quando o número estiver na API oficial.
