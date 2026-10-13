import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clapperboard, Loader2, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../lib/api";
import { useTable } from "../lib/hooks";
import type { Strategy } from "../lib/types";
import { EmptyState, formatDateTime, PageHeader, Panel, PlatformIcon, SectionLabel } from "../components/bits";

const CHANNEL: Record<string, string> = { tiktok: "TikTok Shop", shopee: "Shopee", site: "Site", instagram: "Instagram", mercadolivre: "Mercado Livre", geral: "Geral", ambos: "TikTok + Instagram" };
const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-[13px] text-foreground/85">
      {items.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/40" />{x}</li>)}
    </ul>
  );
}

function Videos({ strategy }: { strategy: Strategy }) {
  const qc = useQueryClient();
  const picks = strategy.video_picks ?? [];
  const [selected, setSelected] = useState<Set<number>>(() => new Set(picks.map((p) => p.id)));
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const r = await api.invoke<{ queued: number }>("ai", { action: "strategy_videos", strategy_id: strategy.id, product_ids: [...selected], platforms: ["tiktok"] });
      qc.invalidateQueries({ queryKey: ["table"] });
      toast.success(`${r.queued} vídeos na fila. Ficam prontos aos poucos e vão para Aprovações.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!picks.length) return null;
  return (
    <Panel
      title={`Vídeos de ${picks.length} produtos diferentes`}
      description="Um vídeo por produto, para o TikTok: vertical, ~15 s, com música, sem site nem link. Escolhidos pelo motor: os que vendem e estão sem vídeo recente, depois kits e o resto do catálogo."
      action={
        <Button size="sm" disabled={busy || !selected.size || !!strategy.videos_queued_at} onClick={make}>
          {busy ? <Loader2 className="animate-spin" /> : <Clapperboard />} {strategy.videos_queued_at ? "Na fila" : `Fazer ${selected.size} vídeos`}
        </Button>
      }
    >
      {strategy.videos_queued_at && (
        <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" /> Pedido em {formatDateTime(strategy.videos_queued_at)}. Os vídeos aparecem em Aprovações conforme ficam prontos (alguns por hora).
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((p) => (
          <label key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-[13px]">
            <Checkbox
              checked={selected.has(p.id)}
              disabled={!!strategy.videos_queued_at}
              onCheckedChange={(v) => setSelected((cur) => { const n = new Set(cur); if (v) n.add(p.id); else n.delete(p.id); return n; })}
            />
            {p.image && <img src={p.image} alt="" className="h-9 w-9 shrink-0 rounded object-cover" loading="lazy" />}
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {p.sold > 0 && <span className="tabular shrink-0 text-xs text-muted-foreground">{p.sold} vend.</span>}
          </label>
        ))}
      </div>
    </Panel>
  );
}

function PlanView({ strategy }: { strategy: Strategy }) {
  const { plan, data } = strategy;
  return (
    <div className="space-y-5">
      <Panel title="Resumo" description={`Gerado em ${formatDateTime(strategy.created_at)} · últimos ${data.period_days} dias`} bodyClassName="space-y-4 p-5">
        <p className="text-[14px] leading-relaxed">{plan.summary}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Pedidos no site" value={data.site.orders} />
          <Stat label="Faturamento no site" value={brl(data.site.revenue)} />
          <Stat label="Pedidos no Mercado Livre" value={data.mercadolivre ? data.mercadolivre.orders : "—"} />
          <Stat label="Pedidos na Shopee" value={data.shopee ? data.shopee.orders : "—"} />
          <Stat label="Produtos sem venda" value={`${data.products_without_sales} de ${data.products}`} />
          <Stat label="Produtos sem vídeo" value={data.products_without_video} />
        </div>
        {plan.diagnosis.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {plan.diagnosis.map((d, i) => (
              <div key={i} className="rounded-md border p-3">
                <p className="text-[13px] font-medium">{d.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{d.detail}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Esta semana" bodyClassName="p-5">
        <List items={plan.weekly_checklist} />
      </Panel>

      {plan.market && (
        <Panel title="Pesquisa de mercado" description={strategy.research?.at ? `Pesquisa na web de ${formatDateTime(strategy.research.at)}` : undefined} bodyClassName="space-y-4 p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div><SectionLabel className="mb-2">Tendências</SectionLabel><List items={plan.market.trends} /></div>
            <div><SectionLabel className="mb-2">Oportunidades</SectionLabel><List items={plan.market.opportunities} /></div>
          </div>
          {plan.market.prices && <div><SectionLabel className="mb-1">Preços no mercado</SectionLabel><p className="text-[13px]">{plan.market.prices}</p></div>}
          {plan.market.competitors.length > 0 && (
            <div>
              <SectionLabel className="mb-2">Concorrentes</SectionLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                {plan.market.competitors.map((c, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <p className="text-[13px] font-medium">{c.name} <span className="font-normal text-muted-foreground">· {c.channel}</span></p>
                    <p className="mt-1 text-xs text-muted-foreground">{c.insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!!strategy.research?.sources?.length && (
            <div>
              <SectionLabel className="mb-1">Fontes</SectionLabel>
              <ul className="space-y-0.5 text-xs">
                {strategy.research.sources.map((u) => <li key={u} className="truncate"><a href={u} target="_blank" rel="noreferrer" className="text-muted-foreground underline underline-offset-2">{u}</a></li>)}
              </ul>
            </div>
          )}
        </Panel>
      )}

      <Panel title="Prioridades" bodyClassName="divide-y p-0">
        {plan.priorities.map((p, i) => (
          <div key={i} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] font-semibold"><span className="tabular mr-2 text-muted-foreground">{i + 1}</span>{p.title}</p>
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{CHANNEL[p.channel] ?? p.channel}</span>
            </div>
            <p className="text-[13px] text-muted-foreground">{p.why}</p>
            <List items={p.actions} />
            {p.products.length > 0 && <p className="text-xs text-muted-foreground">Produtos: {p.products.join(" · ")}</p>}
          </div>
        ))}
      </Panel>

      {!!plan.channels?.length && (
        <Panel title="Plano por canal" bodyClassName="grid gap-4 p-5 lg:grid-cols-2">
          {plan.channels.map((c, i) => (
            <div key={i} className="rounded-md border p-3">
              <p className="text-[13px] font-semibold">{CHANNEL[c.channel] ?? c.channel}</p>
              <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{c.goal}</p>
              <List items={c.actions} />
            </div>
          ))}
        </Panel>
      )}

      {plan.followers && (
        <Panel title="Ganhar seguidores" bodyClassName="space-y-3 p-5">
          <p className="text-[13px]">{plan.followers.strategy}</p>
          <div><SectionLabel className="mb-1">Ritmo</SectionLabel><p className="text-[13px]">{plan.followers.rhythm}</p></div>
          <List items={plan.followers.actions} />
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={<span className="flex items-center gap-2"><PlatformIcon platform="tiktok" className="h-4 w-4" /> Anúncios no TikTok (GMV Max)</span>} bodyClassName="space-y-3 p-5">
          <p className="text-[13px]">{plan.tiktok_ads.advice}</p>
          <div><SectionLabel className="mb-1">ROI alvo</SectionLabel><p className="text-[13px]">{plan.tiktok_ads.roi_target}</p></div>
          <div><SectionLabel className="mb-1">Orçamento</SectionLabel><p className="text-[13px]">{plan.tiktok_ads.budget}</p></div>
          {plan.tiktok_ads.products.length > 0 && <div><SectionLabel className="mb-1">Produtos para a campanha</SectionLabel><List items={plan.tiktok_ads.products} /></div>}
        </Panel>
        <Panel title="Ideias de kit" bodyClassName="space-y-3 p-5">
          {plan.kits.map((k, i) => (
            <div key={i}>
              <p className="text-[13px] font-medium">{k.name}</p>
              <p className="text-xs text-muted-foreground">{k.products.join(" + ")}</p>
              <p className="mt-0.5 text-xs">{k.why}</p>
            </div>
          ))}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Conteúdo para ganhar seguidores e vender" bodyClassName="divide-y p-0">
          {plan.content.map((c, i) => (
            <div key={i} className="p-3">
              <p className="text-[13px]">{c.idea}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{c.format} · {CHANNEL[c.channel] ?? c.channel}{c.product ? ` · ${c.product}` : ""}</p>
            </div>
          ))}
        </Panel>
        <Panel title="Datas que vêm aí" bodyClassName="divide-y p-0">
          {plan.dates.length ? plan.dates.map((d, i) => (
            <div key={i} className="p-3">
              <p className="text-[13px] font-medium"><span className="tabular mr-2 text-muted-foreground">{d.date.split("-").reverse().slice(0, 2).join("/")}</span>{d.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{d.action}</p>
            </div>
          )) : <p className="p-3 text-xs text-muted-foreground">Nenhuma data importante nos próximos 45 dias.</p>}
        </Panel>
      </div>

      <Videos key={strategy.id} strategy={strategy} />
    </div>
  );
}

const STEPS = ["Lendo as vendas do site, Mercado Livre e Shopee…", "Pesquisando o mercado na web (concorrentes, preços, tendências)…", "Montando a estratégia…"];

export default function StrategyPage() {
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useTable("strategies", { limit: 10 });
  const latest = list.find((s) => (s.status ?? "done") === "done" && s.plan?.summary);
  const [tiktok, setTiktok] = useState("");
  const [fresh, setFresh] = useState(false);
  const [step, setStep] = useState<number | null>(null);

  const generate = async () => {
    try {
      setStep(0);
      const st = await api.invoke<{ id: string }>("ai", { action: "strategy_start", tiktok });
      setStep(1);
      await api.invoke("ai", { action: "strategy_research", strategy_id: st.id, fresh });
      setStep(2);
      await api.invoke("ai", { action: "strategy_finish", strategy_id: st.id });
      qc.invalidateQueries({ queryKey: ["table", "strategies"] });
      toast.success("Estratégia pronta");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStep(null);
    }
  };
  const busy = step !== null;

  return (
    <div>
      <PageHeader
        title="Estratégia"
        description="O motor junta as vendas do site, do Mercado Livre e da Shopee, os números do TikTok que você colar, uma pesquisa de mercado na web e as datas que vêm aí, e monta as melhores estratégias para vender mais e ganhar seguidores."
      />
      <div className="space-y-5">
        <Panel title="Gerar estratégia" bodyClassName="space-y-3 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="tt-numbers" className="text-xs">Números do TikTok (opcional)</Label>
            <Textarea
              id="tt-numbers"
              rows={4}
              className="text-[13px]"
              value={tiktok}
              onChange={(e) => setTiktok(e.target.value)}
              placeholder={"Copie da campanha GMV Max, ex.:\nCusto R$ 91,05 · 14 pedidos · receita R$ 606,61\nCaixa Misteriosa: custo 2,47, 2 pedidos, ROI 88\nZé Gotinha Diversidade: custo 8,24, 4 pedidos, ROI 17,9"}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={fresh} onCheckedChange={(v) => setFresh(Boolean(v))} disabled={busy} />
            Fazer uma pesquisa de mercado nova (senão reaproveita a da última semana)
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {busy ? <span className="flex items-center gap-2 text-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {step! + 1}/3 · {STEPS[step!]}</span> : "Leva de 1 a 3 minutos. Gere de novo toda semana."}
            </p>
            <Button onClick={generate} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Gerar estratégia</Button>
          </div>
        </Panel>

        {isLoading ? null : latest ? <PlanView strategy={latest} /> : (
          <EmptyState icon={<Target className="h-5 w-5" />} title="Nenhuma estratégia ainda">
            Clique em Gerar estratégia. Se tiver, cole os números da sua campanha do TikTok para o plano ficar mais certeiro.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
