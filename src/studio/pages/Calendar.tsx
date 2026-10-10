import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, PenSquare, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useInvalidate, useRemoveRow, useTable } from "../lib/hooks";
import type { Post } from "../lib/types";
import { formatDateTime, KIND_LABEL, PageHeader, PlatformIcon, StatusBadge } from "../components/bits";
import { PostThumb } from "../components/PostThumb";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function PostRow({ post }: { post: Post }) {
  const remove = useRemoveRow("posts");
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      const r = await api.publishNow(post);
      toast[r.status === "failed" ? "error" : "success"](r.status === "failed" ? "Falhou de novo — veja o erro abaixo." : "Publicação enviada!");
      invalidate("posts");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const errors = Object.entries(post.results ?? {}).filter(([, r]) => r?.error);
  const links = Object.entries(post.results ?? {}).filter(([, r]) => r?.permalink);
  return (
    <Card>
      <CardContent className="flex gap-4 p-4">
        <PostThumb post={post} className="w-20 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={post.status} />
            <span className="text-xs text-muted-foreground">{KIND_LABEL[post.kind]}</span>
            {post.platforms.map((p) => <PlatformIcon key={p} platform={p} />)}
            {post.created_by === "agent" && <span className="text-xs font-medium text-violet-700">criado pelo Claude</span>}
          </div>
          <p className="truncate font-medium">{post.title || post.caption.split("\n")[0] || "Sem legenda"}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(post.published_at ?? post.scheduled_at)}</p>
          {errors.map(([p, r]) => <p key={p} className="text-xs text-destructive">{p}: {r!.error}</p>)}
          {links.map(([p, r]) => (
            <a key={p} href={r!.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Ver no {p} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {post.status !== "published" && (
            <Button asChild size="icon" variant="ghost" aria-label="Editar"><Link to={`/studio/criar?id=${post.id}`}><PenSquare className="h-4 w-4" /></Link></Button>
          )}
          {post.status === "failed" && (
            <Button size="icon" variant="ghost" onClick={retry} disabled={busy} aria-label="Tentar de novo">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </Button>
          )}
          {post.status !== "published" && (
            <Button size="icon" variant="ghost" aria-label="Apagar" onClick={() => confirm("Apagar este post?") && remove.mutate(post.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Calendar() {
  const { data: posts = [] } = useTable("posts");
  const navigate = useNavigate();
  const [view, setView] = useState<"mes" | "lista">("mes");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date>(new Date());

  const days = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor]);

  const dated = posts.filter((p) => p.scheduled_at || p.published_at);
  const postsOn = (d: Date) => dated.filter((p) => sameDay(new Date(p.published_at ?? p.scheduled_at!), d));
  const dayPosts = postsOn(selected);
  const sortedList = [...posts].sort((a, b) => (b.scheduled_at ?? b.created_at).localeCompare(a.scheduled_at ?? a.created_at));

  return (
    <div>
      <PageHeader
        title="Calendário"
        description="Tudo o que foi e vai ser publicado."
        actions={
          <Tabs value={view} onValueChange={(v) => setView(v as "mes" | "lista")}>
            <TabsList>
              <TabsTrigger value="mes">Mês</TabsTrigger>
              <TabsTrigger value="lista">Lista</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {view === "lista" ? (
        <div className="space-y-3">{sortedList.map((p) => <PostRow key={p.id} post={p} />)}</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Card>
            <CardContent className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
                <p className="font-semibold capitalize">{cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
                <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
                {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((d) => {
                  const list = postsOn(d);
                  const inMonth = d.getMonth() === cursor.getMonth();
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => setSelected(d)}
                      onDoubleClick={() => navigate("/studio/criar")}
                      className={cn(
                        "flex min-h-[64px] flex-col items-start rounded-md border p-1 text-left text-xs transition-colors sm:min-h-[84px]",
                        !inMonth && "opacity-40",
                        sameDay(d, selected) ? "border-primary bg-primary/5" : "hover:bg-muted",
                      )}
                    >
                      <span className={cn("mb-1 font-medium", sameDay(d, new Date()) && "rounded bg-primary px-1 text-primary-foreground")}>{d.getDate()}</span>
                      <div className="flex w-full flex-col gap-0.5">
                        {list.slice(0, 3).map((p) => (
                          <span
                            key={p.id}
                            className={cn(
                              "truncate rounded px-1 text-[10px]",
                              p.status === "published" ? "bg-emerald-100 text-emerald-800" : p.status === "failed" ? "bg-red-100 text-red-800" : p.status === "pending_approval" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800",
                            )}
                          >
                            {new Date(p.published_at ?? p.scheduled_at!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {KIND_LABEL[p.kind]}
                          </span>
                        ))}
                        {list.length > 3 && <span className="text-[10px] text-muted-foreground">+{list.length - 3}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <div className="space-y-3">
            <p className="font-semibold capitalize">{selected.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
            {dayPosts.length === 0 && <p className="text-sm text-muted-foreground">Nada neste dia.</p>}
            {dayPosts.map((p) => <PostRow key={p.id} post={p} />)}
            <Button asChild variant="outline" className="w-full"><Link to="/studio/criar">Criar post</Link></Button>
            {posts.filter((p) => !p.scheduled_at && p.status === "draft").length > 0 && (
              <p className="text-xs text-muted-foreground">Rascunhos sem data aparecem na visão Lista.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
