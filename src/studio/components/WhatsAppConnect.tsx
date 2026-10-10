import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "../lib/api";
import { useRemoveRow, useTable } from "../lib/hooks";

export default function WhatsAppConnect() {
  const { data: accounts = [] } = useTable("social_accounts");
  const remove = useRemoveRow("social_accounts");
  const qc = useQueryClient();
  const list = accounts.filter((a) => a.platform === "whatsapp");
  const [busy, setBusy] = useState(false);
  const [waha, setWaha] = useState({ base_url: "", session: "default", api_key: "" });
  const [meta, setMeta] = useState({ phone_number_id: "", access_token: "", waba_id: "" });
  const [webhook, setWebhook] = useState<string | null>(null);

  const connect = async (action: "connect_waha" | "connect_whatsapp", body: Record<string, string>) => {
    setBusy(true);
    try {
      const r = await api.invoke<{ webhook_url?: string; webhook_configured?: boolean }>("inbox", { action, ...body });
      qc.invalidateQueries({ queryKey: ["table", "social_accounts"] });
      toast.success("WhatsApp conectado!");
      if (r.webhook_url && !r.webhook_configured) setWebhook(r.webhook_url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">WhatsApp</CardTitle>
        <CardDescription>O agente de IA responde quem te chamar no WhatsApp e passa para você quando precisar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {list.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="flex-1">
              <p className="text-sm font-semibold">{a.display_name}</p>
              <p className="text-xs text-muted-foreground">+{a.username} · {a.meta.provider === "waha" ? "WAHA" : "API oficial"}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => confirm("Desconectar este WhatsApp?") && remove.mutate(a.id)}>
              <Unplug className="mr-1 h-4 w-4" /> Desconectar
            </Button>
          </div>
        ))}

        {webhook && (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p>Não consegui configurar o webhook no WAHA automaticamente. No painel do WAHA, em <b>Webhooks</b> da sessão, cole esta URL com o evento <code>message</code>:</p>
            <div className="flex gap-2">
              <code className="flex-1 break-all rounded bg-white p-2 text-xs">{webhook}</code>
              <Button size="icon" variant="outline" onClick={() => navigator.clipboard.writeText(webhook).then(() => toast.success("Copiado"))} aria-label="Copiar"><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        <Tabs defaultValue="waha">
          <TabsList>
            <TabsTrigger value="waha">WAHA (grátis)</TabsTrigger>
            <TabsTrigger value="meta">API oficial da Meta</TabsTrigger>
          </TabsList>
          <TabsContent value="waha" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              O WAHA roda no seu servidor (Docker) e conecta o WhatsApp lendo um QR Code, igual ao WhatsApp Web. É gratuito, mas <b>não é oficial</b>: o
              WhatsApp pode bloquear números que pareçam robô. Comece com um número secundário e evite mandar mensagens em massa.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-3">
                <Label>URL pública do WAHA (https)</Label>
                <Input value={waha.base_url} onChange={(e) => setWaha({ ...waha, base_url: e.target.value })} placeholder="https://waha.seudominio.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Sessão</Label>
                <Input value={waha.session} onChange={(e) => setWaha({ ...waha, session: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>API key do WAHA (WAHA_API_KEY)</Label>
                <Input type="password" value={waha.api_key} onChange={(e) => setWaha({ ...waha, api_key: e.target.value })} />
              </div>
            </div>
            <Button onClick={() => connect("connect_waha", waha)} disabled={busy || !waha.base_url}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Conectar WAHA
            </Button>
          </TabsContent>
          <TabsContent value="meta" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Oficial e sem risco de bloqueio. <b>Responder</b> quem te chamou (até 24h depois) é gratuito; só mensagens iniciadas por você, com template, são cobradas.
              Os dados ficam no app da Meta, em WhatsApp → Configuração da API.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Phone Number ID</Label>
                <Input value={meta.phone_number_id} onChange={(e) => setMeta({ ...meta, phone_number_id: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp Business Account ID</Label>
                <Input value={meta.waba_id} onChange={(e) => setMeta({ ...meta, waba_id: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Token permanente (usuário do sistema)</Label>
                <Input type="password" value={meta.access_token} onChange={(e) => setMeta({ ...meta, access_token: e.target.value })} />
              </div>
            </div>
            <Button onClick={() => connect("connect_whatsapp", meta)} disabled={busy || !meta.phone_number_id || !meta.access_token}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Conectar API oficial
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
