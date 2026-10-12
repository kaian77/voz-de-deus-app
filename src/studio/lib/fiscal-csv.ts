// Planilha de produtos da Nuvemshop (Exportar e Importar): completa os dados fiscais vazios (NCM, origem, tipo,
// CEST). A API da Nuvemshop não deixa apps gravarem esses campos, mas a importação da planilha deixa.

export type FiscalDefaults = { ncm?: string; origin?: string; type?: string; cest?: string };
type Column = keyof FiscalDefaults;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Qual coluna da planilha é cada dado fiscal (pelo cabeçalho). */
function detect(header: string[]): Partial<Record<Column, number>> {
  const out: Partial<Record<Column, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    if (out.ncm === undefined && /\bncm\b/.test(n)) out.ncm = i;
    else if (out.cest === undefined && /\bcest\b/.test(n)) out.cest = i;
    else if (out.origin === undefined && /^origem\b/.test(n)) out.origin = i;
    else if (out.type === undefined && /^tipo\b/.test(n) && !/frete|envio|variac|produto fisico/.test(n)) out.type = i;
  });
  return out;
}

function parse(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true; // aspas só abrem no começo da célula
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function serialize(rows: string[][], sep: string, eol: string) {
  const quote = (v: string) => (v.includes(sep) || v.includes('"') || v.includes("\n") || v.includes("\r") ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(quote).join(sep)).join(eol) + eol;
}

// Windows-1252 (o Excel no Brasil costuma salvar assim): caracteres fora do Latin-1
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
function encode1252(text: string) {
  const out = new Uint8Array(text.length);
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    out[n++] = cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) ? cp : CP1252[cp] ?? 0x3f;
  }
  return out.slice(0, n);
}

/** Valor mais usado numa coluna (para copiar o formato que a própria loja já usa, ex.: "0 - Nacional"). */
function mostCommon(rows: string[][], col: number) {
  const count = new Map<string, number>();
  for (const r of rows) {
    const v = (r[col] ?? "").trim();
    if (v) count.set(v, (count.get(v) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export type FiscalResult = { blob: Blob; filled: number; rows: number; columns: Column[]; missing: Column[] };

export async function fillFiscalCsv(file: File, defaults: FiscalDefaults): Promise<FiscalResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  let utf8 = true;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    utf8 = false;
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  const bom = text.startsWith("﻿");
  if (bom) text = text.slice(1);
  const firstLine = text.slice(0, text.search(/\r?\n/) >>> 0);
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const rows = parse(text, sep).filter((r) => r.some((c) => c.trim()));
  if (rows.length < 2) throw new Error("A planilha está vazia.");
  const [header, ...body] = rows;
  const cols = detect(header);
  const columns = (Object.keys(cols) as Column[]);
  if (!columns.length) {
    throw new Error("Não achei as colunas de dados fiscais (NCM, Origem, Tipo). Use a planilha de Produtos → Exportar e Importar da Nuvemshop.");
  }

  // Valor de cada coluna: o formato que a loja já usa nos produtos preenchidos; senão o do modelo de cadastro
  const ncmDigits = defaults.ncm?.replace(/\D/g, "");
  const value: Partial<Record<Column, string>> = {};
  for (const c of columns) {
    const existing = mostCommon(body, cols[c]!);
    if (c === "ncm") value.ncm = ncmDigits || existing?.replace(/\D/g, "") || undefined;
    else if (c === "origin") value.origin = existing || defaults.origin?.replace(/\s*[–—]\s*/, " - ");
    else if (c === "type") value.type = existing || defaults.type;
    else if (c === "cest") value.cest = defaults.cest?.replace(/\D/g, "") || undefined; // CEST só quando o modelo tem
  }

  // Só mexe nas linhas de produto (com o identificador/URL preenchido; na Nuvemshop é a primeira coluna)
  const idCol = Math.max(0, header.findIndex((h) => /identificador|^url/.test(norm(h))));
  let filled = 0;
  for (const r of body) {
    if (!(r[idCol] ?? "").trim()) continue;
    let changed = false;
    for (const c of columns) {
      const i = cols[c]!;
      const v = value[c];
      if (!v || (r[i] ?? "").trim()) continue;
      while (r.length <= i) r.push("");
      r[i] = v;
      changed = true;
    }
    if (changed) filled++;
  }

  const out = serialize([header, ...body], sep, eol);
  const blob = utf8
    ? new Blob([bom ? "﻿" : "", out], { type: "text/csv;charset=utf-8" })
    : new Blob([encode1252(out)], { type: "text/csv;charset=windows-1252" });
  const all: Column[] = ["ncm", "origin", "type"];
  return { blob, filled, rows: body.length, columns, missing: all.filter((c) => !columns.includes(c) || !value[c]) };
}
