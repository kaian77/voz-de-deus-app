// Planos das landing pages (Renda extra) e as mensagens de oferta para copiar e colar no WhatsApp do lead.
// Mensal = site + painel de resultados + alterações. Avulso = paga uma vez; alteração cobrada; painel opcional.
export const OFFER = {
  monthly: 59,
  oneTime: 397,
  change: 30,
  panelAddon: 19,
  /** Links do Mercado Pago (criados pelo dono no app). Vazio = a mensagem sai sem link de pagamento. */
  oneTimeLink: "https://mpago.la/1rDD3Gz",
  monthlyLink: "",
};

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

/** {nome} = nome da empresa; link = prévia da landing, se já existir. */
export function offerMessages(name: string, link?: string | null) {
  const preview = link ? `\n\nA prévia que montei para vocês está aqui: ${link}` : "";
  return {
    monthly:
      `Sobre o valor do site da ${name}: fica ${brl(OFFER.monthly)} por mês, sem taxa de entrada.\n\n` +
      `Já está tudo incluso:\n` +
      `• site no ar, com botão do WhatsApp, mapa e horário\n` +
      `• um painel só seu para ver quantas pessoas visitaram o site e quantas te chamaram por ele\n` +
      `• alterações sempre que precisar (texto, foto, horário, serviços), sem custo extra${preview}` +
      (OFFER.monthlyLink ? `\n\nAprovou a prévia? A assinatura é por aqui (cartão, cobrança automática todo mês): ${OFFER.monthlyLink}` : ""),
    oneTime:
      `Se preferir pagar uma vez só: ${brl(OFFER.oneTime)} e o site da ${name} fica no ar, sem mensalidade.\n\n` +
      `Nesse formato, cada alteração depois sai ${brl(OFFER.change)}. ` +
      `E se quiser o painel de resultados (quantas pessoas visitaram e te chamaram pelo site), dá para incluir por mais ${brl(OFFER.panelAddon)} por mês.${preview}` +
      (OFFER.oneTimeLink ? `\n\nAprovou a prévia? O pagamento é por aqui (Pix, cartão ou boleto): ${OFFER.oneTimeLink}` : ""),
  };
}
