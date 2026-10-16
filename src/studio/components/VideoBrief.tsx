import { useEffect, useState } from "react";
import { Clapperboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type VideoStyle = "cinema" | "classic";
/** O que o dono quer no vídeo: vai junto com o pedido (vazio = a IA decide sozinha). */
export type VideoBrief = { instructions: string; style: VideoStyle };
export const EMPTY_BRIEF: VideoBrief = { instructions: "", style: "cinema" };

const STYLES: { id: VideoStyle; label: string; hint: string }[] = [
  { id: "cinema", label: "Cinematográfico", hint: "Closes de câmera na foto real, luz e textos premium" },
  { id: "classic", label: "Clássico", hint: "Animação antiga, com o produto recortado" },
];

export function VideoBriefFields({ value, onChange, idPrefix = "vb" }: { value: VideoBrief; onChange: (v: VideoBrief) => void; idPrefix?: string }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Estilo</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange({ ...value, style: s.id })}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition-colors",
                value.style === s.id ? "border-foreground bg-secondary" : "bg-card hover:bg-secondary/60",
              )}
            >
              <span className="block text-[13px] font-medium">{s.label}</span>
              <span className="block text-xs text-muted-foreground">{s.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-notes`} className="text-xs">Observações para o vídeo (opcional)</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={3}
          value={value.instructions}
          onChange={(e) => onChange({ ...value, instructions: e.target.value })}
          placeholder={'Ex.: clima de mistério, cores roxas, gancho "ARMY, vocês estão preparadas?", final "Garanta o seu"'}
          maxLength={1500}
        />
        <p className="text-xs text-muted-foreground">Deixe em branco e a IA faz sozinha. Frases entre aspas entram do jeito que você escrever.</p>
      </div>
    </div>
  );
}

/** Janela que aparece antes de gerar/refazer um vídeo, para o dono dizer o que quer. */
export function VideoBriefDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initial?: Partial<VideoBrief>;
  onConfirm: (brief: VideoBrief) => Promise<void> | void;
}) {
  const [value, setValue] = useState<VideoBrief>({ ...EMPTY_BRIEF, ...initial });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue({ ...EMPTY_BRIEF, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(value);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <VideoBriefFields value={value} onChange={setValue} idPrefix="vbd" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Clapperboard />}Gerar vídeo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
