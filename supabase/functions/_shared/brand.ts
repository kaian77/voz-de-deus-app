// Marcas no mesmo Studio: Brax Pins (loja), PáginasPro (sites) e "canal" (contas que só recebem os vídeos dos canais
// do YouTube, como o TikTok do Pergaminho). A conta diz de qual é em meta.brand.
// Automações, piloto automático, aviso de venda e atendente da loja só rodam em conta da Brax Pins.
export type Brand = "brax" | "paginaspro" | "canal";

// deno-lint-ignore no-explicit-any
export const brandOf = (meta: any): Brand => (meta?.brand === "paginaspro" ? "paginaspro" : meta?.brand === "canal" ? "canal" : "brax");
// deno-lint-ignore no-explicit-any
export const isPaginasPro = (meta: any) => brandOf(meta) === "paginaspro";
// deno-lint-ignore no-explicit-any
export const isBrax = (meta: any) => brandOf(meta) === "brax";
