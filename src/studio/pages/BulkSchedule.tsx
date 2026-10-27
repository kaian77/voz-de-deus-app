import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useTable } from "../lib/hooks";
import { renderPostMedia } from "../lib/publishing";
import type { Platform, Post, SocialAccount } from "../lib/types";
import TikTokSettings, { TIKTOK_DEFAULTS, tiktokProblem, toApiOptions, useTikTokCreator, type TikTokOptions } from "../components/TikTokSettings";
import { PageHeader, Panel, PlatformIcon, SlidePreview, toLocalInput } from "../components/bits";

type Item = {
  id: string;
  name: string;
  type: "image" | "video";
  preview: string;
  url?: string;
  /** Foto (ou quadro do vídeo) que a IA olha para escrever a legenda */
  aiImage?: string;
  seconds?: number;
  caption: string;
  /** Data e hora escolhidas à mão (datetime-local); vazio = automático */
  when: string;
  uploading: boolean;
  error?: string;
  /** Post que já existe (ex.: vindo de Aprovações): só ganha data e hora */
  post?: Post;
};

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function formatSlot(local: string) {
  const d = new Date(local);
  return `${WEEK[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toJpeg(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao preparar a foto"))), "image/jpeg", quality));
}

/** JPEG de até 1440px. Fora da proporção que o Instagram aceita (4:5 a 1,91:1), centraliza num fundo branco 4:5. */
async function prepareImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Não consegui abrir ${file.name}. Use fotos JPG ou PNG.`);
  }
  const ratio = bitmap.width / bitmap.height;
  const fits = ratio >= 0.8 && ratio <= 1.91;
  const canvas = document.createElement("canvas");
  if (fits) {
    const scale = Math.min(1, 1440 / bitmap.width);
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
  } else {
    canvas.width = 1080;
    canvas.height = 1350;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  return toJpeg(canvas);
}

/** Duração do vídeo e um quadro do começo (para a IA ver do que se trata). */
function videoInfo(src: string): Promise<{ seconds?: number; frame?: Blob }> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    let seconds: number | undefined;
    const done = (frame?: Blob) => {
      clearTimeout(timer);
      resolve({ seconds, frame });
    };
    const timer = setTimeout(() => done(), 10000);
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadedmetadata = () => {
      seconds = v.duration;
      v.currentTime = Math.min(1, v.duration / 2);
    };
    v.onseeked = async () => {
      try {
        const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
        done(await toJpeg(canvas, 0.8));
      } catch {
        done();
      }
    };
    v.onerror = () => done();
    v.src = src;
  });
}

const ACCOUNT_KEY = "bulk-accounts";
const isLoja = (a: SocialAccount) => !a.meta?.brand || a.meta.brand === "brax";
const accountLabel = (a: SocialAccount) =>
  `@${a.username ?? a.display_name ?? "conta"}${a.meta?.brand === "paginaspro" ? " · PáginasPro" : a.meta?.brand === "canal" ? " · fora da loja" : " · Brax Pins"}`;

function readSavedAccounts(): Partial<Record<Platform, string>> {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "{}");
  } catch {
    return {};
  }
}

/** Conta em que um post sai naquela rede (sem escolha = a da loja). */
function postAccount(p: Post, platform: Platform, accounts: SocialAccount[]) {
  const chosen = (p.options?.account_ids as Record<string, string> | undefined)?.[platform];
  return chosen ?? accounts.find((a) => a.platform === platform && isLoja(a))?.id;
}

/** Horários livres a partir do dia escolhido, pulando os já ocupados e os que já passaram. */
function* slots(start: string, times: string[], taken: Set<string>) {
  const sorted = [...new Set(times.filter(Boolean))].sort();
  if (!sorted.length) return;
  const soon = Date.now() + 10 * 60 * 1000;
  const day = new Date(`${start || dayKey(new Date())}T00:00`);
  for (let i = 0; i < 366; i++) {
    for (const t of sorted) {
      const local = `${dayKey(day)}T${t}`;
      if (new Date(local).getTime() < soon || taken.has(local)) continue;
      yield local;
    }
    day.setDate(day.getDate() + 1);
  }
}

export default function BulkSchedule() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { data: posts = [], isSuccess: postsLoaded } = useTable("posts");
  const { data: accounts = [] } = useTable("social_accounts");
  const connected = (["instagram", "tiktok"] as Platform[]).filter((p) => accounts.some((a) => a.platform === p));
  const [picked, setPlatforms] = useState<Platform[]>([]);
  const [chosenAccounts, setChosenAccounts] = useState<Partial<Record<Platform, string>>>(readSavedAccounts);
  const social = accounts as SocialAccount[];
  const accountsOf = (p: Platform) => social.filter((a) => a.platform === p);
  // Conta de cada rede: a escolhida (se ainda existe) ou a da loja
  const accountFor = (p: Platform) =>
    accountsOf(p).find((a) => a.id === chosenAccounts[p]) ?? accountsOf(p).find(isLoja) ?? accountsOf(p)[0];
  const chooseAccount = (p: Platform, id: string) => {
    const next = { ...chosenAccounts, [p]: id };
    setChosenAccounts(next);
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  };
  // Só as redes conectadas valem (os posts de Aprovações podem citar uma rede que não está conectada)
  const platforms = picked.filter((p) => connected.includes(p));
  const [items, setItems] = useState<Item[]>([]);
  const [start, setStart] = useState(() => dayKey(new Date()));
  const [times, setTimesState] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bulk-times") || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {
      /* sem armazenamento */
    }
    return ["13:00", "19:00"];
  });
  // Lembra os horários do dia para a próxima vez
  const setTimes = (next: string[] | ((cur: string[]) => string[])) =>
    setTimesState((cur) => {
      const value = typeof next === "function" ? next(cur) : next;
      try {
        localStorage.setItem("bulk-times", JSON.stringify(value));
      } catch {
        /* sem armazenamento */
      }
      return value;
    });
  const [skipTaken, setSkipTaken] = useState(true);
  const [hint, setHint] = useState("");
  const [suffix, setSuffix] = useState("");
  const [ttOpts, setTtOpts] = useState<TikTokOptions>(TIKTOK_DEFAULTS);
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const onTikTok = platforms.includes("tiktok");
  const ttCreator = useTikTokCreator(onTikTok);

  useEffect(() => {
    if (!picked.length && connected.length) setPlatforms(connected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected.join()]);

  // Posts vindos de Aprovações (?posts=id1,id2)
  const loaded = useRef(false);
  useEffect(() => {
    const ids = params.get("posts")?.split(",").filter(Boolean) ?? [];
    if (loaded.current || !ids.length || !postsLoaded) return;
    loaded.current = true;
    const found = ids.map((id) => (posts as Post[]).find((p) => p.id === id)).filter((p): p is Post => !!p && !["published", "publishing"].includes(p.status));
    setItems((cur) => [
      ...cur,
      ...found.map((p): Item => ({
        id: p.id,
        name: p.title || "Post",
        type: ["reel", "video"].includes(p.kind) ? "video" : "image",
        preview: p.media[0]?.url ?? "",
        url: p.media[0]?.url ?? "slides",
        aiImage: p.media.find((m) => m.type === "image")?.url ?? p.slides?.find((x) => x.product_image)?.product_image,
        caption: p.caption,
        when: "",
        uploading: false,
        post: p,
      })),
    ]);
    const used = [...new Set(found.flatMap((p) => p.platforms))];
    if (used.length) setPlatforms(used);
  }, [params, posts, postsLoaded]);

  // Libera as prévias locais ao sair da página
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const patch = (id: string, p: Partial<Item>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  // Data e hora de cada post: as escolhidas à mão ficam; as outras pegam os próximos horários livres, na ordem da lista
  const targetIds = platforms.map((p) => accountFor(p)?.id).filter(Boolean).join();
  const schedule = useMemo(() => {
    const taken = new Set<string>();
    if (skipTaken) {
      for (const p of posts as Post[]) {
        if (items.some((x) => x.post?.id === p.id)) continue; // os que estão sendo reagendados aqui
        // Só ocupa o horário se o post sai numa das contas escolhidas aqui (a conta nova não disputa horário com a loja)
        if (!platforms.some((pl) => p.platforms.includes(pl) && postAccount(p, pl, social) === accountFor(pl)?.id)) continue;
        if (p.scheduled_at && ["scheduled", "pending_approval", "publishing"].includes(p.status)) taken.add(toLocalInput(p.scheduled_at));
      }
    }
    for (const it of items) if (it.when) taken.add(it.when);
    const gen = slots(start, times, taken);
    const out: Record<string, string | undefined> = {};
    for (const it of items) out[it.id] = it.when || gen.next().value || undefined;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, posts, start, times, skipTaken, targetIds]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (fileRef.current) fileRef.current.value = "";
    const added: (Item & { file: File })[] = list.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return {
        id: crypto.randomUUID(),
        file,
        name: file.name.replace(/\.\w+$/, ""),
        type: file.type.startsWith("video/") ? "video" : "image",
        preview,
        caption: "",
        when: "",
        uploading: true,
      };
    });
    setItems((cur) => [...cur, ...added.map(({ file: _f, ...it }) => it)]);
    // Envia um de cada vez para não travar a conexão do celular
    for (const it of added) {
      try {
        if (it.type === "image") {
          const url = await api.upload(await prepareImage(it.file), `${it.name}.jpg`);
          patch(it.id, { url, aiImage: url, uploading: false });
        } else {
          const info = await videoInfo(it.preview);
          const url = await api.upload(it.file, it.file.name);
          const aiImage = info.frame ? await api.upload(info.frame, `${it.name}-quadro.jpg`).catch(() => undefined) : undefined;
          patch(it.id, { url, aiImage, seconds: info.seconds, uploading: false });
        }
      } catch (e) {
        patch(it.id, { uploading: false, error: (e as Error).message });
      }
    }
  };

  const move = (i: number, dir: -1 | 1) =>
    setItems((s) => {
      const next = [...s];
      const j = i + dir;
      if (j < 0 || j >= next.length) return s;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const writeCaptions = async () => {
    const todo = items.filter((x) => !x.caption.trim() && x.url);
    if (!todo.length) return toast.info(items.some((x) => x.uploading) ? "Espere as fotos terminarem de enviar." : "Todos os posts já têm legenda.");
    setWriting(true);
    let done = 0;
    for (const it of todo) {
      try {
        const r = await api.invoke<{ caption: string; hashtags: string[] }>("ai", {
          action: "caption_media",
          image: it.aiImage,
          name: it.name,
          hint,
          kind: it.type === "video" ? "reel" : "image",
          platforms,
          account_id: (accountFor("instagram") && platforms.includes("instagram") ? accountFor("instagram") : accountFor(platforms[0]))?.id,
        });
        patch(it.id, { caption: `${r.caption}\n\n${r.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` });
        done++;
      } catch (e) {
        toast.error((e as Error).message);
        break;
      }
    }
    setWriting(false);
    if (done) toast.success(`${done} legenda(s) escrita(s). Revise antes de agendar.`);
  };

  const problem = (): string | null => {
    if (!items.length) return "Envie as fotos e os vídeos.";
    if (!platforms.length) return "Escolha pelo menos uma rede.";
    if (items.some((x) => x.uploading)) return "Espere os arquivos terminarem de enviar.";
    if (items.some((x) => x.error || !x.url)) return "Tire da lista os arquivos que deram erro.";
    if (items.some((x) => !schedule[x.id])) return "Adicione pelo menos um horário por dia.";
    if (items.some((x) => new Date(schedule[x.id]!).getTime() < Date.now())) return "Tem post com horário no passado.";
    const long = items.find((x) => (x.caption + suffix).length > 2200);
    if (long) return `A legenda de “${long.name}” passa de 2.200 caracteres.`;
    if (onTikTok) {
      const p = tiktokProblem(ttOpts, ttCreator.data);
      if (p) return p;
      const max = ttCreator.data?.max_video_post_duration_sec;
      const tooLong = items.find((x) => x.type === "video" && max && x.seconds && x.seconds > max);
      if (tooLong) return `“${tooLong.name}” tem ${Math.round(tooLong.seconds!)}s; sua conta do TikTok aceita até ${max}s.`;
    }
    return null;
  };

  const accountIds = () => {
    const out: Record<string, string> = {};
    for (const p of platforms) {
      const a = accountFor(p);
      if (a) out[p] = a.id;
    }
    return out;
  };

  const save = async () => {
    const p = problem();
    if (p) return toast.error(p);
    const account_ids = accountIds();
    setSaving(true);
    let saved = 0;
    try {
      for (const it of items) {
        const caption = [it.caption.trim(), suffix.trim()].filter(Boolean).join("\n\n");
        const scheduled_at = new Date(schedule[it.id]!).toISOString();
        if (it.post) {
          const p = it.post;
          await api.update("posts", p.id, {
            // Post da PáginasPro fica só no Instagram dela (nunca no TikTok/Instagram da loja)
            platforms: p.kind === "story" || p.options?.brand === "paginaspro" ? p.platforms : platforms,
            media: await renderPostMedia(p),
            caption,
            scheduled_at,
            status: "scheduled",
            options: {
              ...(p.options ?? {}),
              ...(onTikTok ? { tiktok: toApiOptions(ttOpts) } : {}),
              // Post da PáginasPro continua na conta dela
              ...(p.options?.brand === "paginaspro" ? {} : { account_ids }),
            },
          });
          saved++;
          continue;
        }
        await api.insert("posts", {
          platforms,
          kind: it.type === "video" ? "reel" : "image",
          media: [{ url: it.url!, type: it.type }],
          slides: null,
          design: null,
          caption,
          title: it.name,
          scheduled_at,
          status: "scheduled",
          results: {},
          options: { ...(onTikTok ? { tiktok: toApiOptions(ttOpts) } : {}), account_ids },
          created_by: "user",
        });
        saved++;
      }
      await qc.invalidateQueries({ queryKey: ["table", "posts"] });
      toast.success(`${saved} posts agendados`);
      navigate("/studio/calendario");
    } catch (e) {
      toast.error(`${saved ? `${saved} agendados; ` : ""}${(e as Error).message}`);
      // Os que já foram agendados saem da lista para não duplicar ao tentar de novo
      if (saved) setItems((list) => list.slice(saved));
      await qc.invalidateQueries({ queryKey: ["table", "posts"] });
    } finally {
      setSaving(false);
    }
  };

  const uploading = items.filter((x) => x.uploading).length;
  const days = new Set(items.map((x) => schedule[x.id]?.slice(0, 10)).filter(Boolean)).size;

  return (
    <div>
      <PageHeader
        title="Agendar em massa"
        description="Mande várias fotos e vídeos de uma vez (ou traga os posts de Aprovações). Cada um vira um post, distribuído nos dias e horários que você escolher."
        actions={
          <Button size="sm" onClick={save} disabled={saving || !items.length}>
            {saving && <Loader2 className="animate-spin" />}
            Agendar {items.length ? `${items.length} posts` : ""}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Posts"
            description={items.length ? `${items.length} posts em ${days} dia(s)${uploading ? ` · enviando ${uploading}` : ""}` : "Fotos viram post de imagem; vídeos viram Reels (e vídeo no TikTok)."}
            bodyClassName="p-0"
          >
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            {items.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b px-4 py-3">
                <Button size="sm" onClick={() => fileRef.current?.click()}>
                  <ImagePlus />Mais arquivos
                </Button>
                <Button size="sm" variant="outline" onClick={writeCaptions} disabled={writing}>
                  {writing ? <Loader2 className="animate-spin" /> : <Sparkles />}Escrever legendas com IA
                </Button>
              </div>
            )}
            {items.length === 0 ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 px-4 py-12 text-[13px] text-muted-foreground hover:text-foreground"
              >
                <ImagePlus className="h-5 w-5" />
                Escolha as fotos e os vídeos (pode selecionar vários de uma vez)
              </button>
            ) : (
              <div className="divide-y">
                {items.map((it, i) => {
                  const slot = schedule[it.id];
                  return (
                    <div key={it.id} className="grid gap-3 p-3 sm:grid-cols-[84px_minmax(0,1fr)]">
                      <div className="relative w-[84px]">
                        {it.post && !it.preview && it.post.slides?.length ? (
                          <SlidePreview slide={it.post.slides[0]} index={0} total={it.post.slides.length} design={it.post.design} className="w-full" />
                        ) : it.type === "video" ? (
                          <video src={it.preview} className="aspect-[9/16] w-full rounded-md bg-black object-cover" muted playsInline preload="metadata" />
                        ) : (
                          <img src={it.preview} alt="" className="aspect-[4/5] w-full rounded-md border object-cover" />
                        )}
                        {it.uploading && (
                          <span className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60"><Loader2 className="h-4 w-4 animate-spin" /></span>
                        )}
                        <span className="absolute left-1 top-1 rounded bg-foreground/80 px-1 text-[10px] font-medium text-background">{i + 1}</span>
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{it.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {it.post?.kind === "carousel" ? `Carrossel · ${it.post.media.length || it.post.slides?.length || 0}` : it.type === "video" ? `Reels${it.seconds ? ` · ${Math.round(it.seconds)}s` : ""}` : "Foto"}
                          </span>
                          <div className="flex">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} aria-label="Mover para cima"><ArrowUp className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} aria-label="Mover para baixo"><ArrowDown className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setItems((s) => s.filter((x) => x.id !== it.id))} aria-label="Tirar da lista"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                        {it.error && <p className="flex items-center gap-1 text-xs text-danger"><AlertCircle className="h-3.5 w-3.5" />{it.error}</p>}
                        <Textarea
                          rows={3}
                          className="text-[13px]"
                          value={it.caption}
                          onChange={(e) => patch(it.id, { caption: e.target.value })}
                          placeholder="Legenda (ou use “Legendas com IA”)"
                        />
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Input
                            type="datetime-local"
                            className="h-8 w-auto text-xs"
                            value={it.when || slot || ""}
                            onChange={(e) => patch(it.id, { when: e.target.value })}
                            aria-label="Data e hora"
                          />
                          {slot ? <span className="text-muted-foreground">{formatSlot(slot)}{it.when ? " · escolhido por você" : ""}</span> : <span className="text-danger">Sem horário</span>}
                          {it.when && (
                            <button type="button" className="underline underline-offset-2" onClick={() => patch(it.id, { when: "" })}>automático</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
          {onTikTok && <TikTokSettings value={ttOpts} onChange={setTtOpts} isVideo={items.some((x) => x.type === "video")} />}
        </div>

        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Panel title="Onde publicar">
            {connected.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Conecte o Instagram ou o TikTok em Contas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connected.map((p) => {
                  const on = platforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPlatforms((cur) => (on ? cur.filter((x) => x !== p) : [...cur, p]))}
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
            )}
            {platforms.some((p) => accountsOf(p).length > 1) && (
              <div className="mt-4 space-y-3">
                {platforms.filter((p) => accountsOf(p).length > 1).map((p) => (
                  <div key={p} className="space-y-1.5">
                    <Label htmlFor={`acc-${p}`} className="text-xs">Conta do {p === "instagram" ? "Instagram" : "TikTok"}</Label>
                    <select
                      id={`acc-${p}`}
                      value={accountFor(p)?.id ?? ""}
                      onChange={(e) => chooseAccount(p, e.target.value)}
                      className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
                    >
                      {accountsOf(p).map((a) => (
                        <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
            <AccountProfile account={platforms.map(accountFor).find((a) => a && !isLoja(a))} />
          </Panel>

          <Panel title="Horários" description="Os posts entram, na ordem da lista, nos próximos horários livres a partir do dia escolhido.">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="start" className="text-xs">Começar em</Label>
                <Input id="start" type="date" className="h-9" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Horários de cada dia ({times.length} post{times.length === 1 ? "" : "s"} por dia)</Label>
                <div className="flex flex-wrap gap-2">
                  {times.map((t, i) => (
                    <div key={i} className="flex items-center rounded-md border">
                      <Input
                        type="time"
                        className="h-8 w-[96px] border-0 text-xs shadow-none focus-visible:ring-0"
                        value={t}
                        onChange={(e) => setTimes((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
                        aria-label={`Horário ${i + 1}`}
                      />
                      {times.length > 1 && (
                        <button type="button" className="px-1.5 text-muted-foreground hover:text-foreground" onClick={() => setTimes((cur) => cur.filter((_, j) => j !== i))} aria-label="Tirar horário">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {times.length < 8 && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setTimes((cur) => [...cur, "09:00"])}>
                      <Plus />Horário
                    </Button>
                  )}
                </div>
              </div>
              <label htmlFor="skip" className="flex items-center justify-between gap-3 text-[13px]">
                <span>Pular horários que já têm post</span>
                <Switch id="skip" checked={skipTaken} onCheckedChange={setSkipTaken} />
              </label>
            </div>
          </Panel>

          <Panel title="Legendas">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="hint" className="text-xs">Contexto para a IA (opcional)</Label>
                <Textarea id="hint" rows={3} className="text-[13px]" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Ex.: lançamento da coleção de Natal, frete grátis acima de R$ 99" />
                <p className="text-xs text-muted-foreground">A IA olha cada foto (ou um quadro do vídeo) e escreve a legenda de quem ainda está sem.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="suffix" className="text-xs">Texto no fim de todas as legendas (opcional)</Label>
                <Textarea id="suffix" rows={2} className="text-[13px]" value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="Ex.: Compre pelo link da bio 🛍️" />
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Perfil de uma conta fora da loja: a IA usa nas legendas dos posts dela. */
function AccountProfile({ account }: { account?: SocialAccount }) {
  const qc = useQueryClient();
  const [about, setAbout] = useState(account?.meta?.profile ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setAbout(account?.meta?.profile ?? ""), [account?.id, account?.meta?.profile]);
  if (!account) return null;
  const changed = about.trim() !== (account.meta?.profile ?? "").trim();
  const save = async () => {
    setSaving(true);
    try {
      await api.invoke("ai", { action: "account_profile", account_id: account.id, about });
      await qc.invalidateQueries({ queryKey: ["table", "social_accounts"] });
      toast.success("Perfil da conta salvo");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-4 space-y-1.5 border-t pt-4">
      <Label htmlFor="acc-profile" className="text-xs">Sobre @{account.username} (a IA usa nas legendas)</Label>
      <Textarea
        id="acc-profile"
        rows={5}
        className="text-[13px]"
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        placeholder={"Assunto da página, público, tom de voz, hashtags e chamada final.\nEx.: Curiosidades do dia a dia. Tom leve e direto. Hashtags: #curiosidades #vocesabia. Chamada: Siga para mais."}
      />
      {!account.meta?.profile && <p className="text-xs text-muted-foreground">Sem perfil, a IA escreve só sobre o que aparece no vídeo.</p>}
      {changed && (
        <Button size="sm" variant="outline" onClick={save} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}Salvar perfil
        </Button>
      )}
    </div>
  );
}
