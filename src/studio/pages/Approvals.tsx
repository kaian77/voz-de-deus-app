import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bot, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import { useInvalidate, useTable } from "../lib/hooks";
import { renderAndUploadSlides } from "../lib/publishing";
import type { Post } from "../lib/types";
import { EmptyState, formatDateTime, KIND_LABEL, PageHeader, PlatformIcon, SectionLabel, SlidePreview } from "../components/bits";
import { PostThumb } from "../components/PostThumb";

function ApprovalItem({ post }: { post: Post }) {
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const slides = post.slides?.length && !post.media.length ? (post.kind === "carousel" ? post.slides : post.slides.slice(0, 1)) : null;

  const approve = async () => {
    setBusy("approve");
    try {
      const media = slides ? await renderAndUploadSlides(slides, post.design) : post.media;
      const future = post.scheduled_at && new Date(post.scheduled_at) > new Date();
      await api.update("posts", post.id, { media, status: future ? "scheduled" : "draft" });
      toast.success(future ? `Aprovado. Sai ${formatDateTime(post.scheduled_at)}.` : "Aprovado como rascunho. Defina um horário para agendar.");
      invalidate("posts");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy("reject");
    await api.remove("posts", post.id).catch((e) => toast.error(e.message));
    toast("Sugestão descartada");
    invalidate("posts");
    setBusy(null);
  };

  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-[13px]">
        <span className="flex items-center gap-1.5 font-medium"><Bot className="h-3.5 w-3.5 text-muted-foreground" /> {post.title || KIND_LABEL[post.kind]}</span>
        <span className="text-muted-foreground">{KIND_LABEL[post.kind]}</span>
        <span className="flex gap-1.5">{post.platforms.map((p) => <PlatformIcon key={p} platform={p} />)}</span>
        <span className="tabular ml-auto text-xs text-muted-foreground">{formatDateTime(post.scheduled_at)}</span>
      </header>
      <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {slides ? (
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
            {slides.map((s, i) => <SlidePreview key={i} slide={s} index={i} total={slides.length} design={post.design} className="w-[200px] shrink-0 snap-start" />)}
          </div>
        ) : (
          <PostThumb post={post} className="max-w-[240px]" />
        )}
        <div className="flex min-w-0 flex-col gap-4">
          {post.notes && (
            <div>
              <SectionLabel className="mb-1">Por que este post</SectionLabel>
              <p className="text-[13px] text-foreground/80">{post.notes}</p>
            </div>
          )}
          <div>
            <SectionLabel className="mb-1">Legenda</SectionLabel>
            <p className="max-h-44 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed">{post.caption}</p>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={approve} disabled={!!busy}>
              {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Aprovar
            </Button>
            <Button asChild size="sm" variant="outline"><Link to={`/studio/criar?id=${post.id}`}>Editar</Link></Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={reject} disabled={!!busy}>Descartar</Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function Approvals() {
  const { data: posts = [] } = useTable("posts");
  const pending = posts.filter((p) => p.status === "pending_approval").sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  return (
    <div>
      <PageHeader title="Aprovações" description="Posts que o Claude preparou. Nada é publicado sem o seu aval enquanto a aprovação estiver ligada." />
      {pending.length === 0 ? (
        <EmptyState icon={<Bot />} title="Nenhum post esperando aprovação">
          Peça ao Claude algo como “crie 3 carrosséis para esta semana e agende nos melhores horários”. Eles aparecem aqui.
        </EmptyState>
      ) : (
        <div className="space-y-4">{pending.map((p) => <ApprovalItem key={p.id} post={p} />)}</div>
      )}
    </div>
  );
}
