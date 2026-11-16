// CRM da prospecção: etapas do funil, follow-ups (mensagens curtas e naturais) e envio pelo WhatsApp do dono.
import type { Lead } from "./types";

export type Stage = "ready" | "waiting" | "followup" | "talking" | "won" | "lost";

export const STAGES: { key: Stage; label: string; hint: string; color: string }[] = [
  { key: "ready", label: "Prévia pronta", hint: "Mensagem escrita, falta enviar", color: "#6366f1" },
  { key: "waiting", label: "Aguardando", hint: "Enviada, esperando resposta", color: "#0ea5e9" },
  { key: "followup", label: "Follow-up", hint: "Sem resposta: hora de chamar de novo", color: "#f59e0b" },
  { key: "talking", label: "Negociando", hint: "Respondeu: feche o negócio", color: "#a855f7" },
  { key: "won", label: "Fechou", hint: "Cliente PáginasPro", color: "#16a34a" },
  { key: "lost", label: "Não fechou", hint: "Perdido ou sem resposta", color: "#94a3b8" },
];

/** Dias depois do último contato para cada follow-up (1º, 2º, 3º). */
export const FOLLOWUP_DAYS = [2, 4, 7];
export const MAX_FOLLOWUPS = FOLLOWUP_DAYS.length;

const DAY = 86400_000;
export const lastTouch = (l: Lead) => new Date(l.last_touch_at ?? l.contacted_at ?? l.updated_at).getTime();
export const daysSince = (l: Lead) => Math.floor((Date.now() - lastTouch(l)) / DAY);

export function stageOf(l: Lead): Stage | null {
  if (l.status === "won") return "won";
  if (l.status === "lost") return "lost";
  if (l.status === "replied") return "talking";
  if (l.status === "contacted") {
    const n = l.followups ?? 0;
    if (n >= MAX_FOLLOWUPS) return daysSince(l) >= FOLLOWUP_DAYS[MAX_FOLLOWUPS - 1] ? "followup" : "waiting";
    return daysSince(l) >= FOLLOWUP_DAYS[n] ? "followup" : "waiting";
  }
  if (l.prospect_status === "ready") return "ready";
  return null;
}

/** Quando vence o próximo follow-up (ms), ou null. */
export function nextFollowupAt(l: Lead) {
  if (l.status !== "contacted") return null;
  const n = Math.min(l.followups ?? 0, MAX_FOLLOWUPS - 1);
  return lastTouch(l) + FOLLOWUP_DAYS[n] * DAY;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** Troca {saudacao} pela saudação da hora em que vai ser enviada. */
export const humanize = (text: string) => text.split("{saudacao}").join(greeting());

/** Follow-ups: curtos, sem pressão, cada um diferente. */
export function followupMessage(l: Lead, link: string | null) {
  const n = l.followups ?? 0;
  const seed = [...l.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const options = [
    [
      `Oi! Conseguiu dar uma olhada na prévia?${link ? `\n${link}` : ""}\n\nSe quiser mudar foto, cor ou algum texto, eu ajusto rapidinho 🙂`,
      `{saudacao}! Passando para saber se deu tempo de ver o site que montei para vocês${link ? `: ${link}` : ""} 😊`,
    ],
    [
      `{saudacao}! Ficou alguma dúvida sobre o site? Se preferir, te explico por áudio, é bem rapidinho.`,
      `Oi! Só para não deixar no vácuo 😅 Se quiser, posso deixar o site com as cores e fotos que vocês preferirem. É só me falar.`,
    ],
    [
      `Oi! Vou dar uma última passada aqui 😊 A prévia continua neste link${link ? `: ${link}` : ""}\n\nSe não for o momento, tudo bem! Fico à disposição.`,
      `{saudacao}! Não quero incomodar, então essa é minha última mensagem 🙂 Se um dia quiserem o site, é só me chamar.${link ? `\n${link}` : ""}`,
    ],
  ][Math.min(n, MAX_FOLLOWUPS - 1)];
  return options[seed % options.length];
}

export function waLink(phone: string | null | undefined, text: string) {
  const n = String(phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${n.length <= 11 && n ? `55${n}` : n}?text=${encodeURIComponent(humanize(text))}`;
}

export const LOST_REASONS = ["Não respondeu", "Achou caro", "Já tem quem faça", "Não quer site agora", "Número errado", "Outro"];
export const PLANS = ["À vista", "Mensal", "Upgrade", "Premium", "Link da bio"];

/** "Enviar todos": horários espaçados (4 a 9 min, aleatório) a partir de agora ou do fim da fila atual. */
export function outboxSchedule(count: number, after = Date.now()) {
  const out: string[] = [];
  let t = after;
  for (let i = 0; i < count; i++) {
    out.push(new Date(t).toISOString());
    t += (4 + Math.random() * 5) * 60_000;
  }
  return out;
}

export const outboxEta = (l: Lead) => (l.send_after ? new Date(l.send_after).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null);
