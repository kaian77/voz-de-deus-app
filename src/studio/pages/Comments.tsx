import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTable } from "../lib/hooks";
import type { CommentEvent } from "../lib/types";
import { EmptyState, formatDateTime, PageHeader } from "../components/bits";

const STATUS: Record<CommentEvent["status"], { label: string; className: string }> = {
  replied: { label: "Respondido", className: "bg-emerald-100 text-emerald-800" },
  ignored: { label: "Sem automação", className: "bg-slate-100 text-slate-700" },
  failed: { label: "Falhou", className: "bg-red-100 text-red-800" },
  pending: { label: "Processando", className: "bg-blue-100 text-blue-800" },
};

export default function Comments() {
  const { data: comments = [] } = useTable("comment_events", { limit: 300 });
  const { data: automations = [] } = useTable("automations");
  const [filter, setFilter] = useState<"all" | CommentEvent["status"]>("all");
  const list = filter === "all" ? comments : comments.filter((c) => c.status === filter);
  const nameOf = (id: string | null) => automations.find((a) => a.id === id)?.name;

  return (
    <div>
      <PageHeader title="Comentários" description="Tudo que chegou pelo webhook do Instagram e o que a automação fez." />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="replied">Respondidos</TabsTrigger>
          <TabsTrigger value="ignored">Sem automação</TabsTrigger>
          <TabsTrigger value="failed">Falhas</TabsTrigger>
        </TabsList>
      </Tabs>
      {list.length === 0 ? (
        <EmptyState icon={<MessageCircle className="h-8 w-8" />} title="Nenhum comentário aqui">
          Assim que alguém comentar nos seus posts (com a conta conectada e o webhook configurado), ele aparece nesta lista.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {list.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className={cn("border-0", STATUS[c.status].className)}>{STATUS[c.status].label}</Badge>
                  <span>{formatDateTime(c.created_at)}</span>
                  {nameOf(c.automation_id) && <span>· {nameOf(c.automation_id)}</span>}
                </div>
                <p className="text-sm"><b>@{c.from_username ?? "alguém"}</b> {c.text}</p>
                {c.reply_text && <p className="rounded-md bg-muted p-2 text-xs"><b>Resposta pública:</b> {c.reply_text}</p>}
                {c.dm_text && <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-900"><b>Direct:</b> {c.dm_text}</p>}
                {c.error && c.status !== "ignored" && <p className="text-xs text-destructive">{c.error}</p>}
                {c.status === "ignored" && c.error && <p className="text-xs text-muted-foreground">{c.error}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
