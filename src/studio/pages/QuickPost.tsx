import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clapperboard, GalleryHorizontal, ImageIcon, Loader2, Send, Smartphone, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../lib/api";
import { renderPhotoReel } from "../lib/photo-reel";
import { unlockReelAudio } from "../lib/reel";
import type { Post, PostKind } from "../lib/types";
import { PageHeader, Panel } from "../components/bits";
import ProductPicker, { type LinkedProduct } from "../components/ProductPicker";
import { toastPublishResult } from "@/studio/lib/publish-toast";

type Kind = "story" | "image" | "carousel" | "reel";
type Picked = { file: File; preview: string; video: boolean };

const KINDS: { id: Kind; label: string; hint: string; icon: typeof ImageIcon }[] = [
  { id: "story", label: "Story", hint: "1 foto ou vídeo, 24 h", icon: Smartphone },
  { id: "image", label: "Post", hint: "1 foto no feed", icon: ImageIcon },
  { id: "carousel", label: "Carrossel", hint: "2 a 10 fotos", icon: GalleryHorizontal },
  { id: "reel", label: "Reels", hint: "Vídeo, ou fotos viram vídeo", icon: Clapperboard },
];

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao preparar a foto"))), "image/jpeg", 0.9));
}

/** Foto no formato do Instagram (feed 4:5, story 9:16): a foto inteira na frente e ela mesma desfocada no fundo. */
async function fitted(file: File, w: number, h: number): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error(`Não consegui abrir ${file.name}. Use fotos JPG ou PNG.`);
  });
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const cover = Math.max(w / bmp.width, h / bmp.height);
  ctx.filter = "blur(40px) brightness(0.75)";
  ctx.drawImage(bmp, (w - bmp.width * cover) / 2, (h - bmp.height * cover) / 2, bmp.width * cover, bmp.height * cover);
  ctx.filter = "none";
  const fit = Math.min(w / bmp.width, h / bmp.height);
  ctx.drawImage(bmp, (w - bmp.width * fit) / 2, (h - bmp.height * fit) / 2, bmp.width * fit, bmp.height * fit);
  return toJpeg(c);
}

/** Legenda da IA para um produto (olha a foto só para saber como ele é). */
async function captionFor(file: File | undefined, kind: Kind, productName: string, product?: LinkedProduct | null) {
  const image = file && !file.type.startsWith("video/") ? await api.upload(await fitted(file, 1080, 1350), "legenda.jpg") : undefined;
  const r = await api.invoke<{ caption: string; hashtags: string[] }>("ai", {
    action: "caption_media", image, kind, platforms: ["instagram"],
    product_name: productName || undefined, product_description: product?.description,
    hint: product?.url ? "O link do produto vai no direct para quem comentar; não escreva URL na legenda." : undefined,
  });
  return `${r.caption}${r.hashtags?.length && kind !== "story" ? `\n\n${r.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : ""}`;
}

/** Sobe a mídia no formato certo e posta na hora. */
async function postNow(kind: Kind, files: File[], productName: string, caption: string, product?: LinkedProduct | null, onStep?: (s: string) => void) {
  const photos = files.filter((f) => !f.type.startsWith("video/"));
  const video = files.find((f) => f.type.startsWith("video/"));
  let media: Post["media"] = [];
  if (kind === "reel") {
    if (video) {
      onStep?.("Enviando o vídeo…");
      media = [{ url: await api.upload(video, video.name), type: "video" }];
    } else {
      onStep?.("Montando o vídeo com as fotos (deixe a tela aberta)…");
      const urls = photos.map((f) => URL.createObjectURL(f));
      const blob = await renderPhotoReel(urls, productName).finally(() => urls.forEach((u) => URL.revokeObjectURL(u)));
      onStep?.("Enviando o vídeo…");
      media = [{ url: await api.upload(blob, "reel.mp4"), type: "video" }];
    }
  } else if (kind === "story") {
    const one = files[0];
    onStep?.("Enviando…");
    media = one.type.startsWith("video/")
      ? [{ url: await api.upload(one, one.name), type: "video" }]
      : [{ url: await api.upload(await fitted(one, 1080, 1920), "story.jpg"), type: "image" }];
  } else {
    const list = kind === "image" ? photos.slice(0, 1) : photos;
    for (const [i, f] of list.entries()) {
      onStep?.(`Enviando ${i + 1}/${list.length}…`);
      media.push({ url: await api.upload(await fitted(f, 1080, 1350), `foto-${i + 1}.jpg`), type: "image" });
    }
  }
  onStep?.("Postando…");
  const saved = await api.insert("posts", {
    platforms: ["instagram"], kind: kind as PostKind, media, caption: kind === "story" ? "" : caption,
    title: productName || null, status: "publishing", results: {}, created_by: "user",
    options: product?.url ? { product: { id: product.id, name: product.name, url: product.url } } : {},
  });
  return api.publishNow(saved);
}

/** Postar rápido: um post (fotos + produto → tipo → legenda → posta) ou vários de uma vez (cada foto um post). */
export default function QuickPost() {
  const [mode, setMode] = useState<"one" | "many">("one");
  return (
    <div>
      <PageHeader title="Postar rápido" description="Mande a foto, diga o produto, escolha o tipo, gere a legenda e poste na hora no Instagram." />
      <div className="mb-4 inline-flex rounded-lg border p-1 text-sm">
        {([["one", "Um post"], ["many", "Vários de uma vez"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)}
            className={`rounded-md px-3 py-1.5 ${mode === id ? "bg-foreground text-background" : "text-muted-foreground"}`}>{label}</button>
        ))}
      </div>
      {mode === "one" ? <SinglePost /> : <BatchPost />}
    </div>
  );
}

function SinglePost() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("image");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [name, setName] = useState("");
  const [product, setProduct] = useState<LinkedProduct | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const pick = (files: FileList | null) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    setPicked((cur) => [...cur, ...list.map((file) => ({ file, preview: URL.createObjectURL(file), video: file.type.startsWith("video/") }))].slice(0, 10));
  };
  const photos = picked.filter((p) => !p.video);
  const video = picked.find((p) => p.video);
  const productName = name.trim() || product?.name || "";

  const problem = (): string | null => {
    if (!picked.length) return "Escolha a foto (ou o vídeo).";
    if (kind === "carousel" && photos.length < 2) return "Carrossel precisa de pelo menos 2 fotos.";
    if (kind === "carousel" && video) return "No carrossel use só fotos.";
    if ((kind === "image") && !photos.length) return "Post precisa de uma foto.";
    return null;
  };

  const writeCaption = async () => {
    if (!picked.length) return toast.error("Escolha a foto primeiro.");
    setBusy("caption");
    try {
      setCaption(await captionFor(photos[0]?.file, kind, productName, product));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const p = problem();
    if (p) return toast.error(p);
    if (kind === "reel" && !video) unlockReelAudio(); // som do Reel feito com as fotos (precisa do toque)
    setBusy("publish");
    try {
      toastPublishResult(await postNow(kind, picked.map((x) => x.file), productName, caption, product, setBusy));
      await qc.invalidateQueries({ queryKey: ["table", "posts"] });
      picked.forEach((x) => URL.revokeObjectURL(x.preview));
      setPicked([]);
      setCaption("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="grid gap-4">
        <Panel title="1. O que vai postar" bodyClassName="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)}
              className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left ${kind === k.id ? "border-foreground ring-1 ring-foreground" : "hover:border-foreground/30"}`}>
              <k.icon className="h-4 w-4" />
              <span className="text-sm font-medium">{k.label}</span>
              <span className="text-xs text-muted-foreground">{k.hint}</span>
            </button>
          ))}
        </Panel>

        <Panel title="2. Fotos e produto" bodyClassName="space-y-3 p-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground hover:bg-muted/40">
            <Upload className="h-5 w-5" />
            <span className="font-medium text-foreground">Escolher {kind === "carousel" ? "fotos" : kind === "reel" ? "vídeo ou fotos" : "foto"}</span>
            <input type="file" accept={kind === "carousel" || kind === "image" ? "image/*" : "image/*,video/*"} multiple={kind === "carousel" || kind === "reel"} className="hidden"
              onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          </label>
          {picked.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {picked.map((p, i) => (
                <div key={p.preview} className="relative">
                  {p.video ? <video src={p.preview} className="aspect-square w-full rounded border object-cover" muted /> : <img src={p.preview} alt="" className="aspect-square w-full rounded border object-cover" />}
                  <button className="absolute right-1 top-1 rounded bg-background/90 p-1" aria-label="Tirar"
                    onClick={() => setPicked((cur) => cur.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do produto (ex.: Pin Medicina prata e dourado)" />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Ligar ao produto do site (opcional: quem comentar recebe o link no direct)</p>
            <ProductPicker value={product} onChange={setProduct} />
          </div>
          {kind === "reel" && !video && photos.length > 0 && (
            <p className="text-xs text-muted-foreground">As fotos viram um vídeo de {Math.round(photos.length * 2.8)} s com o nome do produto e música, feito aqui no celular na hora de postar.</p>
          )}
        </Panel>

        {kind !== "story" && (
          <Panel title="3. Legenda" bodyClassName="space-y-2 p-4"
            action={<Button size="sm" variant="outline" onClick={writeCaption} disabled={!!busy}>
              {busy === "caption" ? <Loader2 className="animate-spin" /> : <Sparkles />} Criar legenda
            </Button>}>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={8} placeholder="Toque em “Criar legenda” ou escreva aqui." />
          </Panel>
        )}

        <Button size="lg" onClick={publish} disabled={!!busy}>
          {busy && busy !== "caption" ? <Loader2 className="animate-spin" /> : <Send />}
          {busy && busy !== "caption" ? busy : `Postar ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()} agora`}
        </Button>
      </div>
    </div>
  );
}

type Item = { id: string; file: File; preview: string; name: string; caption: string; status?: "ok" | "error"; error?: string };

/** Vários de uma vez: cada foto (ou vídeo) vira um post separado, com o nome do produto e a legenda dele. */
function BatchPost() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Exclude<Kind, "carousel">>("image");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const pick = (files: FileList | null) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    setItems((cur) => [...cur, ...list.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), name: "", caption: "" }))].slice(0, 30));
  };
  const todo = items.filter((x) => x.status !== "ok");

  const writeAll = async () => {
    const list = todo.filter((x) => !x.caption.trim());
    if (!list.length) return toast.info("Todos já têm legenda.");
    if (list.some((x) => !x.name.trim())) toast.info("Dica: com o nome do produto a legenda sai bem melhor.");
    let done = 0;
    for (const [i, x] of list.entries()) {
      setBusy(`Escrevendo legenda ${i + 1}/${list.length}…`);
      try {
        patch(x.id, { caption: await captionFor(x.file, kind, x.name.trim()) });
        done++;
      } catch (e) {
        toast.error(`${x.name || `Post ${i + 1}`}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    if (done) toast.success(`${done} legenda(s) prontas. Confira antes de postar.`);
  };

  const postAll = async () => {
    if (!todo.length) return toast.error("Escolha as fotos.");
    if (kind !== "story" && todo.some((x) => !x.caption.trim()) && !confirm("Tem post sem legenda. Postar assim mesmo?")) return;
    if (kind === "reel") unlockReelAudio();
    let ok = 0;
    for (const [i, x] of todo.entries()) {
      try {
        const r = await postNow(kind, [x.file], x.name.trim(), x.caption, null, (s) => setBusy(`Post ${i + 1}/${todo.length}: ${s}`));
        const failed = Object.values(r.results ?? {}).find((v) => (v as { status?: string })?.status === "failed") as { error?: string } | undefined;
        if (r.status === "failed" || failed) patch(x.id, { status: "error", error: failed?.error ?? "não publicou" });
        else {
          patch(x.id, { status: "ok", error: undefined });
          ok++;
        }
      } catch (e) {
        patch(x.id, { status: "error", error: (e as Error).message });
      }
    }
    setBusy(null);
    await qc.invalidateQueries({ queryKey: ["table", "posts"] });
    if (ok) toast.success(`${ok} post(s) publicados no Instagram.`);
    if (ok < todo.length) toast.error(`${todo.length - ok} não foram. Veja o motivo em cada um e tente de novo.`);
  };

  return (
    <div className="grid gap-4">
      <Panel title="1. Tipo (vale para todos)" bodyClassName="grid grid-cols-3 gap-2 p-4">
        {KINDS.filter((k) => k.id !== "carousel").map((k) => (
          <button key={k.id} onClick={() => setKind(k.id as Exclude<Kind, "carousel">)}
            className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left ${kind === k.id ? "border-foreground ring-1 ring-foreground" : "hover:border-foreground/30"}`}>
            <k.icon className="h-4 w-4" />
            <span className="text-sm font-medium">{k.label}</span>
          </button>
        ))}
      </Panel>

      <Panel title="2. Fotos (cada uma vira um post)" bodyClassName="space-y-3 p-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground hover:bg-muted/40">
          <Upload className="h-5 w-5" />
          <span className="font-medium text-foreground">Escolher fotos{kind !== "image" ? " ou vídeos" : ""}</span>
          <span>Até 30. Depois escreva o nome do produto de cada uma.</span>
          <input type="file" accept={kind === "image" ? "image/*" : "image/*,video/*"} multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </label>
        {items.map((x, i) => (
          <div key={x.id} className={`flex gap-3 rounded-md border p-2 ${x.status === "ok" ? "opacity-60" : ""}`}>
            <div className="relative w-20 shrink-0">
              {x.file.type.startsWith("video/") ? <video src={x.preview} className="aspect-square w-20 rounded border object-cover" muted /> : <img src={x.preview} alt="" className="aspect-square w-20 rounded border object-cover" />}
              {x.status !== "ok" && (
                <button className="absolute right-1 top-1 rounded bg-background/90 p-1" aria-label="Tirar" onClick={() => setItems((cur) => cur.filter((y) => y.id !== x.id))}><Trash2 className="h-3 w-3" /></button>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Input value={x.name} onChange={(e) => patch(x.id, { name: e.target.value })} placeholder={`Produto ${i + 1} (ex.: Pin Terapia Ocupacional)`} className="h-8" disabled={x.status === "ok"} />
              {kind !== "story" && (
                <Textarea value={x.caption} onChange={(e) => patch(x.id, { caption: e.target.value })} rows={3} placeholder="Legenda (ou “Criar legendas” para todos)" className="text-xs" disabled={x.status === "ok"} />
              )}
              {x.status === "ok" && <p className="text-xs text-emerald-700">Postado ✓</p>}
              {x.status === "error" && <p className="text-xs text-destructive">Não foi: {x.error}</p>}
            </div>
          </div>
        ))}
      </Panel>

      {kind !== "story" && (
        <Button variant="outline" onClick={writeAll} disabled={!!busy || !todo.length}>
          {busy?.startsWith("Escrevendo") ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {busy?.startsWith("Escrevendo") ? busy : `Criar legendas (${todo.filter((x) => !x.caption.trim()).length})`}
        </Button>
      )}
      <Button size="lg" onClick={postAll} disabled={!!busy || !todo.length}>
        {busy && !busy.startsWith("Escrevendo") ? <Loader2 className="animate-spin" /> : <Send />}
        {busy && !busy.startsWith("Escrevendo") ? busy : `Postar todos agora (${todo.length})`}
      </Button>
    </div>
  );
}
