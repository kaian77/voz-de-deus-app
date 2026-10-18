import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, Download, Loader2 } from "lucide-react";
import { api, isDemo } from "../lib/api";

// O Chrome avisa uma vez que dá para instalar: guarda o aviso para o botão "Instalar app"
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((f) => f());
  });
}

const standalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true);
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Rodapé do menu: instalar o Studio como app no celular e ligar os avisos (Web Push). */
export function AppInstall() {
  const [, rerender] = useState(0);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    listeners.add(f);
    if (pushSupported()) {
      navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => setSubscribed(!!sub && Notification.permission === "granted")).catch(() => setSubscribed(false));
    }
    return () => void listeners.delete(f);
  }, []);

  if (isDemo) return null;

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      deferred = null;
      rerender((n) => n + 1);
    } else if (ios()) {
      toast.message("No iPhone: toque em Compartilhar (quadrado com seta) → Adicionar à Tela de Início.", { duration: 9000 });
    } else {
      toast.message("No Chrome: menu ⋮ → Instalar app (ou Adicionar à tela inicial).", { duration: 9000 });
    }
  };

  const enable = async () => {
    if (!pushSupported()) {
      return toast.error(ios() ? "No iPhone, instale o Studio na Tela de Início primeiro e abra por lá." : "Este navegador não aceita avisos.");
    }
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Permita as notificações para o Studio nas configurações do navegador.");
      const { key } = await api.invoke<{ key: string }>("ai", { action: "push_key" });
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      await api.invoke("ai", { action: "push_subscribe", subscription: sub.toJSON(), user_agent: navigator.userAgent });
      setSubscribed(true);
      toast.success("Avisos ligados! Deve chegar um aviso de teste agora.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const row = "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] text-foreground/70 hover:bg-secondary hover:text-foreground";
  return (
    <>
      {!standalone() && (
        <button onClick={install} className={row}>
          <Download className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          Instalar app no celular
        </button>
      )}
      {subscribed ? (
        <p className={row + " hover:bg-transparent"}><BellRing className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />Avisos ligados</p>
      ) : (
        <button onClick={enable} disabled={busy} className={row}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
          Ligar avisos
        </button>
      )}
    </>
  );
}
