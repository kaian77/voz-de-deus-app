import { toast } from "sonner";
import type { Post } from "./types";
import { tiktokCaption } from "./tiktok-caption";

export const TIKTOK_INBOX_NOTE =
  "Foi para o app do TikTok: abra a notificação no celular, revise e toque em Publicar (no vídeo, cole a legenda — ela já vai sem link/site, que o TikTok proíbe).";

/** Avisa o resultado de "Publicar agora" (inclusive quando o TikTok recebe como rascunho no app). */
export function toastPublishResult(result: Post) {
  const errors = Object.values(result.results ?? {}).map((r) => r?.error).filter(Boolean);
  if (result.status === "failed") return toast.error(`Falhou: ${errors.join(" | ")}`);
  if (result.results?.tiktok?.inbox) {
    if (result.caption) navigator.clipboard?.writeText(tiktokCaption(result.caption)).catch(() => {});
    return toast.success(`${TIKTOK_INBOX_NOTE} A legenda já foi copiada.`, { duration: 10000 });
  }
  if (result.status === "publishing") return toast.info("Enviado. O vídeo está processando e sai em instantes.");
  return toast.success(result.platforms.includes("tiktok") ? "Publicado. No TikTok, pode levar alguns minutos para aparecer no perfil." : "Publicado");
}
