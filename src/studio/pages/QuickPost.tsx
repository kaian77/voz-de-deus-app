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

/** Postar rápido: fotos + nome do produto → escolhe Story/Post/Carrossel/Reels → legenda pela IA → posta na hora. */
export default function QuickPost() {
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
      const first = photos[0]?.file;
      const image = first ? await api.upload(await fitted(first, 1080, 1350), "legenda.jpg") : undefined;
      const r = await api.invoke<{ caption: string; hashtags: string[] }>("ai", {
        action: "caption_media", image, kind, platforms: ["instagram"],
        product_name: productName || undefined, product_description: product?.description,
        hint: product?.url ? "O link do produto vai no direct para quem comentar; não escreva URL na legenda." : undefined,
      });
      setCaption(`${r.caption}${r.hashtags?.length ? `\n\n${r.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : ""}`);
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
      let media: Post["media"] = [];
      let postKind: PostKind = kind;
      if (kind === "reel") {
        if (video) {
          setBusy("Enviando o vídeo…");
          media = [{ url: await api.upload(video.file, video.file.name), type: "video" }];
        } else {
          setBusy("Montando o vídeo com as fotos (deixe a tela aberta)…");
          const blob = await renderPhotoReel(photos.map((x) => x.preview), productName);
          setBusy("Enviando o vídeo…");
          media = [{ url: await api.upload(blob, "reel.mp4"), type: "video" }];
        }
      } else if (kind === "story") {
        const one = picked[0];
        setBusy("Enviando…");
        media = one.video
          ? [{ url: await api.upload(one.file, one.file.name), type: "video" }]
          : [{ url: await api.upload(await fitted(one.file, 1080, 1920), "story.jpg"), type: "image" }];
      } else {
        const list = kind === "image" ? photos.slice(0, 1) : photos;
        for (const [i, x] of list.entries()) {
          setBusy(`Enviando ${i + 1}/${list.length}…`);
          media.push({ url: await api.upload(await fitted(x.file, 1080, 1350), `foto-${i + 1}.jpg`), type: "image" });
        }
        postKind = kind;
      }
      setBusy("Postando…");
      const saved = await api.insert("posts", {
        platforms: ["instagram"], kind: postKind, media, caption: kind === "story" ? "" : caption,
        title: productName || null, status: "publishing", results: {}, created_by: "user",
        options: product?.url ? { product: { id: product.id, name: product.name, url: product.url } } : {},
      });
      toastPublishResult(await api.publishNow(saved));
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
      <PageHeader title="Postar rápido" description="Mande a foto, diga o produto, escolha o tipo, gere a legenda e poste na hora no Instagram." />
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
