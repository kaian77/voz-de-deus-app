import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";

// SDK do Facebook (carregado só quando o dono toca no botão)
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

type Config = { app_id: string; config_id: string; ready: boolean };

function loadSdk(appId: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v24.0" });
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("Não consegui carregar o Facebook. Confira a internet e tente de novo."));
    document.body.appendChild(s);
  });
}

/**
 * WhatsApp Business da PáginasPro em coexistência: o número continua no app do celular (você manda a 1ª mensagem
 * para o lead) e a IA da PáginasPro responde pela API oficial quando o cliente fala.
 */
export default function PaginasProWhatsApp() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const cfg = await api.invoke<Config>("inbox", { action: "wa_signup_config" });
      if (!cfg.ready) {
        setMissing(true);
        return;
      }
      await loadSdk(cfg.app_id);
      // O Facebook manda os ids do número e da conta por mensagem da janela; o código vem no retorno do login
      let ids: { phone_number_id?: string; waba_id?: string } = {};
      let finished = false;
      const onMessage = (e: MessageEvent) => {
        if (!/facebook\.com$/.test(new URL(e.origin).hostname)) return;
        try {
          const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
          if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
          if (String(data.event).startsWith("FINISH")) {
            ids = data.data ?? {};
            finished = true;
          }
          if (data.event === "CANCEL") toast.message("Conexão cancelada no Facebook.");
        } catch {
          /* mensagens que não são do cadastro */
        }
      };
      window.addEventListener("message", onMessage);
      const code = await new Promise<string | null>((resolve) =>
        window.FB.login((r: { authResponse?: { code?: string } }) => resolve(r?.authResponse?.code ?? null), {
          config_id: cfg.config_id,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
        }),
      );
      // Os ids às vezes chegam um instante depois do código
      for (let i = 0; i < 20 && !finished; i++) await new Promise((r) => setTimeout(r, 250));
      window.removeEventListener("message", onMessage);
      if (!code) return;
      if (!ids.phone_number_id || !ids.waba_id) throw new Error("O Facebook não devolveu o número. Tente de novo e escolha o número da PáginasPro até o fim.");
      await api.invoke("inbox", { action: "connect_whatsapp_signup", code, phone_number_id: ids.phone_number_id, waba_id: ids.waba_id });
      await qc.invalidateQueries({ queryKey: ["table", "social_accounts"] });
      toast.success("WhatsApp da PáginasPro conectado! A IA já responde quem chamar.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed p-3">
      <p className="text-[13px] font-medium">WhatsApp da PáginasPro (app + IA)</p>
      <p className="mt-1 text-xs text-muted-foreground">
        O número continua no app do WhatsApp Business do seu celular. Você manda a primeira mensagem para o lead pelo app e, quando ele responder,
        a IA da PáginasPro conversa, pede os dados, monta a prévia e manda os planos. Se você responder pelo app, a IA espera 3 horas.
      </p>
      <Button size="sm" className="mt-2 w-full" onClick={connect} disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Conectar com Facebook
      </Button>
      {missing && (
        <p className="mt-2 text-xs text-destructive">
          Falta configurar o app da Meta: cadastre META_APP_ID e WA_ES_CONFIG_ID (e META_APP_SECRET, se o segredo for diferente do WHATSAPP_APP_SECRET)
          nos secrets do GitHub e rode o deploy.
        </p>
      )}
    </div>
  );
}
