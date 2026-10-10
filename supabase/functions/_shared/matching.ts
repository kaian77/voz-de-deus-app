// Regras de correspondência entre comentário e automação (palavras-chave, sem diferenciar acentos/maiúsculas).
export const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export function matches(automation: { keywords: string[]; match_mode: string; media_ids: string[] }, text: string, mediaId?: string) {
  if (automation.media_ids?.length && (!mediaId || !automation.media_ids.includes(mediaId))) return false;
  if (automation.match_mode === "any" || !automation.keywords?.length) return true;
  const t = normalize(text);
  return automation.keywords.some((k) => {
    const kw = normalize(k);
    if (!kw) return false;
    if (automation.match_mode === "exact") return t === kw;
    return new RegExp(`(^|[^\\p{L}\\p{N}])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(t);
  });
}
