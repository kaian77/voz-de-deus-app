import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthGate from "./studio/components/AuthGate";
import StudioLayout from "./studio/components/StudioLayout";
import Dashboard from "./studio/pages/Dashboard";
import Composer from "./studio/pages/Composer";
import Calendar from "./studio/pages/Calendar";
import Approvals from "./studio/pages/Approvals";
import Automations from "./studio/pages/Automations";
import Comments from "./studio/pages/Comments";
import Vitrine from "./studio/pages/Vitrine";
import Competitors from "./studio/pages/Competitors";
import Accounts from "./studio/pages/Accounts";
import ClaudeApi from "./studio/pages/ClaudeApi";
import Messages from "./studio/pages/Messages";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/studio" element={<AuthGate><StudioLayout /></AuthGate>}>
            <Route index element={<Dashboard />} />
            <Route path="criar" element={<Composer />} />
            <Route path="calendario" element={<Calendar />} />
            <Route path="aprovacoes" element={<Approvals />} />
            <Route path="automacoes" element={<Automations />} />
            <Route path="comentarios" element={<Comments />} />
            <Route path="mensagens" element={<Messages />} />
            <Route path="vitrine" element={<Vitrine />} />
            <Route path="concorrentes" element={<Competitors />} />
            <Route path="contas" element={<Accounts />} />
            <Route path="claude" element={<ClaudeApi />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
