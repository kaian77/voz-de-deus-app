import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useTable } from "../lib/hooks";
import type { StoreOrder } from "../lib/types";
import { EmptyState, PageHeader, relativeTime, StatusDot } from "../components/bits";

const FILTERS = [
  { id: "open", label: "Em andamento" },
  { id: "closed", label: "Concluídos" },
  { id: "cancelled", label: "Cancelados" },
  { id: "any", label: "Todos" },
] as const;

type Tone = "success" | "neutral" | "danger" | "brand" | "warning";

function paymentTone(p?: string): Tone {
  if (p === "pago" || p === "pagamento autorizado") return "success";
  if (p === "aguardando pagamento") return "warning";
  if (p === "reembolsado" || p === "cancelado" || p === "abandonado") return "danger";
  return "neutral";
}

function shippingTone(s?: string): Tone {
  if (s === "entregue") return "success";
  if (s === "enviado") return "brand";
  return "neutral";
}

const sentence = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

export default function Orders() {
  const { data: accounts = [], isLoading: loadingAccounts } = useTable("social_accounts");
  const connected = accounts.some((a) => a.platform === "nuvemshop");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("open");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");

  const orders = useQuery({
    queryKey: ["store-orders", filter, q],
    queryFn: () => api.invoke<StoreOrder[]>("ai", { action: "store_orders", status: filter, q: q || undefined }),
    enabled: connected,
    retry: false,
    staleTime: 60 * 1000,
  });

  if (!loadingAccounts && !connected) {
    return (
      <div>
        <PageHeader title="Pedidos" description="Pagamentos, envios e rastreio da sua loja." />
        <EmptyState icon={<Package />} title="Conecte a sua loja Nuvemshop" action={<Button asChild size="sm"><Link to="/studio/contas">Ir para Contas</Link></Button>}>
          Com a loja conectada, você acompanha os pedidos aqui e o agente de mensagens responde “cadê meu pedido?” sozinho.
        </EmptyState>
      </div>
    );
  }

  const list = orders.data ?? [];

  return (
    <div>
      <PageHeader title="Pedidos" description="Pagamentos, envios e rastreio da sua loja Nuvemshop, ao vivo." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-md border bg-secondary/60 p-0.5">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={cn("h-7 rounded px-3 text-xs font-medium", filter === f.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {f.label}
            </button>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); }}>
          <Input className="h-8 w-full sm:w-64" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Número, nome ou e-mail" aria-label="Buscar pedido" />
          <Button size="sm" variant="outline" className="h-8" type="submit" aria-label="Buscar"><Search /></Button>
        </form>
      </div>

      {orders.isLoading || loadingAccounts ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : orders.error ? (
        <EmptyState icon={<Package />} title="Não consegui ler os pedidos">{(orders.error as Error).message}</EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon={<Package />} title="Nenhum pedido aqui">{q ? "Nada encontrado para essa busca." : "Os pedidos da loja aparecem aqui."}</EmptyState>
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {list.map((o) => (
            <article key={o.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
              <div className="min-w-0">
                <p className="text-[13px]">
                  <span className="tabular font-semibold">#{o.number}</span>{" "}
                  <span className="font-medium">{o.customer ?? "Cliente"}</span>{" "}
                  <span className="text-xs text-muted-foreground">{relativeTime(o.created_at)}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{o.items.join(" · ") || "—"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {o.status === "cancelled" ? (
                  <StatusDot tone="danger">Cancelado</StatusDot>
                ) : (
                  <>
                    <StatusDot tone={paymentTone(o.payment)}>{sentence(o.payment)}</StatusDot>
                    <StatusDot tone={shippingTone(o.shipping)}>{sentence(o.shipping)}</StatusDot>
                  </>
                )}
                {o.tracking_number && (
                  o.tracking_url ? (
                    <a href={o.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs underline underline-offset-2">
                      {o.tracking_number} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : <span className="font-mono text-xs">{o.tracking_number}</span>
                )}
              </div>
              <div className="text-left sm:text-right">
                <p className="tabular text-[13px] font-medium">{o.total ?? "—"}</p>
                {o.shipping_option && <p className="truncate text-xs text-muted-foreground">{o.shipping_option}</p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
