// Duas marcas no mesmo Studio: Brax Pins (loja) e PáginasPro (sites). A conta diz de qual é em meta.brand.
// Automações, piloto automático e atendente da loja nunca rodam numa conta da PáginasPro, e vice-versa.
export type Brand = "brax" | "paginaspro";

// deno-lint-ignore no-explicit-any
export const brandOf = (meta: any): Brand => (meta?.brand === "paginaspro" ? "paginaspro" : "brax");
// deno-lint-ignore no-explicit-any
export const isPaginasPro = (meta: any) => brandOf(meta) === "paginaspro";
