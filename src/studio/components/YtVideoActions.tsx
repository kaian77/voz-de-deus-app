import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../lib/api";
import { useInvalidate } from "../lib/hooks";
import type { YtVideo } from "../lib/types";

/** Refazer / Apagar um vídeo do YouTube (piloto bíblico ou corte): apaga no canal também. */
export function YtVideoActions({ video }: { video: YtVideo }) {
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<"redo" | "delete" | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  if (["scripting", "rendering", "redo", "deleted"].includes(video.status)) return null;
  const clip = video.kind === "clip";

  const run = async (action: "yt_video_redo" | "yt_video_delete") => {
    setBusy(action === "yt_video_redo" ? "redo" : "delete");
    try {
      await api.invoke("ai", { action, id: video.id, note });
      toast.success(action === "yt_video_delete" ? "Apagado do canal e do Studio."
        : clip ? "Refazendo: um corte novo, de outro momento, sai em 30 min a 2 h." : "Refazendo: roteiro e vídeo novos saem em alguns minutos.");
      setAsking(false);
      setNote("");
      invalidate("yt_videos");
    } catch (e) {
      toast.error((e as Error).message, { duration: 10000 });
    } finally {
      setBusy(null);
    }
  };

  const remove = () => {
    if (confirm(video.youtube_id ? "Apagar este vídeo do canal do YouTube e do Studio?" : "Apagar este vídeo do Studio?")) run("yt_video_delete");
  };

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAsking(true)} disabled={busy !== null}>
        <RotateCcw className="mr-1 h-3.5 w-3.5" />Refazer
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-danger" onClick={remove} disabled={busy !== null} aria-label="Apagar">
        {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Apagar
      </Button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-sm">Refazer: {video.title ?? video.topic}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {video.youtube_id ? "Este vídeo é apagado do canal e " : ""}
            {clip ? "a IA escolhe outro momento do mesmo episódio." : "a IA escreve um roteiro novo sobre o mesmo tema e monta o vídeo de novo."}
          </p>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={clip ? "O que mudar? (opcional) Ex.: um momento mais engraçado, mais curto…" : "O que mudar? (opcional) Ex.: gancho mais forte, falar de Davi…"} />
          <Button onClick={() => run("yt_video_redo")} disabled={busy !== null}>
            {busy === "redo" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}Refazer
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
