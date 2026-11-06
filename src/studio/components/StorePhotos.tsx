import { useState } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import { useInvalidate, useTable } from "../lib/hooks";
import type { StorePhotoJob } from "../lib/types";
import { Panel } from "./bits";

/** Fotos temáticas dos produtos da loja: antes × depois para aprovar. Aplicar = vira a capa no site
 *  (o Mercado Livre continua com fundo branco). */
export function StorePhotos() {
  const invalidate = useInvalidate();
  const { data: jobs = [] } = useTable("store_photo_jobs", { order: "updated_at", ascending: false, limit: 300 }, { refetchInterval: 20000 });
  const [busy, setBusy] = useState<string | null>(null);
  const ready = jobs.filter((j) => j.status === "ready");
  const working = jobs.filter((j) => j.status === "queued" || j.status === "processing").length;
  const failed = jobs.filter((j) => j.status === "failed");
  const applied = jobs.filter((j) => j.status === "applied").length;
  if (!jobs.length) return null;

  const apply = async (ids: string[]) => {
    setBusy(ids.length > 1 ? "all" : ids[0]);
    let done = 0;
    try {
      for (let round = 0; round < 10; round++) {
        const r = await api.invoke<{ applied: number; errors: string[]; pending: number }>("ai", { action: "store_photos_apply", ids });
        done += r.applied;
        r.errors.slice(0, 3).forEach((e) => toast.error(e));
        if (!r.pending || !r.applied) break;
      }
      if (done) toast.success(`${done} foto(s) no site, como capa.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      invalidate("store_photo_jobs");
    }
  };
  const redo = async (j: StorePhotoJob) => {
    setBusy(j.id);
    try {
      await api.invoke("ai", { action: "store_photos_queue", ids: [j.product_id] });
      toast.success("Refazendo com outro cenário");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      invalidate("store_photo_jobs");
    }
  };
  const discard = async (j: StorePhotoJob) => {
    await api.update("store_photo_jobs", j.id, { status: "discarded" }).catch((e) => toast.error(e.message));
    invalidate("store_photo_jobs");
  };

  return (
    <Panel
      title="Fotos temáticas"
      description={`${working ? `${working} sendo feitas · ` : ""}${ready.length} para aprovar · ${applied} já no site${failed.length ? ` · ${failed.length} com erro` : ""}. Aprovar = vira a capa no site; o Mercado Livre continua com fundo branco.`}
      action={ready.length > 1 ? (
        <Button size="sm" onClick={() => apply(ready.map((j) => j.id))} disabled={!!busy}>
          {busy === "all" ? <Loader2 className="animate-spin" /> : <Check />} Aplicar todas ({ready.length})
        </Button>
      ) : undefined}
      bodyClassName="p-4"
    >
      {working > 0 && <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Fazendo as fotos (uns 20 s cada)…</p>}
      {failed.length > 0 && <p className="mb-3 text-xs text-destructive">{failed[0].name}: {failed[0].error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {ready.map((j) => (
          <div key={j.id} className="space-y-2 rounded-md border p-2">
            <p className="truncate text-sm font-medium">{j.name}</p>
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <img src={j.source_url} alt="antes" className="aspect-square w-full rounded border object-cover" loading="lazy" />
              <img src={j.result_url ?? ""} alt="depois" className="aspect-square w-full rounded border object-cover" loading="lazy" />
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" className="h-8" onClick={() => apply([j.id])} disabled={!!busy}>
                {busy === j.id ? <Loader2 className="animate-spin" /> : <Check />} Aplicar
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => redo(j)} disabled={!!busy}><RefreshCw /> Refazer</Button>
              <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => discard(j)}><X /> Descartar</Button>
              {j.url && <a href={j.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 self-center text-xs underline">ver <ExternalLink className="h-3 w-3" /></a>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
