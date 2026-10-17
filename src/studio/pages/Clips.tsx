import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Pencil, Play, Plus, Scissors, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useInvalidate, useTable } from "../lib/hooks";
import type { ClipSource, YtVideo } from "../lib/types";
import { EmptyState, formatDateTime, PageHeader, Panel, relativeTime } from "../components/bits";

const SOURCE_STATUS: Record<ClipSource["status"], { label: string; tone: string }> = {
  queued: { label: "Na fila", tone: "text-amber-600" },
  processing: { label: "Baixando, transcrevendo e cortando…", tone: "text-amber-600" },
  done: { label: "Pronto (revisa episódios novos a cada 12 h)", tone: "text-emerald-600" },
  failed: { label: "Falhou", tone: "text-danger" },
};

const EMPTY = { campaign: "", url: "", credit: "", hashtags: "", rules: "", clips_wanted: "6", per_day: "3" };

const shortUrl = (v: YtVideo) => `https://youtube.com/shorts/${v.youtube_id}`;

export default function Clips() {
  const invalidate = useInvalidate();
  const { data: channels = [] } = useTable("yt_channels", { order: "created_at", ascending: true });
  const { data: sources = [] } = useTable("clip_sources", { order: "created_at" }, { refetchInterval: 20000 });
  const { data: videos = [] } = useTable("yt_videos", { order: "publish_at", limit: 100, eq: { kind: "clip" } }, { refetchInterval: 20000 });
  const [channelId, setChannelId] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [paste, setPaste] = useState("");
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [watching, setWatching] = useState<YtVideo | null>(null);
  const byId = new Map(channels.map((c) => [c.id, c]));
  const clipChannels = channels.filter((c) => c.mode === "clips");
  const chosen = channelId || clipChannels[0]?.id || "";
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const fill = async () => {
    if (!paste.trim()) return toast.error("Cole o texto da campanha, o link do briefing ou da pasta");
    setReading(true);
    try {
      const r = await api.invoke<{ campaign: string; credit: string; hashtags: string; rules: string; url: string; only_link?: boolean }>("ai", { action: "clips_parse_campaign", text: paste });
      setForm((f) => ({
        ...f, campaign: r.campaign || f.campaign, credit: r.credit || f.credit, hashtags: r.hashtags || f.hashtags,
        rules: r.rules || f.rules, url: r.url || f.url,
      }));
      if (r.only_link) toast.message("Peguei o link da pasta. Para o resto, cole também o texto das regras ou o link do briefing (Google Docs).");
      else toast.success(r.url ? "Preenchido! Confira e clique em Começar." : "Preenchido! Falta o link da pasta do Drive.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReading(false);
    }
  };

  const edit = (s: ClipSource) => {
    setEditing(s.id);
    setChannelId(s.channel_ref);
    setForm({
      campaign: s.campaign, url: s.url, credit: s.credit ?? "", hashtags: s.hashtags ?? "", rules: s.rules ?? "",
      clips_wanted: String(s.clips_wanted), per_day: String(s.per_day),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const add = async () => {
    if (!chosen) return toast.error("Escolha o canal de cortes");
    if (!form.url.trim()) return toast.error("Cole o link da pasta do Drive da campanha");
    setSending(true);
    try {
      const r = await api.invoke<{ started: boolean }>("ai", {
        action: "clips_add_source", id: editing ?? undefined, channel_id: chosen, ...form, clips_wanted: Number(form.clips_wanted), per_day: Number(form.per_day),
      });
      toast.success(editing ? "Campanha salva: os próximos cortes já seguem os dados novos." : r.started ? "Começou! Baixar e transcrever o episódio leva de 30 min a 2 h." : "Na fila: roda em até 6 h.");
      setForm(EMPTY);
      setPaste("");
      setEditing(null);
      invalidate("clip_sources");
      invalidate("yt_channels");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const copy = (v: YtVideo) => navigator.clipboard.writeText(shortUrl(v)).then(() => toast.success("Link copiado — cole em \"Enviar clipe\" na campanha"));

  return (
    <div>
      <PageHeader
        title="Cortes"
        description="Cortes de vídeos liberados (campanhas de clipping, Creative Commons ou criadores que autorizaram): a IA acha os melhores momentos, corta na vertical seguindo o rosto, coloca título, logo e legendas e posta no canal."
      />

      <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Panel title={editing ? "Editar campanha" : "Nova campanha"} description="Cole a pasta do Google Drive com os vídeos da campanha (o logo da pasta entra em todo corte). Tudo fica salvo na campanha.">
          <div className="space-y-3">
            {!editing && (
              <div className="space-y-1.5 rounded-md border border-dashed p-3">
                <Label className="text-xs text-muted-foreground">Atalho: cole aqui o que a campanha mostra (texto da página no Whop, link do briefing no Google Docs, link da pasta)</Label>
                <Textarea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Cole tudo de uma vez: regras, hashtags, links…" />
                <Button variant="outline" className="w-full" onClick={fill} disabled={reading}>
                  {reading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}Preencher com IA
                </Button>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Canal</Label>
              <Select value={chosen} onValueChange={setChannelId}>
                <SelectTrigger><SelectValue placeholder="Escolha o canal" /></SelectTrigger>
                <SelectContent>
                  {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.title ?? c.channel_id}{c.mode === "clips" ? " (cortes)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              {chosen && byId.get(chosen)?.mode !== "clips" && (
                <p className="text-xs text-amber-600">Este canal vira canal de cortes (o piloto de vídeos com IA desliga nele).</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome da campanha</Label>
              <Input value={form.campaign} onChange={(e) => set("campaign", e.target.value)} placeholder="Stream House LA" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Link da pasta (ou do vídeo) no Google Drive</Label>
              <Input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Crédito</Label>
                <Input value={form.credit} onChange={(e) => set("credit", e.target.value)} placeholder="Stream House LA — CWETV" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Hashtags obrigatórias</Label>
                <Input value={form.hashtags} onChange={(e) => set("hashtags", e.target.value)} placeholder="#streamhousela #cwetv" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Regras e o que a marca quer (cole o briefing)</Label>
              <Textarea rows={4} value={form.rules} onChange={(e) => set("rules", e.target.value)} placeholder="Funny, dramatic, relatable moments… each clip must have a title…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Cortes por episódio</Label>
                <Select value={form.clips_wanted} onValueChange={(v) => set("clips_wanted", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["3", "4", "6", "8", "10", "12"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Posts por dia</Label>
                <Select value={form.per_day} onValueChange={(v) => set("per_day", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["1", "2", "3", "4", "5", "6"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={add} disabled={sending}>
              {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}{editing ? "Salvar campanha" : "Começar os cortes"}
            </Button>
            {editing && <Button variant="ghost" className="w-full" onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancelar</Button>}
            <p className="text-xs text-muted-foreground">Só use conteúdo que você tem permissão para cortar. A pasta precisa estar como "qualquer pessoa com o link".</p>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Campanhas" bodyClassName="p-0">
            {sources.length === 0 ? (
              <p className="p-4 text-[13px] text-muted-foreground">Nenhuma campanha ainda.</p>
            ) : (
              <ul className="divide-y">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{s.campaign} <span className="font-normal text-muted-foreground">· {byId.get(s.channel_ref)?.title ?? "canal"}</span></p>
                    {s.hashtags && <p className="truncate text-xs text-muted-foreground">{s.hashtags}</p>}
                    <p className={cn("flex items-center gap-1 text-xs", SOURCE_STATUS[s.status].tone)}>
                      {(s.status === "queued" || s.status === "processing") && <Loader2 className="h-3 w-3 animate-spin" />}
                      {s.status === "failed" ? s.error ?? "Falhou" : SOURCE_STATUS[s.status].label} · {s.clips_made} cortes · {relativeTime(s.updated_at)}
                    </p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => edit(s)}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {videos.length === 0 ? (
            <EmptyState icon={<Scissors className="h-5 w-5" />} title="Nenhum corte ainda">Os cortes aparecem aqui com o link para enviar na campanha.</EmptyState>
          ) : (
            <Panel title="Cortes" description="Depois de publicado, copie o link e envie na campanha (botão &quot;Enviar clipe&quot;)." bodyClassName="p-0">
              <div className="divide-y">
                {videos.map((v) => (
                  <div key={v.id} className="flex gap-3 px-4 py-3">
                    <button type="button" onClick={() => v.preview_url && setWatching(v)} className="relative w-16 shrink-0" aria-label="Assistir">
                      {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" className="aspect-[9/16] w-full rounded object-cover" /> : <div className="aspect-[9/16] rounded bg-secondary" />}
                      {v.preview_url && <span className="absolute inset-0 grid place-items-center rounded bg-black/25 text-white"><Play className="h-5 w-5 fill-white" /></span>}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13px] font-medium">{v.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {byId.get(v.channel_ref)?.title} · {v.topic} · {v.duration_s ? `${Math.round(v.duration_s)}s` : ""}
                        {v.publish_at && ` · publica ${formatDateTime(v.publish_at)}`}
                      </p>
                      {v.youtube_id && (
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copy(v)}><Copy className="mr-1 h-3.5 w-3.5" />Copiar link</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                            <a href={`https://studio.youtube.com/video/${v.youtube_id}/edit`} target="_blank" rel="noreferrer">YouTube Studio <ExternalLink className="ml-1 h-3 w-3" /></a>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <Dialog open={!!watching} onOpenChange={(o) => !o && setWatching(null)}>
        <DialogContent className="max-w-sm p-3">
          <DialogTitle className="pr-6 text-sm">{watching?.title}</DialogTitle>
          {watching?.preview_url && <video key={watching.id} src={watching.preview_url} controls autoPlay playsInline className="mx-auto max-h-[75vh] w-full rounded bg-black" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
