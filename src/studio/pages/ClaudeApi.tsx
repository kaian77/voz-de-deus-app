import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, functionsBaseUrl, isDemo, randomKey, sha256Hex } from "../lib/api";
import { useRemoveRow, useSettings, useTable } from "../lib/hooks";
import type { ApiKey, BrandSettings } from "../lib/types";
import { PageHeader, relativeTime } from "../components/bits";

const copy = (text: string, msg = "Copiado") =>
  navigator.clipboard.writeText(text).then(() => toast.success(msg), () => toast.error("Selecione o texto e copie manualmente"));

const EXAMPLES = [
  "Analise meu Instagram, me diga o que melhorar na vitrine e salve a auditoria no Studio.",
  "Crie 5 carrosséis para esta semana sobre ansiedade e fé e agende nos meus melhores horários.",
  "Crie uma automação: quem comentar ORAÇÃO recebe no direct o link do app.",
  "Adicione @perfil_x e @perfil_y como concorrentes, compare com a gente e me dê 10 ideias de reels.",
  "O que está agendado para os próximos 7 dias? Tem algum dia vazio?",
  "Quais conversas estão esperando por mim? Responda as que você souber.",
];

/** Linha de configuração: título e explicação à esquerda, controles à direita. */
function Row({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-6 last:border-b-0 md:grid-cols-[260px_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function KeyRow({ k, onRevoke }: { k: ApiKey; onRevoke: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{k.name} <span className="font-mono text-xs font-normal text-muted-foreground">{k.prefix}…</span></p>
        <p className="text-xs text-muted-foreground">{k.last_used_at ? `Último uso há ${relativeTime(k.last_used_at)}` : "Nunca usada"}</p>
      </div>
      {confirming ? (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={onRevoke}>Revogar</Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setConfirming(true)}>Revogar</Button>
      )}
    </div>
  );
}

export default function ClaudeApi() {
  const { data } = useSettings();
  const { data: keys = [] } = useTable("api_keys");
  const removeKey = useRemoveRow("api_keys");
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<BrandSettings>>({ approval_required: true, timezone: "America/Sao_Paulo" });
  const [saving, setSaving] = useState(false);
  const [keyName, setKeyName] = useState("Claude");
  const [newKey, setNewKey] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (key: keyof BrandSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value });
  const val = (key: keyof BrandSettings) => (form[key] as string | null | undefined) ?? "";

  const save = async () => {
    setSaving(true);
    try {
      const { user_id: _u, ...rest } = form;
      await api.saveSettings(rest);
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Configurações salvas");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const createKey = async () => {
    const key = randomKey();
    try {
      await api.insert("api_keys", { name: keyName || "Claude", prefix: key.slice(0, 10), key_hash: await sha256Hex(key) });
      qc.invalidateQueries({ queryKey: ["table", "api_keys"] });
      setNewKey(key);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const mcpUrl = `${functionsBaseUrl}/agent/mcp/${newKey ?? "SUA_CHAVE"}`;

  return (
    <div>
      <PageHeader
        title="Claude e API"
        description="O que o Claude e o agente de IA sabem sobre a sua marca, e como o Claude acessa o Studio."
        actions={<Button size="sm" onClick={save} disabled={saving}>Salvar alterações</Button>}
      />

      <div className="rounded-lg border bg-card px-5">
        <Row title="Marca" description="Contexto usado em legendas, carrosséis, respostas e análises.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="brand_name" label="Nome da marca"><Input id="brand_name" className="h-9" value={val("brand_name")} onChange={set("brand_name")} placeholder="Voz de Deus" /></Field>
            <Field id="niche" label="Nicho"><Input id="niche" className="h-9" value={val("niche")} onChange={set("niche")} placeholder="Conteúdo cristão e devocional" /></Field>
          </div>
          <Field id="audience" label="Público"><Textarea id="audience" rows={2} className="text-[13px]" value={val("audience")} onChange={set("audience")} placeholder="Quem você quer alcançar" /></Field>
          <Field id="tone" label="Tom de voz"><Input id="tone" className="h-9" value={val("tone")} onChange={set("tone")} placeholder="Acolhedor, esperançoso, simples" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="default_hashtags" label="Hashtags da marca"><Input id="default_hashtags" className="h-9" value={val("default_hashtags")} onChange={set("default_hashtags")} placeholder="fé palavradedeus jesus" /></Field>
            <Field id="timezone" label="Fuso horário"><Input id="timezone" className="h-9 font-mono text-xs" value={val("timezone")} onChange={set("timezone")} /></Field>
          </div>
          <Field id="default_cta" label="Chamada para ação padrão"><Input id="default_cta" className="h-9" value={val("default_cta")} onChange={set("default_cta")} placeholder="Comente AMÉM para receber uma oração" /></Field>
        </Row>

        <Row title="Agente de mensagens" description="Responde o direct do Instagram e o WhatsApp. Quando não souber, ou a pessoa pedir um humano, passa a conversa para você.">
          <label htmlFor="agent_enabled" className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <span className="text-[13px] font-medium">Responder mensagens automaticamente</span>
            <Switch id="agent_enabled" checked={!!form.agent_enabled} onCheckedChange={(v) => setForm({ ...form, agent_enabled: v })} />
          </label>
          <Field id="agent_instructions" label="Como atender" hint="Postura, o que oferecer, o que evitar.">
            <Textarea id="agent_instructions" rows={3} className="text-[13px]" value={val("agent_instructions")} onChange={set("agent_instructions")} placeholder="Acolha, ofereça oração, convide para o grupo de quarta. Nunca fale de política." />
          </Field>
          <Field id="agent_knowledge" label="Base de conhecimento" hint="O agente só afirma o que estiver aqui: horários, links, preços, perguntas frequentes.">
            <Textarea id="agent_knowledge" rows={5} className="font-mono text-xs leading-relaxed" value={val("agent_knowledge")} onChange={set("agent_knowledge")} placeholder={"Grupo de oração: quartas, 20h, ao vivo no Instagram\nApp: https://vozdedeus.app"} />
          </Field>
          <Field id="agent_handoff_message" label="Mensagem ao passar para você">
            <Input id="agent_handoff_message" className="h-9" value={val("agent_handoff_message")} onChange={set("agent_handoff_message")} placeholder="Vou chamar alguém da equipe para te responder." />
          </Field>
        </Row>

        <Row title="Autonomia do Claude" description="Defina se o Claude publica sozinho ou deixa os posts esperando a sua aprovação.">
          <label htmlFor="approval_required" className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <span>
              <span className="block text-[13px] font-medium">Exigir minha aprovação</span>
              <span className="block text-xs text-muted-foreground">Desligado, o Claude agenda e publica direto.</span>
            </span>
            <Switch id="approval_required" checked={!!form.approval_required} onCheckedChange={(v) => setForm({ ...form, approval_required: v })} />
          </label>
        </Row>

        <Row
          title="Acesso do Claude"
          description={<>Gere uma chave e adicione o Studio como conector no Claude: <span className="text-foreground">Configurações → Conectores → Adicionar conector personalizado</span>.</>}
        >
          {isDemo && <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">No modo demonstração não há servidor. A conexão funciona depois de configurar o Supabase.</p>}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createKey();
            }}
          >
            <Input className="h-9" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Nome da chave" aria-label="Nome da chave" />
            <Button type="submit" size="sm" variant="outline" className="h-9 shrink-0">Gerar chave</Button>
          </form>
          {newKey && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium">Copie agora. Por segurança, a chave não é exibida de novo.</p>
              <div className="flex gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-secondary px-2 py-1.5 font-mono text-[11px]">{newKey}</code>
                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => copy(newKey)} aria-label="Copiar chave"><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          )}
          {keys.length > 0 && <div className="divide-y rounded-md border">{keys.map((k) => <KeyRow key={k.id} k={k} onRevoke={() => removeKey.mutate(k.id)} />)}</div>}
          <Field id="mcp" label="Endereço do conector (MCP)">
            <div className="flex gap-2">
              <code id="mcp" className="min-w-0 flex-1 break-all rounded border bg-secondary/60 px-2 py-1.5 font-mono text-[11px]">{mcpUrl}</code>
              <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => copy(mcpUrl)} aria-label="Copiar endereço"><Copy className="h-3.5 w-3.5" /></Button>
            </div>
          </Field>
          <Field id="cli" label="Claude Code">
            <code id="cli" className="block break-all rounded border bg-secondary/60 px-2 py-1.5 font-mono text-[11px]">claude mcp add --transport http social-studio {mcpUrl}</code>
          </Field>
        </Row>

        <Row title="O que pedir" description="Exemplos para colar no Claude depois de conectar.">
          <div className="divide-y rounded-md border">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => copy(e, "Exemplo copiado")} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] hover:bg-secondary/50">
                <span className="flex-1">{e}</span>
                <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </Row>
      </div>
    </div>
  );
}
