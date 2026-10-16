import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clapperboard, Download, ImagePlus, Loader2, RotateCcw, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useInvalidate, useTable } from "../lib/hooks";
import type { AiVideo, AiVideoProvider } from "../lib/types";
import ProductPicker, { type LinkedProduct } from "../components/ProductPicker";
import { EmptyState, PageHeader, Panel, relativeTime, StatusDot } from "../components/bits";

const PROVIDERS: { id: AiVideoProvider; label: string; secrets: string }[] = [
  { id: "higgsfield", label: "Higgsfield", secrets: "HIGGSFIELD_API_KEY e HIGGSFIELD_API_SECRET" },
  { id: "kling", label: "Kling", secrets: "KLING_ACCESS_KEY e KLING_SECRET_KEY" },
];

/** Sugestões de modelo; o campo aceita qualquer um (copie o nome da página da API do provedor). */
const MODELS: Record<AiVideoProvider, { id: string; label: string }[]> = {
  higgsfield: [
    { id: "kling-video/v2.5-turbo/pro/image-to-video", label: "Kling 2.5 Turbo Pro · foto → vídeo" },
    { id: "kling-video/v2.5-turbo/standard/image-to-video", label: "Kling 2.5 Turbo · foto → vídeo" },
    { id: "kling-video/v2.5-turbo/pro/text-to-video", label: "Kling 2.5 Turbo Pro · texto → vídeo" },
    { id: "minimax/hailuo-2.3/standard/image-to-video", label: "Hailuo 2.3 · foto → vídeo" },
    { id: "minimax/hailuo-2.3/standard/text-to-video", label: "Hailuo 2.3 · texto → vídeo" },
  ],
  kling: [
    { id: "kling-v2-5-turbo", label: "Kling 2.5 Turbo" },
    { id: "kling-v2-1-master", label: "Kling 2.1 Master" },
    { id: "kling-v2-1", label: "Kling 2.1" },
  ],
};

const ASPECTS = [
  { id: "9:16", label: "9:16 Reels/TikTok" },
  { id: "1:1", label: "1:1 Feed" },
  { id: "16:9", label: "16:9 Horizontal" },
];

const PROVIDER_LABEL: Record<AiVideoProvider, string> = { higgsfield: "Higgsfield", kling: "Kling" };

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(`ai-video:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(`ai-video:${key}`, value);
    } catch {
      /* storage indisponível */
    }
  },
};

function Chips<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-8 rounded-md border px-3 text-[13px] transition-colors disabled:opacity-40",
            value === o.id ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-secondary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Videos() {
  const invalidate = useInvalidate();
  const providers = useQuery({
    queryKey: ["ai-video-providers"],
    queryFn: () => api.invoke<Record<AiVideoProvider, boolean>>("ai", { action: "ai_video_providers" }),
    staleTime: 5 * 60 * 1000,
  });
  const ready = providers.data ?? { higgsfield: false, kling: false };
  const anyReady = ready.higgsfield || ready.kling;

  const [provider, setProvider] = useState<AiVideoProvider>((store.get("provider") as AiVideoProvider) || "higgsfield");
  const [model, setModel] = useState(store.get(`model:${provider}`) || MODELS[provider][0].id);
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [product, setProduct] = useState<LinkedProduct | null>(null);
  const [duration, setDuration] = useState("5");
  const [aspect, setAspect] = useState("9:16");
  const [mode, setMode] = useState<"std" | "pro">("pro");
  const [negative, setNegative] = useState("");
  const [extra, setExtra] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Se só um provedor tem chave, já começa nele
  useEffect(() => {
    if (providers.data && !providers.data[provider]) {
      const other = PROVIDERS.find((p) => providers.data![p.id]);
      if (other) pickProvider(other.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers.data]);

  const pickProvider = (p: AiVideoProvider) => {
    setProvider(p);
    store.set("provider", p);
    setModel(store.get(`model:${p}`) || MODELS[p][0].id);
  };

  const { data: videos = [], isLoading } = useTable("ai_videos", undefined, { refetchInterval: 15000 });
  const processing = videos.some((v) => v.status === "processing");

  // Enquanto houver vídeo gerando, pergunta ao provedor a cada 20s (o cron também confere a cada minuto)
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(async () => {
      await api.invoke("ai", { action: "ai_video_check" }).catch(() => null);
      invalidate("ai_videos");
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      setImage(await api.upload(file, file.name));
      setProduct(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const photo = product?.images[0] ?? image;

  const generate = async () => {
    let extraObj: Record<string, unknown> | undefined;
    if (extra.trim()) {
      try {
        extraObj = JSON.parse(extra);
        if (!extraObj || typeof extraObj !== "object" || Array.isArray(extraObj)) throw new Error();
      } catch {
        return toast.error('Parâmetros extras: use JSON, ex.: {"cfg_scale": 0.5}');
      }
    }
    setSending(true);
    try {
      store.set(`model:${provider}`, model.trim());
      await api.invoke("ai", {
        action: "ai_video_create",
        provider,
        model: model.trim(),
        prompt,
        image_url: photo || null,
        duration: Number(duration) || 5,
        aspect_ratio: aspect,
        mode,
        negative_prompt: negative || undefined,
        extra: extraObj,
      });
      toast.success("Vídeo enviado. Fica pronto em alguns minutos.");
      invalidate("ai_videos");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const reuse = (v: AiVideo) => {
    pickProvider(v.provider);
    setModel(v.model);
    setPrompt(v.prompt);
    setImage(v.image_url);
    setProduct(null);
    const p = v.params ?? {};
    if (p.duration) setDuration(String(p.duration));
    if (typeof p.aspect_ratio === "string") setAspect(p.aspect_ratio);
    if (p.mode === "std" || p.mode === "pro") setMode(p.mode);
    setNegative(typeof p.negative_prompt === "string" ? p.negative_prompt : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div>
      <PageHeader title="Vídeos IA" description="Gere vídeos com o Higgsfield ou o Kling a partir de um texto ou da foto do produto e mande direto para um post." />

      {providers.isSuccess && !anyReady && (
        <div className="mb-6 rounded-lg border border-dashed bg-card px-4 py-3 text-sm">
          <p className="font-medium">Cadastre a chave da API para começar</p>
          <p className="mt-1 text-muted-foreground">
            No GitHub do projeto: Settings → Secrets and variables → Actions → New repository secret. Higgsfield: <code>HIGGSFIELD_API_KEY</code> e{" "}
            <code>HIGGSFIELD_API_SECRET</code>. Kling: <code>KLING_ACCESS_KEY</code> e <code>KLING_SECRET_KEY</code>. Depois rode a action “Supabase deploy”.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Panel title="Novo vídeo" bodyClassName="space-y-4">
          <div className="space-y-1.5">
            <Label>Provedor</Label>
            <Chips
              value={provider}
              onChange={pickProvider}
              options={PROVIDERS.map((p) => ({ id: p.id, label: ready[p.id] ? p.label : `${p.label} (sem chave)` }))}
            />
            {providers.isSuccess && !ready[provider] && (
              <p className="text-xs text-muted-foreground">Falta o secret {PROVIDERS.find((p) => p.id === provider)!.secrets} no GitHub.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Modelo</Label>
            <Input id="ai-model" list="ai-models" value={model} onChange={(e) => setModel(e.target.value)} className="font-mono text-[12px]" />
            <datalist id="ai-models">
              {MODELS[provider].map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </datalist>
            <p className="text-xs text-muted-foreground">
              {provider === "higgsfield"
                ? "Cole o nome do modelo que aparece na página da API de cada modelo no Higgsfield (ex.: Kling 3.0, Seedance)."
                : "Nome do modelo na API do Kling (model_name)."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Foto (opcional)</Label>
            {photo ? (
              <div className="flex items-center gap-3 rounded-md border p-2">
                <img src={photo} alt="" className="h-14 w-14 rounded object-cover" />
                <p className="min-w-0 flex-1 truncate text-[13px]">{product?.name ?? "Foto enviada"}</p>
                <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-secondary" onClick={() => { setImage(null); setProduct(null); }} aria-label="Remover foto">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <ProductPicker value={product} onChange={setProduct} />
                <Button type="button" variant="outline" size="sm" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                  Enviar foto do celular
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">Com foto, use um modelo “image-to-video”; sem foto, “text-to-video”.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-prompt">O que acontece no vídeo</Label>
            <Textarea
              id="ai-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex.: o pin gira devagar sobre veludo preto, luz de estúdio refletindo no esmalte vermelho e dourado, câmera aproximando"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ai-duration">Duração (s)</Label>
              <Input id="ai-duration" type="number" min={1} max={30} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            {provider === "kling" && (
              <div className="space-y-1.5">
                <Label>Qualidade</Label>
                <Chips<"std" | "pro"> value={mode} onChange={setMode} options={[{ id: "std", label: "Padrão" }, { id: "pro", label: "Pro" }]} />
              </div>
            )}
          </div>

          {!photo && (
            <div className="space-y-1.5">
              <Label>Formato</Label>
              <Chips value={aspect} onChange={setAspect} options={ASPECTS} />
            </div>
          )}

          <button type="button" className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAdvanced((a) => !a)}>
            {advanced ? "Esconder opções avançadas" : "Opções avançadas"}
          </button>
          {advanced && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ai-negative">Evitar (negative prompt)</Label>
                <Input id="ai-negative" value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="Ex.: texto, marca d'água, distorção" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-extra">Parâmetros extras (JSON)</Label>
                <Textarea id="ai-extra" rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} className="font-mono text-[12px]" placeholder='{"cfg_scale": 0.5, "resolution": "1080p"}' />
                <p className="text-xs text-muted-foreground">Vão como estão para a API do modelo. Use null para tirar um parâmetro padrão.</p>
              </div>
            </div>
          )}

          <Button className="w-full" disabled={sending || !ready[provider] || !model.trim() || (!prompt.trim() && !photo)} onClick={generate}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
            Gerar vídeo
          </Button>
          <p className="text-center text-xs text-muted-foreground">Cada vídeo gasta créditos no provedor (preço por segundo).</p>
        </Panel>

        <div className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : videos.length === 0 ? (
            <EmptyState icon={<Clapperboard />} title="Nenhum vídeo ainda">Os vídeos que você gerar aparecem aqui para assistir, baixar ou virar post.</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {videos.map((v) => <VideoCard key={v.id} video={v} onReuse={() => reuse(v)} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VideoCard({ video: v, onReuse }: { video: AiVideo; onReuse: () => void }) {
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<"post" | "delete" | null>(null);

  const post = async () => {
    setBusy("post");
    try {
      await api.invoke("ai", { action: "ai_video_post", id: v.id });
      toast.success("Post criado em Aprovações. Escreva a legenda e aprove.");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm("Apagar este vídeo?")) return;
    setBusy("delete");
    try {
      await api.invoke("ai", { action: "ai_video_delete", id: v.id });
      invalidate("ai_videos");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex aspect-[9/16] max-h-[420px] w-full items-center justify-center bg-muted">
        {v.status === "done" && v.video_url ? (
          <video src={v.video_url} controls playsInline preload="metadata" className="h-full w-full bg-black object-contain" />
        ) : v.status === "processing" ? (
          <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Gerando…
          </div>
        ) : (
          <p className="px-4 text-center text-xs text-muted-foreground">{v.file_deleted_at ? "Arquivo apagado na limpeza automática (30 dias)." : "Não foi gerado."}</p>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <StatusDot tone={v.status === "done" ? "success" : v.status === "failed" ? "danger" : "brand"}>
            {v.status === "done" ? "Pronto" : v.status === "failed" ? "Falhou" : "Gerando"}
          </StatusDot>
          <span className="text-[11px] text-muted-foreground">{relativeTime(v.created_at)}</span>
        </div>
        <p className="truncate font-mono text-[11px] text-muted-foreground" title={v.model}>{PROVIDER_LABEL[v.provider]} · {v.model}</p>
        {v.prompt && <p className="line-clamp-3 text-[13px]">{v.prompt}</p>}
        {v.error && <p className="text-xs text-danger">{v.error}</p>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {v.status === "done" && v.video_url && (
            <>
              {v.post_id ? (
                <Button asChild size="sm" variant="outline" className="h-8"><Link to="/studio/aprovacoes">Ver post</Link></Button>
              ) : (
                <Button size="sm" className="h-8" disabled={busy !== null} onClick={post}>
                  {busy === "post" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                  Criar post
                </Button>
              )}
              <Button asChild size="sm" variant="outline" className="h-8">
                <a href={v.video_url} download target="_blank" rel="noreferrer"><Download className="mr-1.5 h-3.5 w-3.5" />Baixar</a>
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="h-8" onClick={onReuse}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Refazer</Button>
          <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={busy !== null} onClick={remove} aria-label="Apagar">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
