import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useRemoveRow, useSaveRow, useTable } from "../lib/hooks";
import { PlatformIcon, StatusDot } from "./bits";
import { ConnectedAccount } from "../pages/Accounts";

type Provider = "waha" | "meta";

export default function WhatsAppConnect() {
  const { data: accounts = [] } = useTable("social_accounts");
  const remove = useRemoveRow("social_accounts");
  const save = useSaveRow("social_accounts");
  const qc = useQueryClient();
  const list = accounts.filter((a) => a.platform === "whatsapp");
  const [provider, setProvider] = useState<Provider>("waha");
  const [busy, setBusy] = useState(false);
  const [waha, setWaha] = useState({ base_url: "", session: "default", api_key: "" });
  const [meta, setMeta] = useState({ phone_number_id: "", access_token: "", waba_id: "" });
  const [webhook, setWebhook] = useState<string | null>(null);
  const [label, setLabel] = useState("Pessoal");
  const [agent, setAgent] = useState(false);

  const connect = async (action: "connect_waha" | "connect_whatsapp", body: Record<string, string>) => {
    setBusy(true);
    try {
      const r = await api.invoke<{ webhook_url?: string; webhook_configured?: boolean; status?: string }>("inbox", { action, ...body, label, agent });
      qc.invalidateQueries({ queryKey: ["table", "social_accounts"] });
      if (r.status && r.status !== "WORKING") toast.warning("Salvo. Agora leia o QR Code no painel do WAHA (a sessão está iniciando).");
      else toast.success("WhatsApp conectado");
      if (r.webhook_url && !r.webhook_configured) setWebhook(r.webhook_url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado"), () => toast.error("Selecione e copie manualmente"));

  return (
    <section className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="flex gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"><PlatformIcon platform="whatsapp" className="h-5 w-5 text-foreground" /></span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">WhatsApp</h2>
            {list.length > 0 ? <StatusDot tone="success">Conectado</StatusDot> : <StatusDot tone="neutral">Não conectado</StatusDot>}
          </div>
          <p className="mt-1 text-[13px] text-foreground/80">O agente de IA responde quem chamar no seu WhatsApp e passa a conversa para você quando precisa. Dá para conectar mais de um número (ex.: pessoal e loja) e escolher em qual a IA responde.</p>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <p><span className="font-medium text-foreground">WAHA</span> é gratuito e roda num servidor seu, conectado por QR Code como o WhatsApp Web. Não é oficial: o WhatsApp pode bloquear números que se comportem como robô. Comece com um número secundário e não envie mensagens em massa.</p>
            <p><span className="font-medium text-foreground">API oficial da Meta</span> não tem risco de bloqueio. Responder quem te chamou, em até 24 horas, é gratuito; só mensagens iniciadas por você são cobradas.</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {list.map((a) => (
          <div key={a.id} className="space-y-1.5">
            <ConnectedAccount account={a} onRemove={() => remove.mutate(a.id)} />
            {a.meta.provider === "waha" && a.meta.status && a.meta.status !== "WORKING" && (
              <p className="px-1 text-xs text-destructive">
                {a.meta.status.startsWith("ERRO") ? "Servidor do WAHA fora do ar." : "Desconectado: abra o painel do WAHA e leia o QR Code de novo."} ({a.meta.status})
              </p>
            )}
            <label className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
              IA responde neste número
              <Switch checked={a.meta.agent !== false} onCheckedChange={(v) => save.mutate({ id: a.id, meta: { ...a.meta, agent: v } })} />
            </label>
          </div>
        ))}

        {webhook && (
          <div className="space-y-2 rounded-md border border-dashed p-3 text-xs">
            <p>Configure este endereço no painel do WAHA, em Webhooks da sessão, com o evento <code className="font-mono">message</code>:</p>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-secondary p-2 font-mono text-[11px]">{webhook}</code>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => copy(webhook)} aria-label="Copiar endereço"><Copy className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}

        <div className="rounded-md border">
          <div className="grid grid-cols-2 border-b text-xs font-medium">
            {(["waha", "meta"] as Provider[]).map((p) => (
              <button key={p} type="button" onClick={() => setProvider(p)} className={cn("h-9 border-b-2", provider === p ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {p === "waha" ? "WAHA (grátis)" : "API oficial"}
              </button>
            ))}
          </div>
          <form
            className="space-y-3 p-3 [&_label]:text-xs"
            onSubmit={(e) => {
              e.preventDefault();
              if (provider === "waha") connect("connect_waha", waha);
              else connect("connect_whatsapp", meta);
            }}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wa-label">Nome do número</Label>
                <Input id="wa-label" className="h-8 text-[13px]" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pessoal, Loja..." />
              </div>
              <div className="flex h-8 items-center gap-2">
                <Switch id="wa-agent" checked={agent} onCheckedChange={setAgent} />
                <Label htmlFor="wa-agent">IA responde</Label>
              </div>
            </div>
            {provider === "waha" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="waha-url">Endereço do WAHA (https)</Label>
                  <Input id="waha-url" className="h-8 text-[13px]" value={waha.base_url} onChange={(e) => setWaha({ ...waha, base_url: e.target.value })} placeholder="https://waha.seudominio.com" />
                </div>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="waha-session">Sessão</Label>
                    <Input id="waha-session" className="h-8 text-[13px]" value={waha.session} onChange={(e) => setWaha({ ...waha, session: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="waha-key">Chave de API</Label>
                    <Input id="waha-key" className="h-8 text-[13px]" type="password" value={waha.api_key} onChange={(e) => setWaha({ ...waha, api_key: e.target.value })} placeholder="WAHA_API_KEY" />
                  </div>
                </div>
                <Button type="submit" size="sm" className="w-full" disabled={busy || !waha.base_url}>{busy && <Loader2 className="animate-spin" />} Conectar WAHA</Button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-phone">Phone Number ID</Label>
                    <Input id="wa-phone" className="h-8 text-[13px]" value={meta.phone_number_id} onChange={(e) => setMeta({ ...meta, phone_number_id: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wa-waba">ID da conta (WABA)</Label>
                    <Input id="wa-waba" className="h-8 text-[13px]" value={meta.waba_id} onChange={(e) => setMeta({ ...meta, waba_id: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-token">Token permanente</Label>
                  <Input id="wa-token" className="h-8 text-[13px]" type="password" value={meta.access_token} onChange={(e) => setMeta({ ...meta, access_token: e.target.value })} />
                </div>
                <Button type="submit" size="sm" className="w-full" disabled={busy || !meta.phone_number_id || !meta.access_token}>{busy && <Loader2 className="animate-spin" />} Conectar API oficial</Button>
              </>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
