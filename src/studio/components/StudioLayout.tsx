import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bot, CalendarDays, CheckCircle2, Inbox, LayoutDashboard, LogOut, Menu, MessageCircle, PenSquare, Store, Users, Workflow, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { isDemo, resetDemo, supabase } from "../lib/api";
import { useTable } from "../lib/hooks";

const NAV = [
  { to: "/studio", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/studio/criar", label: "Criar post", icon: PenSquare },
  { to: "/studio/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/studio/aprovacoes", label: "Aprovações", icon: CheckCircle2, badge: "approvals" },
  { to: "/studio/mensagens", label: "Mensagens", icon: Inbox, badge: "inbox" },
  { to: "/studio/automacoes", label: "Automações", icon: Workflow },
  { to: "/studio/comentarios", label: "Comentários", icon: MessageCircle },
  { to: "/studio/vitrine", label: "Vitrine", icon: Store },
  { to: "/studio/concorrentes", label: "Concorrentes", icon: Users },
  { to: "/studio/contas", label: "Contas", icon: Link2 },
  { to: "/studio/claude", label: "Claude & API", icon: Bot },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: posts } = useTable("posts");
  const { data: conversations } = useTable("conversations", { order: "last_message_at" });
  const counts: Record<string, number> = {
    approvals: posts?.filter((p) => p.status === "pending_approval").length ?? 0,
    inbox: conversations?.filter((c) => c.status === "needs_human").length ?? 0,
  };
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )
          }
        >
          <item.icon className="h-4 w-4" />
          <span className="flex-1">{item.label}</span>
          {item.badge && counts[item.badge] > 0 && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-950">{counts[item.badge]}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-divine text-lg font-bold text-white">S</div>
      <div>
        <p className="text-sm font-bold leading-tight">Social Studio</p>
        <p className="text-xs text-muted-foreground">Instagram · TikTok · WhatsApp</p>
      </div>
    </div>
  );
}

export default function StudioLayout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-muted/30">
      {isDemo && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">
          Modo demo: os dados ficam só neste navegador. Configure o Supabase (veja <b>SETUP_SOCIAL_STUDIO.md</b>) para conectar Instagram e TikTok de verdade.
        </div>
      )}
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r bg-background py-5 lg:flex">
          <Brand />
          <div className="flex-1 overflow-y-auto px-3">
            <Nav />
          </div>
          <div className="px-3">
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> {isDemo ? "Reiniciar demo" : "Sair"}
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
            <Brand />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Abrir menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-4">
                <div className="mb-6 mt-2">
                  <Brand />
                </div>
                <Nav onNavigate={() => setOpen(false)} />
                <Button variant="ghost" size="sm" className="mt-6 w-full justify-start text-muted-foreground" onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" /> {isDemo ? "Reiniciar demo" : "Sair"}
                </Button>
              </SheetContent>
            </Sheet>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
