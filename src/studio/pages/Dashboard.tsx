import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, ChevronRight, Package, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSettings, useTable } from "../lib/hooks";
import { api, isDemo } from "../lib/api";
import type { Post, SalesSummary } from "../lib/types";
import { formatTime, KIND_LABEL, sentence, PageHeader, Panel, PlatformIcon, relativeTime, StatusBadge, StatusDot } from "../components/bits";
import { PostThumb } from "../components/PostThumb";

const DAY = 24 * 3600 * 1000;
const World3D = lazy(() => import("../components/World3D"));

function Metric({ label, value, hint, to, className }: { label: string; value: number; hint: string; to: string; className?: string }) {
  return (
    <Link to={to} className={cn("group flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-secondary/50", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular text-[28px] font-semibold leading-none tracking-tight">{value}</span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {hint} <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
    </Link>
  );
}

function AgendaRow({ post }: { post: Post }) {
  return (
    <Link to={`/studio/criar?id=${post.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/50">
      <span className="tabular w-11 shrink-0 text-xs text-muted-foreground">{formatTime(post.scheduled_at!)}</span>
      <PostThumb post={post} className="w-8 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{post.title || post.caption.split("\n")[0] || KIND_LABEL[post.kind]}</p>
        <p className="text-xs text-muted-foreground">{KIND_LABEL[post.kind]}</p>
      </div>
      <div className="hidden items-center gap-1.5 sm:flex">{post.platforms.map((p) => <PlatformIcon key={p} platform={p} />)}</div>
      <StatusBadge status={post.status} />
    </Link>
  );
}

const CHANNEL_LABEL = { site: "Site", mercadolivre: "Mercado Livre", shopee: "Shopee" } as const;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Vendas de hoje/semana por canal, pedidos para enviar e as tarefas da estratégia. */
function Sales() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-summary"],
    queryFn: () => api.invoke<SalesSummary>("ai", { action: "sales_summary" }),
    enabled: !isDemo,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  if (isDemo || error) return null;
  const channels = data ? (Object.entries(data.channels) as [keyof typeof CHANNEL_LABEL, NonNullable<SalesSummary["channels"]["site"]>][]) : [];
  return (
    <Panel
      className="mb-6"
      title="Vendas"
      description={data ? `Atualizado ${relativeTime(data.at)}` : "Site, Mercado Livre e Shopee"}
      action={<Link to="/studio/pedidos" className="text-xs font-medium text-muted-foreground hover:text-foreground">Ver pedidos</Link>}
      bodyClassName="p-0"
    >
      {isLoading || !data ? (
        <p className="px-4 py-6 text-[13px] text-muted-foreground">Somando as vendas…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 border-b sm:grid-cols-3">
            <div className="border-r px-4 py-3">
              <p className="text-xs text-muted-foreground">Hoje</p>
              <p className="tabular mt-1 text-[22px] font-semibold leading-none">{brl(data.total.today.revenue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{data.total.today.orders} pedido{data.total.today.orders === 1 ? "" : "s"}</p>
            </div>
            <div className="px-4 py-3 sm:border-r">
              <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
              <p className="tabular mt-1 text-[22px] font-semibold leading-none">{brl(data.total.week.revenue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{data.total.week.orders} pedidos</p>
            </div>
            <Link to="/studio/pedidos" className="col-span-2 flex items-center gap-3 border-t px-4 py-3 hover:bg-secondary/50 sm:col-span-1 sm:border-t-0">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="tabular text-[22px] font-semibold leading-none">{data.total.to_ship}</p>
                <p className="mt-1 text-xs text-muted-foreground">para enviar</p>
              </div>
            </Link>
          </div>
          <div className="divide-y">
            {channels.map(([c, v]) => (
              <div key={c} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
                <span>{CHANNEL_LABEL[c]}</span>
                {v.error ? (
                  <span className="truncate text-xs text-destructive">{v.error}</span>
                ) : (
                  <span className="tabular text-muted-foreground">
                    hoje {v.today.orders} · semana {v.week.orders} · {brl(v.week.revenue)}{v.to_ship ? ` · ${v.to_ship} p/ enviar` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
          {data.tasks.length > 0 && (
            <Link to="/studio/estrategia" className="block border-t px-4 py-3 hover:bg-secondary/50">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"><Target className="h-3.5 w-3.5" /> Tarefas da semana</p>
              <ul className="space-y-1 text-[13px] text-foreground/85">
                {data.tasks.map((t, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/40" />{t}</li>)}
              </ul>
            </Link>
          )}
        </>
      )}
    </Panel>
  );
}

export default function Dashboard() {
  const { data: posts = [] } = useTable("posts");
  const { data: automations = [] } = useTable("automations");
  const { data: comments = [] } = useTable("comment_events", { limit: 200 });
  const { data: accounts = [] } = useTable("social_accounts");
  const { data: conversations = [] } = useTable("conversations", { order: "last_message_at" });
  const { data: keys = [] } = useTable("api_keys");
  const { data: settings } = useSettings();

  const now = Date.now();
  const week = posts
    .filter((p) => ["scheduled", "pending_approval"].includes(p.status) && p.scheduled_at && new Date(p.scheduled_at).getTime() >= now && new Date(p.scheduled_at).getTime() < now + 7 * DAY)
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  const byDay = week.reduce<Record<string, Post[]>>((acc, p) => {
    const key = new Date(p.scheduled_at!).toDateString();
    (acc[key] ??= []).push(p);
    return acc;
  }, {});
  const pending = posts.filter((p) => p.status === "pending_approval");
  const failed = posts.filter((p) => p.status === "failed");
  const waiting = conversations.filter((c) => c.status === "needs_human");
  const replied7d = comments.filter((c) => c.status === "replied" && new Date(c.created_at).getTime() > now - 7 * DAY).length;

  const steps = [
    { done: accounts.some((a) => a.platform === "instagram"), label: "Conectar o Instagram", to: "/studio/contas" },
    { done: accounts.some((a) => a.platform === "whatsapp"), label: "Conectar o WhatsApp", to: "/studio/contas" },
    { done: Boolean(settings?.niche && settings?.tone), label: "Descrever a marca e o tom de voz", to: "/studio/claude" },
    { done: keys.length > 0, label: "Dar acesso ao Claude", to: "/studio/claude" },
  ];
  const stepsLeft = steps.filter((s) => !s.done).length;

  const attention = [
    { count: pending.length, label: "posts criados pelo Claude para aprovar", to: "/studio/aprovacoes", tone: "warning" as const },
    { count: waiting.length, label: "conversas esperando resposta sua", to: "/studio/mensagens", tone: "warning" as const },
    { count: failed.length, label: "publicações com falha", to: "/studio/calendario", tone: "danger" as const },
  ].filter((a) => a.count > 0);

  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  // Mesmos números do painel de Vendas (a consulta é compartilhada pelo cache)
  const { data: sales } = useQuery({
    queryKey: ["sales-summary"],
    queryFn: () => api.invoke<SalesSummary>("ai", { action: "sales_summary" }),
    enabled: !isDemo,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return (
    <div>
      <PageHeader
        title="Visão geral"
        description={sentence(today)}
        actions={
          <Button asChild size="sm">
            <Link to="/studio/criar"><Plus /> Criar post</Link>
          </Button>
        }
      />

      <div className="relative mb-6 overflow-hidden rounded-lg border bg-gradient-to-b from-sky-100 to-emerald-50 dark:from-slate-800 dark:to-slate-900">
        <Suspense fallback={<div className="h-[260px] sm:h-[340px]" />}>
          <World3D
            className="h-[260px] w-full sm:h-[340px]"
            stats={{
              ordersToday: sales?.total.today.orders ?? 0,
              toShip: sales?.total.to_ship ?? 0,
              waiting: waiting.length,
              scheduled: week.filter((p) => p.status === "scheduled").length,
              pending: pending.length,
            }}
          />
        </Suspense>
        <p className="pointer-events-none absolute left-3 top-2 text-xs font-semibold uppercase tracking-wider text-foreground/60">Mundo Brax</p>
      </div>

      <Sales />

      <div className="mb-6 grid grid-cols-2 overflow-hidden rounded-lg border bg-card lg:grid-cols-4">
        <Metric label="Agendados" value={week.filter((p) => p.status === "scheduled").length} hint="próximos 7 dias" to="/studio/calendario" className="border-b border-r lg:border-b-0" />
        <Metric label="Para aprovar" value={pending.length} hint="criados pelo Claude" to="/studio/aprovacoes" className="border-b lg:border-b-0 lg:border-r" />
        <Metric label="Comentários respondidos" value={replied7d} hint="últimos 7 dias" to="/studio/comentarios" className="border-r" />
        <Metric label="Automações ativas" value={automations.filter((a) => a.active).length} hint={`${automations.reduce((s, a) => s + a.triggered_count, 0)} disparos no total`} to="/studio/automacoes" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          className="self-start"
          title="Agenda da semana"
          action={<Link to="/studio/calendario" className="text-xs font-medium text-muted-foreground hover:text-foreground">Abrir calendário</Link>}
          bodyClassName="p-0"
        >
          {week.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nada agendado para os próximos 7 dias.{" "}
              <Link to="/studio/criar" className="font-medium text-foreground underline underline-offset-4">Criar um post</Link>
            </div>
          ) : (
            Object.entries(byDay).map(([day, list]) => (
              <div key={day} className="border-b last:border-b-0">
                <p className="bg-secondary/40 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                  {new Date(day).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" }).replace(/\./g, "")}
                </p>
                <div className="divide-y">{list.map((p) => <AgendaRow key={p.id} post={p} />)}</div>
              </div>
            ))
          )}
        </Panel>

        <div className="space-y-6">
          {stepsLeft > 0 && (
            <Panel title="Configuração" description={`${steps.length - stepsLeft} de ${steps.length} concluídos`} bodyClassName="p-2">
              {steps.map((s) => (
                <Link key={s.label} to={s.to} className="flex items-center gap-3 rounded-md px-2 py-2 text-[13px] hover:bg-secondary/60">
                  <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border", s.done && "border-foreground bg-foreground text-background")}>
                    {s.done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                  <span className={cn("flex-1", s.done && "text-muted-foreground line-through")}>{s.label}</span>
                  {!s.done && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </Link>
              ))}
            </Panel>
          )}

          <Panel title="Precisa de atenção" bodyClassName="p-2">
            {attention.length === 0 ? (
              <p className="px-2 py-3 text-[13px] text-muted-foreground">Tudo em dia.</p>
            ) : (
              attention.map((a) => (
                <Link key={a.label} to={a.to} className="flex items-center gap-3 rounded-md px-2 py-2 text-[13px] hover:bg-secondary/60">
                  <StatusDot tone={a.tone}><span className="tabular">{a.count}</span></StatusDot>
                  <span className="flex-1 text-foreground/80">{a.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ))
            )}
          </Panel>

          <Panel title="Comentários recentes" action={<Link to="/studio/comentarios" className="text-xs font-medium text-muted-foreground hover:text-foreground">Ver todos</Link>} bodyClassName="p-0">
            {comments.length === 0 && <p className="px-4 py-4 text-[13px] text-muted-foreground">Nenhum comentário recebido ainda.</p>}
            <div className="divide-y">
              {comments.slice(0, 4).map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-medium">@{c.from_username ?? "alguém"}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(c.created_at)}</span>
                  </div>
                  <p className="truncate text-[13px] text-foreground/80">{c.text}</p>
                  {c.reply_text && <p className="mt-0.5 truncate text-xs text-muted-foreground">Respondido: {c.reply_text}</p>}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
