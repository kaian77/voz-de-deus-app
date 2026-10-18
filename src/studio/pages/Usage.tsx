import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { PageHeader, Panel } from "../components/bits";

type Report = {
  since: string;
  storage: { folder: string; bytes: number; files: number }[];
  db_bytes: number;
  ai: { source: string; model: string | null; calls: number; input: number; output: number }[];
  actions: Record<string, { runs: number; minutes: number }>;
  actions_error: string | null;
};

// Limites do plano grátis
const ACTIONS_LIMIT = 2000; // minutos/mês (repositório privado)
const STORAGE_LIMIT = 1024 ** 3; // 1 GB
const DB_LIMIT = 500 * 1024 ** 2; // 500 MB

// US$ por milhão de tokens (entrada, saída)
const PRICES: [string, number, number][] = [
  ["fable", 10, 50], ["opus-5-5", 4, 20], ["opus", 5, 25], ["sonnet-5", 2, 10], ["sonnet", 3, 15], ["haiku-5", 0.1, 0.5], ["haiku", 1, 5],
];
const cost = (model: string | null, input: number, output: number) => {
  const p = PRICES.find(([k]) => (model ?? "").includes(k)) ?? ["", 4, 20];
  return (input * p[1] + output * p[2]) / 1e6;
};

const FOLDERS: Record<string, string> = {
  videos: "Vídeos de produto", clips: "Cortes", deals: "Achadinhos", youtube: "YouTube", ml: "Fotos do Mercado Livre",
  ia: "Vídeos e imagens de IA", ideas: "Ideias de conteúdo", produtos: "Produtos", outros: "Outros",
};
const SOURCES: Record<string, string> = {
  textos: "Textos e roteiros", atendimento: "Atendimento (DM)", pesquisa: "Pesquisas", cortes: "Cortes", achadinhos: "Achadinhos",
};

const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`);
const usd = (v: number) => `US$ ${v.toFixed(v < 1 ? 3 : 2)}`;

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("text-xs", pct >= 90 ? "text-danger" : pct >= 70 ? "text-amber-600" : "text-muted-foreground")}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full", pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="mt-3 divide-y text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between py-1.5"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>
      ))}
    </div>
  );
}

export default function Usage() {
  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["usage"],
    queryFn: () => api.invoke<Report>("ai", { action: "usage_report" }),
  });

  const minutes = Object.values(data?.actions ?? {}).reduce((s, w) => s + w.minutes, 0);
  const storage = (data?.storage ?? []).reduce((s, f) => s + f.bytes, 0);
  const aiCost = (data?.ai ?? []).reduce((s, a) => s + cost(a.model, a.input, a.output), 0);
  const aiBySource = Object.entries((data?.ai ?? []).reduce<Record<string, { calls: number; cost: number }>>((acc, a) => {
    const k = SOURCES[a.source] ?? a.source;
    acc[k] = { calls: (acc[k]?.calls ?? 0) + a.calls, cost: (acc[k]?.cost ?? 0) + cost(a.model, a.input, a.output) };
    return acc;
  }, {})).sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div>
      <PageHeader
        title="Uso"
        description="Quanto o Studio está gastando neste mês: tempo do GitHub Actions (onde os vídeos são feitos), espaço no Supabase e a IA."
        actions={<Button variant="outline" onClick={() => refetch()} disabled={isFetching}>{isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Atualizar</Button>}
      />
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando…</p>
      ) : error ? (
        <p className="text-sm text-danger">{(error as Error).message}</p>
      ) : data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="GitHub Actions" description="Minutos usados no mês (estimativa). O plano grátis dá 2.000 por mês.">
            <Meter value={minutes} max={ACTIONS_LIMIT} label={`${minutes} de ${ACTIONS_LIMIT} min`} />
            {data.actions_error && <p className="mt-2 text-xs text-danger">{data.actions_error}</p>}
            <Rows rows={Object.entries(data.actions).sort((a, b) => b[1].minutes - a[1].minutes)
              .map(([name, w]) => [name, `${w.minutes} min · ${w.runs}×`])} />
          </Panel>

          <Panel title="Supabase" description="Plano grátis: 1 GB de arquivos e 500 MB de banco.">
            <div className="space-y-3">
              <Meter value={storage} max={STORAGE_LIMIT} label={`Arquivos: ${mb(storage)}`} />
              <Meter value={data.db_bytes} max={DB_LIMIT} label={`Banco: ${mb(data.db_bytes)}`} />
            </div>
            <Rows rows={data.storage.map((f) => [FOLDERS[f.folder] ?? f.folder, `${mb(f.bytes)} · ${f.files} arq.`])} />
          </Panel>

          <Panel title="IA (Anthropic)" description="Gasto estimado no mês pelos tokens usados. O valor exato fica no console da Anthropic.">
            <p className="text-2xl font-semibold">{usd(aiCost)}</p>
            <p className="text-xs text-muted-foreground">≈ R$ {(aiCost * 5.5).toFixed(2)} (dólar a R$ 5,50)</p>
            <Rows rows={aiBySource.map(([k, v]) => [k, `${usd(v.cost)} · ${v.calls} chamadas`])} />
            {!aiBySource.length && <p className="mt-3 text-xs text-muted-foreground">Ainda sem registros: a contagem começou agora.</p>}
          </Panel>
        </div>
      )}
    </div>
  );
}
