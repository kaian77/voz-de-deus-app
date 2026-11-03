import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../lib/api";
import { Panel } from "./bits";

type Item = { id: number; name: string; image: string | null; url: string; published: boolean; stock: number | null; variants: number };
type Result = { mercadolivre?: Record<string, string> };

const mlNote = (r: Result) => {
  const v = Object.values(r.mercadolivre ?? {});
  if (!v.length) return "";
  const bad = v.filter((x) => x !== "ok" && x !== "encerrado");
  return bad.length ? ` Mercado Livre: ${bad[0]}` : " Mercado Livre também.";
};

/** Produtos da loja: busca, muda estoque e apaga (no site e no anúncio do Mercado Livre ligado). */
export function StoreManager() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const list = useQuery({
    queryKey: ["store-manage", search],
    queryFn: () => api.invoke<Item[]>("ai", { action: "store_manage_list", q: search || undefined }),
    staleTime: 60_000,
  });
  return (
    <Panel title="Produtos da loja" description="Mude o estoque ou apague. Vale para o site e para o anúncio do Mercado Livre." bodyClassName="p-0">
      <form className="flex gap-2 border-b p-3" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pelo nome (vazio = os últimos)" className="h-9" />
        <Button type="submit" size="sm" variant="outline" className="h-9"><Search /></Button>
      </form>
      {list.isLoading ? (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : list.error ? (
        <p className="p-4 text-sm text-danger">{(list.error as Error).message}</p>
      ) : !list.data?.length ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
      ) : (
        <div className="divide-y">
          {list.data.map((p) => <Row key={p.id} item={p} onChange={() => qc.invalidateQueries({ queryKey: ["store-manage"] })} />)}
        </div>
      )}
    </Panel>
  );
}

function Row({ item, onChange }: { item: Item; onChange: () => void }) {
  const [stock, setStock] = useState(item.stock === null ? "" : String(item.stock));
  const [busy, setBusy] = useState<"stock" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const changed = stock !== (item.stock === null ? "" : String(item.stock));

  const save = async () => {
    setBusy("stock");
    try {
      const r = await api.invoke<Result>("ai", { action: "store_stock", id: item.id, stock: stock.trim() === "" ? null : Number(stock) });
      toast.success(`Estoque salvo.${mlNote(r)}`);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("delete");
    try {
      const r = await api.invoke<Result>("ai", { action: "store_delete", id: item.id });
      toast.success(`Apagado do site.${mlNote(r) ? mlNote(r).replace("também", "encerrado") : ""}`);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
      {item.image ? <img src={item.image} alt="" className="h-10 w-10 rounded border object-cover" loading="lazy" /> : <div className="h-10 w-10 rounded border bg-muted" />}
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-[13px] font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {item.published ? "No ar" : "Escondido"}{item.variants > 1 ? ` · ${item.variants} variações` : ""}
          {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 underline">ver <ExternalLink className="h-3 w-3" /></a>}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Input value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="∞"
          className="h-8 w-20 text-center" aria-label="Estoque" title="Vazio = sem controle de estoque" />
        {changed && (
          <Button size="sm" className="h-8" onClick={save} disabled={!!busy}>{busy === "stock" && <Loader2 className="animate-spin" />}Salvar</Button>
        )}
        {confirming ? (
          <>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={remove} disabled={!!busy}>
              {busy === "delete" && <Loader2 className="animate-spin" />}Apagar de vez
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => setConfirming(true)} aria-label="Apagar"><Trash2 /></Button>
        )}
      </div>
    </div>
  );
}
