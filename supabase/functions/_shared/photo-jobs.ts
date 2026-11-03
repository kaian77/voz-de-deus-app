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
  let results = (job.results ?? []) as Result[];
  // situação dos rascunhos já ligados ao lote: só "created" conta como no site (failed/pending tenta de novo)
  const linked = [...new Set(results.map((r) => r.draft_id).filter(Boolean))] as string[];
  const { data: linkedDrafts } = linked.length
    ? await db.from("product_drafts").select("id,status").in("id", linked)
    : { data: [] as { id: string; status: string }[] };
  const statusOf = new Map((linkedDrafts ?? []).map((d) => [d.id, d.status as string]));

  const deleted: unknown[] = [];
  if (replace) {
    // produtos que saíram deste lote antes (guardados no "refazer" ou achados pelas fotos do lote no rascunho)
    const { data: old } = await db.from("product_drafts").select("id,product_id,images").eq("user_id", userId)
      .eq("status", "created").not("product_id", "is", null);
    const fromJob = (old ?? []).filter((d) => !linked.includes(d.id) && (d.images ?? []).some((u: string) => u.includes(`/fotos/${id}/`)));
    const ids = [...new Set([...(job.replace_products ?? []).map(Number), ...fromJob.map((d) => Number(d.product_id))])].filter(Boolean);
    for (const pid of ids) {
      deleted.push(await deleteProduct(db, userId, pid).catch((e) => ({ id: pid, error: e instanceof Error ? e.message : String(e) })));
    }
    if (fromJob.length) await db.from("product_drafts").update({ product_id: null, product_url: null }).in("id", fromJob.map((d) => d.id));
    if (job.replace_products?.length) await db.from("photo_jobs").update({ replace_products: [] }).eq("id", id);
  }
  const template = await templateFor(db, userId);
  if (!template) throw new Error("Salve um modelo de cadastro em Produtos antes");
  const done = (s: number) => results.some((r) => r.source === s && r.draft_id && statusOf.get(r.draft_id) === "created");
  const sources = [...new Set(results.map((r) => r.source))].filter((s) => !skip.includes(s) && !done(s));
  const created: unknown[] = [];
  const errors: unknown[] = [];
  for (const s of sources) {
    if (Date.now() - started > 100_000) break;
    const g = results.filter((r) => r.source === s);
    const colors = g.length > 1 && g.some((r) => r.color === "prata") && g.some((r) => r.color === "dourado")
      ? g.map((r) => ({ value: r.color === "dourado" ? "Dourado" : "Prata", image: r.white_url }))
      : undefined;
    const fields = {
      images: [...g.map((r) => r.white_url), ...g.map((r) => r.theme_url)],
      name: g[0].name || (job.names ?? [])[s] || null, template_id: template.id,
      overrides: { social_images: g.map((r) => r.theme_url), ml_images: g.map((r) => r.white_url), ...(colors ? { colors } : {}) },
    };
    // rascunho que falhou antes: reaproveita (com as fotos atuais do lote)
    let draftId = g.find((r) => r.draft_id && ["failed", "pending"].includes(statusOf.get(r.draft_id) ?? ""))?.draft_id;
    if (draftId) {
      await db.from("product_drafts").update({ ...fields, status: "failed" }).eq("id", draftId);
    } else {
      const { data: draft, error } = await db.from("product_drafts").insert({ user_id: userId, status: "pending", ...fields }).select().single();
      if (error || !draft) {
        errors.push({ source: s, error: error?.message });
        continue;
      }
      draftId = draft.id as string;
      results = results.map((r) => (r.source === s ? { ...r, draft_id: draftId } : r));
      await db.from("photo_jobs").update({ results }).eq("id", id);
    }
    try {
      const r = await createFromDraft(db, userId, draftId!) as { product_url?: string | null; product?: { url?: string } };
      const url = r.product?.url ?? r.product_url ?? null;
      statusOf.set(draftId!, "created");
      results = results.map((x) => (x.source === s ? { ...x, draft_id: draftId, product_url: url } : x));
      await db.from("photo_jobs").update({ results }).eq("id", id);
      created.push({ source: s, name: g[0].name, colors: colors?.map((c) => c.value) ?? [g[0].color], url });
    } catch (e) {
      statusOf.set(draftId!, "failed");
      errors.push({ source: s, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const pending = [...new Set(results.map((r) => r.source))].filter((s) => !skip.includes(s) && !done(s)).length;
  return { deleted, created, errors, pending };
}
