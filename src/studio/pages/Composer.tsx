import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Send, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { THEMES } from "../lib/carousel";
import { useTable } from "../lib/hooks";
import { renderAndUploadSlides } from "../lib/publishing";
import type { CarouselDesign, MediaItem, Platform, Post, PostKind, Slide, ThemeId } from "../lib/types";
import { KIND_LABEL, PageHeader, PlatformIcon, SlidePreview, StatusBadge, toLocalInput } from "../components/bits";

const KINDS: { id: PostKind; hint: string; platforms: Platform[] }[] = [
  { id: "image", hint: "1 imagem", platforms: ["instagram", "tiktok"] },
  { id: "carousel", hint: "2 a 10 imagens/slides", platforms: ["instagram", "tiktok"] },
  { id: "reel", hint: "Vídeo vertical 9:16", platforms: ["instagram", "tiktok"] },
  { id: "story", hint: "Só Instagram", platforms: ["instagram"] },
];

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
  const [design, setDesign] = useState<CarouselDesign>({ theme: "divino" });
  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aiOpen, setAiOpen] = useState<null | "caption" | "carousel">(null);
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState("6");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setPlatforms(editing.platforms);
    setKind(editing.kind === "video" ? "reel" : editing.kind === "photos" ? "carousel" : editing.kind);
    setMedia(editing.media ?? []);
    if (editing.slides?.length) {
      setSlides(editing.slides);
      setMode(editing.media?.length ? "upload" : "design");
    } else setMode("upload");
    setDesign(editing.design ?? { theme: "divino" });
    setCaption(editing.caption);
    setTitle(editing.title ?? "");
    setWhen(toLocalInput(editing.scheduled_at));
  }, [editing]);

  useEffect(() => {
    const ig = accounts?.find((a) => a.platform === "instagram");
    if (ig?.username && !design.handle) setDesign((d) => ({ ...d, handle: `@${ig.username}` }));
  }, [accounts, design.handle]);

  const designable = kind === "carousel" || kind === "image" || kind === "story";
  const usingDesign = designable && mode === "design";
  const visibleSlides = kind === "carousel" ? slides : slides.slice(0, 1);

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
      };
      const saved = editing ? await api.update("posts", editing.id, row) : await api.insert("posts", { ...row, created_by: "user", options: {} });
      if (intent === "publish") {
        const result = await api.publishNow(saved);
        if (result.status === "published") toast.success("Publicado! 🎉");
        else if (result.status === "publishing") toast.info("Enviado — o vídeo está processando e será publicado em instantes.");
        else toast.error(`Falhou: ${Object.values(result.results ?? {}).map((r) => r?.error).filter(Boolean).join(" | ")}`);
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
        const r = await api.invoke<{ caption: string; hashtags: string[] }>("ai", { action: "caption", topic, kind, platforms });
        setCaption(`${r.caption}\n\n${r.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`);
      } else {
        const r = await api.invoke<{ slides: Slide[]; caption: string; hashtags: string[]; title: string }>("ai", { action: "carousel", topic, slides: Number(slideCount) });
        setKind("carousel");
        setMode("design");
        setSlides(r.slides);
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

  return (
    <div>
      <PageHeader
        title={editing ? "Editar post" : "Criar post"}
        description="Monte, agende ou publique no Instagram e no TikTok ao mesmo tempo."
        actions={
          <>
            {editing && <StatusBadge status={editing.status} />}
            <Button variant="outline" onClick={() => setAiOpen("carousel")}>
              <Wand2 className="mr-2 h-4 w-4" /> Carrossel com IA
            </Button>
          </>
        }
      />

      {editing?.notes && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-900">
            <b>Estratégia do Claude:</b> {editing.notes}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1. Onde e qual formato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                {(["instagram", "tiktok"] as Platform[]).map((p) => (
                  <label key={p} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2", platforms.includes(p) && "border-primary bg-primary/5")}>
                    <Checkbox checked={platforms.includes(p)} onCheckedChange={() => togglePlatform(p)} />
                    <PlatformIcon platform={p} />
                    <span className="text-sm font-medium">{p === "instagram" ? "Instagram" : "TikTok"}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    className={cn("rounded-lg border p-3 text-left transition-colors", kind === k.id ? "border-primary bg-primary/5" : "hover:bg-muted")}
                  >
                    <p className="text-sm font-semibold">{KIND_LABEL[k.id]}</p>
                    <p className="text-xs text-muted-foreground">{k.hint}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">2. Conteúdo</CardTitle>
              {designable && (
                <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                  <TabsList>
                    <TabsTrigger value="design">Desenhar slides</TabsTrigger>
                    <TabsTrigger value="upload">Enviar arquivos</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {usingDesign ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Tema</Label>
                      <Select value={design.theme ?? "divino"} onValueChange={(v) => setDesign({ ...design, theme: v as ThemeId })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(THEMES).map(([id, t]) => (
                            <SelectItem key={id} value={id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Assinatura nos slides</Label>
                      <Input value={design.handle ?? ""} onChange={(e) => setDesign({ ...design, handle: e.target.value })} placeholder="@seuperfil" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    {visibleSlides.map((s, i) => (
                      <div key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[110px_1fr]">
                        <SlidePreview slide={s} index={i} total={visibleSlides.length} design={design} />
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">Slide {i + 1}{i === 0 && " · capa"}</span>
                            {kind === "carousel" && (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSlide(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSlide(i, 1)} aria-label="Descer"><ArrowDown className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={slides.length === 1} onClick={() => setSlides((x) => x.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            )}
                          </div>
                          <Input value={s.title} onChange={(e) => updateSlide(i, { title: e.target.value })} placeholder="Título" />
                          <Textarea rows={2} value={s.body ?? ""} onChange={(e) => updateSlide(i, { body: e.target.value })} placeholder="Texto de apoio (opcional)" />
                          <Input value={s.image_url ?? ""} onChange={(e) => updateSlide(i, { image_url: e.target.value || undefined })} placeholder="URL de imagem de fundo (opcional)" />
                        </div>
                      </div>
                    ))}
                  </div>
                  {kind === "carousel" && slides.length < 10 && (
                    <Button variant="outline" size="sm" onClick={() => setSlides((s) => [...s, { title: "", body: "" }])}>
                      <Plus className="mr-1 h-4 w-4" /> Adicionar slide
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {media.map((m, i) => (
                      <div key={m.url + i} className="relative">
                        {m.type === "video" ? (
                          <video src={m.url} className="aspect-[4/5] w-full rounded-md bg-black object-cover" muted />
                        ) : (
                          <img src={m.url} alt="" className="aspect-[4/5] w-full rounded-md object-cover" />
                        )}
                        <button className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white" onClick={() => setMedia((x) => x.filter((_, j) => j !== i))} aria-label="Remover">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted"
                    >
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
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
                    Instagram publica imagens em JPEG. Reels: MP4 vertical (9:16), até 15 min. TikTok: vídeo MP4/MOV ou até 35 fotos.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">3. Legenda</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setAiOpen("caption")}>
                <Sparkles className="mr-1 h-4 w-4" /> Escrever com IA
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={8} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Gancho forte na primeira linha… CTA no final… #hashtags" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{(caption.match(/#\w+/g) ?? []).length} hashtags</span>
                <span className={cn(caption.length > 2200 && "text-destructive")}>{caption.length}/2200</span>
              </div>
              <div className="space-y-1.5">
                <Label>Nome interno (opcional)</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Série promessas #3" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Prévia</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mx-auto max-w-[260px] rounded-[2rem] border-8 border-foreground/90 bg-background p-2 shadow-xl">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <div className="h-6 w-6 rounded-full bg-gradient-divine" />
                  <span className="text-xs font-semibold">{design.handle || "@seuperfil"}</span>
                </div>
                {usingDesign ? (
                  <div className="flex snap-x gap-1 overflow-x-auto">
                    {visibleSlides.map((s, i) => (
                      <SlidePreview key={i} slide={s} index={i} total={visibleSlides.length} design={design} className="w-full shrink-0 snap-center" />
                    ))}
                  </div>
                ) : media[0] ? (
                  media[0].type === "video" ? (
                    <video src={media[0].url} className="aspect-[9/16] w-full rounded-md bg-black object-cover" controls />
                  ) : (
                    <img src={media[0].url} alt="" className="aspect-[4/5] w-full rounded-md object-cover" />
                  )
                ) : (
                  <div className="flex aspect-[4/5] items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">Sem mídia</div>
                )}
                <p className="mt-2 line-clamp-4 whitespace-pre-line px-1 text-[11px]">{caption || "Sua legenda aparece aqui"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">4. Quando</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <Button className="w-full" onClick={() => save("schedule")} disabled={!!busy}>
                {busy === "schedule" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Agendar
              </Button>
              <Button className="w-full" variant="secondary" onClick={() => save("publish")} disabled={!!busy}>
                {busy === "publish" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Publicar agora
              </Button>
              <Button className="w-full" variant="ghost" onClick={() => save("draft")} disabled={!!busy}>
                {busy === "draft" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar rascunho
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!aiOpen} onOpenChange={(o) => !o && setAiOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{aiOpen === "caption" ? "Escrever legenda com IA" : "Criar carrossel com IA"}</DialogTitle>
            <DialogDescription>Usa o perfil da marca configurado em "Claude & API".</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea rows={4} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex: 5 versículos para quem está passando por ansiedade, com CTA para comentar AMÉM" />
            {aiOpen === "carousel" && (
              <div className="flex items-center gap-2">
                <Label>Slides</Label>
                <Input type="number" min={3} max={10} value={slideCount} onChange={(e) => setSlideCount(e.target.value)} className="w-20" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={runAi} disabled={busy === "ai"}>
              {busy === "ai" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
