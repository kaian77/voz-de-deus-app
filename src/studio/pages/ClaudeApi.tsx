import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Copy, KeyRound, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, functionsBaseUrl, isDemo, randomKey, sha256Hex } from "../lib/api";
import { useRemoveRow, useSettings, useTable } from "../lib/hooks";
import type { BrandSettings } from "../lib/types";
import { formatDateTime, PageHeader } from "../components/bits";

const copy = (text: string, msg = "Copiado!") => navigator.clipboard.writeText(text).then(() => toast.success(msg));

const EXAMPLES = [
  "Analise meu Instagram e me diga o que melhorar na vitrine. Salve a auditoria no Studio.",
  "Crie 5 carrosséis para esta semana sobre ansiedade e fé, e agende nos meus melhores horários.",
  "Crie uma automação: quem comentar ORAÇÃO recebe no direct o link do app.",
  "Adicione @perfil_x e @perfil_y como concorrentes, compare com a gente e me dê 10 ideias de reels.",
  "O que está agendado para os próximos 7 dias? Tem algum buraco no calendário?",
  "Quais conversas estão esperando por mim? Responda as que você souber.",
];

function BrandForm() {
  const { data } = useSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<BrandSettings>>({ approval_required: true, timezone: "America/Sao_Paulo" });
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  const field = (key: keyof BrandSettings, label: string, placeholder: string, multiline = false) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {multiline ? (
        <Textarea rows={2} value={(form[key] as string) ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />
      ) : (
        <Input value={(form[key] as string) ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />
      )}
    </div>
  );
  const save = async () => {
    try {
      const { user_id: _u, ...rest } = form;
      await api.saveSettings(rest);
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Perfil da marca salvo — a IA e o Claude vão usar isso.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Perfil da marca</CardTitle>
        <CardDescription>Contexto que o Claude e a IA usam para escrever no seu tom.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {field("brand_name", "Nome da marca", "Voz de Deus")}
          {field("niche", "Nicho", "Conteúdo cristão / devocional")}
        </div>
        {field("audience", "Público", "Quem você quer alcançar", true)}
        {field("tone", "Tom de voz", "Acolhedor, esperançoso, simples")}
        {field("default_hashtags", "Hashtags da marca", "fé palavradedeus jesus")}
        {field("default_cta", "CTA padrão", "Comente AMÉM para receber uma oração")}
        {field("timezone", "Fuso horário", "America/Sao_Paulo")}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Posts do Claude precisam da minha aprovação</p>
            <p className="text-xs text-muted-foreground">Desligado = o Claude agenda direto, com total autonomia.</p>
          </div>
          <Switch checked={!!form.approval_required} onCheckedChange={(v) => setForm({ ...form, approval_required: v })} />
        </div>
        <div className="space-y-3 rounded-lg border p-3" id="agente">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Agente de mensagens (IA responde DMs e WhatsApp)</p>
              <p className="text-xs text-muted-foreground">Quando não souber ou a pessoa pedir humano, ele te chama em Mensagens.</p>
            </div>
            <Switch checked={!!form.agent_enabled} onCheckedChange={(v) => setForm({ ...form, agent_enabled: v })} />
          </div>
          {field("agent_instructions", "Como o agente deve atender", "Ex: acolha, ofereça oração, convide para o grupo de quarta, nunca fale de política", true)}
          {field("agent_knowledge", "Base de conhecimento (FAQ, links, horários, preços)", "Ex: Grupo de oração: quartas 20h no Instagram. App: https://…", true)}
          {field("agent_handoff_message", "Mensagem ao passar para humano", "Vou chamar alguém da equipe, só um instante 🙏")}
        </div>
        <Button onClick={save}>Salvar</Button>
      </CardContent>
    </Card>
  );
}

export default function ClaudeApi() {
  const { data: keys = [] } = useTable("api_keys");
  const removeKey = useRemoveRow("api_keys");
  const qc = useQueryClient();
  const [name, setName] = useState("Claude");
  const [newKey, setNewKey] = useState<string | null>(null);

  const createKey = async () => {
    const key = randomKey();
    try {
      await api.insert("api_keys", { name: name || "Claude", prefix: key.slice(0, 10), key_hash: await sha256Hex(key) });
      qc.invalidateQueries({ queryKey: ["table", "api_keys"] });
      setNewKey(key);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const mcpUrl = `${functionsBaseUrl}/agent/mcp/${newKey ?? "SUA_CHAVE"}`;
  const restUrl = `${functionsBaseUrl}/agent/tools`;

  return (
    <div>
      <PageHeader title="Claude & API" description="Dê ao Claude acesso ao Studio para criar, agendar, analisar e responder por você." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> 1. Crie uma chave de acesso</CardTitle>
              <CardDescription>A chave dá acesso total ao Studio. Guarde em segredo; apague se vazar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex: Claude)" />
                <Button onClick={createKey}>Gerar chave</Button>
              </div>
              {newKey && (
                <Alert className="border-emerald-300 bg-emerald-50">
                  <AlertTitle>Copie agora — ela não aparece de novo</AlertTitle>
                  <AlertDescription className="mt-2 flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-white p-2 text-xs">{newKey}</code>
                    <Button size="icon" variant="outline" onClick={() => copy(newKey)} aria-label="Copiar"><Copy className="h-4 w-4" /></Button>
                  </AlertDescription>
                </Alert>
              )}
              {keys.map((k) => (
                <div key={k.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  <div className="flex-1">
                    <p className="font-medium">{k.name} <span className="font-mono text-xs text-muted-foreground">{k.prefix}…</span></p>
                    <p className="text-xs text-muted-foreground">{k.last_used_at ? `Usada ${formatDateTime(k.last_used_at)}` : "Nunca usada"}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => confirm("Revogar esta chave?") && removeKey.mutate(k.id)} aria-label="Revogar"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" /> 2. Conecte ao Claude</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {isDemo && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">No modo demo não há servidor: configure o Supabase para a conexão funcionar.</p>}
              <div className="space-y-1.5">
                <Label>URL do conector MCP</Label>
                <div className="flex gap-2">
                  <code className="flex-1 break-all rounded bg-muted p-2 text-xs">{mcpUrl}</code>
                  <Button size="icon" variant="outline" onClick={() => copy(mcpUrl)} aria-label="Copiar"><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              <div>
                <p className="font-medium">No Claude (app ou claude.ai)</p>
                <p className="text-muted-foreground">Configurações → Conectores → Adicionar conector personalizado → cole a URL acima.</p>
              </div>
              <div>
                <p className="font-medium">No Claude Code</p>
                <code className="block break-all rounded bg-muted p-2 text-xs">claude mcp add --transport http social-studio {mcpUrl}</code>
              </div>
              <div>
                <p className="font-medium">API REST (scripts / automações)</p>
                <code className="block break-all rounded bg-muted p-2 text-xs">
                  curl -H "Authorization: Bearer {newKey ?? "SUA_CHAVE"}" {restUrl}/get_overview -X POST -d '{"{}"}'
                </code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">3. Peça o que quiser</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => copy(e, "Exemplo copiado")} className="w-full rounded-md border p-2 text-left text-sm hover:bg-muted">“{e}”</button>
              ))}
            </CardContent>
          </Card>
        </div>
        <BrandForm />
      </div>
    </div>
  );
}
