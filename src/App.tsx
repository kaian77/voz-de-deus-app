import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Navigate, Routes, Route } from "react-router-dom";
import AuthGate from "./studio/components/AuthGate";
import StudioLayout from "./studio/components/StudioLayout";
import Dashboard from "./studio/pages/Dashboard";
import Composer from "./studio/pages/Composer";
import BulkSchedule from "./studio/pages/BulkSchedule";
import Calendar from "./studio/pages/Calendar";
import Approvals from "./studio/pages/Approvals";
import Automations from "./studio/pages/Automations";
import Comments from "./studio/pages/Comments";
import Vitrine from "./studio/pages/Vitrine";
import Competitors from "./studio/pages/Competitors";
import Leads from "./studio/pages/Leads";
import Landings from "./studio/pages/Landings";
import YouTube from "./studio/pages/YouTube";
import Clips from "./studio/pages/Clips";
import Usage from "./studio/pages/Usage";
import Accounts from "./studio/pages/Accounts";
import ClaudeApi from "./studio/pages/ClaudeApi";
import Messages from "./studio/pages/Messages";
import Orders from "./studio/pages/Orders";
import Products from "./studio/pages/Products";
import Legal from "./studio/pages/Legal";
import StrategyPage from "./studio/pages/Strategy";
import Videos from "./studio/pages/Videos";
import Review from "./studio/pages/Review";
import Reviews from "./studio/pages/Reviews";
import LinkBio from "./studio/pages/LinkBio";
import { INSTAGRAM_STUDIO_PATHS, IS_INSTAGRAM_PRODUCT } from "./studio/lib/product";

const queryClient = new QueryClient();

// Build de demonstração hospedado como página única (VITE_HASH_ROUTER=1) usa rotas com #
const Router = import.meta.env.VITE_HASH_ROUTER ? HashRouter : BrowserRouter;

const studioRoutes = [
  { path: "", element: <Dashboard /> },
  { path: "criar", element: <Composer /> },
  { path: "em-massa", element: <BulkSchedule /> },
  { path: "videos", element: <Videos /> },
  { path: "calendario", element: <Calendar /> },
  { path: "aprovacoes", element: <Approvals /> },
  { path: "automacoes", element: <Automations /> },
  { path: "comentarios", element: <Comments /> },
  { path: "mensagens", element: <Messages /> },
  { path: "pedidos", element: <Orders /> },
  { path: "avaliacoes", element: <Reviews /> },
  { path: "produtos", element: <Products /> },
  { path: "estrategia", element: <StrategyPage /> },
  { path: "vitrine", element: <Vitrine /> },
  { path: "link-bio", element: <LinkBio /> },
  { path: "concorrentes", element: <Competitors /> },
  { path: "leads", element: <Leads /> },
  { path: "landing", element: <Landings /> },
  { path: "youtube", element: <YouTube /> },
  { path: "cortes", element: <Clips /> },
  { path: "uso", element: <Usage /> },
  { path: "contas", element: <Accounts /> },
  { path: "claude", element: <ClaudeApi /> },
];

const visibleStudioRoutes = IS_INSTAGRAM_PRODUCT
  ? studioRoutes.filter((route) => INSTAGRAM_STUDIO_PATHS.has(route.path))
  : studioRoutes;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/studio" replace />} />
          <Route path="/studio" element={<AuthGate><StudioLayout /></AuthGate>}>
            {visibleStudioRoutes.map((route) => route.path
              ? <Route key={route.path} path={route.path} element={route.element} />
              : <Route key="index" index element={route.element} />)}
            {IS_INSTAGRAM_PRODUCT && <Route path="*" element={<Navigate to="/studio" replace />} />}
          </Route>
          <Route path="/avaliar" element={<Review />} />
          <Route path="/privacidade" element={<Legal doc="privacidade" />} />
          <Route path="/termos" element={<Legal doc="termos" />} />
          <Route path="/exclusao-de-dados" element={<Legal doc="exclusao-de-dados" />} />
          <Route path="*" element={<Navigate to="/studio" replace />} />
        </Routes>
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
