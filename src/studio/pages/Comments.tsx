import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTable } from "../lib/hooks";
import type { CommentEvent } from "../lib/types";
import { Avatar, EmptyState, PageHeader, relativeTime, StatusDot } from "../components/bits";

const STATUS: Record<CommentEvent["status"], { label: string; tone: "success" | "neutral" | "danger" | "brand" }> = {
  replied: { label: "Respondido", tone: "success" },
  ignored: { label: "Sem automação", tone: "neutral" },
  failed: { label: "Falhou", tone: "danger" },
  pending: { label: "Processando", tone: "brand" },
};

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "replied", label: "Respondidos" },
  { id: "ignored", label: "Sem automação" },
  { id: "failed", label: "Falhas" },
] as const;

export default function Comments() {
  const { data: comments = [] } = useTable("comment_events", { limit: 300 });
  const { data: automations = [] } = useTable("automations");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const list = filter === "all" ? comments : comments.filter((c) => c.status === filter);
  const nameOf = (id: string | null) => automations.find((a) => a.id === id)?.name;

  return (
    <div>
      <PageHeader title="Comentários" description="Cada comentário recebido no Instagram e o que a automação fez com ele." />
      <div className="mb-4 inline-flex rounded-md border bg-secondary/60 p-0.5">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cn("h-7 rounded px-3 text-xs font-medium", filter === f.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {f.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<MessageSquare />} title="Nenhum comentário aqui">
          Os comentários aparecem assim que alguém comentar nos seus posts, com o Instagram conectado.
        </EmptyState>
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {list.map((c) => (
            <article key={c.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 gap-3">
                <Avatar name={c.from_username} />
                <div className="min-w-0">
                  <p className="text-[13px]">
                    <span className="font-medium">@{c.from_username ?? "alguém"}</span>{" "}
                    <span className="text-xs text-muted-foreground">{relativeTime(c.created_at)}</span>
                  </p>
                  <p className="text-[13px] text-foreground/85">{c.text}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <StatusDot tone={STATUS[c.status].tone}>{STATUS[c.status].label}</StatusDot>
                    {nameOf(c.automation_id) && <span>{nameOf(c.automation_id)}</span>}
                  </div>
                </div>
              </div>
              <div className="min-w-0 space-y-1.5 text-xs sm:border-l sm:pl-4">
                {c.reply_text && <p><span className="text-muted-foreground">Resposta pública · </span>{c.reply_text}</p>}
                {c.dm_text && <p><span className="text-muted-foreground">Direct · </span>{c.dm_text}</p>}
                {c.error && <p className={c.status === "ignored" ? "text-muted-foreground" : "text-danger"}>{c.error}</p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
