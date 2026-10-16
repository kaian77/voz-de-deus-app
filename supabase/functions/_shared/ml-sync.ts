// Sincronização da loja Nuvemshop com o Mercado Livre, em lote e em segundo plano: cada produto da loja
// atualiza o anúncio que já existe (fotos da loja, descrição no padrão do lojista, estoque) ou vira um anúncio novo.
// A fila fica em social_accounts.meta.ml_sync da conta do Mercado Livre e o cron processa alguns por minuto.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ns, storeFor, txt } from "./nuvemshop.ts";
import { ML_LOOKUP_FIELDS, mlSellerItems, mlTokenFor } from "./mercadolivre.ts";
import { publishToMercadoLivre } from "./marketplaces.ts";
import { dispatchRender } from "./product-video.ts";

/** Produtos por rodada do cron (cada um faz várias chamadas ao ML). */
const PER_RUN = 3;

type SyncResult = { id: number; name: string; ml_id?: string; status?: string; updated?: boolean; error?: string; reason?: string };
export type MlSync = {
  started_at: string;
  finished_at?: string | null;
  total: number;
  queue: number[];
  done: SyncResult[];
  errors: SyncResult[];
  skipped: SyncResult[];
  /** Produtos tirados da fila pela rodada em andamento (voltam para a fila se ela morrer no meio) */
  inflight?: { ids: number[]; at: string } | null;
  /** Quantas vezes cada produto já voltou para a fila */
  retries?: Record<string, number>;
};

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", ordm: "º", ordf: "ª", ndash: "–", mdash: "—", hellip: "…", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ccedil: "ç", Ccedil: "Ç" };
for (const [v, marks] of Object.entries({ a: "acute grave circ tilde uml", e: "acute grave circ uml", i: "acute grave circ uml", o: "acute grave circ tilde uml", u: "acute grave circ uml" })) {
  const accents: Record<string, string> = { acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈" };
  for (const m of marks.split(" ")) {
    ENTITIES[v + m] = (v + accents[m]).normalize("NFC");
    ENTITIES[v.toUpperCase() + m] = (v.toUpperCase() + accents[m]).normalize("NFC");
  }
}

/** HTML da Nuvemshop em texto corrido (sem tags, entidades decodificadas). */
function plain(html: string) {
  return html.replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? m)
    .replace(/\s+/g, " ").trim();
}

/** Nome do pin sem "Pin", sem "(Metal Esmaltado)" e sem o subtítulo: "Zé Bioquímico". */
export function pinModel(name: string) {
  return name.replace(/\([^)]*\)/g, "").split(" - ")[0].replace(/^\s*(pin|broche|botton)\s+/i, "").trim() || name.trim();
}

/** SKU no padrão do lojista: PIN-ZE-GOTINHA-VETERINARIO. */
export function pinSku(name: string) {
  return "PIN-" + pinModel(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** O ML não aceita links nem contatos na descrição: tira as frases que têm. */
const noContacts = (s: string) =>
  s.split(/(?<=[.!?])\s+/)
    .filter((f) => !/https?:\/\/|www\.|\.com(\.br)?\b|@\w|whats ?app|\(\d{2}\)/i.test(f))
    .join(" ").replace(/\s+/g, " ").trim();

/** Primeiras frases do texto, até ~`max` caracteres. */
function firstSentences(text: string, max = 700) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return end > 200 ? cut.slice(0, end + 1) : cut.trimEnd() + "…";
}

/** Descrição do anúncio no padrão da Brax Pins Mania para o Mercado Livre. */
export function mlListingDescription(p: { name: string; about: string; theme?: string }) {
  const short = p.name.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const about = firstSentences(noContacts(p.about));
  return [
    `${short.toUpperCase()} – BRAX PINS MANIA`,
    "",
    "Leve sua profissão, causa, paixão ou identidade para o dia a dia com um pin exclusivo da Brax Pins Mania.",
    "",
    about || `O ${short} é uma peça marcante, colecionável e cheia de significado.`,
    "",
    "Produzido em metal de alta resistência com acabamento esmaltado premium, possui excelente definição dos detalhes, cores vivas e acabamento de alta qualidade.",
    "",
    "DESTAQUES DO PRODUTO",
    "- Produto em metal esmaltado",
    "- Acabamento premium",
    "- Alta resistência e durabilidade",
    "- Design exclusivo",
    "- Ideal para presentear ou colecionar",
    "- Excelente para profissionais, estudantes e apaixonados pelo tema",
    "- Produto original Brax Pins Mania",
    "",
    "ONDE USAR",
    "Perfeito para:",
    ...["Jalecos", "Uniformes", "Crachás", "Cordões", "Mochilas", "Bolsas", "Bonés", "Jaquetas", "Coleções de pins"].map((w) => `- ${w}`),
    "",
    "ESPECIFICAÇÕES",
    "Produto: Pin / Broche",
    "Material: Metal esmaltado",
    "Marca: Brax Pins Mania",
    ...(p.theme ? [`Tema: ${p.theme}`] : []),
    "Cor predominante: Multicolorido",
    "Quantidade: 1 unidade",
    "Condição: Novo",
    "Origem: Nacional",
    "",
    "CONTEÚDO DA EMBALAGEM",
    `- 1 ${short}`,
    "",
    "IMPORTANTE",
    "As cores podem apresentar pequenas variações dependendo da configuração da tela utilizada.",
    "Produto enviado cuidadosamente embalado para preservar seu acabamento.",
    "",
    "MODELO EXCLUSIVO – POUCAS UNIDADES DISPONÍVEIS.",
    "Alguns modelos são produzidos em quantidades limitadas e podem não retornar ao estoque após esgotarem. Se gostou, aproveite enquanto está disponível.",
  ].join("\n");
}

async function mlAccount(db: SupabaseClient, userId: string) {
  const { data } = await db.from("social_accounts").select("*").eq("user_id", userId).eq("platform", "mercadolivre").order("connected_at").limit(1).maybeSingle();
  return data;
}

/** Grava o estado relendo o meta atual (a análise de preços também escreve nele). */
async function saveSync(db: SupabaseClient, accountId: string, sync: MlSync) {
  const { data } = await db.from("social_accounts").select("meta").eq("id", accountId).single();
  await db.from("social_accounts").update({ meta: { ...(data?.meta ?? {}), ml_sync: sync } }).eq("id", accountId);
}

/** Registra o resultado de um produto no estado atual (outra rodada pode ter mexido na fila enquanto esta rodava). */
async function record(db: SupabaseClient, accountId: string, id: number, r: { done?: SyncResult; error?: SyncResult; skipped?: SyncResult }) {
  const { data } = await db.from("social_accounts").select("meta").eq("id", accountId).single();
  const sync = data?.meta?.ml_sync as MlSync | undefined;
  if (!sync) return 0;
  if (r.done) sync.done.push(r.done);
  if (r.error) sync.errors.push(r.error);
  if (r.skipped) sync.skipped.push(r.skipped);
  if (sync.inflight) sync.inflight.ids = sync.inflight.ids.filter((x) => x !== id);
  if (!sync.queue.length && !sync.inflight?.ids.length && !sync.finished_at) sync.finished_at = new Date().toISOString();
  await db.from("social_accounts").update({ meta: { ...data!.meta, ml_sync: sync } }).eq("id", accountId);
  return sync.queue.length;
}

/** Coloca todos os produtos publicados da loja na fila de sincronização. */
export async function startMlSync(db: SupabaseClient, userId: string) {
  const acc = await mlAccount(db, userId);
  if (!acc) throw new Error("Conecte o Mercado Livre em Contas");
  const store = await storeFor(db, userId);
  if (!store) throw new Error("Conecte a Nuvemshop em Contas");
  const products = await storeProducts(store.token, store.storeId);
  const ids = products.map((p) => p.id);
  const photos = await queuePhotos(db, userId, products);
  const sync: MlSync = { started_at: new Date().toISOString(), finished_at: null, total: ids.length, queue: ids, done: [], errors: [], skipped: [] };
  await saveSync(db, acc.id, sync);
  return { total: ids.length, photos, minutes: Math.ceil(ids.length / PER_RUN) };
}

/** Estado da sincronização (para o app e o Claude). */
export async function mlSyncStatus(db: SupabaseClient, userId: string) {
  const acc = await mlAccount(db, userId);
  const sync = acc?.meta?.ml_sync as MlSync | undefined;
  if (!sync) return { running: false };
  return {
    running: sync.queue.length > 0 || !!sync.inflight?.ids.length,
    total: sync.total,
    remaining: sync.queue.length,
    updated: sync.done.filter((d) => d.updated).length,
    created: sync.done.filter((d) => !d.updated).length,
    skipped: sync.skipped,
    errors: sync.errors,
    started_at: sync.started_at,
    finished_at: sync.finished_at,
  };
}

/** Rodada do cron: processa alguns produtos da fila de cada conta. */
export async function runMlSync(db: SupabaseClient) {
  const { data: accounts } = await db.from("social_accounts").select("id,user_id,external_id,meta").eq("platform", "mercadolivre");
  const out: unknown[] = [];
  for (const acc of accounts ?? []) {
    const sync = acc.meta?.ml_sync as MlSync | undefined;
    if (!sync) continue;
    const errors: SyncResult[] = [];
    // Rodada anterior morreu no meio (tempo/CPU da função): devolve os produtos dela para a fila; na 3ª vez, vira erro
    if (sync.inflight?.ids.length) {
      if (Date.now() - new Date(sync.inflight.at).getTime() < 3 * 60_000) continue; // ainda pode estar rodando
      sync.retries ??= {};
      const back: number[] = [];
      for (const id of sync.inflight.ids) {
        sync.retries[id] = (sync.retries[id] ?? 0) + 1;
        if (sync.retries[id] >= 3) errors.push({ id, name: String(id), error: "A rodada parou no meio 3 vezes com este produto" });
        else back.push(id);
      }
      sync.errors.push(...errors);
      sync.queue = [...back, ...sync.queue];
      sync.inflight = null;
    }
    if (!sync.queue.length) {
      if (!sync.finished_at) {
        sync.finished_at = new Date().toISOString();
        await saveSync(db, acc.id, sync);
      }
      continue;
    }
    // Tira da fila antes de processar: se a rodada demorar, a próxima não pega os mesmos produtos
    const batch = sync.queue.slice(0, PER_RUN);
    sync.queue = sync.queue.slice(PER_RUN);
    sync.inflight = { ids: batch, at: new Date().toISOString() };
    await saveSync(db, acc.id, sync);

    let remaining = sync.queue.length;
    try {
      const store = await storeFor(db, acc.user_id);
      if (!store) throw new Error("Nuvemshop desconectada");
      const token = await mlTokenFor(db, acc.id);
      const sellerItems = await mlSellerItems(token, acc.external_id, 1000, "", ML_LOOKUP_FIELDS);
      for (const id of batch) {
        let name = String(id);
        try {
          // deno-lint-ignore no-explicit-any
          const p = await ns<any>(store.token, store.storeId, `products/${id}`);
          name = txt(p.name);
          // deno-lint-ignore no-explicit-any
          const v: any = p.variants?.[0] ?? {};
          const price = Number(v.price || 0); // preço cheio: é com ele que a regra de preço foi descoberta
          // deno-lint-ignore no-explicit-any
          const images: string[] = (p.images ?? []).map((i: any) => i.src).filter(Boolean);
          const skip = /^\s*(kit|combo)\b/i.test(name) ? "kit (preço e descrição são diferentes)"
            : /\bteste\b/i.test(name) ? "produto de teste"
            : !price ? "sem preço"
            : !images.length ? "sem foto"
            : null;
          if (skip) {
            remaining = await record(db, acc.id, id, { skipped: { id, name, reason: skip } });
            continue;
          }
          const photos = await mlReadyImages(db, acc.user_id, images);
          if (photos.wait) {
            remaining = await defer(db, acc.id, id);
            continue;
          }
          // deno-lint-ignore no-explicit-any
          const theme = (p.categories ?? []).map((c: any) => txt(c.name)).filter(Boolean).slice(0, 2).join(", ") || undefined;
          const r = await publishToMercadoLivre(db, acc.user_id, {
            name,
            description: mlListingDescription({ name, about: plain(txt(p.description)), theme }),
            images: photos.images,
            ml_ready_pictures: photos.ready,
            price,
            sku: String(v.sku ?? "").trim() || pinSku(name),
            stock: 200,
          }, sellerItems);
          remaining = await record(db, acc.id, id, {
            done: { id, name, ml_id: r.id, status: r.status, updated: "updated" in r ? r.updated : false, ...(r.warnings.length ? { error: r.warnings.join("; ") } : {}) },
          });
        } catch (e) {
          remaining = await record(db, acc.id, id, { error: { id, name, error: e instanceof Error ? e.message : String(e) } });
        }
      }
    } catch (e) {
      // Falha antes dos produtos (token, loja, lista de anúncios): devolve o lote para a fila e registra o motivo
      const { data } = await db.from("social_accounts").select("meta").eq("id", acc.id).single();
      const cur = data?.meta?.ml_sync as MlSync | undefined;
      if (cur) {
        cur.queue = [...(cur.inflight?.ids ?? []), ...cur.queue];
        cur.inflight = null;
        const msg = e instanceof Error ? e.message : String(e);
        // O mesmo problema a cada minuto (ex.: acesso expirado) fica registrado uma vez só
        if (cur.errors.at(-1)?.error !== msg) cur.errors.push({ id: 0, name: "Rodada", error: msg });
        await saveSync(db, acc.id, cur);
      }
    }
    out.push({ account: acc.id, processed: batch.length, remaining });
  }
  return out;
}

/** Produtos publicados da loja (até 2.000), com as fotos. */
async function storeProducts(token: string, storeId: string) {
  const out: { id: number; images: string[] }[] = [];
  for (let page = 1; page <= 10; page++) {
    // deno-lint-ignore no-explicit-any
    const list = await ns<any[]>(token, storeId, `products?per_page=200&page=${page}&fields=id,published,images`);
    if (!Array.isArray(list) || !list.length) break;
    // deno-lint-ignore no-explicit-any
    for (const p of list.filter((p) => p.published !== false)) out.push({ id: Number(p.id), images: (p.images ?? []).map((i: any) => i.src).filter(Boolean) });
    if (list.length < 200) break;
  }
  return out;
}

/** Fotos por anúncio (o ML aceita até 10; a loja costuma ter poucas). */
const ML_PICTURES = 6;

/** Põe as fotos na fila do workflow que as deixa no padrão do ML (a 1ª vira capa com fundo branco). */
async function queuePhotos(db: SupabaseClient, userId: string, products: { images: string[] }[]) {
  const rows = products.flatMap((p) =>
    p.images.slice(0, ML_PICTURES).map((src, i) => ({ user_id: userId, source_url: src, kind: i === 0 ? "cover" : "extra" }))
  );
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("ml_photos").upsert(rows.slice(i, i + 500), { onConflict: "source_url,kind", ignoreDuplicates: true });
    if (error) throw new Error(`fila de fotos: ${error.message}`);
  }
  await dispatchRender("ml-photos.yml");
  return rows.length;
}

/** Quanto tempo a sincronização espera a foto tratada antes de usar a da loja. */
const PHOTO_WAIT_MS = 2 * 3600_000;

/**
 * Fotos do produto para o ML: as tratadas (fundo branco) quando prontas. `wait` = ainda tem foto na fila
 * (a sincronização deixa o produto para depois).
 */
async function mlReadyImages(db: SupabaseClient, userId: string, images: string[]) {
  const list = images.slice(0, ML_PICTURES);
  if (!list.length) return { images: list, ready: false, wait: false };
  const { data } = await db.from("ml_photos").select("source_url,kind,status,result_url,created_at").in("source_url", list);
  const rows = data ?? [];
  const row = (src: string, i: number) => rows.find((r) => r.source_url === src && r.kind === (i === 0 ? "cover" : "extra"));
  if (list.some((src, i) => !row(src, i))) {
    await queuePhotos(db, userId, [{ images: list }]); // foto nova na loja desde que a sincronização começou
    return { images: list, ready: false, wait: true };
  }
  const wait = list.some((src, i) => {
    const r = row(src, i)!;
    return r.status === "queued" && Date.now() - new Date(r.created_at).getTime() < PHOTO_WAIT_MS;
  });
  const out = list.map((src, i) => row(src, i)?.result_url || src);
  return { images: out, ready: out.some((u, i) => u !== list[i]), wait };
}

/** Devolve o produto para o fim da fila (esperando as fotos tratadas). */
async function defer(db: SupabaseClient, accountId: string, id: number) {
  const { data } = await db.from("social_accounts").select("meta").eq("id", accountId).single();
  const sync = data?.meta?.ml_sync as MlSync | undefined;
  if (!sync) return 0;
  if (sync.inflight) sync.inflight.ids = sync.inflight.ids.filter((x) => x !== id);
  sync.queue.push(id);
  await db.from("social_accounts").update({ meta: { ...data!.meta, ml_sync: sync } }).eq("id", accountId);
  return sync.queue.length;
}

/**
 * Produto novo na loja (cadastrado pelo Studio ou direto na Nuvemshop) → entra na fila da sincronização
 * e vira anúncio no Mercado Livre no padrão da marca. Liga/desliga: brand_settings.marketplace_autopublish.
 * Na primeira vez só guarda os produtos que já existem (esses a sincronização completa cobre).
 */
export async function watchNewProducts(db: SupabaseClient) {
  const { data: accounts } = await db.from("social_accounts").select("id,user_id,meta").eq("platform", "mercadolivre");
  const out: unknown[] = [];
  for (const acc of accounts ?? []) {
    const { data: settings } = await db.from("brand_settings").select("marketplace_autopublish").eq("user_id", acc.user_id).maybeSingle();
    if (!settings?.marketplace_autopublish) continue;
    try {
      const store = await storeFor(db, acc.user_id);
      if (!store) continue;
      const products = await storeProducts(store.token, store.storeId);
      const ids = products.map((p) => p.id);
      if (!ids.length) continue; // loja fora do ar: não zera a lista de conhecidos
      const { data } = await db.from("social_accounts").select("meta").eq("id", acc.id).single();
      const meta = data?.meta ?? {};
      const known: number[] | undefined = Array.isArray(meta.ml_known) ? meta.ml_known : undefined;
      const fresh = known ? ids.filter((id) => !known.includes(id)) : [];
      let sync = meta.ml_sync as MlSync | undefined;
      if (fresh.length) {
        const queued = new Set([...(sync?.queue ?? []), ...(sync?.inflight?.ids ?? [])]);
        const add = fresh.filter((id) => !queued.has(id));
        sync = sync
          ? { ...sync, total: sync.total + add.length, queue: [...sync.queue, ...add], finished_at: null, done: sync.done.slice(-300) }
          : { started_at: new Date().toISOString(), finished_at: null, total: add.length, queue: add, done: [], errors: [], skipped: [] };
        await queuePhotos(db, acc.user_id, products.filter((p) => add.includes(p.id))).catch((e) => console.error("fotos ML", e));
        out.push({ account: acc.id, queued: add });
      }
      await db.from("social_accounts").update({
        meta: { ...meta, ml_known: [...new Set([...(known ?? []), ...ids])], ...(sync ? { ml_sync: sync } : {}) },
      }).eq("id", acc.id);
    } catch (e) {
      out.push({ account: acc.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
