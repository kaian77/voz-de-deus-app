import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Sparkles, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, isDemo } from "../lib/api";
import { useRemoveRow, useSaveRow, useTable } from "../lib/hooks";
import type { Competitor, CompetitorAnalysis } from "../lib/types";
import { EmptyState, formatDateTime, PageHeader, PlatformIcon } from "../components/bits";

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-0.5 text-sm">{items.map((x, i) => <li key={i}>• {x}</li>)}</ul>
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

  const run = async (action: "sync" | "analyze") => {
    setBusy(action);
    try {
      if (action === "sync") await api.invoke("ai", { action: "sync_competitor", username: c.username });
      else {
        if (notes !== (c.notes ?? "")) await api.update("competitors", c.id, { notes });
        const r = await api.invoke<{ analysis: CompetitorAnalysis }>("ai", { action: "analyze_competitor", id: c.id });
        if (isDemo) await api.update("competitors", c.id, { analysis: r.analysis });
      }
      qc.invalidateQueries({ queryKey: ["table", "competitors"] });
      toast.success(action === "sync" ? "Dados atualizados" : "Análise pronta");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {snap?.profile_picture_url ? <img src={snap.profile_picture_url} alt="" className="h-11 w-11 rounded-full object-cover" /> : <div className="h-11 w-11 rounded-full bg-muted" />}
            <div>
              <a href={c.platform === "instagram" ? `https://instagram.com/${c.username}` : `https://www.tiktok.com/@${c.username}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold hover:underline">
                <PlatformIcon platform={c.platform} /> @{c.username}
              </a>
              <p className="text-xs text-muted-foreground">
                {snap?.followers_count != null ? `${snap.followers_count.toLocaleString("pt-BR")} seguidores · ` : ""}
                {snap?.media_count != null ? `${snap.media_count} posts · ` : ""}
                {avgEng != null ? `${avgEng} interações/post · ` : ""}
                {c.synced_at ? `atualizado ${formatDateTime(c.synced_at)}` : "sem dados ainda"}
              </p>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => confirm(`Parar de monitorar @${c.username}?`) && remove.mutate(c.id)} aria-label="Remover"><Trash2 className="h-4 w-4" /></Button>
        </div>
        {snap?.biography && <p className="whitespace-pre-line rounded-md bg-muted p-2 text-xs">{snap.biography}</p>}
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (c.notes ?? "") && save.mutate({ id: c.id, notes })} placeholder="Suas anotações: o que eles fazem bem, formatos, frequência…" />
        <div className="flex flex-wrap gap-2">
          {c.platform === "instagram" && (
            <Button size="sm" variant="outline" onClick={() => run("sync")} disabled={!!busy}>
              {busy === "sync" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Atualizar dados
            </Button>
          )}
          <Button size="sm" onClick={() => run("analyze")} disabled={!!busy}>
            {busy === "analyze" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />} Analisar com IA
          </Button>
        </div>
        {c.analysis && (
          <div className="space-y-3 rounded-lg border bg-violet-50/50 p-4">
            <p className="text-sm">{c.analysis.summary}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Section title="Forças" items={c.analysis.strengths} />
              <Section title="Padrões de conteúdo" items={c.analysis.content_patterns} />
              <Section title="Brechas para você" items={c.analysis.opportunities} />
              <Section title="Ideias para adaptar" items={c.analysis.ideas_to_adapt} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
      <PageHeader title="Concorrentes" description="Monitore perfis de referência e transforme o que funciona para eles em ideias para você." />
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row">
          <div className="flex gap-1">
            {(["instagram", "tiktok"] as const).map((p) => (
              <Button key={p} variant={platform === p ? "default" : "outline"} size="icon" onClick={() => setPlatform(p)} aria-label={p}>
                <PlatformIcon platform={p} className={platform === p ? "text-white" : ""} />
              </Button>
            ))}
          </div>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="@perfil_concorrente" />
          <Button onClick={add} disabled={save.isPending}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
        </CardContent>
      </Card>
      {competitors.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="Nenhum concorrente monitorado">
          Adicione perfis do seu nicho. Os dados públicos de contas profissionais do Instagram são puxados automaticamente quando o Business Discovery está configurado; para TikTok, anote o que observar ou peça ao Claude para pesquisar.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">{competitors.map((c) => <CompetitorCard key={c.id} c={c} />)}</div>
      )}
    </div>
  );
}
