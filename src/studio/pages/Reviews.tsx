import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSaveRow, useTable } from "../lib/hooks";
import { EmptyState, formatDateTime, PageHeader } from "../components/bits";

const FORM_URL = "https://voz-de-deus-app.vercel.app/avaliar";

/** Avaliações do formulário "Avalie e ganhe 10%": o dono aprova as que podem ir para o site. */
export default function Reviews() {
  const { data: reviews = [] } = useTable("site_reviews");
  const save = useSaveRow("site_reviews");
  const pending = reviews.filter((r) => r.status === "pending").length;
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1).replace(".", ",") : null;

  return (
    <div>
      <PageHeader
        title="Avaliações"
        description={`Clientes que avaliaram pelo site ganham o cupom de 10% na hora e por e-mail.${avg ? ` Nota média ${avg} · ${pending} para aprovar.` : ""}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
        <span className="text-muted-foreground">Link do formulário:</span>
        <code className="truncate text-xs">{FORM_URL}</code>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => navigator.clipboard?.writeText(FORM_URL).then(() => toast.success("Link copiado"))}>
          Copiar
        </Button>
      </div>
      {reviews.length === 0 ? (
        <EmptyState icon={<Star className="h-5 w-5" />} title="Nenhuma avaliação ainda">Mande o link do formulário para quem já comprou (WhatsApp, Instagram, e-mail pós-venda).</EmptyState>
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {reviews.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="text-[#FFC72C]">{"★".repeat(r.rating)}</span>
                  <span className="text-muted-foreground/40">{"★".repeat(5 - r.rating)}</span>
                  <span className="ml-2 font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">pedido #{r.order_number} · {formatDateTime(r.created_at)}</span>
                </p>
                {r.comment && <p className="mt-1 text-sm">“{r.comment}”</p>}
                {r.products && <p className="mt-1 truncate text-xs text-muted-foreground">{r.products}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  Cupom {r.coupon} · {r.emailed_at ? "e-mail enviado" : r.email_error ? `e-mail não saiu (${r.email_error})` : "e-mail na fila"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {r.status !== "approved" && (
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => save.mutate({ id: r.id, status: "approved" })}>Aprovar para o site</Button>
                )}
                {r.status !== "hidden" && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => save.mutate({ id: r.id, status: "hidden" })}>Ocultar</Button>
                )}
                {r.status === "approved" && <span className="self-center text-xs font-medium text-success">No site</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
