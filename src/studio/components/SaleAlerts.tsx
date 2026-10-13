import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../lib/api";
import { useSettings, useTable } from "../lib/hooks";
import { StatusDot } from "./bits";

const CHANNELS = [
  { id: "mercadolivre", name: "Mercado Livre" },
  { id: "shopee", name: "Shopee" },
  { id: "nuvemshop", name: "Site (Nuvemshop)" },
] as const;

/** Aviso de venda: cada venda nova vira uma mensagem de WhatsApp para o número escolhido. */
export default function SaleAlerts() {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: accounts = [] } = useTable("social_accounts");
  const hasWhatsApp = accounts.some((a) => a.platform === "whatsapp");
  const savedPhone = settings?.sale_alert_phone ?? "";
  const savedChannels = settings?.sale_alert_channels ?? CHANNELS.map((c) => c.id);
  const [phone, setPhone] = useState(savedPhone);
  const [channels, setChannels] = useState<string[]>(savedChannels);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  useEffect(() => setPhone(savedPhone), [savedPhone]);
  useEffect(() => setChannels(savedChannels), [savedChannels.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy("save");
    try {
      const clean = phone.trim();
      await api.saveSettings({
        sale_alert_phone: clean || null,
        sale_alert_channels: channels,
        // Só avisa vendas a partir de agora (não manda as antigas de uma vez)
        ...(clean && clean !== savedPhone ? { sale_alert_since: new Date().toISOString() } : {}),
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success(clean ? "Aviso de venda ligado" : "Aviso de venda desligado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      await api.invoke("inbox", { action: "test_sale_alert", phone });
      toast.success("Mensagem de teste enviada");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="flex gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Aviso de venda no WhatsApp</h2>
            {savedPhone ? <StatusDot tone="success">Ligado</StatusDot> : <StatusDot tone="neutral">Desligado</StatusDot>}
          </div>
          <p className="mt-1 text-[13px] text-foreground/80">
            A cada venda nova, o Studio manda uma mensagem com o pedido, os itens e o total para o número que você escolher. Sai pelo WhatsApp conectado aqui em cima.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Confere a cada 2 minutos. TikTok Shop entra quando a conta for conectada.</p>
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="sale-phone" className="text-xs">Mandar para o número (com DDD)</Label>
          <Input id="sale-phone" className="h-8 text-[13px]" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="61 99999-9999" />
        </div>
        <div className="space-y-1.5">
          {CHANNELS.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={channels.includes(c.id)}
                onCheckedChange={(v) => setChannels((cur) => (v ? [...new Set([...cur, c.id])] : cur.filter((x) => x !== c.id)))}
              />
              {c.name}
            </label>
          ))}
        </div>
        {!hasWhatsApp && <p className="text-xs text-destructive">Conecte um WhatsApp acima para os avisos saírem.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" disabled={!hasWhatsApp || !phone.trim() || busy !== null} onClick={test}>
            {busy === "test" && <Loader2 className="animate-spin" />} Enviar teste
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={save}>
            {busy === "save" && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </div>
      </div>
    </section>
  );
}
