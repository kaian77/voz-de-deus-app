import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, ExternalLink, Loader2, MoreHorizontal, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api, isDemo } from "../lib/api";
import { useRemoveRow, useSaveRow, useTable } from "../lib/hooks";
import type { Competitor, CompetitorAnalysis } from "../lib/types";
import { Avatar, EmptyState, PageHeader, PlatformIcon, relativeTime, SectionLabel } from "../components/bits";
import { IS_INSTAGRAM_PRODUCT } from "../lib/product";

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <SectionLabel className="mb-1.5">{title}</SectionLabel>
      <ul className="space-y-1 text-[13px] text-foreground/85">
        {items.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/40" />{x}</li>)}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="tabular text-[15px] font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function CompetitorCard({ c }: { c: Competitor }) {
  const qc = useQueryClient();
  const save = useSaveRow("competitors");
  const remove = useRemoveRow("competitors");
  const [busy, setBusy] = useState<"sync" | "analyze" | null>(null);
  const [notes, setNotes] = useState(c.notes ?? "");
  const snap = c.snapshot;
  const media = snap?.media ?? [];
  const avgEng = media.length ? Math.round(media.reduce((s, m) => s + (m.like_count ?? 0) + (m.comments_count ?? 0), 0) / media.length) : null;
  const url = c.platform === "instagram" ? `https://instagram.com/${c.username}` : `https://www.tiktok.com/@${c.username}`;

  const run = async (action: "sync" | "analyze") => {
    setBusy(action);
    try {
      if (action === "sync") await api.invoke("ai", { action: "sync_competitor", username: c.username, platform: c.platform });
      else {
        if (notes !== (c.notes ?? "")) await api.update("competitors", c.id, { notes });
        const r = await api.invoke<{ analysis: CompetitorAnalysis }>("ai", { action: "analyze_competitor", id: c.id });
        if (isDemo) await api.update("competitors", c.id, { analysis: r.analysis });
      }
      qc.invalidateQueries({ queryKey: ["table", "competitors"] });
      toast.success(action === "sync" ? "Dados atualizados" : "Análise concluída");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Avatar name={c.username} src={snap?.profile_picture_url} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] font-semibold hover:underline">
            @{c.username} <PlatformIcon platform={c.platform} />
          </a>
          <p className="truncate text-xs text-muted-foreground">{snap?.name ?? "Sem dados coletados"}{c.synced_at && ` · atualizado há ${relativeTime(c.synced_at)}`}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ações"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><a href={url} target="_blank" rel="noreferrer">Abrir perfil <ExternalLink className="ml-auto h-3 w-3" /></a></DropdownMenuItem>
            <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => remove.mutate(c.id)}>Parar de monitorar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="seguidores" value={snap?.followers_count != null ? snap.followers_count.toLocaleString("pt-BR") : "–"} />
          <Stat label="posts" value={snap?.media_count != null ? snap.media_count.toLocaleString("pt-BR") : "–"} />
          <Stat label="interações por post" value={avgEng != null ? avgEng.toLocaleString("pt-BR") : "–"} />
        </div>
        {snap?.biography && <p className="whitespace-pre-line border-l-2 pl-3 text-xs text-muted-foreground">{snap.biography}</p>}
        {snap?.summary && (
          <div className="space-y-1.5 rounded-md bg-secondary/60 p-3">
            <p className="text-[13px] leading-relaxed">{snap.summary}</p>
            {!!snap.sources?.length && (
              <p className="truncate text-[11px] text-muted-foreground">
                Pesquisado na web ·{" "}
                {snap.sources.slice(0, 3).map((u, i) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="underline underline-offset-2">{i ? ", " : ""}{new URL(u).hostname.replace(/^www\./, "")}</a>
                ))}
              </p>
            )}
          </div>
        )}
        <Textarea
          rows={2}
          className="resize-none text-[13px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (c.notes ?? "") && save.mutate({ id: c.id, notes })}
          placeholder="Suas observações: formatos, frequência, ganchos que funcionam…"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={() => run("sync")} disabled={!!busy}>
            {busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />} {snap ? "Atualizar dados" : "Pesquisar perfil"}
          </Button>
          <Button size="sm" variant={c.analysis ? "outline" : "default"} className="h-8" onClick={() => run("analyze")} disabled={!!busy}>
            {busy === "analyze" ? <Loader2 className="animate-spin" /> : <Sparkles />} {c.analysis ? "Refazer análise" : "Analisar com IA"}
          </Button>
        </div>
        {c.analysis && (
          <div className="space-y-4 border-t pt-4">
            <p className="text-[13px] leading-relaxed">{c.analysis.summary}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Bullets title="Pontos fortes" items={c.analysis.strengths} />
              <Bullets title="Padrões de conteúdo" items={c.analysis.content_patterns} />
              <Bullets title="Brechas para você" items={c.analysis.opportunities} />
              <Bullets title="Ideias para adaptar" items={c.analysis.ideas_to_adapt} />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export default function Competitors() {
  const { data: competitors = [] } = useTable("competitors", { ascending: true });
  const save = useSaveRow("competitors");
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState<"instagram" | "tiktok">("instagram");

  const add = async () => {
    const u = username.trim().replace(/^@/, "").toLowerCase();
    if (!u) return;
    await save.mutateAsync({ username: u, platform });
    setUsername("");
  };

  return (
    <div>
      <PageHeader title="Concorrentes" description="Acompanhe perfis de referência e transforme o que funciona para eles em ideias para você." />
      <form
        className="mb-6 flex flex-col gap-2 rounded-lg border bg-card p-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="inline-flex shrink-0 rounded-md border bg-secondary/60 p-0.5">
          {(IS_INSTAGRAM_PRODUCT ? ["instagram"] as const : ["instagram", "tiktok"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPlatform(p)} className={cn("flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium", platform === p ? "bg-card shadow-sm" : "text-muted-foreground")}>
              <PlatformIcon platform={p} /> {p === "instagram" ? "Instagram" : "TikTok"}
            </button>
          ))}
        </div>
        <Input className="h-8 border-0 text-[13px] shadow-none focus-visible:ring-0" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@perfil_de_referencia" aria-label="Perfil" />
        <Button type="submit" size="sm" className="h-8" disabled={save.isPending}><Plus /> Adicionar</Button>
      </form>
      {competitors.length === 0 ? (
        <EmptyState icon={<BarChart3 />} title="Nenhum perfil monitorado">
          {IS_INSTAGRAM_PRODUCT ? "Adicione perfis do seu nicho no Instagram. A IA pesquisa o perfil e compara os conteúdos com a sua marca." : "Adicione perfis do seu nicho (Instagram ou TikTok). A IA pesquisa o perfil na web e depois compara com a sua marca."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">{competitors.map((c) => <CompetitorCard key={c.id} c={c} />)}</div>
      )}
    </div>
  );
}
