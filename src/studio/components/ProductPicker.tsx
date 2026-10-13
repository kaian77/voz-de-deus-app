import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";

/** Produto da loja vinculado a um post (fotos já copiadas para o storage do Studio). */
export type LinkedProduct = { id: number; name: string; url?: string; images: string[]; description?: string };

type Hit = { id: number; name: string; image?: string; url?: string };

/** Busca e escolhe um produto da Nuvemshop para o post. */
export default function ProductPicker({ value, onChange }: { value: LinkedProduct | null; onChange: (p: LinkedProduct | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);

  useEffect(() => {
    if (value) return;
    const term = q.trim();
    if (term.length < 2) return setHits([]);
    let alive = true;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.invoke<Hit[]>("ai", { action: "store_products", q: term });
        if (alive) setHits(Array.isArray(r) ? r : []);
      } catch (e) {
        if (alive) toast.error((e as Error).message);
      } finally {
        if (alive) setSearching(false);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, value]);

  const pick = async (h: Hit) => {
    setPicking(h.id);
    try {
      const p = await api.invoke<LinkedProduct>("ai", { action: "store_product_pick", id: h.id });
      if (!p.images?.length) toast.warning("Esse produto não tem foto na loja.");
      onChange(p);
      setQ("");
      setHits([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPicking(null);
    }
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border p-2">
        {value.images[0] && <img src={value.images[0]} alt="" className="h-12 w-12 rounded object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{value.name}</p>
          <p className="text-xs text-muted-foreground">{value.images.length} foto(s) do produto no post</p>
        </div>
        <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => onChange(null)} aria-label="Remover produto">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-9 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pin na loja (ex.: rosa, enfermagem, aranha)" />
        {searching && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {hits.length > 0 && (
        <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              disabled={picking !== null}
              onClick={() => pick(h)}
              className={cn("flex w-full items-center gap-3 p-2 text-left transition-colors hover:bg-secondary", picking === h.id && "bg-secondary")}
            >
              {h.image ? <img src={h.image} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded bg-secondary" />}
              <span className="min-w-0 flex-1 truncate text-[13px]">{h.name}</span>
              {picking === h.id && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && !searching && !hits.length && <p className="text-xs text-muted-foreground">Nenhum produto com esse nome.</p>}
    </div>
  );
}
