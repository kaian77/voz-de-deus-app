// Botão "Enviar todos": põe os leads na fila do envio automático (o cron manda 1 por vez pelo WhatsApp conectado
// no WAHA, com 4 a 9 min entre um e outro, seg a sáb das 8h às 20h, até 30 por dia). Mostra a fila e deixa cancelar.
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { api } from "../lib/api";
import { useInvalidate, useTable } from "../lib/hooks";
import type { Lead } from "../lib/types";
import { outboxSchedule } from "../lib/crm";

export function SendAll({ leads, textOf, label, allLeads }: { leads: Lead[]; textOf: (l: Lead) => string; label: string; allLeads: Lead[] }) {
  const invalidate = useInvalidate();
  const { data: accounts = [] } = useTable("social_accounts");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = allLeads.filter((l) => l.send_after);
  const todo = leads.filter((l) => !l.send_after && l.whatsapp).slice(0, 30);
  const wa = accounts.find((a) => a.platform === "whatsapp" && (a.meta as { provider?: string } | null)?.provider === "waha");

  const queue = async () => {
    setBusy(true);
    try {
      const last = Math.max(Date.now(), ...pending.map((l) => new Date(l.send_after!).getTime() + 5 * 60_000));
      const times = outboxSchedule(todo.length, pending.length ? last : Date.now());
      await Promise.all(todo.map((l, i) => api.update("leads", l.id, { send_after: times[i], send_text: textOf(l), send_error: null })));
      await invalidate("leads");
      toast.success(`${todo.length} mensagens na fila. Saem uma por vez, a cada 4 a 9 minutos (termina por volta das ${new Date(times[times.length - 1]).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      await Promise.all(pending.map((l) => api.update("leads", l.id, { send_after: null, send_text: null })));
      await invalidate("leads");
      toast.success("Envio automático cancelado");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {todo.length > 0 && (
          <Button size="sm" className="h-8" disabled={busy} onClick={() => (wa ? setConfirm(true) : toast.error("Conecte seu WhatsApp em Contas → WhatsApp (QR code do WAHA) para enviar automático. Sem isso, use o Enviar de cada um."))}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}{label} ({todo.length})
          </Button>
        )}
        {pending.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-xs text-sky-900">
            <Loader2 className="h-3 w-3 animate-spin" />{pending.length} na fila de envio
            <button type="button" className="ml-1 hover:underline" onClick={cancel} disabled={busy}><X className="inline h-3 w-3" /> cancelar</button>
          </span>
        )}
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar {todo.length} mensagens automático?</AlertDialogTitle>
            <AlertDialogDescription>
              Saem do seu WhatsApp ({wa?.username ?? "conectado"}), uma por vez, com 4 a 9 minutos entre elas, de segunda a sábado das 8h às 20h, no máximo 30 por dia.
              Cada mensagem é diferente e começa com "Bom dia/Boa tarde". Mesmo assim, mensagem para quem não te conhece pode gerar denúncia e o WhatsApp pode restringir o número; se 3 envios falharem seguidos, a fila para e você recebe um aviso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={queue}>Enviar todos</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
