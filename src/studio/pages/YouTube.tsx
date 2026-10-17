import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, Loader2, Play, Plus, Search, Sparkles, TrendingUp, Youtube } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useInvalidate, useTable } from "../lib/hooks";
import type { YtChannel, YtVideo } from "../lib/types";
import { Avatar, EmptyState, formatDateTime, PageHeader, Panel, relativeTime } from "../components/bits";

const VOICES: Record<YtChannel["language"], { id: string; label: string }[]> = {
  pt: [
    { id: "pt-BR-AntonioNeural", label: "Antônio (masculina, calorosa)" },
    { id: "pt-BR-FranciscaNeural", label: "Francisca (feminina, suave)" },
    { id: "pt-BR-ThalitaMultilingualNeural", label: "Thalita (feminina, jovem)" },
  ],
  en: [
    { id: "en-US-AndrewNeural", label: "Andrew (male, warm)" },
    { id: "en-US-ChristopherNeural", label: "Christopher (male, deep)" },
    { id: "en-US-AvaNeural", label: "Ava (female, soft)" },
  ],
};
const NICHE = { pt: "Curiosidades da Bíblia", en: "Bible curiosities" };

const STATUS: Record<YtVideo["status"], { label: string; tone: string }> = {
  draft: { label: "Tema escolhido", tone: "text-muted-foreground" },
  scripting: { label: "Escrevendo roteiro…", tone: "text-amber-600" },
  queued: { label: "Na fila do vídeo", tone: "text-amber-600" },
  rendering: { label: "Montando o vídeo…", tone: "text-amber-600" },
  uploaded: { label: "Enviado ao YouTube", tone: "text-emerald-600" },
  failed: { label: "Falhou", tone: "text-danger" },
};

function ChannelCard({ ch, onChanged }: { ch: YtChannel; onChanged: () => void }) {
  const [form, setForm] = useState(ch);
  const [busy, setBusy] = useState<string | null>(null);
  const [showTrends, setShowTrends] = useState(false);
  useEffect(() => setForm(ch), [ch]);
  const dirty = JSON.stringify([form.enabled, form.language, form.niche, form.shorts_per_day, form.long_per_week, form.voice]) !==
    JSON.stringify([ch.enabled, ch.language, ch.niche, ch.shorts_per_day, ch.long_per_week, ch.voice]);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run("save", () => api.update("yt_channels", ch.id, {
      enabled: form.enabled, language: form.language, niche: form.niche.trim() || NICHE[form.language],
      shorts_per_day: form.shorts_per_day, long_per_week: form.long_per_week, voice: form.voice,
    }), form.enabled ? "Salvo. O piloto planeja os vídeos de amanhã depois das 15h." : "Salvo");

  const setLanguage = (language: YtChannel["language"]) =>
    setForm((f) => ({
      ...f, language, voice: VOICES[language][0].id,
      niche: f.niche === NICHE[f.language] ? NICHE[language] : f.niche,
    }));

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Avatar name={ch.title ?? "Canal"} src={ch.thumbnail} className="h-6 w-6" />
          {ch.title ?? ch.channel_id}
          <span className="rounded border px-1.5 text-[10px] font-medium uppercase text-muted-foreground">{form.language === "en" ? "English" : "Português"}</span>
        </span>
      }
      action={
        <a href={`https://studio.youtube.com/channel/${ch.channel_id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          YouTube Studio <ExternalLink className="h-3 w-3" />
        </a>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:col-span-2">
          <span>
            <span className="block text-[13px] font-medium">Piloto automático</span>
            <span className="block text-xs text-muted-foreground">Todo dia escolhe os temas em alta, escreve, narra, anima e posta.</span>
          </span>
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
        </label>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Idioma do canal</Label>
          <Select value={form.language} onValueChange={(v) => setLanguage(v as YtChannel["language"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="pt">Português (Brasil)</SelectItem><SelectItem value="en">English (EUA)</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nicho</Label>
          <Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Shorts por dia</Label>
          <Select value={String(form.shorts_per_day)} onValueChange={(v) => setForm({ ...form, shorts_per_day: Number(v) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{[0, 1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Vídeos longos por semana</Label>
          <Select value={String(form.long_per_week)} onValueChange={(v) => setForm({ ...form, long_per_week: Number(v) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{[0, 1, 2, 3, 4, 5, 7].map((n) => <SelectItem key={n} value={String(n)}>{n === 7 ? "Todo dia" : n}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Voz da narração</Label>
          <Select value={form.voice} onValueChange={(v) => setForm({ ...form, voice: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{VOICES[form.language].map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {dirty && <Button className="mt-3 w-full" onClick={save} disabled={busy !== null}>{busy === "save" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salvar</Button>}
      {ch.error && <p className="mt-3 text-xs text-danger">{ch.error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null || dirty} onClick={() => run("short", () => api.invoke("ai", { action: "yt_generate_now", channel_id: ch.id, kind: "short" }), "Short a caminho: roteiro em ~1 min, vídeo em ~15 min")}>
          {busy === "short" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}Fazer um Short agora
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null || dirty} onClick={() => run("long", () => api.invoke("ai", { action: "yt_generate_now", channel_id: ch.id, kind: "long" }), "Vídeo longo a caminho: fica pronto em ~40 min")}>
          {busy === "long" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}Fazer um vídeo longo agora
        </Button>
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("trends", async () => { await api.invoke("ai", { action: "yt_research", channel_id: ch.id }); setShowTrends(true); }, "Pesquisa atualizada")}>
          {busy === "trends" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}Pesquisar em alta
        </Button>
      </div>

      {!!ch.trends?.length && (
        <div className="mt-4">
          <button type="button" className="flex items-center gap-1.5 text-xs font-medium" onClick={() => setShowTrends(!showTrends)}>
            <TrendingUp className="h-3.5 w-3.5" /> O que está dando audiência no nicho ({ch.trends.length}){ch.trends_at && ` · ${relativeTime(ch.trends_at)}`}
          </button>
          {showTrends && (
            <ul className="mt-2 divide-y rounded-md border text-xs">
              {ch.trends.slice(0, 12).map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                  <a href={`https://youtu.be/${t.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{t.title}</a>
                  <span className="shrink-0 text-muted-foreground">{t.kind === "short" ? "Short" : "Longo"} · {t.per_day.toLocaleString("pt-BR")}/dia</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}

export default function YouTubePage() {
  const [params, setParams] = useSearchParams();
  const invalidate = useInvalidate();
  const { data: channels = [], isLoading } = useTable("yt_channels", { order: "created_at", ascending: true });
  const { data: videos = [] } = useTable("yt_videos", { order: "publish_at", limit: 60 }, { refetchInterval: 15000 });
  const [connecting, setConnecting] = useState(false);
  const [watching, setWatching] = useState<YtVideo | null>(null);
  // Erro da conexão fica na tela (o toast some rápido e no celular passa despercebido)
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    const err = params.get("error");
    if (err) {
      toast.error(err);
      setConnectError(err);
    }
    if (params.get("connected")) toast.success("Canal conectado! Escolha o idioma e ligue o piloto automático.");
    if (err || params.get("connected")) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const { url } = await api.invoke<{ url: string }>("oauth-youtube?action=start");
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  };

  const byId = new Map(channels.map((c) => [c.id, c]));

  return (
    <div>
      <PageHeader
        title="Canal do YouTube"
        description="Curiosidades da Bíblia em animação: a IA pesquisa o que dá audiência, escreve, narra, anima, legenda, faz a capa e posta. Um canal por idioma."
        actions={<Button onClick={connect} disabled={connecting}>{connecting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Youtube className="mr-1.5 h-4 w-4" />}{channels.length ? "Conectar outro canal" : "Conectar canal"}</Button>}
      />

      {connectError && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-[13px]">
          <p className="font-medium text-danger">Não conectou: {connectError}</p>
          <button type="button" className="mt-1 text-xs text-muted-foreground hover:underline" onClick={() => setConnectError(null)}>Fechar</button>
        </div>
      )}

      {!isLoading && channels.length === 0 ? (
        <EmptyState icon={<Youtube className="h-5 w-5" />} title="Nenhum canal conectado">
          Conecte o canal em português e, se quiser, o canal em inglês (outra conta/canal do YouTube). Antes, os secrets GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET precisam estar no GitHub.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {channels.map((c) => <ChannelCard key={c.id} ch={c} onChanged={() => { invalidate("yt_channels"); invalidate("yt_videos"); }} />)}
        </div>
      )}

      {videos.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold">Vídeos</h2>
          <div className="divide-y rounded-lg border bg-card">
            {videos.map((v) => {
              const ch = byId.get(v.channel_ref);
              return (
                <div key={v.id} className="flex gap-3 px-4 py-3">
                  {v.preview_url ? (
                    <button type="button" onClick={() => setWatching(v)} className="group relative w-28 shrink-0" aria-label="Assistir">
                      <img src={v.thumbnail_url ?? ""} alt="" className="aspect-video w-full rounded bg-secondary object-cover" />
                      <span className="absolute inset-0 grid place-items-center rounded bg-black/30 text-white group-hover:bg-black/45"><Play className="h-6 w-6 fill-white" /></span>
                    </button>
                  ) : v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt="" className="aspect-video w-28 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="grid aspect-video w-28 shrink-0 place-items-center rounded bg-secondary text-[10px] text-muted-foreground">{v.kind === "short" ? "Short" : "Longo"}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-medium">{v.title ?? v.topic}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {v.kind === "short" ? "Short" : "Vídeo longo"} · {ch?.language === "en" ? "EN" : "PT"}
                      {v.publish_at && ` · ${v.status === "uploaded" ? "publica" : "previsto"} ${formatDateTime(v.publish_at)}`}
                      {v.duration_s ? ` · ${Math.round(v.duration_s)}s` : ""}
                    </p>
                    <p className={cn("mt-0.5 flex items-center gap-1 text-xs font-medium", STATUS[v.status].tone)}>
                      {["scripting", "queued", "rendering"].includes(v.status) && <Loader2 className="h-3 w-3 animate-spin" />}
                      {STATUS[v.status].label}
                      {v.preview_url && (
                        <button type="button" onClick={() => setWatching(v)} className="ml-2 inline-flex items-center gap-0.5 font-normal text-foreground hover:underline">
                          assistir <Play className="h-3 w-3" />
                        </button>
                      )}
                      {v.youtube_id && (
                        <a href={`https://studio.youtube.com/video/${v.youtube_id}/edit`} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 font-normal text-foreground hover:underline">
                          no YouTube <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                    {v.error && <p className="mt-0.5 text-xs text-muted-foreground">{v.error}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="mt-8 text-xs text-muted-foreground">
        Usa os Serviços de API do YouTube. Ao conectar um canal você concorda com os{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="underline">Termos de Serviço do YouTube</a> e com a{" "}
        <a href="/privacidade" className="underline">nossa Política de Privacidade</a> (que segue a{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline">Política de Privacidade do Google</a>). Revogue o acesso quando quiser em{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="underline">myaccount.google.com/permissions</a>.
      </p>

      <Dialog open={!!watching} onOpenChange={(o) => !o && setWatching(null)}>
        <DialogContent className="max-w-3xl p-3">
          <DialogTitle className="pr-6 text-sm">{watching?.title ?? watching?.topic}</DialogTitle>
          {watching?.preview_url && (
            <video
              key={watching.id}
              src={watching.preview_url}
              controls
              autoPlay
              playsInline
              className={cn("mx-auto w-full rounded bg-black", watching.kind === "short" ? "max-h-[75vh] max-w-[360px]" : "aspect-video")}
            />
          )}
          <p className="text-xs text-muted-foreground">Prévia em qualidade menor; no YouTube o vídeo está em alta qualidade. Para publicar, abra no YouTube Studio (no canal certo) e mude para Público.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
