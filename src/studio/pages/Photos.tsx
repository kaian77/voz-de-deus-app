import { useState } from "react";
import { toast } from "sonner";
import { Download, ImagePlus, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../lib/api";
import { useInvalidate, useTable } from "../lib/hooks";
import type { PhotoJob, PhotoResult } from "../lib/types";
import { EmptyState, PageHeader, Panel, relativeTime } from "../components/bits";

type Picked = { file: File; preview: string; name: string };

const STATUS: Record<PhotoJob["status"], string> = {
  queued: "Na fila",
  processing: "Fazendo as fotos…",
  ready: "Pronto",
  failed: "Deu erro",
};

// o storage do Supabase entrega o arquivo para baixar com ?download=<nome>
const dl = (url: string, name: string) => `${url}?download=${encodeURIComponent(name)}`;
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "produto";

/** Fotos de produto: sobe as fotos, o Studio recorta cada produto (sem redesenhar), separa prata/dourado e faz
 *  a foto de fundo branco e a do tema. */
export default function Photos() {
  const invalidate = useInvalidate();
  const { data: jobs = [] } = useTable("photo_jobs", { order: "created_at", ascending: false, limit: 30 }, { refetchInterval: 15000 });
  const [picked, setPicked] = useState<Picked[]>([]);
  const [theme, setTheme] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const pick = (files: FileList | null) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    setPicked((cur) => [...cur, ...list.map((file) => ({ file, preview: URL.createObjectURL(file), name: "" }))].slice(0, 60));
  };
  const setName = (i: number, name: string) => setPicked((cur) => cur.map((p, j) => (j === i ? { ...p, name } : p)));

  const send = async () => {
    if (!picked.length) return;
    try {
      const urls: string[] = [];
      for (const [i, p] of picked.entries()) {
        setBusy(`Enviando ${i + 1}/${picked.length}`);
        urls.push(await api.upload(p.file, p.file.name || `foto-${i + 1}.jpg`));
      }
      setBusy("Começando");
      const r = await api.invoke<{ dispatched: boolean }>("ai", { action: "photos_run", urls, names: picked.map((p) => p.name), theme });
      toast.success(r.dispatched ? "Fazendo as fotos: ficam prontas em uns 5 minutos" : "Lote na fila");
      picked.forEach((p) => URL.revokeObjectURL(p.preview));
      setPicked([]);
      invalidate("photo_jobs");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Fotos de produto"
        description="Suba as fotos e escreva o tema. O Studio recorta cada produto sem redesenhar (fica igual à foto), separa prata e dourado quando vêm juntos e faz duas fotos de cada: fundo branco e fundo do tema."
      />
      <div className="space-y-4">
        <Panel title="Novo lote" bodyClassName="space-y-4 p-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground hover:bg-muted/40">
            <Upload className="h-5 w-5" />
            <span className="font-medium text-foreground">Escolher fotos</span>
            <span>Quantas quiser. Foto com 2 produtos (prata e dourado) vira 2 produtos.</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          </label>
          {picked.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {picked.map((p, i) => (
                <div key={p.preview} className="space-y-1.5">
                  <div className="relative">
                    <img src={p.preview} alt="" className="aspect-square w-full rounded-md border object-cover" />
                    <button className="absolute right-1 top-1 rounded bg-background/90 p-1" aria-label="Tirar"
                      onClick={() => setPicked((cur) => cur.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <Input value={p.name} onChange={(e) => setName(i, e.target.value)} placeholder="Nome em cima (opcional)" className="h-8 text-xs" />
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Tema do fundo</p>
            <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Ex.: zen, flores de cerejeira, lótus, água calma ao amanhecer" />
          </div>
          <Button disabled={!picked.length || !!busy} onClick={send}>
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} {busy ?? `Fazer as fotos${picked.length ? ` (${picked.length})` : ""}`}
          </Button>
        </Panel>

        {jobs.length === 0 ? (
          <EmptyState icon={<ImagePlus />} title="Nenhum lote ainda">Escolha as fotos acima e toque em “Fazer as fotos”.</EmptyState>
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: PhotoJob }) {
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const working = job.status === "queued" || job.status === "processing";

  const redo = async () => {
    setBusy(true);
    try {
      await api.invoke("ai", { action: "photos_run", id: job.id });
      toast.success("Refazendo com outro fundo");
      invalidate("photo_jobs");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm("Apagar este lote da lista?")) return;
    await api.remove("photo_jobs", job.id).catch((e) => toast.error(e.message));
    invalidate("photo_jobs");
  };
  // o recorte acerta a cor quase sempre; se errar, um toque troca prata ↔ dourado
  const flip = async (r: PhotoResult) => {
    const results = job.results.map((x) => (x === r ? { ...x, color: x.color === "prata" ? "dourado" : "prata" } : x)) as PhotoResult[];
    await api.update("photo_jobs", job.id, { results }).catch((e) => toast.error(e.message));
    invalidate("photo_jobs");
  };

  return (
    <Panel
      title={job.theme || "Sem tema"}
      description={`${job.source_urls.length} foto${job.source_urls.length === 1 ? "" : "s"} · ${STATUS[job.status]} · ${relativeTime(job.created_at)}`}
      action={
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={busy || working} onClick={redo}>
            {busy || working ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refazer fundo
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={remove} aria-label="Apagar"><Trash2 /></Button>
        </div>
      }
      bodyClassName="p-4"
    >
      {job.error && job.status !== "ready" && <p className="mb-3 text-xs text-destructive">{job.error}</p>}
      {working ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Recortando e montando as fotos (uns 5 minutos)…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {job.results.map((r, i) => {
            const base = slug(`${r.name || "produto"}-${i + 1}-${r.color}`);
            return (
              <div key={`${r.source}-${r.index}`} className="space-y-2 rounded-md border p-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.name || `Produto ${i + 1}`}</span>
                  <button onClick={() => flip(r)} title="Tocar para trocar"
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.color === "dourado" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                    {r.color === "dourado" ? "Dourado" : "Prata"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([["Fundo branco", r.white_url, "branco"], ["Tema", r.theme_url, "tema"]] as const).map(([label, url, tag]) => (
                    <a key={tag} href={dl(url, `${base}-${tag}.jpg`)} className="group block space-y-1">
                      <img src={url} alt={label} loading="lazy" className="aspect-square w-full rounded border object-cover" />
                      <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground"><Download className="h-3 w-3" /> {label}</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
