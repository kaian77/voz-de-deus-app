import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Bot, CalendarDays, Clapperboard, CalendarPlus, CheckSquare, Gauge, Inbox, Globe, LayoutGrid, Link2, LogOut, MapPin, Menu, MessageSquare, MoreHorizontal, Package, PenLine, Plus, ShoppingBag, Star, Store, Workflow, Target, Youtube, Scissors,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { isDemo, resetDemo, supabase } from "../lib/api";
import { useSettings, useTable } from "../lib/hooks";
import { Avatar } from "./bits";
import PageErrorBoundary from "./PageErrorBoundary";
import { AppInstall } from "./AppInstall";

type Item = { to: string; label: string; icon: typeof Bot; end?: boolean; count?: "approvals" | "inbox" };
const GROUPS: { label?: string; items: Item[] }[] = [
  { items: [{ to: "/studio", label: "Visão geral", icon: LayoutGrid, end: true }] },
  {
    label: "Publicar",
    items: [
      { to: "/studio/criar", label: "Criar post", icon: PenLine },
      { to: "/studio/videos", label: "Vídeos IA", icon: Clapperboard },
      { to: "/studio/em-massa", label: "Agendar em massa", icon: CalendarPlus },
      { to: "/studio/calendario", label: "Calendário", icon: CalendarDays },
      { to: "/studio/aprovacoes", label: "Aprovações", icon: CheckSquare, count: "approvals" },
    ],
  },
  {
    label: "Engajar",
    items: [
      { to: "/studio/mensagens", label: "Mensagens", icon: Inbox, count: "inbox" },
      { to: "/studio/automacoes", label: "Automações", icon: Workflow },
      { to: "/studio/comentarios", label: "Comentários", icon: MessageSquare },
    ],
  },
  {
    label: "Loja",
    items: [
      { to: "/studio/produtos", label: "Produtos", icon: ShoppingBag },
      { to: "/studio/pedidos", label: "Pedidos", icon: Package },
      { to: "/studio/avaliacoes", label: "Avaliações", icon: Star },
    ],
  },
  {
    label: "Crescer",
    items: [
      { to: "/studio/estrategia", label: "Estratégia", icon: Target },
      { to: "/studio/vitrine", label: "Vitrine", icon: Store },
      { to: "/studio/concorrentes", label: "Concorrentes", icon: BarChart3 },
    ],
  },
  {
    label: "Renda extra",
    items: [
      { to: "/studio/leads", label: "Leads", icon: MapPin },
      { to: "/studio/landing", label: "Landing pages", icon: Globe },
      { to: "/studio/youtube", label: "Canal do YouTube", icon: Youtube },
      { to: "/studio/cortes", label: "Cortes", icon: Scissors },
    ],
  },
  {
    label: "Configurar",
    items: [
      { to: "/studio/contas", label: "Contas", icon: Link2 },
      { to: "/studio/claude", label: "Claude e API", icon: Bot },
      { to: "/studio/uso", label: "Uso", icon: Gauge },
    ],
  },
];

function useCounts() {
  const { data: posts } = useTable("posts");
  const { data: conversations } = useTable("conversations", { order: "last_message_at" });
  return {
    approvals: posts?.filter((p) => p.status === "pending_approval").length ?? 0,
    inbox: conversations?.filter((c) => c.status === "needs_human").length ?? 0,
  };
}

/** Barra fixa no rodapé do celular: o que se usa todo dia a um toque; o resto fica em "Mais". */
function BottomBar({ onMore }: { onMore: () => void }) {
  const counts = useCounts();
  const tab = (to: string, label: string, Icon: typeof Bot, count = 0, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn("relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]", isActive ? "font-medium text-foreground" : "text-muted-foreground")}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} />
      {label}
      {count > 0 && (
        <span className="tabular absolute left-1/2 top-1 ml-1.5 min-w-4 rounded-full bg-foreground px-1 text-center text-[10px] font-medium leading-4 text-background">{count > 99 ? "99+" : count}</span>
      )}
    </NavLink>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navegação principal">
      {tab("/studio", "Início", LayoutGrid, 0, true)}
      {tab("/studio/aprovacoes", "Aprovar", CheckSquare, counts.approvals)}
      <NavLink to="/studio/criar" className="flex flex-1 items-center justify-center" aria-label="Criar post">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background shadow-sm"><Plus className="h-5 w-5" /></span>
      </NavLink>
      {tab("/studio/mensagens", "Mensagens", Inbox, counts.inbox)}
      <button type="button" onClick={onMore} className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground">
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
        Mais
      </button>
    </nav>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const counts = useCounts();
  return (
    <nav className="flex flex-col gap-5">
      {GROUPS.map((group, i) => (
        <div key={i} className="flex flex-col gap-px">
          {group.label && <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground/80">{group.label}</p>}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                  isActive ? "bg-secondary font-medium text-foreground" : "text-foreground/70 hover:bg-secondary/70 hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn("h-4 w-4", isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                  {item.count && counts[item.count] > 0 && (
                    <span className="tabular rounded bg-foreground px-1.5 text-[10px] font-medium leading-4 text-background">{counts[item.count]}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Workspace() {
  const { data: settings } = useSettings();
  const { data: accounts } = useTable("social_accounts");
  const ig = accounts?.find((a) => a.platform === "instagram" && a.meta?.brand !== "paginaspro") ?? accounts?.find((a) => a.platform === "instagram");
  const name = settings?.brand_name || ig?.display_name || "Social Studio";
  return (
    <div className="flex items-center gap-2.5 px-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-[12px] font-semibold text-background">
        {name.trim()[0]?.toUpperCase()}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-semibold">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{ig?.username ? `@${ig.username}` : "Social Studio"}</p>
      </div>
    </div>
  );
}

function Footer({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="space-y-2 border-t px-3 pt-3">
      {isDemo && (
        <div className="rounded-md border border-dashed px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">Modo demonstração.</span> Dados de exemplo, salvos só neste navegador.
        </div>
      )}
      <AppInstall />
      <button onClick={onSignOut} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] text-foreground/70 hover:bg-secondary hover:text-foreground">
        <LogOut className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        {isDemo ? "Restaurar exemplos" : "Sair"}
      </button>
    </div>
  );
}

export default function StudioLayout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: accounts } = useTable("social_accounts");
  const ig = accounts?.find((a) => a.platform === "instagram" && a.meta?.brand !== "paginaspro") ?? accounts?.find((a) => a.platform === "instagram");

  const signOut = async () => {
    if (isDemo) {
      resetDemo();
      window.location.reload();
      return;
    }
    await supabase!.auth.signOut();
    navigate("/studio");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r bg-card py-4 lg:flex">
        <Workspace />
        <div className="mt-6 flex-1 overflow-y-auto px-2">
          <Nav />
        </div>
        <Footer onSignOut={signOut} />
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur lg:hidden">
          <Workspace />
          <div className="flex items-center gap-2">
            <Avatar name={ig?.username} src={ig?.avatar_url} className="h-7 w-7" />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Abrir menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-[260px] flex-col p-0 py-4">
                <Workspace />
                <div className="mt-6 flex-1 overflow-y-auto px-2">
                  <Nav onNavigate={() => setOpen(false)} />
                </div>
                <Footer onSignOut={signOut} />
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1180px] px-4 py-6 pb-24 sm:px-8 lg:py-8">
          <PageErrorBoundary key={location.pathname}>
            <Outlet />
          </PageErrorBoundary>
        </main>
        <BottomBar onMore={() => setOpen(true)} />
      </div>
    </div>
  );
}
