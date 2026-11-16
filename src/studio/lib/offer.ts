// Planos das landing pages (Renda extra) e as mensagens de oferta para copiar e colar no WhatsApp do lead.
// Mensal = site + painel de resultados + alterações. Avulso = paga uma vez; alteração cobrada; painel opcional.
// Estes são os valores padrão; o dono muda no Studio (Landing pages → "Preços e links", brand_settings.landing_offer).
export const OFFER = {
  /** WhatsApp do dono (só dígitos, com 55) usado no site da PáginasPro */
  whatsapp: "5561992372216",
  monthly: 49,
  oneTime: 297,
  /** Upgrade para quem já tem site (prospecção): mais barato */
  upgradeMonthly: 49,
  upgradeOneTime: 247,
  change: 30,
  panelAddon: 19,
  /** Links do Mercado Pago (criados pelo dono no app). Vazio = a mensagem sai sem link de pagamento. */
  oneTimeLink: "https://mpago.la/1rDD3Gz",
  monthlyLink: "https://mpago.la/29WANe2",
  /** Premium: layout animado igual ao site da PáginasPro */
  premiumMonthly: 129,
  premiumOneTime: 997,
  premiumMonthlyLink: "https://mpago.la/1Bu8EjD",
  premiumOneTimeLink: "https://mpago.la/1YEqfgd",
  /** Agenda online (adicional): assinatura mensal */
  agendaMonthly: 29,
  agendaLink: "https://mpago.la/1oq3nf6",
  /** Link da bio: uma tela no lugar do Linktree (vídeo no topo, números, abas por público, WhatsApp) */
  bioMonthly: 39,
  bioOneTime: 197,
  bioMonthlyLink: "",
  bioOneTimeLink: "",
};

export type Offer = typeof OFFER;

/** Valores salvos no Studio por cima dos padrões (campos vazios ou inválidos ficam com o padrão). */
export function mergeOffer(saved?: Partial<Offer> | null): Offer {
  const out = { ...OFFER };
  for (const [k, v] of Object.entries(saved ?? {})) {
    if (!(k in OFFER)) continue;
    const def = OFFER[k as keyof Offer];
    if (typeof def === "number" && Number(v) > 0) (out as Record<string, unknown>)[k] = Number(v);
    if (typeof def === "string" && typeof v === "string") (out as Record<string, unknown>)[k] = v.trim();
  }
  out.whatsapp = out.whatsapp.replace(/\D/g, "") || OFFER.whatsapp;
  return out;
}

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

/** {nome} = nome da empresa; link = prévia da landing, se já existir. */
export function offerMessages(name: string, link?: string | null, o: Offer = OFFER) {
  const preview = link ? `\n\nA prévia que montei para vocês está aqui: ${link}` : "";
  return {
    premium:
      `Também tenho a versão Premium do site da ${name}: o mesmo conteúdo, com animações, foto em 3D que se mexe com o dedo, galeria e uma apresentação bem mais marcante (igual ao meu site: https://paginaspro.app.br).\n\n` +
      `• Premium mensal: ${brl(o.premiumMonthly)} por mês, com painel de resultados e alterações inclusas\n` +
      `• Premium à vista: ${brl(o.premiumOneTime)} uma vez só (alterações depois a ${brl(o.change)} cada)${preview}` +
      (o.premiumMonthlyLink || o.premiumOneTimeLink
        ? `\n\nAprovou a prévia? Pagamento:` +
          (o.premiumMonthlyLink ? `\n• mensal (cartão, todo mês): ${o.premiumMonthlyLink}` : "") +
          (o.premiumOneTimeLink ? `\n• à vista (Pix, cartão ou boleto): ${o.premiumOneTimeLink}` : "")
        : ""),
    upgrade:
      `Sobre o valor da troca do site da ${name}: ${brl(o.upgradeOneTime)} uma vez só (Pix, cartão ou boleto) ou ${brl(o.upgradeMonthly)} por mês com painel de visitas e alterações inclusas. ` +
      `Eu cuido de tudo, inclusive de apontar o domínio que vocês já têm para o site novo.${preview}`,
    bio:
      `Para o link da bio do Instagram da ${name} eu faço uma página só sua no lugar do Linktree: vídeo seu no topo, seus números, abas para cada tipo de cliente, fotos e o botão do WhatsApp, tudo numa tela de celular.\n\n` +
      `• mensal: ${brl(o.bioMonthly)} por mês, com painel de visitas/cliques e alterações inclusas\n` +
      `• à vista: ${brl(o.bioOneTime)} uma vez só (alterações depois a ${brl(o.change)} cada)${preview}` +
      (o.bioMonthlyLink || o.bioOneTimeLink
        ? `\n\nAprovou a prévia? Pagamento:` +
          (o.bioMonthlyLink ? `\n• mensal (cartão, todo mês): ${o.bioMonthlyLink}` : "") +
          (o.bioOneTimeLink ? `\n• à vista (Pix, cartão ou boleto): ${o.bioOneTimeLink}` : "")
        : ""),
    monthly:
      `Sobre o valor do site da ${name}: fica ${brl(o.monthly)} por mês, sem taxa de entrada.\n\n` +
      `Já está tudo incluso:\n` +
      `• site no ar, com botão do WhatsApp, mapa e horário\n` +
      `• um painel só seu para ver quantas pessoas visitaram o site e quantas te chamaram por ele\n` +
      `• alterações sempre que precisar (texto, foto, horário, serviços), sem custo extra\n\n` +
      `Se quiser, dá para incluir a agenda online (o cliente marca o horário pelo site e vocês controlam tudo num painel) por mais ${brl(o.agendaMonthly)} por mês.${preview}` +
      (o.monthlyLink ? `\n\nAprovou a prévia? A assinatura é por aqui (cartão, cobrança automática todo mês): ${o.monthlyLink}` : ""),
    oneTime:
      `Se preferir pagar uma vez só: ${brl(o.oneTime)} e o site da ${name} fica no ar, sem mensalidade.\n\n` +
      `Nesse formato, cada alteração depois sai ${brl(o.change)}. ` +
      `E se quiser o painel de resultados (quantas pessoas visitaram e te chamaram pelo site), dá para incluir por mais ${brl(o.panelAddon)} por mês. ` +
      `A agenda online (o cliente marca o horário pelo site) também é opcional: ${brl(o.agendaMonthly)} por mês.${preview}` +
      (o.oneTimeLink ? `\n\nAprovou a prévia? O pagamento é por aqui (Pix, cartão ou boleto): ${o.oneTimeLink}` : ""),
  };
}
