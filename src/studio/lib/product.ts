/** Configuração do produto separado da PáginasPro. Este branch inicia em modo Instagram. */
export const IS_INSTAGRAM_PRODUCT = (import.meta.env.VITE_PRODUCT_MODE ?? "instagram") === "instagram";
export const PRODUCT_NAME = IS_INSTAGRAM_PRODUCT ? "PáginasPro Instagram" : "Social Studio";

export const INSTAGRAM_STUDIO_PATHS = new Set([
  "",
  "criar",
  "em-massa",
  "calendario",
  "aprovacoes",
  "automacoes",
  "comentarios",
  "mensagens",
  "link-bio",
  "vitrine",
  "concorrentes",
  "uso",
  "contas",
  "claude",
]);
