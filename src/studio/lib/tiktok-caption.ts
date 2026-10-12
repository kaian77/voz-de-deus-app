// Mesma regra de supabase/functions/_shared/tiktok.ts: o TikTok Shop pune legendas que mandam o cliente para fora
const URL_RE = /(https?:\/\/|www\.)\S+|\b[\w-]+(\.[\w-]+)*\.(com|net|shop|store)(\.br)?\b\S*/gi;
const OFFSITE = /\u0000|link\s+(na|da|do)\s+(bio|perfil)|\bsite\b|nuvemshop|whats/i;

/** Legenda para o TikTok: tira frases com link, site ou "link na bio" (o resto, inclusive hashtags, fica). */
export function tiktokCaption(caption: string, fallback = ""): string {
  const out = (caption ?? "").replace(URL_RE, "\u0000").split("\n").map((line) =>
    (line.match(/[^.!?]+[.!?]*\s*/g) ?? []).filter((s) => !OFFSITE.test(s)).join("").trim()
  ).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out || fallback;
}
