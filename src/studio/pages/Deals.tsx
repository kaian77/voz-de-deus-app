import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, ExternalLink, Loader2, Play, ShoppingBag, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useInvalidate, useTable } from "../lib/hooks";
import type { Deal } from "../lib/types";
import { EmptyState, PageHeader, Panel, relativeTime } from "../components/bits";

const brl = (v: number | null) => (v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

const copy = (text: string | null, what: string) =>
  text ? navigator.clipboard.writeText(text).then(() => toast.success(`${what} copiado`)) : toast.error("Ainda não está pronto");

export default function Deals() {
  const invalidate = useInvalidate();
  const { data: deals = [] } = useTable("deals", { order: "created_at", limit: 60 }, { refetchInterval: 30000 });
  const [watching, setWatching] = useState<Deal | null>(null);
  const [asking, setAsking] = useState(false);
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const todo = deals.filter((d) => d.status === "ready" || d.status === "rendering");
  const done = deals.filter((d) => d.status === "posted");
  const list = tab === "todo" ? todo : done;

  const mark = async (d: Deal, status: Deal["status"]) => {
    try {
      await api.update("deals", d.id, { status, posted_at: status === "posted" ? new Date().toISOString() : null, updated_at: new Date().toISOString() });
      invalidate("deals");
      toast.success(status === "posted" ? "Marcado como postado" : "Pulado");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const more = async () => {
    setAsking(true);
    try {
      const r = await api.invoke<{ started: boolean }>("ai", { action: "deals_more" });
      toast.success(r.started ? "Escolhendo produtos e fazendo os vídeos: ficam prontos em uns 15 min." : "Na fila: roda amanhã cedo.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Achadinhos"
        description="Todo dia o robô escolhe produtos baratos e bem avaliados no feed da Shopee Afiliados e faz um vídeo de cada um, com o seu link de afiliado. A Shopee não deixa postar automático: baixe o vídeo e poste no Shopee Vídeo marcando o produto."
        actions={<Button onClick={more} disabled={asking}>{asking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}Gerar mais 3</Button>}
      />

      <div className="mb-4 flex gap-2">
        <Button size="sm" variant={tab === "todo" ? "default" : "outline"} onClick={() => setTab("todo")}>Para postar ({todo.length})</Button>
        <Button size="sm" variant={tab === "done" ? "default" : "outline"} onClick={() => setTab("done")}>Postados ({done.length})</Button>
      </div>

      {!list.length ? (
        <EmptyState icon={<ShoppingBag />} title={tab === "todo" ? "Nenhum achadinho para postar" : "Nada postado ainda"}>
          {tab === "todo" ? "Os vídeos novos saem todo dia às 7h47. Para fazer agora, clique em Gerar mais 3." : "Depois de postar, marque o vídeo como postado."}
        </EmptyState>
      ) : (
        <Panel title="Como postar" description="1. Baixar vídeo · 2. App da Shopee → Vídeo → + → escolha o vídeo · 3. Cole a legenda · 4. Adicionar produto: toque em Nome do produto aqui e cole na busca · 5. Ligue o rótulo de IA e poste." bodyClassName="p-0">
          <div className="divide-y">
            {list.map((d) => (
              <div key={d.id} className="flex gap-3 px-4 py-3">
                <button type="button" onClick={() => d.video_url && setWatching(d)} className="relative w-20 shrink-0" aria-label="Assistir">
                  {d.thumb_url || d.image_url ? (
                    <img src={d.thumb_url ?? d.image_url ?? ""} alt="" className="aspect-[9/16] w-full rounded object-cover" />
                  ) : <div className="aspect-[9/16] rounded bg-secondary" />}
                  {d.video_url && <span className="absolute inset-0 grid place-items-center rounded bg-black/25 text-white"><Play className="h-5 w-5 fill-white" /></span>}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] font-medium">{d.name || d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.discount ? <span className="line-through">{brl(d.price)}</span> : null} <span className="font-medium text-foreground">{brl(d.sale_price)}</span>
                    {d.discount ? ` · -${d.discount}%` : ""} · ⭐ {d.rating ?? "-"} · {d.likes ?? 0} curtidas · {relativeTime(d.created_at)}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">Produto para marcar: <span className="text-foreground">{d.title}</span>{d.shop_name ? ` · loja ${d.shop_name}` : ""}</p>
                  {d.status === "rendering" && <p className="flex items-center gap-1 text-xs text-amber-600"><Loader2 className="h-3 w-3 animate-spin" />Fazendo o vídeo…</p>}
                  <div className={cn("mt-1.5 flex flex-wrap gap-2", d.status === "rendering" && "opacity-50")}>
                    {d.video_url && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                        <a href={d.video_url} download={`achadinho-${d.itemid}.mp4`} target="_blank" rel="noreferrer"><Download className="mr-1 h-3.5 w-3.5" />Baixar vídeo</a>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copy(d.title, "Nome do produto")}><Copy className="mr-1 h-3.5 w-3.5" />Nome do produto</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copy(d.caption, "Legenda")}><Copy className="mr-1 h-3.5 w-3.5" />Legenda</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copy(d.aff_link, "Link de afiliado")}><Copy className="mr-1 h-3.5 w-3.5" />Link de afiliado</Button>
                    {d.product_link && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                        <a href={d.aff_link ?? d.product_link} target="_blank" rel="noreferrer">Abrir na Shopee <ExternalLink className="ml-1 h-3 w-3" /></a>
                      </Button>
                    )}
                    {tab === "todo" && d.status === "ready" && (
                      <>
                        <Button size="sm" className="h-7 text-xs" onClick={() => mark(d, "posted")}><Check className="mr-1 h-3.5 w-3.5" />Postei</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => mark(d, "skipped")}><X className="mr-1 h-3.5 w-3.5" />Pular</Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Dialog open={!!watching} onOpenChange={(o) => !o && setWatching(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-sm">{watching?.name || watching?.title}</DialogTitle>
          {watching?.video_url && <video src={watching.video_url} controls autoPlay playsInline className="aspect-[9/16] w-full rounded bg-black" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
