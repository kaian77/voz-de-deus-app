// Prospecção automática (Leads): liga/desliga o motor, quantas prévias por dia, e a fila de 1 toque — cada lead
// com a prévia pronta e a mensagem escrita; "Enviar" abre o WhatsApp do dono com o texto e marca como contatado.
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, Rocket, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useSaveRow, useSettings } from "../lib/hooks";
import type { LandingPage, Lead } from "../lib/types";
import { Panel, WhatsAppIcon } from "./bits";
import { humanize, outboxEta, waLink } from "../lib/crm";
import { SendAll } from "./SendAll";

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export default function ProspectQueue({ leads, pages }: { leads: Lead[]; pages: LandingPage[] }) {
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const save = useSaveRow("leads");
  const enabled = settings?.prospect_enabled ?? false;
  const perDay = settings?.prospect_per_day ?? 15;
  const ready = leads.filter((l) => l.prospect_status === "ready" && l.status === "new");
  const building = leads.filter((l) => l.prospect_status === "building");
  const sentToday = leads.filter((l) => l.prospect_status === "sent" && l.contacted_at && new Date(l.contacted_at).getTime() >= startOfDay()).length;
  const waiting = leads.filter((l) => l.status === "new" && !l.prospect_status && l.whatsapp);
  const failed = leads.filter((l) => l.prospect_status === "failed").length;

  const setSettings = async (patch: { prospect_enabled?: boolean; prospect_per_day?: number }) => {
    try {
      await api.saveSettings(patch);
      qc.invalidateQueries({ queryKey: ["settings"] });
      if (patch.prospect_enabled) toast.success("Motor ligado! A 1ª prévia fica pronta em 2 a 3 minutos.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const send = (l: Lead) => {
    window.open(waLink(l.whatsapp, l.prospect_message ?? ""), "_blank");
    const now = new Date().toISOString();
    save.mutate({ id: l.id, prospect_status: "sent", status: "contacted", contacted_at: now, last_touch_at: now });
  };
  const skip = (l: Lead) => save.mutate({ id: l.id, prospect_status: "skipped" });
  const linkOf = (l: Lead) => {
    const p = pages.find((x) => x.id === l.landing_id || x.lead_id === l.id);
    return p ? `https://paginaspro.app.br/p/${p.slug}` : null;
  };

  return (
    <Panel
      title="Prospecção automática"
      description="O motor monta a prévia de cada lead (sem site = site novo; com site = upgrade) e deixa a mensagem pronta. Você só toca em Enviar: sai do seu WhatsApp, sem robô e sem risco de bloqueio."
      action={<Switch checked={enabled} onCheckedChange={(v) => setSettings({ prospect_enabled: v })} aria-label="Ligar a prospecção automática" />}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Select value={String(perDay)} onValueChange={(v) => setSettings({ prospect_per_day: Number(v) })}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[5, 10, 15, 20, 30, 40].map((n) => <SelectItem key={n} value={String(n)}>{n} prévias por dia</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="rounded-full bg-secondary px-2.5 py-1">{ready.length} prontas</span>
        <span className="rounded-full bg-secondary px-2.5 py-1">{building.length ? "montando 1…" : "parado"}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1">{sentToday} enviadas hoje</span>
        <span className="rounded-full bg-secondary px-2.5 py-1">{waiting.length} na espera</span>
        {failed > 0 && <span className="rounded-full bg-secondary px-2.5 py-1 text-danger">{failed} falharam</span>}
      </div>
      <div className="mt-3"><SendAll leads={ready} allLeads={leads} textOf={(l) => l.prospect_message ?? ""} label="Enviar todos" /></div>
      {enabled && !waiting.length && !ready.length && !building.length && (
        <p className="mt-3 text-xs text-muted-foreground">Sem leads novos na espera. Faça uma busca abaixo (ex.: "dentista, nutricionista" em um bairro) e o motor começa sozinho.</p>
      )}
      {ready.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg border">
          {ready.slice(0, 20).map((l) => {
            const link = linkOf(l);
            return (
              <li key={l.id} className="space-y-2 p-3">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", l.kind === "upgrade" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900")}>
                    {l.kind === "upgrade" ? "Upgrade" : "Sem site"}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{l.name}</p>
                  {link && <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs hover:underline">Prévia <ExternalLink className="h-3 w-3" /></a>}
                </div>
                <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{humanize(l.prospect_message ?? "")}</p>
                {l.send_after ? <p className="text-xs text-sky-700">Na fila: sai por volta das {outboxEta(l)}</p> : <div className="flex gap-2">
                  <Button size="sm" className="h-8 flex-1" onClick={() => send(l)}><WhatsAppIcon className="mr-1.5 h-4 w-4" />Enviar</Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => skip(l)} title="Não enviar para este"><SkipForward className="h-4 w-4" /></Button>
                </div>}
              </li>
            );
          })}
        </ul>
      )}
      {!enabled && (
        <Button size="sm" className="mt-3" onClick={() => setSettings({ prospect_enabled: true })}><Rocket className="mr-1.5 h-4 w-4" />Ligar o motor</Button>
      )}
      {enabled && building.length > 0 && !ready.length && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Montando a prévia de {building[0].name}…</p>}
    </Panel>
  );
}
