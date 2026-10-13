/**
 * Chave para comparar telefones (igual a phoneKey das functions): só dígitos, com 55 quando faltar o DDI
 * e sem o 9 extra do celular brasileiro. Aceita "556191331525@c.us".
 */
export function phoneKey(raw: string) {
  let d = String(raw).split("@")[0].replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") d = d.slice(0, 4) + d.slice(5);
  return d;
}
