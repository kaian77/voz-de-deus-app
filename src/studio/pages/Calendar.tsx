import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Loader2, MoreHorizontal, Palette, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useInvalidate, useRemoveRow, useSettings, useTable } from "../lib/hooks";
import { api } from "../lib/api";
import { IS_INSTAGRAM_PRODUCT } from "../lib/product";
import type { Post } from "../lib/types";
import { EmptyState, formatDateTime, sentence, formatTime, KIND_LABEL, PageHeader, PlatformIcon, STATUS, StatusBadge } from "../components/bits";
import { PostThumb } from "../components/PostThumb";
import { TIKTOK_INBOX_NOTE, toastPublishResult } from "@/studio/lib/publish-toast";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const when = (p: Post) => p.published_at ?? p.scheduled_at;

const DOT: Record<string, string> = { neutral: "bg-muted-foreground/50", brand: "bg-brand", success: "bg-success", warning: "bg-warning", danger: "bg-danger" };

function PostActions({ post }: { post: Post }) {
  const remove = useRemoveRow("posts");
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      const r = await api.publishNow(post);
      if (r.status === "failed") toast.error("A publicação falhou de novo. Veja o motivo na lista.");
      else toastPublishResult(r);
      invalidate("posts");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const links = Object.entries(post.results ?? {}).filter(([, r]) => r?.permalink);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ações do post">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {post.status !== "published" && <DropdownMenuItem asChild><Link to={`/studio/criar?id=${post.id}`}>Editar</Link></DropdownMenuItem>}
        {post.status === "failed" && <DropdownMenuItem onSelect={retry}>Tentar publicar de novo</DropdownMenuItem>}
        {links.map(([p, r]) => (
          <DropdownMenuItem key={p} asChild>
            <a href={r!.permalink} target="_blank" rel="noreferrer">Abrir no {p === "instagram" ? "Instagram" : "TikTok"} <ExternalLink className="ml-auto h-3 w-3" /></a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-danger focus:text-danger"
          onSelect={() => {
            // Publicado: o Instagram/TikTok não deixam o Studio apagar o post lá; sai só daqui
            if (post.status === "published" && !confirm("Tirar este post do Studio?\n\nNo Instagram e no TikTok ele continua: o Studio não consegue apagar lá. Para apagar, abra o post (Abrir no Instagram/TikTok) e apague pelo app.")) return;
            remove.mutate(post.id);
          }}
        >
          {post.status === "published" ? "Tirar do Studio" : "Excluir post"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PostLine({ post, showDate }: { post: Post; showDate?: boolean }) {
  const errors = Object.entries(post.results ?? {}).filter(([, r]) => r?.error);
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <PostThumb post={post} className="w-10 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{post.title || post.caption.split("\n")[0] || "Sem legenda"}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="tabular">{showDate ? formatDateTime(when(post)) : when(post) ? formatTime(when(post)!) : "Sem data"}</span>
          <span>·</span>
          <span>{KIND_LABEL[post.kind]}</span>
          {post.created_by === "agent" && <><span>·</span><span>criado pelo Claude</span></>}
        </p>
        {errors.map(([p, r]) => <p key={p} className="mt-1 text-xs text-danger">{p === "instagram" ? "Instagram" : "TikTok"}: {r!.error}</p>)}
        {post.results?.tiktok?.inbox && <p className="mt-1 text-xs text-muted-foreground">TikTok: {TIKTOK_INBOX_NOTE}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden gap-1.5 sm:flex">{post.platforms.map((p) => <PlatformIcon key={p} platform={p} />)}</span>
        <span className="hidden w-24 sm:block"><StatusBadge status={post.status} /></span>
        <PostActions post={post} />
      </div>
    </div>
  );
}

export default function Calendar() {
  const { data: allPosts = [] } = useTable("posts");
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const posts = allPosts.filter((post) => !IS_INSTAGRAM_PRODUCT || post.platforms.includes("instagram"));
  const [view, setView] = useState<"mes" | "semana" | "lista">("mes");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [appearance, setAppearance] = useState<{ accent: string; style: "clean" | "soft" | "editorial" }>({ accent: "#8b5cf6", style: "soft" });
  useEffect(() => {
    if (settings?.calendar_appearance) setAppearance({ accent: "#8b5cf6", style: "soft", ...settings.calendar_appearance });
  }, [settings?.calendar_appearance]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date>(new Date());

  const days = useMemo(() => {
    const start = view === "semana" ? new Date(selected) : new Date(cursor);
    if (view === "semana") start.setDate(start.getDate() - start.getDay());
    else start.setDate(1 - start.getDay());
    const count = view === "semana" ? 7 : 42;
    return Array.from({ length: count }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor, selected, view]);

  const postsOn = (d: Date) => posts.filter((p) => when(p) && sameDay(new Date(when(p)!), d)).sort((a, b) => when(a)!.localeCompare(when(b)!));
  const dayPosts = postsOn(selected);
  const drafts = posts.filter((p) => !when(p));
  const sortedList = [...posts].sort((a, b) => (when(b) ?? b.created_at).localeCompare(when(a) ?? a.created_at));
  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const calendarLabel = view === "semana"
    ? `${days[0].toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`
    : sentence(monthLabel);
  const saveAppearance = async () => {
    setSavingAppearance(true);
    try {
      await api.saveSettings({ calendar_appearance: appearance });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Visual do calendário salvo");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingAppearance(false);
    }
  };
  const calendarFrame = appearance.style === "soft" ? "rounded-2xl shadow-sm" : appearance.style === "editorial" ? "rounded-none shadow-none" : "rounded-lg";
  const cellStyle = appearance.style === "soft" ? "m-0.5 rounded-lg border border-border/60" : appearance.style === "editorial" ? "border-b border-r-0" : "border-b border-r";

  return (
    <div className="space-y-5" style={{ "--calendar-accent": appearance.accent } as CSSProperties}>
      <PageHeader
        title="Calendário"
        description={IS_INSTAGRAM_PRODUCT ? "Planeje sua semana, acompanhe aprovações e veja o que já foi publicado no Instagram." : "Tudo que foi publicado e o que está programado."}
        actions={
          <>
            <div className="inline-flex rounded-md border bg-secondary/60 p-0.5">
              {(["mes", "semana", "lista"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={cn("h-7 rounded px-3 text-xs font-medium", view === v ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {v === "mes" ? "Mês" : v === "semana" ? "Semana" : "Lista"}
                </button>
              ))}
            </div>
            <Button size="sm" variant={appearanceOpen ? "secondary" : "outline"} onClick={() => setAppearanceOpen((open) => !open)}><Palette /> Aparência</Button>
            <Button asChild size="sm"><Link to="/studio/criar"><Plus /> Criar post</Link></Button>
          </>
        }
      />

      {appearanceOpen && (
        <section className="grid gap-5 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-[1fr_1.2fr_auto] md:items-end">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4" /> Personalize seu calendário</p>
            <p className="text-xs text-muted-foreground">Escolha uma cor e um formato. A preferência fica salva na sua conta.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {["#8b5cf6", "#2563eb", "#e11d48", "#ea580c", "#059669", "#18181b"].map((color) => <button key={color} type="button" aria-label={`Cor ${color}`} title={color} onClick={() => setAppearance((old) => ({ ...old, accent: color }))} className={cn("h-8 w-8 rounded-full border-2", appearance.accent === color ? "border-foreground ring-2 ring-foreground/20" : "border-transparent")} style={{ background: color }} />)}
            <input aria-label="Escolher cor personalizada" type="color" value={appearance.accent} onChange={(event) => setAppearance((old) => ({ ...old, accent: event.target.value }))} className="h-9 w-10 cursor-pointer rounded border bg-background p-1" />
            <div className="ml-1 flex gap-1 rounded-lg border bg-secondary/40 p-1">{(["clean", "soft", "editorial"] as const).map((style) => <button key={style} type="button" onClick={() => setAppearance((old) => ({ ...old, style }))} className={cn("rounded-md px-2.5 py-1.5 text-xs", appearance.style === style ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{style === "clean" ? "Clássico" : style === "soft" ? "Suave" : "Minimalista"}</button>)}</div>
          </div>
          <Button size="sm" onClick={saveAppearance} disabled={savingAppearance}>{savingAppearance ? <Loader2 className="animate-spin" /> : <Check />} Salvar visual</Button>
        </section>
      )}

      {view === "lista" ? (
        posts.length === 0 ? (
          <EmptyState icon={<Plus />} title="Nenhum post ainda" />
        ) : (
          <div className="divide-y rounded-lg border bg-card">{sortedList.map((p) => <PostLine key={p.id} post={p} showDate />)}</div>
        )
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className={cn("overflow-hidden border bg-card", calendarFrame)}>
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div><p className="text-[11px] font-medium uppercase tracking-[.12em] text-muted-foreground">Seu planejamento</p><h2 className="mt-0.5 text-base font-semibold">{calendarLabel}</h2></div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(d); }}>Hoje</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (view === "semana") setSelected(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - 7)); else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)); }} aria-label="Período anterior"><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (view === "semana") setSelected(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + 7)); else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)); }} aria-label="Próximo período"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </header>
            <div className="grid grid-cols-7 border-b bg-secondary/30">
              {WEEKDAYS.map((w) => <div key={w} className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{w}</div>)}
            </div>
            <div className={cn("grid grid-cols-7", view === "semana" && "min-h-[330px]")}>
              {days.map((d, i) => {
                const list = postsOn(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const isToday = sameDay(d, new Date());
                const isSelected = sameDay(d, selected);
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => setSelected(d)}
                    className={cn(
                      "flex min-h-[72px] flex-col gap-1.5 p-1.5 text-left transition-colors sm:min-h-[96px]",
                      cellStyle,
                      (i + 1) % 7 === 0 && "border-r-0",
                      view === "mes" && i >= 35 && "border-b-0",
                      view === "semana" && "min-h-[180px] sm:min-h-[280px]",
                      view === "mes" && !inMonth && "bg-secondary/20",
                      isSelected && "ring-1 ring-inset",
                      !isSelected && "hover:bg-secondary/40",
                    )}
                    style={isSelected ? { backgroundColor: `${appearance.accent}18`, outlineColor: appearance.accent } : undefined}
                  >
                    <span
                      className={cn(
                        "tabular flex h-6 min-w-6 items-center justify-center self-start rounded-full px-1.5 text-xs",
                        isToday ? "font-semibold text-white" : inMonth || view === "semana" ? "text-foreground/80" : "text-muted-foreground/60",
                      )}
                      style={isToday ? { backgroundColor: appearance.accent } : undefined}
                    >
                      {d.getDate()}
                    </span>
                    {list.slice(0, view === "semana" ? 6 : 3).map((p) => (
                      <span key={p.id} className="hidden w-full items-center gap-1 truncate rounded-md bg-secondary/50 px-1 py-0.5 text-[11px] text-foreground/80 sm:flex">
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[STATUS[p.status].tone])} />
                        <span className="tabular text-muted-foreground">{formatTime(when(p)!)}</span>
                        <span className="truncate">{KIND_LABEL[p.kind]}</span>
                      </span>
                    ))}
                    {list.length > 0 && (
                      <span className="flex gap-0.5 sm:hidden">{list.slice(0, 4).map((p) => <span key={p.id} className={cn("h-1.5 w-1.5 rounded-full", DOT[STATUS[p.status].tone])} />)}</span>
                    )}
                    {list.length > (view === "semana" ? 6 : 3) && <span className="hidden text-[10px] text-muted-foreground sm:block">+{list.length - (view === "semana" ? 6 : 3)}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-lg border bg-card">
              <header className="border-b px-4 py-2.5">
                <h2 className="text-sm font-semibold">{sentence(selected.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}</h2>
              </header>
              {dayPosts.length === 0 ? (
                <p className="px-4 py-6 text-[13px] text-muted-foreground">Nada programado neste dia.</p>
              ) : (
                <div className="divide-y">{dayPosts.map((p) => <PostLine key={p.id} post={p} />)}</div>
              )}
            </section>
            {drafts.length > 0 && (
              <section className="rounded-lg border bg-card">
                <header className="border-b px-4 py-2.5"><h2 className="text-sm font-semibold">Rascunhos sem data</h2></header>
                <div className="divide-y">{drafts.map((p) => <PostLine key={p.id} post={p} />)}</div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
