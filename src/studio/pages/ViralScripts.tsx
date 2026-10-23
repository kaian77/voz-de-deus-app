import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Check, Clapperboard, ExternalLink, ImagePlus, Loader2, Save, Search, Sparkles, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../lib/api";
import { useSettings, useTable } from "../lib/hooks";
import { renderReelCover, suggestCoverAccent } from "../lib/reel-cover";
import type { Post } from "../lib/types";
import { PageHeader, Panel, SectionLabel } from "../components/bits";

type Script = {
  theme: string;
  format: "reel" | "story";
  hook: string;
  cover_title: string;
  duration_seconds: number;
  scenes: { time: string; visual: string; spoken: string }[];
  caption: string;
  hashtags: string[];
  cta: string;
  angle: string;
};
type ScriptResponse = { scripts: Script[]; sources: string[] };

const ACCENTS = ["#7c3aed", "#2563eb", "#db2777", "#ea580c", "#059669", "#18181b"];
const OBJECTIVES = ["Alcance e compartilhamentos", "Atrair seguidores", "Gerar conversas no direct", "Apresentar um produto ou serviço"];

function ScriptCard({ script, niche, accent, handle, photoUrl, onUse }: { script: Script; niche: string; accent: string; handle?: string; photoUrl?: string; onUse: (postId: string) => Promise<void> }) {
  const [coverTitle, setCoverTitle] = useState(script.cover_title || script.hook);
  const [busy, setBusy] = useState(false);
  const previewLines = coverTitle.toUpperCase().split(" ").reduce<string[]>((lines, word) => {
    const last = lines.at(-1);
    if (!last || `${last} ${word}`.length > 15) lines.push(word);
    else lines[lines.length - 1] = `${last} ${word}`;
    return lines;
  }, []);

  const useScript = async () => {
    setBusy(true);
    try {
      const cover = await renderReelCover({ title: coverTitle, niche, handle, accent, photoUrl });
      const coverUrl = await api.upload(cover, "capa-reel.jpg");
      const notes = [
        "ROTEIRO PARA REEL",
        `Tema: ${script.theme}`,
        `Duração aproximada: ${script.duration_seconds}s`,
        `Gancho: ${script.hook}`,
        "",
        ...script.scenes.map((scene, index) => `${index + 1}. ${scene.time} · ${scene.visual}\nFala: ${scene.spoken}`),
        "",
        `CTA: ${script.cta}`,
        `Estratégia: ${script.angle}`,
      ].join("\n");
      const row: Partial<Post> = {
        title: coverTitle,
        caption: `${script.caption}\n\n${script.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}`,
        kind: "reel",
        platforms: ["instagram"],
        media: [],
        slides: null,
        design: null,
        scheduled_at: null,
        status: "draft",
        results: {},
        options: { instagram: { cover_url: coverUrl } },
        created_by: "user",
        notes,
        published_at: null,
      };
      const post = await api.insert("posts", row);
      await onUse(post.id);
      toast.success("Roteiro e capa prontos. Adicione seu vídeo no próximo passo.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="p-5 md:border-r">
          <SectionLabel>Prévia da capa</SectionLabel>
          <div className="mx-auto mt-3 aspect-[9/16] w-full max-w-[185px] overflow-hidden rounded-2xl border border-white/20 p-3 text-white shadow-lg" style={{ background: photoUrl ? `linear-gradient(180deg, rgba(8,12,10,.15) 5%, rgba(8,12,10,.6) 48%, rgba(8,12,10,.88) 100%), url("${photoUrl}") center / cover` : `radial-gradient(circle at 85% 18%, ${accent}, transparent 38%), linear-gradient(150deg, #111116 10%, #252431 63%, ${accent} 140%)` }}>
            <div className="flex h-full flex-col justify-center rounded-xl border border-white/15 bg-black/30 p-4">
              <span className="text-[9px] font-semibold uppercase tracking-[.16em] text-white/75">{niche || "Seu segmento"}</span>
              <div className="my-4 h-1 w-10 rounded-full" style={{ background: accent }} />
              <p className="break-words text-[clamp(17px,5vw,27px)] font-black leading-[1.02] tracking-tight">{previewLines.map((line, index) => <span key={`${line}-${index}`} className="block">{line}</span>)}</p>
              <p className="mt-5 text-[8px] font-semibold tracking-[.12em] text-white/80">ASSISTA ATÉ O FINAL</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5"><Label htmlFor={`cover-${script.theme}`} className="text-xs">Título da capa</Label><Input id={`cover-${script.theme}`} value={coverTitle} maxLength={60} onChange={(event) => setCoverTitle(event.target.value)} /></div>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium"><Clapperboard className="h-3 w-3" /> Reel · cerca de {script.duration_seconds}s</span><h2 className="mt-3 text-lg font-semibold tracking-tight">{script.theme}</h2><p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{script.angle}</p></div>
            <Button size="sm" onClick={useScript} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}Usar roteiro + capa</Button>
          </div>
          <div className="rounded-xl border-l-4 bg-secondary/40 px-4 py-3" style={{ borderLeftColor: accent }}><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Gancho · primeiros segundos</p><p className="mt-1 text-sm font-semibold">{script.hook}</p></div>
          <div className="space-y-2"><SectionLabel>Cenas e falas</SectionLabel><div className="divide-y rounded-xl border">{script.scenes.map((scene, index) => <div key={`${scene.time}-${index}`} className="grid gap-1.5 px-3 py-2.5 sm:grid-cols-[64px_minmax(0,1fr)]"><span className="tabular text-xs font-semibold" style={{ color: accent }}>{scene.time}</span><div><p className="text-xs text-muted-foreground">{scene.visual}</p><p className="mt-1 text-[13px]">“{scene.spoken}”</p></div></div>)}</div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><SectionLabel>Legenda</SectionLabel><p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed">{script.caption}</p></div><div><SectionLabel>Chamada para ação</SectionLabel><p className="mt-1 text-[13px]">{script.cta}</p><SectionLabel className="mt-4">Hashtags</SectionLabel><p className="mt-1 text-xs text-muted-foreground">{script.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}</p></div></div>
        </div>
      </div>
    </article>
  );
}

export default function ViralScripts() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: accounts = [] } = useTable("social_accounts");
  const instagram = accounts.find((account) => account.platform === "instagram");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [focus, setFocus] = useState("");
  const [objective, setObjective] = useState(OBJECTIVES[0]);
  const [duration, setDuration] = useState(30);
  const [withTrends, setWithTrends] = useState(false);
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [result, setResult] = useState<ScriptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingAccent, setSavingAccent] = useState(false);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState("");
  const [savingPhoto, setSavingPhoto] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!niche && settings?.niche) setNiche(settings.niche);
    if (!audience && settings?.audience) setAudience(settings.audience);
  }, [settings?.niche, settings?.audience, niche, audience]);

  useEffect(() => {
    if (settings) setAccent(settings.instagram_cover_accent || suggestCoverAccent(settings.niche));
  }, [settings?.instagram_cover_accent, settings?.niche]);

  useEffect(() => {
    setCoverPhotoUrl(settings?.instagram_cover_photo_url ?? "");
  }, [settings?.instagram_cover_photo_url]);

  const saveAccent = async () => {
    setSavingAccent(true);
    try {
      await api.saveSettings({ instagram_cover_accent: accent });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Cor da marca salva para as próximas capas.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingAccent(false);
    }
  };

  const uploadCoverPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Escolha uma foto em formato de imagem.");
    if (file.size > 8 * 1024 * 1024) return toast.error("A foto precisa ter até 8 MB.");
    setSavingPhoto(true);
    try {
      const url = await api.upload(file, "foto-capa-perfil");
      await api.saveSettings({ instagram_cover_photo_url: url });
      setCoverPhotoUrl(url);
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Foto salva. Ela será usada nas próximas capas.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingPhoto(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  };

  const removeCoverPhoto = async () => {
    setSavingPhoto(true);
    try {
      await api.saveSettings({ instagram_cover_photo_url: null });
      setCoverPhotoUrl("");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Foto removida das próximas capas.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingPhoto(false);
    }
  };

  const generate = async () => {
    if (!niche.trim()) return toast.error("Escreva o segmento da marca para personalizar os roteiros.");
    setBusy(true);
    setResult(null);
    try {
      const response = await api.invoke<ScriptResponse>("ai", { action: "viral_scripts", niche, audience, focus, objective, duration, count: 3, with_trends: withTrends });
      setResult(response);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const used = async (postId: string) => {
    await qc.invalidateQueries({ queryKey: ["table", "posts"] });
    navigate(`/studio/criar?id=${postId}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Roteiros e capas" description="Ideias para Reels feitas para o segmento da sua marca, com cenas, falas, legenda e capa editável." />
      <section className="overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_85%_10%,hsl(var(--brand)/.15),transparent_34%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--secondary)/.7))] p-5 shadow-sm md:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px] lg:items-center">
          <div><span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium"><Sparkles className="h-3.5 w-3.5" /> Conteúdo sob medida</span><h2 className="mt-4 max-w-2xl text-2xl font-bold tracking-tight md:text-3xl">Transforme ideias em Reels que prendem a atenção.</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Receba 3 caminhos criativos com gancho, cenas para gravar, legenda e uma capa pronta para ajustar e levar ao seu post.</p></div>
          <div className="rounded-xl border bg-card/90 p-4"><p className="text-xs font-semibold">O roteiro vira um rascunho</p><div className="mt-3 space-y-2 text-xs text-muted-foreground"><p className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600" /> Cenas e falas em ordem</p><p className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600" /> Capa visual editável</p><p className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600" /> Revisão antes de agendar</p></div></div>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <Panel title="Monte seus roteiros" description="A IA usa o segmento e o público da marca para adaptar as ideias." bodyClassName="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="script-niche">Segmento / nicho</Label><Input id="script-niche" value={niche} onChange={(event) => { setNiche(event.target.value); if (!settings?.instagram_cover_accent) setAccent(suggestCoverAccent(event.target.value)); }} placeholder="Ex.: confeitaria artesanal" /></div><div className="space-y-1.5"><Label htmlFor="script-audience">Público que você quer atrair</Label><Input id="script-audience" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Ex.: pessoas que gostam de doces caseiros" /></div></div>
          <div className="space-y-1.5"><Label htmlFor="script-focus">Tema ou produto que quer destacar · opcional</Label><Textarea id="script-focus" rows={2} value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="Ex.: erros comuns, bastidores, uma dúvida que sempre aparece…" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="script-objective">Objetivo principal</Label><select id="script-objective" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={objective} onChange={(event) => setObjective(event.target.value)}>{OBJECTIVES.map((item) => <option key={item}>{item}</option>)}</select></div><div><Label className="mb-2 block">Duração do Reel</Label><div className="flex gap-1 rounded-lg border bg-secondary/40 p-1">{([15, 30, 45] as const).map((seconds) => <button key={seconds} type="button" onClick={() => setDuration(seconds)} className={`flex-1 rounded-md px-2 py-2 text-xs ${duration === seconds ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>{seconds} segundos</button>)}</div></div></div>
          <label className="flex items-start gap-3 rounded-xl border bg-secondary/20 p-3.5"><input type="checkbox" checked={withTrends} onChange={(event) => setWithTrends(event.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-600" /><span><span className="flex items-center gap-1.5 text-[13px] font-medium"><Search className="h-3.5 w-3.5" /> Pesquisar assuntos atuais na web</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Quando ligado, buscamos sinais recentes e mostramos as fontes. Isso pode consumir mais créditos de IA; tendências não garantem viralização.</span></span></label>
          <div className="flex flex-wrap items-end justify-between gap-3"><div className="space-y-1.5"><div className="flex items-center gap-2"><Label className="text-xs">Cor da marca nas capas</Label><span className="text-[11px] text-muted-foreground">Sugestão pelo nicho; personalize se quiser</span></div><div className="flex items-center gap-2">{ACCENTS.map((color) => <button key={color} type="button" aria-label={`Cor da capa ${color}`} title={color} onClick={() => setAccent(color)} className={`h-6 w-6 rounded-full border-2 ${accent === color ? "border-foreground ring-2 ring-foreground/15" : "border-transparent"}`} style={{ background: color }} />)}<input aria-label="Outra cor para capa" type="color" value={accent} onChange={(event) => setAccent(event.target.value)} className="h-7 w-8 cursor-pointer rounded border p-0.5" /><Button type="button" size="sm" variant="outline" onClick={saveAccent} disabled={savingAccent}>{savingAccent ? <Loader2 className="animate-spin" /> : <Save />}Salvar cor</Button></div></div><Button onClick={generate} disabled={busy || !niche.trim()}>{busy ? <Loader2 className="animate-spin" /> : <WandSparkles />} {busy ? withTrends ? "Pesquisando e escrevendo…" : "Criando roteiros…" : "Gerar 3 roteiros + capas"}</Button></div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-secondary/20 p-3"><input ref={photoInput} type="file" accept="image/*" hidden onChange={(event) => void uploadCoverPhoto(event.target.files?.[0])} />{coverPhotoUrl ? <img src={coverPhotoUrl} alt="Foto que aparecerá nas capas" className="h-16 w-12 rounded-md border object-cover" /> : <div className="flex h-16 w-12 items-center justify-center rounded-md border border-dashed text-muted-foreground"><ImagePlus className="h-4 w-4" /></div>}<div className="min-w-0 flex-1"><p className="text-xs font-medium">Foto do perfil nas capas · opcional</p><p className="mt-1 text-[11px] text-muted-foreground">A foto fica salva na conta e aparece ao fundo, com contraste para manter o título legível.</p></div><Button type="button" size="sm" variant="outline" onClick={() => photoInput.current?.click()} disabled={savingPhoto}>{savingPhoto ? <Loader2 className="animate-spin" /> : <ImagePlus />}{coverPhotoUrl ? "Trocar foto" : "Enviar foto"}</Button>{coverPhotoUrl && <Button type="button" size="icon" variant="ghost" aria-label="Remover foto das capas" onClick={() => void removeCoverPhoto()} disabled={savingPhoto}><X /></Button>}</div>
          {!instagram && <p className="text-xs text-amber-700">Você pode criar os roteiros agora. Para agendar ou publicar, conecte uma conta profissional do Instagram.</p>}
        </Panel>

        <aside className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2"><Clapperboard className="h-4 w-4" /><p className="text-sm font-semibold">Como funciona</p></div><ol className="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground"><li><b className="mr-1 text-foreground">1.</b> Escolha seu segmento e objetivo.</li><li><b className="mr-1 text-foreground">2.</b> Receba ideias, falas e uma capa 9:16 com título ajustável.</li><li><b className="mr-1 text-foreground">3.</b> Use o roteiro: ele fica como rascunho no criador de posts.</li><li><b className="mr-1 text-foreground">4.</b> Coloque seu vídeo, confira a capa e aprove antes de agendar.</li></ol><p className="mt-4 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">O sistema sugere formatos e temas. O resultado depende da gravação, do público e do comportamento do Instagram; não existe garantia de alcance viral.</p></aside>
      </div>

      {busy && <div className="flex items-center gap-3 rounded-xl border bg-card p-5 text-sm"><Loader2 className="h-5 w-5 animate-spin" /><div><p className="font-medium">{withTrends ? "Procurando assuntos recentes e montando suas ideias…" : "Montando seus roteiros…"}</p><p className="text-xs text-muted-foreground">Pode levar alguns instantes.</p></div></div>}
      {result && <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Sua próxima gravação começa aqui</p><h2 className="mt-1 text-xl font-semibold">3 ideias para {niche}</h2></div><Button variant="outline" size="sm" onClick={generate} disabled={busy}><WandSparkles /> Gerar outras ideias</Button></div>
        {result.sources?.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary/30 px-3 py-2 text-xs"><span className="font-medium">Fontes consultadas:</span>{result.sources.map((source) => <a key={source} href={source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-1 text-muted-foreground hover:text-foreground">{new URL(source).hostname.replace(/^www\./, "")}<ExternalLink className="h-3 w-3" /></a>)}</div>}
        {result.scripts.map((script, index) => <ScriptCard key={`${script.theme}-${index}`} script={script} niche={niche} accent={accent} handle={instagram?.username ?? undefined} photoUrl={coverPhotoUrl || undefined} onUse={used} />)}
      </div>}
    </div>
  );
}
