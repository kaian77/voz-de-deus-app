import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Check, Copy, Download, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "../lib/api";
import { useInvalidate, useSettings, useTable } from "../lib/hooks";
import type { QuizEpisode } from "../lib/types";
import { EmptyState, PageHeader, Panel, relativeTime } from "../components/bits";

const BIO = "Todo dia um quiz da Bíblia 📖 Quantas você acerta? Comente sua nota 👇🙏";
const copy = (text: string, what = "Copiado") => navigator.clipboard.writeText(text).then(() => toast.success(what));
// o storage do Supabase entrega o arquivo para baixar com ?download=<nome>
const downloadUrl = (e: QuizEpisode) => `${e.video_url}?download=desafio-da-biblia-${e.number}.mp4`;

/** Desafio da Bíblia: a IA cria os episódios e o workflow faz os vídeos; aqui o dono baixa e copia a legenda. */
export default function Quiz() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: episodes = [] } = useTable("quiz_episodes", { order: "number", limit: 200 }, { refetchInterval: 20000 });
  const [busy, setBusy] = useState(false);
  const [showPosted, setShowPosted] = useState(false);
  const autopilot = settings?.quiz_autopilot ?? true;
  const pending = episodes.filter((e) => e.status !== "posted").sort((a, b) => a.number - b.number);
  const posted = episodes.filter((e) => e.status === "posted");

  const request = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const r = await api.invoke<{ dispatched: boolean }>("ai", { action: "quiz_request", ...body });
      toast.success(r.dispatched || !body.count ? ok : `${ok} (sai na próxima rodada, às 6h)`);
      qc.invalidateQueries({ queryKey: ["settings"] });
      invalidate("quiz_episodes");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const markPosted = async (e: QuizEpisode) => {
    await api.update("quiz_episodes", e.id, { status: "posted", posted_at: new Date().toISOString() });
    invalidate("quiz_episodes");
    toast.success(`#${e.number} marcado como postado${autopilot ? ": o piloto já prepara outro" : ""}`);
    if (autopilot) api.invoke("ai", { action: "quiz_request", run: true }).catch(() => undefined);
  };
  const retry = async (e: QuizEpisode) => {
    await api.update("quiz_episodes", e.id, { status: "queued", error: null });
    invalidate("quiz_episodes");
    await request({ run: true }, "Refazendo o vídeo");
  };

  return (
    <div>
      <PageHeader
        title="Desafio da Bíblia"
        description="Quiz bíblico em vídeo para a página no Facebook e no Kwai. A IA cria as perguntas (conferidas com o versículo) e faz o vídeo; você baixa, copia a legenda e posta."
        actions={<Button disabled={busy} onClick={() => request({ count: 3 }, "Fazendo 3 episódios: ficam prontos em ~20 min")}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}Fazer mais 3 agora
        </Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Piloto automático" description="Todo dia às 6h deixa vídeos novos prontos, com temas diferentes, para você não ficar sem.">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Manter {settings?.quiz_buffer ?? 3} vídeos prontos para postar</span>
            <Switch checked={autopilot} disabled={busy} onCheckedChange={(v) => request({ autopilot: v }, v ? "Piloto ligado" : "Piloto desligado")} />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">Toque em "Já postei" depois de postar: o vídeo sai daqui (o arquivo é apagado no dia seguinte) e o piloto faz outro.</p>
        </Panel>
        <Panel title="Página (Facebook e Kwai)" description="Nome: Desafio da Bíblia">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild><a href="/desafio-da-biblia/foto-perfil.png" download><Download className="mr-1.5 h-4 w-4" />Foto de perfil</a></Button>
            <Button size="sm" variant="outline" asChild><a href="/desafio-da-biblia/capa-facebook.png" download><Download className="mr-1.5 h-4 w-4" />Capa do Facebook</a></Button>
            <Button size="sm" variant="outline" onClick={() => copy(BIO, "Bio copiada")}><Copy className="mr-1.5 h-4 w-4" />Copiar bio</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Poste 1 por dia, de preferência entre 19h e 21h.</p>
        </Panel>
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold">Para postar</h2>
      {!pending.length ? (
        <EmptyState icon={<BookOpen className="h-5 w-5" />} title="Nenhum vídeo esperando">Toque em "Fazer mais 3 agora".</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pending.map((e) => <EpisodeCard key={e.id} e={e} onPosted={() => markPosted(e)} onRetry={() => retry(e)} />)}
        </div>
      )}

      {posted.length > 0 && (
        <div className="mt-6">
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setShowPosted(!showPosted)}>
            {showPosted ? "Esconder os já postados" : `Ver os já postados (${posted.length})`}
          </button>
          {showPosted && (
            <ul className="mt-2 divide-y rounded-lg border bg-card text-sm">
              {posted.sort((a, b) => b.number - a.number).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="truncate">#{e.number}{e.theme ? ` · ${e.theme}` : ""}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{e.posted_at ? relativeTime(e.posted_at) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EpisodeCard({ e, onPosted, onRetry }: { e: QuizEpisode; onPosted: () => void; onRetry: () => void }) {
  const ready = e.status === "ready" && !!e.video_url;
  return (
    <div className="flex flex-col rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-semibold">#{e.number}{e.theme ? ` · ${e.theme}` : ""}</p>
        {e.duration && <span className="shrink-0 text-xs text-muted-foreground">{Math.floor(e.duration / 60)}:{String(Math.round(e.duration % 60)).padStart(2, "0")}</span>}
      </div>
      {ready ? (
        <video src={e.video_url!} controls preload="metadata" playsInline className="aspect-[9/16] w-full rounded-md bg-black object-contain" />
      ) : (
        <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-md bg-muted p-4 text-center text-sm text-muted-foreground">
          {e.status === "failed" ? (
            <>
              <p>O vídeo falhou{e.error ? `: ${e.error.slice(0, 140)}` : ""}</p>
              <Button size="sm" variant="outline" onClick={onRetry}><RotateCcw className="mr-1.5 h-4 w-4" />Tentar de novo</Button>
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <p>{e.status === "rendering" ? "Fazendo o vídeo…" : "Na fila (sai em alguns minutos)"}</p>
            </>
          )}
        </div>
      )}
      {ready && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" asChild><a href={downloadUrl(e)} download><Download className="mr-1.5 h-4 w-4" />Baixar vídeo</a></Button>
          <Button size="sm" variant="outline" onClick={() => copy(e.caption ?? "", "Legenda copiada: cole no Facebook e no Kwai")}><Copy className="mr-1.5 h-4 w-4" />Copiar legenda</Button>
          <Button size="sm" variant="ghost" className="col-span-2" onClick={onPosted}><Check className="mr-1.5 h-4 w-4" />Já postei</Button>
        </div>
      )}
    </div>
  );
}
