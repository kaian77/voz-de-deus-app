// Direct da página de notícias (conta marcada "Notícias" em Contas, ex.: @lula__nao): a IA só responde quem quer os
// guias em PDF (ou pergunta preço, como comprar, o que tem neles) e manda o link certo da Kiwify. Política, xingamento,
// story, elogio solto e o resto ficam sem resposta. Links: meta.news_links da conta, senão os padrões abaixo.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { generateJSON } from "./claude.ts";
import { sleep } from "./util.ts";

const DEFAULT_LINKS = {
  dinheiro: "https://pay.kiwify.com.br/5ZSogyn",
  fala: "https://pay.kiwify.com.br/yYq9vNm",
};

const Reply = z.object({
  action: z.enum(["reply", "ignore"]).describe("reply só se a pessoa quer/pergunta sobre os guias em PDF; o resto é ignore"),
  text: z.string().describe("resposta curta (até 4 linhas), simpática, com o link certo; vazio se ignore"),
});

// deno-lint-ignore no-explicit-any
export async function newsReply(db: SupabaseClient, conversation: any, inboundMessageId: string, meta: any) {
  // Espera mensagens seguidas e responde só a última
  await sleep(6000);
  const { data: latest } = await db.from("messages").select("id").eq("conversation_id", conversation.id).eq("direction", "in")
    .order("created_at", { ascending: false }).limit(1).single();
  if (latest?.id !== inboundMessageId) return;
  const { data: msgs } = await db.from("messages").select("direction,text").eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false }).limit(10);
  const history = (msgs ?? []).reverse().map((m) => `${m.direction === "in" ? "Pessoa" : "Página"}: ${m.text ?? ""}`).join("\n");
  const last = String((msgs ?? [])[0]?.text ?? "");
  if (!/\p{L}/u.test(last.replace(/^\[[^\]]*enviad[oa]\]$/, ""))) return;
  const links = { ...DEFAULT_LINKS, ...(meta?.news_links ?? {}) };

  const r = await generateJSON(Reply,
    "Você responde o direct de uma página de notícias de direita no Instagram. A página vende dois guias em PDF:\n" +
      `1) "Seu Dinheiro Protegido" — como proteger renda e patrimônio nos próximos anos: sair das dívidas caras, reserva ` +
      `de emergência, dólar sem complicação, pagar menos imposto dentro da lei. Link: ${links.dinheiro}\n` +
      `2) "Fale Sem Medo" — o que dá para postar sem ser bloqueado ou processado: o que a lei diz, o que derruba a conta, ` +
      `como se proteger. Link: ${links.fala}\n` +
      "Responda SÓ quando a pessoa quer um guia, pergunta pelo PDF, preço, como comprar, o link, ou o que tem nos guias. " +
      "Mande o link do guia que ela quer (se não ficou claro, mande os dois, cada um com uma linha do que é). O preço e o " +
      "pagamento aparecem no link; não invente preço, desconto nem bônus. Depois da compra o PDF chega no e-mail. " +
      "Qualquer outra coisa (opinião política, notícia, xingamento, elogio, emoji, menção em story, pergunta pessoal) = ignore. " +
      "Português simples, sem formalidade, no máximo 1 emoji.",
    `Conversa (a última é a mensagem a responder):\n${history}`, "low");
  if (r.action !== "reply" || !r.text.trim()) return;
  // Trava: só manda link que é de um dos guias
  const urls = r.text.match(/https?:\/\/\S+/g) ?? [];
  if (urls.some((u) => !Object.values(links).some((l) => u.startsWith(String(l))))) return;
  const { sendMessage } = await import("./inbox.ts");
  await sendMessage(db, conversation.id, r.text.trim(), "ai");
}
