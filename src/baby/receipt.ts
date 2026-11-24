// Leitura de nota fiscal: XML da NF-e/NFC-e (exato), texto da nota (foto lida pelo OCR ou colado) e QR Code da NFC-e.
// Nunca inventa: o que não está escrito fica vazio e marcado para a pessoa conferir na tela de revisão.
import type { Cat, PurchaseLine } from "./store";

export type Line = PurchaseLine & { low: string[] }; // campos com pouca confiança
export type Parsed = { store: string; cnpj: string; date: string; number: string; key: string; total: number; discount: number; lines: Line[]; warnings: string[] };

const num = (s: string | null | undefined) => {
  if (!s) return 0;
  const t = s.trim();
  // 1.234,56 (nota impressa) ou 1234.56 (XML)
  return /,\d{1,3}$/.test(t) ? parseFloat(t.replace(/\./g, "").replace(",", ".")) : parseFloat(t) || 0;
};

// ---------- dicionário das abreviações mais comuns em nota de loja infantil
const WORDS: [RegExp, string][] = [
  [/\bBODY\b|\bBDY\b/, "Body"], [/\bMACAC(AO|ÃO)?\b|\bMACAQ/, "Macacão"], [/\bMIJ(AO|ÃO)\b/, "Mijão"], [/\bPIJ(AMA)?\b/, "Pijama"],
  [/\bCJ\b|\bCONJ(UNTO)?\b/, "Conjunto"], [/\bVEST(IDO)?\b/, "Vestido"], [/\bCALCA\b|\bCALÇA\b/, "Calça"], [/\bCAMIS(ETA|A)?\b/, "Camiseta"],
  [/\bSHORT\b/, "Shorts"], [/\bCASACO\b|\bJAQ(UETA)?\b/, "Casaco"], [/\bMEIA(S)?\b/, "Meia"], [/\bTOUCA\b/, "Touca"], [/\bLUVA(S)?\b/, "Luva"],
  [/\bSAP(ATO|ATINHO)?\b|\bTENIS\b|\bTÊNIS\b|\bSANDALIA\b/, "Sapato"], [/\bFRALDA(S)?\b|\bFRALD\b/, "Fralda"],
  [/\bLENC(O|OS|Ç?O)?\s*UMED/, "Lenço umedecido"], [/\bPOMADA\b/, "Pomada"], [/\bALGOD(AO|ÃO)\b/, "Algodão"], [/\bSHAMPOO\b|\bSHAMP\b/, "Shampoo"],
  [/\bSABONETE\b|\bSAB\b/, "Sabonete"], [/\bMAMAD(EIRA)?\b/, "Mamadeira"], [/\bCHUP(ETA)?\b/, "Chupeta"], [/\bBANH(EIRA)?\b/, "Banheira"],
  [/\bTOALHA\b/, "Toalha"], [/\bCOBERT(OR)?\b|\bMANTA\b/, "Cobertor"], [/\bLENCOL\b|\bLENÇOL\b/, "Lençol"], [/\bBABADOR\b/, "Babador"],
  [/\bMORDEDOR\b/, "Mordedor"], [/\bBRINQ(UEDO)?\b|\bCHOCALHO\b|\bPELUCIA\b/, "Brinquedo"], [/\bCARRINHO\b/, "Carrinho"], [/\bCADEIR(INHA|A)\b|\bBEBE\s*CONFORTO\b/, "Cadeirinha"],
];
const CAT: Record<string, Cat> = {
  Body: "roupa", Macacão: "roupa", Mijão: "roupa", Pijama: "roupa", Conjunto: "roupa", Vestido: "roupa", Calça: "roupa", Camiseta: "roupa", Shorts: "roupa",
  Casaco: "roupa", Meia: "roupa", Touca: "roupa", Luva: "roupa", Babador: "roupa", Sapato: "sapato", Fralda: "fralda", "Lenço umedecido": "higiene",
  Pomada: "higiene", Algodão: "higiene", Shampoo: "higiene", Sabonete: "higiene", Mamadeira: "utensilio", Chupeta: "utensilio", Banheira: "utensilio",
  Toalha: "utensilio", Cobertor: "utensilio", Lençol: "utensilio", Mordedor: "brinquedo", Brinquedo: "brinquedo", Carrinho: "utensilio", Cadeirinha: "utensilio",
};
const BRANDS = ["PAMPERS", "HUGGIES", "TURMA DA MONICA", "BABYSEC", "MAMYPOKO", "JOHNSON", "GRANADO", "HIPOGLOS", "BEPANTOL", "AVENT", "LILLO", "KUKA", "NUK", "MAM", "HERING", "CARTERS", "CARTER'S", "TIP TOP", "MALWEE", "MARISOL", "BRANDILI", "KYLY", "ELIAN", "PIMPOLHO", "BURIGOTTO", "CHICCO", "GALZERANO", "FISHER PRICE", "DISNEY", "PUC", "LUPO", "PAMPILI", "KLIN", "BIBI"];

/** "BODY INF M 2UN" → Body infantil, tamanho M, 2 unidades */
export function understand(desc: string, qty: number): Pick<Line, "name" | "cat" | "size" | "qty" | "units" | "low"> & { brand: string } {
  const D = desc.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const low: string[] = [];
  let base = "";
  for (const [re, w] of WORDS) if (re.test(D)) {
    base = w;
    break;
  }
  const brand = BRANDS.find((b) => D.includes(b)) ?? "";
  const cat: Cat = base ? CAT[base] : "outro";
  if (!base) low.push("name", "cat");
  // tamanho: RN/P/M/G/GG/XG/XXG, meses (3M, 0-3M, 6 MESES) ou número de calçado
  let size = "";
  const sm = D.match(/\b(RN|PP|P|M|G|GG|XG|XXG|XXXG)\b(?!\s*(L|ML|G\b))/);
  const months = D.match(/\b(\d{1,2})\s*(?:-|A)\s*(\d{1,2})\s*M(?:ESES)?\b|\b(\d{1,2})\s*M(?:ESES)?\b/);
  const shoe = cat === "sapato" ? D.match(/\b(1[3-9]|2[0-9])\b/) : null;
  if (shoe) size = shoe[1];
  else if (months) size = months[1] ? `${months[1]}-${months[2]} meses` : `${months[3]} meses`;
  else if (sm && (cat === "roupa" || cat === "fralda" || cat === "sapato")) size = sm[1];
  if (!size && (cat === "roupa" || cat === "fralda" || cat === "sapato")) low.push("size");
  // "80UN", "C/80", "2UN": em fralda/lenço é o tamanho do pacote; em roupa é quantidade de peças
  const un = D.match(/(?:C\/|COM\s)?(\d{1,3})\s*(?:UN|UND|UNID|UNIDADES|U)\b/) ?? D.match(/\bC\/\s*(\d{1,3})\b/);
  let units: number | undefined;
  let q = qty || 1;
  if (un) {
    const n = parseInt(un[1]);
    if (cat === "fralda" || base === "Lenço umedecido" || base === "Algodão") units = n;
    else if (cat === "roupa" && n > 1 && n < 13 && qty <= 1) q = n;
  }
  if (cat === "fralda" && !units) low.push("units");
  const extra = /\bINF(ANTIL)?\b/.test(D) && cat === "roupa" ? " infantil" : "";
  const name = base ? `${base}${extra}${brand ? " " + titleCase(brand) : ""}` : titleCase(desc.trim());
  return { name, cat, size, qty: q, units, low, brand: brand ? titleCase(brand) : "" };
}
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

// ---------- XML da NF-e / NFC-e (o arquivo .xml que a loja manda ou o portal da Fazenda baixa)
export function parseXml(text: string): Parsed {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Arquivo XML inválido.");
  const q = (sel: string, root: ParentNode = doc) => root.querySelector(sel)?.textContent?.trim() ?? "";
  const inf = doc.querySelector("infNFe");
  if (!inf) throw new Error("Esse XML não é de nota fiscal (NF-e/NFC-e).");
  const lines: Line[] = [...doc.querySelectorAll("det")].map((det) => {
    const desc = q("prod > xProd", det), qty = num(q("prod > qCom", det)), unit = num(q("prod > vUnCom", det));
    const total = num(q("prod > vProd", det)) - num(q("prod > vDesc", det));
    const u = understand(desc, Math.round(qty) || 1);
    const ean = q("prod > cEAN", det);
    return { desc, ...u, qty: u.cat === "roupa" ? u.qty : Math.round(qty) || 1, unit, total, barcode: /^\d{8,14}$/.test(ean) ? ean : undefined } as Line;
  });
  return {
    store: q("emit > xFant") || q("emit > xNome"), cnpj: q("emit > CNPJ"),
    date: (q("ide > dhEmi") || q("ide > dEmi")).slice(0, 10), number: q("ide > nNF"),
    key: (inf.getAttribute("Id") ?? "").replace(/^NFe/, ""), total: num(q("total > ICMSTot > vNF")), discount: num(q("total > ICMSTot > vDesc")),
    lines, warnings: [],
  };
}

// ---------- QR Code da NFC-e: traz a chave de acesso e o link da Fazenda (os itens ficam no site da Fazenda)
export function parseQr(text: string) {
  const key = text.match(/(\d{44})/)?.[1] ?? "";
  const url = /^https?:\/\//.test(text) ? text : "";
  return { key, url };
}
export const keyInfo = (key: string) => (key.length === 44 ? { uf: key.slice(0, 2), yymm: key.slice(2, 6), cnpj: key.slice(6, 20), model: key.slice(20, 22), number: String(parseInt(key.slice(25, 34))) } : null);

// ---------- texto da nota (OCR da foto ou colado do site da Fazenda)
export function parseText(text: string): Parsed {
  const raw = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const all = raw.join("\n");
  const warnings: string[] = [];
  const cnpj = (all.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0] ?? "").replace(/\D/g, "");
  const dm = all.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  const date = dm ? `${dm[3].length === 2 ? "20" + dm[3] : dm[3]}-${dm[2]}-${dm[1]}` : "";
  const key = (all.replace(/(\d{4})\s(?=\d{4})/g, "$1").match(/\d{44}/)?.[0]) ?? "";
  const number = all.match(/(?:NFC-?E\s*N[º°o]?\.?|\bN[º°]|\bN[UÚ]MERO|\bNF\s*N?[º°]?)\s*:?\s*(\d{1,9})\b/i)?.[1] ?? keyInfo(key)?.number ?? "";
  // loja: primeira linha com letras que não é cabeçalho de documento
  const store = raw.find((l) => /[A-Za-z]{3}/.test(l) && !/DOCUMENTO|AUXILIAR|NOTA FISCAL|NFC|DANFE|CNPJ|CONSUMIDOR/i.test(l)) ?? "";
  const tot = all.match(/(?:VALOR\s+(?:TOTAL|A\s+PAGAR)|TOTAL\s+R\$|TOTAL)\s*(?:R\$)?\s*:?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  const desc = all.match(/DESCONTO(?:S)?\s*(?:R\$)?\s*:?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  const lines: Line[] = [];
  const money = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  for (const l of raw) {
    if (/TOTAL|DESCONTO|TROCO|PAGAMENTO|CART[AÃ]O|DINHEIRO|PIX|TRIBUTOS|CNPJ|CPF|CHAVE|PROTOCOLO|CONSULTE|QTD|C[OÓ]DIGO\s+DESCRI/i.test(l)) continue;
    const vals = l.match(money);
    if (!vals || !/[A-Za-z]{3}/.test(l)) continue;
    // "001 7891234567890 BODY INF M 2UN 2 UN X 29,90 59,80" ou "BODY INF M (Código: 123) Qtde.:2 UN: UN Vl. Unit.: 29,90 Vl. Total 59,80"
    const qm = l.match(/Qtde?\.?\s*:?\s*(\d+(?:,\d+)?)/i) ?? l.match(/(\d+(?:,\d+)?)\s*(?:UN|UND|PC|PCT|KG)\s*[Xx*]/i);
    const qty = qm ? Math.max(1, Math.round(num(qm[1]))) : 1;
    const total = num(vals[vals.length - 1]);
    const unit = vals.length > 1 ? num(vals[vals.length - 2]) : qty ? total / qty : total;
    let d = l.split(/\(C[óo]digo|Qtde|\s\d+(?:,\d+)?\s*(?:UN|UND|PC|PCT|KG)\s*[Xx*]/i)[0];
    d = d.replace(money, "").replace(/^\s*\d{1,3}\s+/, "").replace(/\b\d{8,14}\b/, "").trim();
    if (d.length < 3) continue;
    const u = understand(d, qm ? qty : 0);
    const low = [...u.low];
    if (!qm) low.push("qty");
    lines.push({ desc: d, ...u, qty: u.cat === "roupa" ? Math.max(u.qty, qty) : qty, unit, total, low });
  }
  if (!lines.length) warnings.push("Não achei os itens no texto. Confira a foto (nota inteira, reta e com luz) ou digite os itens.");
  const sum = lines.reduce((s, x) => s + x.total, 0);
  const total = tot ? num(tot[1]) : sum;
  if (tot && Math.abs(sum - total - (desc ? num(desc[1]) : 0)) > 0.05 && lines.length) warnings.push(`A soma dos itens (${sum.toFixed(2).replace(".", ",")}) não bate com o total da nota (${total.toFixed(2).replace(".", ",")}). Confira os valores.`);
  if (!date) warnings.push("Não achei a data da compra.");
  return { store, cnpj, date, number, key, total, discount: desc ? num(desc[1]) : 0, lines, warnings };
}

/** OCR da foto da nota no próprio celular (Tesseract, português). Baixa o leitor só na primeira vez. */
export async function ocr(file: Blob, progress: (p: number) => void) {
  const { createWorker } = await import("tesseract.js");
  const w = await createWorker("por", 1, { logger: (m: { status: string; progress: number }) => m.status === "recognizing text" && progress(m.progress) });
  try {
    const { data } = await w.recognize(file);
    return data.text;
  } finally {
    await w.terminate();
  }
}
