import { Link } from "react-router-dom";
import { Bot, CalendarClock, CheckCircle2, MessageCircle, PenSquare, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTable } from "../lib/hooks";
import { formatDateTime, KIND_LABEL, PageHeader, PlatformIcon, StatusBadge } from "../components/bits";
import { PostThumb } from "../components/PostThumb";

function Stat({ label, value, icon: Icon, to }: { label: string; value: number | string; icon: typeof Bot; to: string }) {
  return (
    <Link to={to}>
      <Card className="transition-shadow hover:shadow-gentle">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { data: posts = [] } = useTable("posts");
  const { data: automations = [] } = useTable("automations");
  const { data: comments = [] } = useTable("comment_events", { limit: 200 });
  const { data: accounts = [] } = useTable("social_accounts");

  const now = Date.now();
  const upcoming = posts
    .filter((p) => p.status === "scheduled" && p.scheduled_at && new Date(p.scheduled_at).getTime() >= now)
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  const pending = posts.filter((p) => p.status === "pending_approval");
  const failed = posts.filter((p) => p.status === "failed");
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const replied7d = comments.filter((c) => c.status === "replied" && new Date(c.created_at).getTime() > weekAgo).length;

  return (
    <div>
      <PageHeader
        title="Visão geral"
        description="Tudo o que está agendado, rodando e esperando por você."
        actions={
          <Button asChild>
            <Link to="/studio/criar"><PenSquare className="mr-2 h-4 w-4" /> Criar post</Link>
          </Button>
        }
      />

      {accounts.length === 0 && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">Conecte seu Instagram e TikTok para publicar e responder comentários automaticamente.</p>
            <Button asChild size="sm"><Link to="/studio/contas">Conectar contas</Link></Button>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Agendados" value={upcoming.length} icon={CalendarClock} to="/studio/calendario" />
        <Stat label="Aguardando aprovação" value={pending.length} icon={CheckCircle2} to="/studio/aprovacoes" />
        <Stat label="Comentários respondidos (7 dias)" value={replied7d} icon={MessageCircle} to="/studio/comentarios" />
        <Stat label="Automações ativas" value={automations.filter((a) => a.active).length} icon={Workflow} to="/studio/automacoes" />
      </div>

      {failed.length > 0 && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-900">
            {failed.length} post(s) falharam ao publicar.{" "}
            <Link to="/studio/calendario" className="font-semibold underline">Ver e tentar de novo</Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Próximas publicações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nada agendado ainda.</p>}
            {upcoming.slice(0, 6).map((p) => (
              <Link key={p.id} to={`/studio/criar?id=${p.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
                <PostThumb post={p} className="w-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title || p.caption.split("\n")[0] || KIND_LABEL[p.kind]}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(p.scheduled_at)} · {KIND_LABEL[p.kind]}</p>
                </div>
                <div className="flex gap-1">{p.platforms.map((pl) => <PlatformIcon key={pl} platform={pl} />)}</div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Últimos comentários</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {comments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário recebido ainda.</p>}
            {comments.slice(0, 6).map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <p className="text-sm"><b>@{c.from_username ?? "alguém"}</b> {c.text}</p>
                {c.reply_text && <p className="mt-1 text-xs text-muted-foreground">↳ {c.reply_text}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        {pending.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Criados pelo Claude, esperando sua aprovação</CardTitle>
              <Button asChild size="sm" variant="outline"><Link to="/studio/aprovacoes">Revisar</Link></Button>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {pending.slice(0, 6).map((p) => (
                <Link key={p.id} to="/studio/aprovacoes" className="space-y-1">
                  <PostThumb post={p} />
                  <StatusBadge status={p.status} />
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
