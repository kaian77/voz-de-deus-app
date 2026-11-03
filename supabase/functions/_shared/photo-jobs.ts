// Lotes de "Fotos de produto" pelo Claude (MCP): listar, refazer e cadastrar no site — o mesmo que a tela faz.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createFromDraft, templateFor } from "./products.ts";
import { dispatchRender } from "./product-video.ts";
import { deleteProduct } from "./store-manage.ts";

type Result = { source: number; index: number; color: string; name: string | null; white_url: string; theme_url: string; draft_id?: string; product_url?: string | null };

export async function listPhotoJobs(db: SupabaseClient, userId: string) {
  const { data } = await db.from("photo_jobs").select("id,theme,status,results,source_urls,replace_products,created_at,error")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  return (data ?? []).map((j) => {
    const results = (j.results ?? []) as Result[];
    const sources = [...new Set(results.map((r) => r.source))];
    return {
      id: j.id, theme: j.theme, status: j.status, created_at: j.created_at, error: j.error, photos: j.source_urls?.length ?? 0,
      products: sources.length, on_site: sources.filter((s) => results.some((r) => r.source === s && r.draft_id)).length,
      to_replace: j.replace_products ?? [],
    };
  });
}

/** Refaz os lotes (estilo novo). Guarda os produtos que já tinham subido deles, para trocar ao cadastrar de novo. */
export async function redoPhotoJobs(db: SupabaseClient, userId: string, ids?: string[]) {
  let q = db.from("photo_jobs").select("id,results,replace_products").eq("user_id", userId).in("status", ["ready", "failed"]);
  if (ids?.length) q = q.in("id", ids);
  const { data: jobs } = await q;
  for (const j of jobs ?? []) {
    const draftIds = ((j.results ?? []) as Result[]).map((r) => r.draft_id).filter(Boolean) as string[];
    const { data: drafts } = draftIds.length
      ? await db.from("product_drafts").select("product_id").in("id", draftIds).not("product_id", "is", null)
      : { data: [] as { product_id: string }[] };
    const replace = [...new Set([...(j.replace_products ?? []), ...(drafts ?? []).map((d) => Number(d.product_id))])].filter(Boolean);
    await db.from("photo_jobs").update({ status: "queued", seed: null, attempts: 0, error: null, replace_products: replace, updated_at: new Date().toISOString() }).eq("id", j.id);
  }
  return { requeued: (jobs ?? []).length, dispatched: (jobs ?? []).length ? await dispatchRender("product-photos.yml") : false };
}

/**
 * Cadastra no site os produtos de um lote pronto (prata + dourado da mesma foto = um produto com variações).
 * replace: antes apaga os produtos que já tinham subido desse lote (site + anúncio do ML). Roda até ~100 s;
 * devolve quantos faltam (chamar de novo até pending = 0).
 */
export async function publishPhotoJob(db: SupabaseClient, userId: string, id: string, replace = true, skip: number[] = []) {
  const started = Date.now();
  const { data: job } = await db.from("photo_jobs").select("*").eq("id", id).eq("user_id", userId).single();
  if (!job) throw new Error("Lote não encontrado");
  if (job.status !== "ready") throw new Error(`O lote ainda não está pronto (${job.status})`);
  const deleted: unknown[] = [];
  if (replace && job.replace_products?.length) {
    for (const pid of job.replace_products as number[]) {
      deleted.push(await deleteProduct(db, userId, pid).catch((e) => ({ id: pid, error: e instanceof Error ? e.message : String(e) })));
    }
    await db.from("photo_jobs").update({ replace_products: [] }).eq("id", id);
  }
  const template = await templateFor(db, userId);
  if (!template) throw new Error("Salve um modelo de cadastro em Produtos antes");
  let results = (job.results ?? []) as Result[];
  const sources = [...new Set(results.map((r) => r.source))].filter((s) => !skip.includes(s) && !results.some((r) => r.source === s && r.draft_id));
  const created: unknown[] = [];
  const errors: unknown[] = [];
  for (const s of sources) {
    if (Date.now() - started > 100_000) break;
    const g = results.filter((r) => r.source === s);
    const colors = g.length > 1 && g.some((r) => r.color === "prata") && g.some((r) => r.color === "dourado")
      ? g.map((r) => ({ value: r.color === "dourado" ? "Dourado" : "Prata", image: r.white_url }))
      : undefined;
    const { data: draft, error } = await db.from("product_drafts").insert({
      user_id: userId, images: [...g.map((r) => r.white_url), ...g.map((r) => r.theme_url)],
      name: g[0].name || (job.names ?? [])[s] || null, template_id: template.id, status: "pending",
      overrides: { social_images: g.map((r) => r.theme_url), ml_images: g.map((r) => r.white_url), ...(colors ? { colors } : {}) },
    }).select().single();
    if (error || !draft) {
      errors.push({ source: s, error: error?.message });
      continue;
    }
    results = results.map((r) => (r.source === s ? { ...r, draft_id: draft.id } : r));
    await db.from("photo_jobs").update({ results }).eq("id", id);
    try {
      const r = await createFromDraft(db, userId, draft.id) as { product_url?: string | null; product?: { url?: string } };
      const url = r.product?.url ?? r.product_url ?? null;
      results = results.map((x) => (x.source === s ? { ...x, product_url: url } : x));
      await db.from("photo_jobs").update({ results }).eq("id", id);
      created.push({ source: s, name: g[0].name, colors: colors?.map((c) => c.value) ?? [g[0].color], url });
    } catch (e) {
      errors.push({ source: s, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const pending = [...new Set(results.map((r) => r.source))].filter((s) => !skip.includes(s) && !results.some((r) => r.source === s && r.draft_id)).length;
  return { deleted, created, errors, pending };
}
