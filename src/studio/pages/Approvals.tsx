import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, CalendarPlus, Check, Clapperboard, Download, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, isDemo } from "../lib/api";
import { useInvalidate, useSettings, useTable } from "../lib/hooks";
import { renderAndUploadSlides } from "../lib/publishing";
import type { Post } from "../lib/types";
import { EmptyState, formatDateTime, KIND_LABEL, PageHeader, Panel, PlatformIcon, relativeTime, SectionLabel, SlidePreview, StatusDot } from "../components/bits";
import { PostThumb } from "../components/PostThumb";
import { toastPublishResult } from "@/studio/lib/publish-toast";

/** Nome do arquivo baixado: título do post sem acentos/símbolos. */
const fileName = (post: Post) =>
  `${(post.title || "video").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "video"}.mp4`;

/** Aprova um post: renderiza os slides (se houver) e agenda no horário sugerido; sem horário futuro vira rascunho. */
async function approvePost(post: Post) {
  const slides = post.slides?.length && !post.media.length ? (post.kind === "carousel" ? post.slides : post.slides.slice(0, 1)) : null;
  const media = slides ? await renderAndUploadSlides(slides, post.design) : post.media;
  const future = !!post.scheduled_at && new Date(post.scheduled_at) > new Date();
  await api.update("posts", post.id, { media, status: future ? "scheduled" : "draft" });
  return future;
}

function ApprovalItem({ post, selected, onSelect }: { post: Post; selected: boolean; onSelect: (v: boolean) => void }) {
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<"approve" | "reject" | "publish" | null>(null);
  const slides = post.slides?.length && !post.media.length ? (post.kind === "carousel" ? post.slides : post.slides.slice(0, 1)) : null;

  const approve = async () => {
    setBusy("approve");
    try {
      const future = await approvePost(post);
      toast.success(future ? `Aprovado. Sai ${formatDateTime(post.scheduled_at)}.` : "Aprovado como rascunho. Defina um horário para agendar.");
      invalidate("posts");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setBusy("publish");
    try {
      const media = slides ? await renderAndUploadSlides(slides, post.design) : post.media;
      const saved = await api.update("posts", post.id, { media, status: "publishing", scheduled_at: new Date().toISOString() });
      const result = await api.publishNow(saved);
      toastPublishResult(result);
      invalidate("posts");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const video = post.media.find((m) => m.type === "video");
  const reject = async () => {
    setBusy("reject");
    await api.remove("posts", post.id).catch((e) => toast.error(e.message));
    toast("Sugestão descartada");
    invalidate("posts");
    setBusy(null);
  };

  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-[13px]">
        <Checkbox checked={selected} onCheckedChange={(v) => onSelect(Boolean(v))} aria-label="Selecionar para agendar em massa" />
        <span className="flex items-center gap-1.5 font-medium"><Bot className="h-3.5 w-3.5 text-muted-foreground" /> {post.title || KIND_LABEL[post.kind]}</span>
        <span className="text-muted-foreground">{KIND_LABEL[post.kind]}</span>
        <span className="flex gap-1.5">{post.platforms.map((p) => <PlatformIcon key={p} platform={p} />)}</span>
        <span className="tabular ml-auto text-xs text-muted-foreground">{formatDateTime(post.scheduled_at)}</span>
      </header>
      <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {slides ? (
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
            {slides.map((s, i) => <SlidePreview key={i} slide={s} index={i} total={slides.length} design={post.design} className="w-[200px] shrink-0 snap-start" />)}
          </div>
        ) : (
          <PostThumb post={post} className="max-w-[240px]" />
        )}
        <div className="flex min-w-0 flex-col gap-4">
          {post.notes && (
            <div>
              <SectionLabel className="mb-1">Por que este post</SectionLabel>
              <p className="text-[13px] text-foreground/80">{post.notes}</p>
            </div>
          )}
          <div>
            <SectionLabel className="mb-1">Legenda</SectionLabel>
            <p className="max-h-44 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed">{post.caption}</p>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={approve} disabled={!!busy}>
              {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={publish} disabled={!!busy}>
              {busy === "publish" ? <Loader2 className="animate-spin" /> : <Send />} Publicar agora
            </Button>
            <Button asChild size="sm" variant="outline"><Link to={`/studio/criar?id=${post.id}`}>Editar</Link></Button>
            {video && (
              <Button asChild size="sm" variant="outline">
                {/* ?download= faz o Supabase mandar o arquivo como download (o navegador salva em vez de abrir) */}
                <a href={`${video.url}${video.url.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName(post))}`} download><Download /> Baixar</a>
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={reject} disabled={!!busy}>Descartar</Button>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Piloto automático: toda semana o Studio cria posts com as datas comemorativas e os produtos da loja. */
type VideoPilot = { per_day: number; cycle: number; total: number; done: number; finished_at: string | null; last_run: string | null; pending: number; max_pending: number };

/** Vídeos diários do TikTok: N produtos do site por dia, sem repetir; para quando acabar e espera você recomeçar. */
function VideoAutopilot() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["video-autopilot"],
    queryFn: () => api.invoke<VideoPilot>("ai", { action: "video_autopilot_status" }),
    enabled: !isDemo,
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const call = async (action: string, extra: Record<string, unknown> = {}, ok?: string) => {
    setBusy(action);
    try {
      const r = await api.invoke<VideoPilot & { status?: VideoPilot; made?: number; skipped?: string }>("ai", { action, ...extra });
      qc.setQueryData(["video-autopilot"], r.status ?? r);
      qc.invalidateQueries({ queryKey: ["table"] });
      if (r.skipped) toast.message(`Nada criado: ${r.skipped}.`);
      else if (typeof r.made === "number") toast.success(`${r.made} vídeos na fila. Ficam prontos aos poucos e aparecem aqui.`);
      else if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  if (isDemo || error) return null;
  const pct = data && data.total ? Math.round((data.done / data.total) * 100) : 0;
  return (
    <Panel title="Vídeos diários do TikTok" description="Todo dia às 9h o Studio faz um vídeo de cada produto do site que ainda não ganhou vídeo, com as fotos do site e sem chamada para o site. Nunca repete; quando acabar, para e te avisa." bodyClassName="space-y-3 p-4">
      {isLoading || !data ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(data.per_day)} onValueChange={(v) => call("video_autopilot_save", { per_day: Number(v) }, Number(v) ? `${v} vídeos por dia` : "Vídeos diários desligados")}>
              <SelectTrigger className="h-9 w-[170px] text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0, 5, 10, 15, 20].map((n) => <SelectItem key={n} value={String(n)}>{n ? `${n} vídeos por dia` : "Desligado"}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!data.per_day || !!data.finished_at || busy !== null} onClick={() => call("video_autopilot_run")}>
              {busy === "video_autopilot_run" ? <Loader2 className="animate-spin" /> : <Clapperboard />} Fazer os de hoje agora
            </Button>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Ciclo {data.cycle}: {data.done} de {data.total} produtos com vídeo</span>
              <span className="tabular">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-foreground" style={{ width: `${pct}%` }} /></div>
          </div>
          {data.finished_at && (
            <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
              <span>Todos os produtos já ganharam vídeo neste ciclo. Parei de criar.</span>
              <Button size="sm" disabled={busy !== null} onClick={() => call("video_autopilot_restart", {}, "Novo ciclo começado")}>
                {busy === "video_autopilot_restart" && <Loader2 className="animate-spin" />} Recomeçar
              </Button>
            </div>
          )}
          {data.pending >= data.max_pending && (
            <p className="text-xs text-destructive">{data.pending} vídeos esperando aprovação. Aprove (ou descarte) para o piloto continuar; assim o armazenamento grátis não lota.</p>
          )}
        </>
      )}
    </Panel>
  );
}

function Autopilot() {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: videos = [] } = useTable("product_videos", { limit: 20 }, { refetchInterval: 30000 });
  const [busy, setBusy] = useState(false);
  const enabled = settings?.autopilot_enabled ?? true;
  const perWeek = settings?.autopilot_per_week ?? 4;
  const rendering = videos.filter((v) => v.brief?.idea_key && ["queued", "rendering", "rendered"].includes(v.status));

  const save = async (patch: { autopilot_enabled?: boolean; autopilot_per_week?: number }) => {
    try {
      await api.saveSettings(patch);
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const createNow = async () => {
    setBusy(true);
    try {
      const r = await api.invoke<{ created: { format: string }[] }>("ai", { action: "content_ideas", count: perWeek });
      qc.invalidateQueries({ queryKey: ["table", "posts"] });
      qc.invalidateQueries({ queryKey: ["table", "product_videos"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      const v = r.created.filter((c) => c.format === "video").length;
      const c = r.created.length - v;
      toast.success(r.created.length
        ? `${c} carrossel(éis) aqui embaixo${v ? ` e ${v} vídeo(s) sendo gerado(s); chegam aqui quando ficarem prontos` : ""}.`
        : "Nenhuma ideia nova para os próximos dias.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Piloto automático" bodyClassName="p-0">
      <label htmlFor="autopilot" className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <span>
          <span className="block text-[13px] font-medium">Criar posts sozinho toda semana</span>
          <span className="block text-xs text-muted-foreground">
            Olha as datas comemorativas e campanhas dos próximos dias (Outubro Rosa, Dia do Médico, Natal…), os seus produtos e o que o seu
            público curte, e cria carrosséis e vídeos com os pins do tema. Tudo chega aqui para você aprovar.
            {settings?.autopilot_last_run && !settings.autopilot_error && Date.now() - new Date(settings.autopilot_last_run).getTime() < 6 * 86400_000
              ? ` Última vez: ${relativeTime(settings.autopilot_last_run)}.`
              : ""}
          </span>
          {settings?.autopilot_error && (
            <span className="mt-1 block text-xs text-danger">A última rodada falhou ({settings.autopilot_error}). Tenta de novo em 1 hora.</span>
          )}
        </span>
        <Switch id="autopilot" checked={enabled} onCheckedChange={(v) => save({ autopilot_enabled: v })} />
      </label>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Select value={String(perWeek)} onValueChange={(v) => save({ autopilot_per_week: Number(v) })}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2, 3, 4, 5, 6, 7].map((n) => <SelectItem key={n} value={String(n)}>{n} posts por semana</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8" onClick={createNow} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {busy ? "Criando (até 1 minuto)" : "Criar ideias agora"}
        </Button>
      </div>
      {rendering.length > 0 && (
        <div className="divide-y border-t">
          {rendering.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-2 text-xs">
              <Clapperboard className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{String(v.brief.theme ?? "Vídeo")}: {v.name}</span>
              <StatusDot tone="brand">Gerando o vídeo</StatusDot>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function Approvals() {
  const navigate = useNavigate();
  const { data: posts = [] } = useTable("posts");
  const pending = posts.filter((p) => p.status === "pending_approval").sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = selected.filter((id) => pending.some((p) => p.id === id));
  const toggle = (id: string, on: boolean) => setSelected((cur) => (on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)));
  const invalidate = useInvalidate();
  const [approving, setApproving] = useState<number | null>(null);
  const approveSelected = async () => {
    const list = pending.filter((p) => chosen.includes(p.id));
    let ok = 0;
    let drafts = 0;
    setApproving(0);
    for (const p of list) {
      try {
        if (!(await approvePost(p))) drafts++;
        ok++;
      } catch (e) {
        toast.error(`${p.title || "Post"}: ${(e as Error).message}`);
      }
      setApproving(ok);
    }
    setApproving(null);
    setSelected([]);
    invalidate("posts");
    toast.success(`${ok} aprovado${ok === 1 ? "" : "s"}${drafts ? ` (${drafts} sem horário futuro viraram rascunho)` : ""}.`);
  };

  return (
    <div>
      <PageHeader
        title="Aprovações"
        description="Posts que o Studio preparou. Aprove no horário sugerido, publique agora ou selecione vários para aprovar de uma vez ou escolher os dias."
        actions={pending.length > 0 ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setSelected(chosen.length === pending.length ? [] : pending.map((p) => p.id))}>
              {chosen.length === pending.length ? "Limpar seleção" : "Selecionar todos"}
            </Button>
            <Button size="sm" disabled={!chosen.length || approving !== null} onClick={approveSelected}>
              {approving !== null ? <Loader2 className="animate-spin" /> : <Check />}
              {approving !== null ? ` Aprovando ${approving}/${chosen.length}` : ` Aprovar${chosen.length ? ` (${chosen.length})` : ""}`}
            </Button>
            <Button size="sm" variant="outline" disabled={!chosen.length || approving !== null} onClick={() => navigate(`/studio/em-massa?posts=${chosen.join(",")}`)}>
              <CalendarPlus /> Escolher dias
            </Button>
          </>
        ) : undefined}
      />
      <div className="space-y-4">
        <Autopilot />
        <VideoAutopilot />
        {pending.length === 0 ? (
          <EmptyState icon={<Bot />} title="Nenhum post esperando aprovação">
            Clique em “Criar ideias agora” ou peça ao Claude algo como “crie 3 carrosséis para esta semana”. Eles aparecem aqui.
          </EmptyState>
        ) : (
          pending.map((p) => <ApprovalItem key={p.id} post={p} selected={chosen.includes(p.id)} onSelect={(v) => toggle(p.id, v)} />)
        )}
      </div>
    </div>
  );
}
