import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bot, Check, Loader2, PenSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "../lib/api";
import { useInvalidate, useTable } from "../lib/hooks";
import { renderAndUploadSlides } from "../lib/publishing";
import type { Post } from "../lib/types";
import { EmptyState, formatDateTime, KIND_LABEL, PageHeader, PlatformIcon, SlidePreview } from "../components/bits";
import { PostThumb } from "../components/PostThumb";

function ApprovalCard({ post }: { post: Post }) {
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const approve = async () => {
    setBusy("approve");
    try {
      let media = post.media;
      if (!media.length && post.slides?.length) {
        const slides = post.kind === "carousel" ? post.slides : post.slides.slice(0, 1);
        media = await renderAndUploadSlides(slides, post.design);
      }
      const future = post.scheduled_at && new Date(post.scheduled_at) > new Date();
      await api.update("posts", post.id, { media, status: future ? "scheduled" : "draft" });
      toast.success(future ? `Aprovado e agendado para ${formatDateTime(post.scheduled_at)}` : "Aprovado como rascunho — defina um horário para agendar.");
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
    invalidate("posts");
    setBusy(null);
  };

  return (
    <Card>
      <CardContent className="grid gap-5 p-5 md:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          {post.slides?.length && !post.media.length ? (
            <div className="flex snap-x gap-2 overflow-x-auto pb-2">
              {(post.kind === "carousel" ? post.slides : post.slides.slice(0, 1)).map((s, i, arr) => (
                <SlidePreview key={i} slide={s} index={i} total={arr.length} design={post.design} className="w-[220px] shrink-0 snap-center" />
              ))}
            </div>
          ) : (
            <PostThumb post={post} />
          )}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Bot className="h-4 w-4 text-violet-600" />
            <span className="font-semibold">{post.title || KIND_LABEL[post.kind]}</span>
            {post.platforms.map((p) => <PlatformIcon key={p} platform={p} />)}
            <span className="text-muted-foreground">· {formatDateTime(post.scheduled_at)}</span>
          </div>
          {post.notes && <p className="rounded-md bg-violet-50 p-3 text-sm text-violet-900"><b>Por quê:</b> {post.notes}</p>}
          <p className="max-h-48 overflow-y-auto whitespace-pre-line rounded-md border p-3 text-sm">{post.caption}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={approve} disabled={!!busy}>
              {busy === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Aprovar
            </Button>
            <Button asChild variant="outline"><Link to={`/studio/criar?id=${post.id}`}><PenSquare className="mr-2 h-4 w-4" /> Editar</Link></Button>
            <Button variant="ghost" onClick={reject} disabled={!!busy}>
              <X className="mr-2 h-4 w-4" /> Descartar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Approvals() {
  const { data: posts = [] } = useTable("posts");
  const pending = posts.filter((p) => p.status === "pending_approval");
  return (
    <div>
      <PageHeader title="Aprovações" description="Conteúdos que o Claude criou para você. Aprove, edite ou descarte." />
      {pending.length === 0 ? (
        <EmptyState icon={<Bot className="h-8 w-8" />} title="Nada esperando aprovação">
          Peça ao Claude: "crie 3 carrosséis para esta semana e agende nos melhores horários". Eles aparecem aqui.
        </EmptyState>
      ) : (
        <div className="space-y-4">{pending.map((p) => <ApprovalCard key={p.id} post={p} />)}</div>
      )}
    </div>
  );
}
