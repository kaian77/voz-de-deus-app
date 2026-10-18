// Landing pages de clientes (Renda extra): a IA olha as fotos e escreve o conteúdo da página.
// O layout é fixo (src/landing/render.ts); aqui só sai o texto, as cores, as fontes e o estilo do topo.
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { aiEnabled, generateJSON } from "./claude.ts";
import { igPublicProfile } from "./instagram.ts";
import { dispatchRender } from "./product-video.ts";
import { HttpError } from "./util.ts";

const Item = z.object({ title: z.string(), text: z.string() });
const Content = z.object({
  template: z.enum(["split", "full"]).describe("split = texto ao lado da foto; full = foto grande de fundo (só se a foto principal for horizontal e bonita)"),
  fonts: z.enum(["fraunces", "cormorant", "dmserif", "jakarta"]).describe(
    "fraunces = serifada moderna e acolhedora; cormorant = elegante/luxo (estética, advocacia); dmserif = clássica e forte; jakarta = sem serifa, moderna/tecnológica",
  ),
  colors: z.object({
    primary: z.string().describe("Cor principal da marca em hex #rrggbb, tirada do logo/fotos; com bom contraste no branco"),
    ink: z.string().describe("Cor quase preta para textos, puxando para o tom da marca, hex"),
    soft: z.string().describe("Tom bem claro da cor principal para fundos de seção, hex"),
  }),
  seo_title: z.string().describe("Até 60 caracteres: nome + especialidade + cidade"),
  seo_description: z.string().describe("Até 155 caracteres"),
  eyebrow: z.string().describe("Linha curta acima do título, ex.: 'Nutricionista em Sobradinho · DF'"),
  headline: z.string().describe("Título principal, até 8 palavras, sobre o resultado que o cliente quer"),
  highlight: z.string().describe("Trecho exato do headline (1 a 3 palavras) para destacar na cor"),
  subheadline: z.string().describe("1 ou 2 frases explicando para quem é e como ajuda"),
  cta_label: z.string().describe("Texto do botão de WhatsApp, ex.: 'Agendar minha consulta'"),
  whatsapp_message: z.string().describe("Mensagem que já vem escrita quando o visitante abre o WhatsApp"),
  about_title: z.string(),
  about_text: z.string().describe("2 parágrafos curtos, em primeira pessoa se for profissional autônomo, sem exagero"),
  credentials: z.array(z.string()).describe("3 a 5 itens curtos (formação, abordagem, público) SÓ com o que foi informado; vazio se nada foi informado"),
  specialties: z.array(z.string()).describe(
    "Especialidades/áreas de atuação em 1 a 4 palavras cada (0 a 8), tiradas SÓ do que foi informado (categoria do Google, bio do Instagram, serviços). Nada informado = lista vazia",
  ),
  services_title: z.string(),
  services: z.array(Item).describe("3 a 6 serviços com 1 frase cada"),
  steps: z.array(Item).describe("Exatamente 3 passos de como funciona o atendimento"),
  benefits: z.array(Item).describe("3 ou 4 diferenciais concretos"),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).describe("4 a 6 dúvidas reais de quem procura esse serviço"),
  final_title: z.string().describe("Chamada final curta"),
  final_text: z.string(),
  hero_photo: z.number().int().describe("Índice (0..) da melhor foto para o topo: pessoa/ambiente, nítida, sem texto"),
  about_photo: z.number().int().describe("Índice de outra foto para a seção Sobre (pode repetir se só houver uma)"),
});

export type LandingContent = z.infer<typeof Content>;

const SYSTEM =
  `Você é redator e diretor de arte de uma agência brasileira que faz landing pages premium para profissionais e pequenos negócios ` +
  `(saúde, estética, advocacia, serviços locais). Escreve em português do Brasil, natural, específico e humano: nada de clichês de IA ` +
  `("transforme sua vida", "jornada", "potencialize", "descubra o poder", "solução completa"), nada de emojis, sem exclamações em excesso, ` +
  `frases curtas. Pense no que um cliente dessa área realmente pergunta e quer, como as melhores landing pages do nicho fazem ` +
  `(promessa clara no topo, prova, serviços, como funciona, dúvidas, chamada para o WhatsApp).\n\n` +
  `Regras:\n` +
  `- Use só dados verdadeiros da empresa (os informados, a bio do Instagram e o Google Maps). ` +
  `Nunca invente fatos: formação, anos de experiência, número de pacientes, prêmios, preços, convênios, depoimentos ou resultados garantidos. ` +
  `Use só o que foi informado; o resto escreva de forma que seja verdade para qualquer profissional sério da área.\n` +
  `- Saúde (medicina, nutrição, psicologia, odonto, fisio): siga as regras dos conselhos — sem promessa de resultado, sem antes/depois, sem "o melhor".\n` +
  `- Cores: tire do logo ou da identidade que aparece nas fotos. Sem logo, escolha uma cor sóbria que combine com a área e com as fotos ` +
  `(nada de roxo/azul neon genérico). A primária precisa de contraste para texto branco no botão.\n` +
  `- Serviços e especialidades: só os que aparecem nas informações; se houver poucos, fique nos que a área sempre oferece, sem nomes de procedimentos específicos.\n` +
  `- Olhe as fotos: escolha a melhor para o topo e outra para o "Sobre" (evite print de texto, cardápio, arte com letras e foto ruim).`;

export async function writeLanding(page: Record<string, unknown>, instructions?: string): Promise<LandingContent> {
  if (!aiEnabled()) throw new HttpError(400, "Configure a chave da Claude para gerar a página");
  const photos = (page.photos as string[] | null) ?? [];
  const info = [
    `Nome: ${page.name}`,
    `Área: ${page.niche}`,
    page.city && `Cidade/bairro: ${page.city}`,
    page.registry && `Registro profissional: ${page.registry}`,
    page.address && `Endereço: ${page.address}`,
    page.hours && `Horário: ${page.hours}`,
    page.instagram && `Instagram: ${page.instagram}`,
    page.rating && `Nota no Google: ${page.rating} (${page.reviews ?? 0} avaliações)`,
    page.notes && `Informações do cliente (serviços, formação, diferenciais, bio do Instagram e Google Maps):\n${page.notes}`,
    page.logo && `O logo é a última imagem enviada.`,
    `Fotos enviadas: ${photos.length} (índices 0 a ${Math.max(0, photos.length - 1)}).`,
  ].filter(Boolean).join("\n");
  const previous = page.content ? `\n\nVersão atual da página (mantenha o que não for pedido para mudar):\n${JSON.stringify(page.content)}` : "";
  const ask = instructions?.trim() ? `\n\nAjuste pedido pelo dono: ${instructions.trim()}` : "";
  const images = [...photos.slice(0, 6), ...(page.logo ? [String(page.logo)] : [])];
  const out = await generateJSON(Content, SYSTEM, `Crie o conteúdo da landing page.\n\n${info}${previous}${ask}`, "medium", images);
  const max = Math.max(0, photos.length - 1);
  return { ...out, specialties: out.specialties.slice(0, 8), hero_photo: Math.min(Math.max(0, out.hero_photo), max), about_photo: Math.min(Math.max(0, out.about_photo), max) };
}

/** Endereço curto e único para a página publicada (/p/<slug>). */
export async function uniqueSlug(db: SupabaseClient, name: string, id: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "pagina";
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const { data } = await db.from("landing_pages").select("id").eq("slug", slug).maybeSingle();
    if (!data || data.id === id) return slug;
  }
  return `${base}-${id.slice(0, 6)}`;
}

// ---------------------------------------------------------------------------
// Dados reais do cliente: Instagram (bio + fotos dos posts) e Google Maps (horário, fotos, categoria, descrição).
// Espaço: fotos do Google entram só como link (não expiram, não ocupam o storage); as do Instagram expiram,
// então até 6 são copiadas para o storage. Rodar de novo não repete foto nem texto.
// ---------------------------------------------------------------------------
type Imported = { at?: string; sources?: string[]; instagram?: string; maps?: string };

async function copyPhoto(db: SupabaseClient, userId: string, pageId: string, url: string) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 15_000) return null; // ícone/miniatura
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const path = `${userId}/landing/${pageId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from("media").upload(path, bytes, { contentType: type });
    return error ? null : db.storage.from("media").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export function igUsername(v: unknown) {
  const s = String(v ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "");
  return /^[\w.]{1,30}$/.test(s) ? s.toLowerCase() : "";
}

/** Puxa os dados reais do cliente para a página. Devolve o patch para landing_pages (vazio se nada mudou). */
export async function importClientData(db: SupabaseClient, page: Record<string, any>): Promise<Record<string, unknown>> {
  const prev: Imported = page.imported ?? {};
  const sources = new Set(prev.sources ?? []);
  const photos: string[] = [...(page.photos ?? [])];
  const notes: string[] = page.notes ? [String(page.notes)] : [];
  const addNote = (label: string, text?: string | null) => {
    const t = String(text ?? "").trim();
    if (t && !notes.join("\n").includes(t)) notes.push(`${label}: ${t}`);
  };
  const patch: Record<string, unknown> = {};
  const status: Imported = { instagram: prev.instagram, maps: prev.maps };
  const room = () => Math.max(0, 12 - photos.length);
  const addPhotos = async (urls: string[], max: number, copy = true) => {
    let added = 0;
    for (const url of urls) {
      if (added >= max || !room()) break;
      const key = url.split("?")[0];
      if (sources.has(key)) continue;
      sources.add(key);
      const saved = copy ? await copyPhoto(db, page.user_id, page.id, url) : url;
      if (saved) {
        photos.push(saved);
        added++;
      }
    }
    return added;
  };

  // Google Maps (só páginas que vieram de um lead)
  if (page.lead_id) {
    const { data: lead } = await db.from("leads").select("*").eq("id", page.lead_id).maybeSingle();
    const d = lead?.details as { hours?: string; photos?: string[]; category?: string; description?: string } | null;
    if (lead && d && lead.details_status === "done") {
      if (d.hours && !page.hours) patch.hours = d.hours;
      addNote("Categoria no Google", d.category);
      addNote("Descrição no Google", d.description);
      if (lead.rating && !page.rating) Object.assign(patch, { rating: lead.rating, reviews: lead.reviews });
      const n = await addPhotos(d.photos ?? [], 6, false);
      status.maps = `ok: ${n} foto(s)${d.hours ? ", horário" : ", sem horário no Google"}`;
    } else if (lead) {
      if (lead.details_status !== "queued" && lead.details_status !== "running" && lead.details_status !== "failed") {
        await db.from("leads").update({ details_status: "queued" }).eq("id", lead.id);
        await dispatchRender("leads.yml");
      }
      status.maps = lead.details_status === "failed" ? "não achei o lugar de novo no Google Maps" : "pending";
    }
  }

  // Instagram (bio + fotos dos posts)
  const user = igUsername(page.instagram);
  if (user) {
    try {
      const ig = await igPublicProfile(user);
      addNote("Bio do Instagram", ig.bio);
      addNote("Categoria no Instagram", ig.category);
      let n = await addPhotos(ig.photos, 6);
      if (n < 2 && ig.picture) n += await addPhotos([ig.picture], 1);
      status.instagram = `ok: ${n} foto(s)`;
    } catch (e) {
      status.instagram = `erro: ${(e as Error).message}`;
    }
  }

  if (photos.length !== (page.photos ?? []).length) patch.photos = photos;
  const joined = notes.join("\n");
  if (joined !== (page.notes ?? "")) patch.notes = joined;
  patch.imported = { at: new Date().toISOString(), sources: [...sources], ...status };
  return patch;
}
