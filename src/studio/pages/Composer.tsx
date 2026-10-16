import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Bookmark, CalendarPlus, Heart, Loader2, MessageCircle, Plus, Send, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { THEMES } from "../lib/carousel";
import { useTable } from "../lib/hooks";
import { renderAndUploadSlides } from "../lib/publishing";
import type { CarouselDesign, MediaItem, Platform, Post, PostKind, Slide, ThemeId } from "../lib/types";
import TikTokSettings, { fromApiOptions, TIKTOK_DEFAULTS, tiktokProblem, toApiOptions, useTikTokCreator, type TikTokOptions } from "../components/TikTokSettings";
import { Avatar, KIND_LABEL, PageHeader, Panel, PlatformIcon, SectionLabel, SlidePreview, StatusBadge, toLocalInput } from "../components/bits";
import { toastPublishResult } from "@/studio/lib/publish-toast";
import ProductPicker, { type LinkedProduct } from "../components/ProductPicker";
import { VideoBriefDialog, type VideoBrief } from "../components/VideoBrief";

const KINDS: { id: PostKind; hint: string }[] = [
  { id: "image", hint: "1 imagem · 4:5" },
  { id: "carousel", hint: "Até 10 slides" },
  { id: "reel", hint: "Vídeo 9:16" },
  { id: "story", hint: "Só Instagram" },
];

/** Controle segmentado simples, sem cara de "aba". */
function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-md border bg-secondary/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("h-7 rounded px-3 text-xs font-medium transition-colors", value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Mode = "upload" | "design";

export default function Composer() {
  const [params] = useSearchParams();
  const editId = params.get("id");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: posts } = useTable("posts");
  const { data: accounts } = useTable("social_accounts");
  const editing = useMemo(() => posts?.find((p) => p.id === editId), [posts, editId]);

  const [platforms, setPlatforms] = useState<Platform[]>(["instagram"]);
  const [kind, setKind] = useState<PostKind>("carousel");
  const [mode, setMode] = useState<Mode>("design");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [slides, setSlides] = useState<Slide[]>([{ title: "Seu título de capa aqui", body: "Arraste para o lado →" }]);
  const [design, setDesign] = useState<CarouselDesign>({ theme: "marca" });
  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aiOpen, setAiOpen] = useState<null | "caption" | "carousel">(null);
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState("6");
  const fileRef = useRef<HTMLInputElement>(null);
  const [ttOpts, setTtOpts] = useState<TikTokOptions>(TIKTOK_DEFAULTS);
  const [videoSeconds, setVideoSeconds] = useState<number>();
  const [product, setProduct] = useState<LinkedProduct | null>(null);
  const onTikTok = platforms.includes("tiktok") && kind !== "story";
  const ttCreator = useTikTokCreator(onTikTok);

  // Duração do vídeo (o TikTok limita por conta)
  useEffect(() => {
    setVideoSeconds(undefined);
    const v = media[0];
    if (v?.type !== "video") return;
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => setVideoSeconds(el.duration);
    el.src = v.url;
  }, [media]);

  useEffect(() => {
    if (!editing) return;
    setPlatforms(editing.platforms);
    setKind(editing.kind === "video" ? "reel" : editing.kind === "photos" ? "carousel" : editing.kind);
    setMedia(editing.media ?? []);
    if (editing.slides?.length) {
      setSlides(editing.slides);
      setMode(editing.media?.length ? "upload" : "design");
    } else setMode("upload");
    setDesign(editing.design ?? { theme: "marca" });
    setCaption(editing.caption);
    setTitle(editing.title ?? "");
    setWhen(toLocalInput(editing.scheduled_at));
    setTtOpts(fromApiOptions((editing.options as { tiktok?: Record<string, unknown> })?.tiktok));
  }, [editing]);

  useEffect(() => {
    const ig = accounts?.find((a) => a.platform === "instagram");
    if (ig?.username && !design.handle) setDesign((d) => ({ ...d, handle: `@${ig.username}` }));
  }, [accounts, design.handle]);

  const designable = kind === "carousel" || kind === "image" || kind === "story";
  const usingDesign = designable && mode === "design";
  const visibleSlides = kind === "carousel" ? slides : slides.slice(0, 1);

  // Foto do produto vinculado: na capa e no último slide (cartão abaixo do texto) e, no modo de arquivos, como imagem do post
  const withProduct = (list: Slide[], p: LinkedProduct | null, old: LinkedProduct | null) =>
    list.map((x, i) => {
      const own = x.product_image && old?.images.includes(x.product_image);
      const base = own ? { ...x, product_image: undefined } : x;
      return p?.images[0] && (i === 0 || (i === list.length - 1 && list.length > 1)) && (!x.product_image || own)
        ? { ...base, product_image: p.images[i === 0 ? 0 : Math.min(1, p.images.length - 1)] }
        : base;
    });

  const linkProduct = (p: LinkedProduct | null) => {
    const old = product;
    setProduct(p);
    setSlides((s) => withProduct(s, p, old));
    setMedia((m) => {
      const kept = m.filter((x) => !old?.images.includes(x.url));
      if (!p?.images.length || kind === "reel") return kept;
      const add = (kind === "carousel" ? p.images : p.images.slice(0, 1)).map((url) => ({ url, type: "image" as const }));
      return kind === "carousel" ? [...kept, ...add].slice(0, 10) : kept.length ? kept : add;
    });
    if (p && !title) setTitle(p.name);
  };

  const [videoAsk, setVideoAsk] = useState(false);
  const productVideo = async (brief: VideoBrief) => {
    if (!product) return;
    setBusy("video");
    try {
      await api.invoke("ai", { action: "store_product_video", name: product.name, images: product.images, url: product.url, description: product.description, topic: title || topic, ...brief });
      toast.success("Vídeo do produto na fila! Fica pronto em alguns minutos e aparece em Aprovações para você revisar.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const togglePlatform = (p: Platform) => {
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: MediaItem[] = [];
      for (const file of Array.from(files)) {
        added.push({ url: await api.upload(file, file.name), type: file.type.startsWith("video") ? "video" : "image" });
      }
      setMedia((m) => [...m, ...added]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const validate = (): string | null => {
    if (!platforms.length) return "Escolha pelo menos uma rede.";
    if (kind === "story" && platforms.includes("tiktok")) return "Story é só do Instagram — desmarque o TikTok.";
    if (!usingDesign && !media.length) return "Envie a mídia do post.";
    if (kind === "reel" && media[0]?.type !== "video") return "Reels precisa de um vídeo.";
    if (platforms.includes("tiktok") && kind !== "reel" && media.some((m) => m.type === "video")) return "No TikTok, fotos/carrossel aceitam só imagens.";
    if (usingDesign && visibleSlides.some((s) => !s.title.trim())) return "Todo slide precisa de um título.";
    if (onTikTok) return tiktokProblem(ttOpts, ttCreator.data, videoSeconds);
    return null;
  };

  const save = async (intent: "draft" | "schedule" | "publish") => {
    const problem = intent === "draft" ? null : validate();
    if (problem) return toast.error(problem);
    if (intent === "schedule" && !when) return toast.error("Escolha data e hora.");
    if (intent === "schedule" && new Date(when) < new Date()) return toast.error("Escolha um horário no futuro.");
    setBusy(intent);
    try {
      let finalMedia = media;
      if (usingDesign && intent !== "draft") {
        toast.info("Gerando as imagens do carrossel…");
        finalMedia = await renderAndUploadSlides(visibleSlides, design);
      }
      const row: Partial<Post> = {
        platforms,
        kind,
        media: usingDesign && intent === "draft" ? [] : finalMedia,
        slides: usingDesign ? visibleSlides : null,
        design: usingDesign ? design : null,
        caption,
        title: title || null,
        scheduled_at: when ? new Date(when).toISOString() : null,
        status: intent === "schedule" ? "scheduled" : intent === "publish" ? "publishing" : "draft",
        results: {},
        options: {
          ...(editing?.options ?? {}),
          ...(onTikTok ? { tiktok: toApiOptions(ttOpts) } : {}),
          // Produto vinculado: a automação do post manda o link dele no direct
          ...(product?.url ? { product: { id: product.id, name: product.name, url: product.url } } : {}),
        },
      };
      const saved = editing ? await api.update("posts", editing.id, row) : await api.insert("posts", { ...row, created_by: "user" });
      if (intent === "publish") {
        const result = await api.publishNow(saved);
        toastPublishResult(result);
      } else toast.success(intent === "schedule" ? "Post agendado!" : "Rascunho salvo.");
      await qc.invalidateQueries({ queryKey: ["table", "posts"] });
      navigate("/studio/calendario");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runAi = async () => {
    if (!topic.trim()) return toast.error("Descreva o tema.");
    setBusy("ai");
    try {
      if (aiOpen === "caption") {
        const r = await api.invoke<{ caption: string; hashtags: string[] }>("ai", { action: "caption", topic, kind, platforms, product: product && { name: product.name } });
        setCaption(`${r.caption}\n\n${r.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`);
      } else {
        const r = await api.invoke<{ slides: Slide[]; caption: string; hashtags: string[]; title: string }>("ai", {
          action: "carousel", topic, slides: Number(slideCount), product: product && { name: product.name, description: product.description },
        });
        setKind("carousel");
        setMode("design");
        setSlides(withProduct(r.slides, product, null));
        setTitle(r.title);
        setCaption(`${r.caption}\n\n${r.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`);
      }
      setAiOpen(null);
      toast.success("Pronto! Revise e ajuste o que quiser.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const updateSlide = (i: number, patch: Partial<Slide>) => setSlides((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const moveSlide = (i: number, dir: -1 | 1) =>
    setSlides((s) => {
      const next = [...s];
      const j = i + dir;
      if (j < 0 || j >= next.length) return s;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const handle = design.handle || "@seuperfil";

  return (
    <div>
      <PageHeader
        title={editing ? "Editar post" : "Criar post"}
        description="Monte uma vez e publique no Instagram e no TikTok."
        actions={
          <>
            {editing && <StatusBadge status={editing.status} />}
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => navigate("/studio/em-massa")}>
                <CalendarPlus /> Agendar em massa
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setAiOpen("carousel")}>
              <Wand2 /> Gerar carrossel com IA
            </Button>
          </>
        }
      />

      {editing?.notes && (
        <div className="mb-6 rounded-lg border bg-card px-4 py-3 text-[13px]">
          <SectionLabel className="mb-1">Estratégia do Claude</SectionLabel>
          <p className="text-foreground/80">{editing.notes}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Destino e formato">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(["instagram", "tiktok"] as Platform[]).map((p) => {
                  const on = platforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      aria-pressed={on}
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-md border px-3 text-[13px] font-medium transition-colors",
                        on ? "border-foreground bg-foreground text-background [&_svg]:text-background" : "bg-card text-foreground/70 hover:border-foreground/30",
                      )}
                    >
                      <PlatformIcon platform={p} />
                      {p === "instagram" ? "Instagram" : "TikTok"}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    className={cn(
                      "rounded-md border px-3 py-2.5 text-left transition-colors",
                      kind === k.id ? "border-foreground ring-1 ring-foreground" : "hover:border-foreground/30",
                    )}
                  >
                    <p className="text-[13px] font-medium">{KIND_LABEL[k.id]}</p>
                    <p className="text-xs text-muted-foreground">{k.hint}</p>
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Produto da loja" description="Opcional: vincule um pin e a foto dele entra no post, no carrossel ou no vídeo.">
            <div className="space-y-3">
              <ProductPicker value={product} onChange={linkProduct} />
              {product && kind === "reel" && (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-secondary/50 p-3 text-[13px]">
                  <span className="flex-1">Sem vídeo pronto? Gere o vídeo animado deste pin (vai para Aprovações quando ficar pronto).</span>
                  <Button size="sm" onClick={() => setVideoAsk(true)} disabled={busy !== null}>
                    {busy === "video" ? <Loader2 className="animate-spin" /> : <Wand2 />} Gerar vídeo do produto
                  </Button>
                </div>
              )}
              <VideoBriefDialog
                open={videoAsk}
                onOpenChange={setVideoAsk}
                title={`Vídeo: ${product?.name ?? "produto"}`}
                description="Escreva o que você quer no vídeo, ou deixe em branco para a IA fazer sozinha."
                onConfirm={productVideo}
              />
            </div>
          </Panel>

          <Panel
            title="Conteúdo"
            action={
              designable ? (
                <Segmented<Mode> value={mode} onChange={setMode} options={[{ value: "design", label: "Criar slides" }, { value: "upload", label: "Enviar arquivos" }]} />
              ) : undefined
            }
          >
            {usingDesign ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Modelo visual</Label>
                    <Select value={design.theme ?? "marca"} onValueChange={(v) => setDesign({ ...design, theme: v as ThemeId, palette: undefined })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(THEMES).map(([id, t]) => (
                          <SelectItem key={id} value={id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Assinatura nos slides</Label>
                    <Input className="h-9" value={design.handle ?? ""} onChange={(e) => setDesign({ ...design, handle: e.target.value })} placeholder="@seuperfil" />
                  </div>
                </div>
                <div className="divide-y rounded-md border">
                  {visibleSlides.map((s, i) => (
                    <div key={i} className="grid gap-3 p-3 sm:grid-cols-[96px_minmax(0,1fr)]">
                      <SlidePreview slide={s} index={i} total={visibleSlides.length} design={design} className="w-24" />
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <SectionLabel>{i === 0 ? "Capa" : `Slide ${i + 1}`}</SectionLabel>
                          {kind === "carousel" && (
                            <div className="flex">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSlide(i, -1)} aria-label="Mover para cima"><ArrowUp className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSlide(i, 1)} aria-label="Mover para baixo"><ArrowDown className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={slides.length === 1} onClick={() => setSlides((x) => x.filter((_, j) => j !== i))} aria-label="Remover slide"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          )}
                        </div>
                        <Input className="h-9 font-medium" value={s.title} onChange={(e) => updateSlide(i, { title: e.target.value })} placeholder="Título do slide" />
                        <Textarea rows={2} className="min-h-0 resize-none text-[13px]" value={s.body ?? ""} onChange={(e) => updateSlide(i, { body: e.target.value })} placeholder="Texto de apoio (opcional)" />
                        <Input className="h-8 text-xs" value={s.image_url ?? ""} onChange={(e) => updateSlide(i, { image_url: e.target.value || undefined })} placeholder="URL de imagem de fundo (opcional)" />
                      </div>
                    </div>
                  ))}
                </div>
                {kind === "carousel" && slides.length < 10 && (
                  <Button variant="outline" size="sm" onClick={() => setSlides((s) => [...s, { title: "", body: "" }])}>
                    <Plus /> Adicionar slide
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {media.map((m, i) => (
                    <div key={m.url + i} className="relative">
                      {m.type === "video" ? (
                        <video src={m.url} className="aspect-[4/5] w-full rounded-md bg-black object-cover" muted />
                      ) : (
                        <img src={m.url} alt="" className="aspect-[4/5] w-full rounded-md object-cover" />
                      )}
                      <button className="absolute right-1 top-1 rounded bg-foreground/80 p-1 text-background" onClick={() => setMedia((x) => x.filter((_, j) => j !== i))} aria-label="Remover arquivo">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Enviar
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  multiple={kind === "carousel"}
                  accept={kind === "reel" ? "video/mp4,video/quicktime" : "image/jpeg,image/png,video/mp4"}
                  onChange={(e) => onFiles(e.target.files)}
                />
                <p className="text-xs text-muted-foreground">
                  Instagram publica imagens em JPEG. Reels: MP4 vertical 9:16, até 15 min. TikTok: vídeo MP4/MOV ou até 35 fotos.
                </p>
              </div>
            )}
          </Panel>

          <Panel
            title="Legenda"
            action={
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAiOpen("caption")}>
                <Sparkles /> Escrever com IA
              </Button>
            }
          >
            <div className="space-y-3">
              <Textarea rows={8} className="text-[13px] leading-relaxed" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={"Primeira linha: o gancho.\nDepois, o conteúdo em parágrafos curtos.\nNo fim, a chamada para ação e as hashtags."} />
              <div className="tabular flex justify-between text-xs text-muted-foreground">
                <span>{(caption.match(/#[\p{L}\w]+/gu) ?? []).length} hashtags</span>
                <span className={cn(caption.length > 2200 && "text-danger")}>{caption.length} / 2.200</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome interno</Label>
                <Input className="h-9" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Série promessas #3 (só aparece aqui no Studio)" />
              </div>
            </div>
          </Panel>
          {onTikTok && <TikTokSettings value={ttOpts} onChange={setTtOpts} isVideo={kind === "reel"} />}
        </div>

        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Panel title="Pré-visualização" description={platforms.includes("instagram") ? "Feed do Instagram" : "TikTok"} bodyClassName="bg-secondary/40 p-5">
            <div className="mx-auto max-w-[280px] overflow-hidden rounded-md border bg-card text-[12px]">
              <div className="flex items-center gap-2 px-3 py-2">
                <Avatar name={handle} className="h-6 w-6 text-[9px]" />
                <span className="font-semibold">{handle.replace(/^@/, "")}</span>
              </div>
              {usingDesign ? (
                <div className="flex snap-x snap-mandatory overflow-x-auto">
                  {visibleSlides.map((s, i) => (
                    <SlidePreview key={i} slide={s} index={i} total={visibleSlides.length} design={design} className="w-full shrink-0 snap-center rounded-none" />
                  ))}
                </div>
              ) : media[0] ? (
                media[0].type === "video" ? (
                  <video src={media[0].url} className="aspect-[9/16] w-full bg-black object-cover" controls />
                ) : (
                  <img src={media[0].url} alt="" className="aspect-[4/5] w-full object-cover" />
                )
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center bg-muted text-xs text-muted-foreground">Sem mídia</div>
              )}
              <div className="flex items-center gap-3 px-3 pt-2.5 [&_svg]:h-[18px] [&_svg]:w-[18px]">
                <Heart strokeWidth={1.75} /><MessageCircle strokeWidth={1.75} /><Send strokeWidth={1.75} />
                {usingDesign && visibleSlides.length > 1 && (
                  <span className="mx-auto flex gap-1">
                    {visibleSlides.map((_, i) => <span key={i} className={cn("h-1 w-1 rounded-full", i === 0 ? "bg-brand" : "bg-foreground/20")} />)}
                  </span>
                )}
                <Bookmark strokeWidth={1.75} className="ml-auto" />
              </div>
              <p className="line-clamp-3 whitespace-pre-line px-3 pb-3 pt-2 leading-snug">
                <span className="font-semibold">{handle.replace(/^@/, "")}</span> {caption || <span className="text-muted-foreground">sua legenda aparece aqui</span>}
              </p>
            </div>
          </Panel>

          <Panel title="Publicação">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="when">Data e hora</Label>
                <Input id="when" className="h-9" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              </div>
              <Button className="w-full" onClick={() => save("schedule")} disabled={!!busy}>
                {busy === "schedule" && <Loader2 className="animate-spin" />} Agendar
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => save("publish")} disabled={!!busy}>
                  {busy === "publish" && <Loader2 className="animate-spin" />} Publicar agora
                </Button>
                <Button variant="ghost" size="sm" onClick={() => save("draft")} disabled={!!busy}>
                  {busy === "draft" && <Loader2 className="animate-spin" />} Salvar rascunho
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Dialog open={!!aiOpen} onOpenChange={(o) => !o && setAiOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{aiOpen === "caption" ? "Escrever legenda com IA" : "Gerar carrossel com IA"}</DialogTitle>
            <DialogDescription>A IA usa o perfil da marca definido em Claude e API.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="topic">Tema</Label>
              <Textarea id="topic" rows={4} className="text-[13px]" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex.: 5 erros que iniciantes cometem no meu nicho, com chamada para comentar QUERO" />
            </div>
            {aiOpen === "carousel" && (
              <div className="flex items-center gap-2">
                <Label className="text-xs" htmlFor="slides">Número de slides</Label>
                <Input id="slides" type="number" min={3} max={10} value={slideCount} onChange={(e) => setSlideCount(e.target.value)} className="h-8 w-16" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={runAi} disabled={busy === "ai"}>
              {busy === "ai" ? <Loader2 className="animate-spin" /> : <Sparkles />} Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
