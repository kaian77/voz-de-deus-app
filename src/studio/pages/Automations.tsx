import { useState } from "react";
import { toast } from "sonner";
import { MessageSquareReply, Pencil, Plus, Sparkles, Trash2, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useInstagramProfile, useRemoveRow, useSaveRow, useTable } from "../lib/hooks";
import { IgMediaTile } from "../components/IgMediaTile";
import type { Automation } from "../lib/types";
import { EmptyState, PageHeader } from "../components/bits";

const blank: Partial<Automation> = {
  name: "",
  active: true,
  keywords: [],
  match_mode: "contains",
  media_ids: [],
  reply_variants: ["Te mandei no direct, {username}! 💌"],
  dm_message: "Oi {username}! Aqui está o que você pediu: ",
  use_ai: false,
  ai_instructions: "",
  once_per_user: true,
};

const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

function AutomationDialog({ value, onClose }: { value: Partial<Automation>; onClose: () => void }) {
  const save = useSaveRow("automations");
  const { data: accounts = [] } = useTable("social_accounts");
  const [a, setA] = useState<Partial<Automation>>(value);
  const [keywords, setKeywords] = useState((value.keywords ?? []).join(", "));
  const [variants, setVariants] = useState((value.reply_variants ?? []).join("\n"));
  const [mediaIds, setMediaIds] = useState<string[]>(value.media_ids ?? []);
  const [pickPosts, setPickPosts] = useState((value.media_ids ?? []).length > 0);
  const profile = useInstagramProfile(pickPosts);
  const igAccounts = accounts.filter((x) => x.platform === "instagram");

  const submit = async () => {
    if (!a.name?.trim()) return toast.error("Dê um nome à automação.");
    const kw = splitList(keywords);
    if (a.match_mode !== "any" && kw.length === 0) return toast.error("Informe pelo menos uma palavra-chave (ou escolha 'qualquer comentário').");
    if (pickPosts && mediaIds.length === 0) return toast.error("Escolha pelo menos um post ou desligue 'Só em posts específicos'.");
    if (!a.dm_message?.trim() && !splitList(variants).length && !a.use_ai) return toast.error("Defina uma resposta pública, uma DM ou ative a IA.");
    await save.mutateAsync({
      ...a,
      account_id: a.account_id ?? igAccounts[0]?.id ?? null,
      keywords: kw,
      reply_variants: variants.split("\n").map((x) => x.trim()).filter(Boolean),
      media_ids: pickPosts ? mediaIds : [],
    });
    toast.success("Automação salva!");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{a.id ? "Editar automação" : "Nova automação"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={a.name ?? ""} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Ex: Comentou ORAÇÃO → manda link" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Quando o comentário…</Label>
              <Select value={a.match_mode} onValueChange={(v) => setA({ ...a, match_mode: v as Automation["match_mode"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">contém a palavra</SelectItem>
                  <SelectItem value="exact">é exatamente a palavra</SelectItem>
                  <SelectItem value="any">qualquer comentário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {igAccounts.length > 1 && (
              <div className="space-y-1.5">
                <Label>Conta</Label>
                <Select value={a.account_id ?? igAccounts[0]?.id} onValueChange={(v) => setA({ ...a, account_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {igAccounts.map((acc) => <SelectItem key={acc.id} value={acc.id}>@{acc.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {a.match_mode !== "any" && (
            <div className="space-y-1.5">
              <Label>Palavras-chave (separe por vírgula)</Label>
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="amém, oração, quero" />
              <p className="text-xs text-muted-foreground">Não diferencia maiúsculas nem acentos: "Oração" = "oracao".</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Só em posts específicos</Label>
              <Switch checked={pickPosts} onCheckedChange={setPickPosts} />
            </div>
            {!pickPosts && <p className="text-xs text-muted-foreground">Vale para todos os posts e reels.</p>}
            {pickPosts && (
              <div className="max-h-56 overflow-y-auto rounded-md border p-2">
                {profile.isLoading && <p className="text-xs text-muted-foreground">Carregando seus posts…</p>}
                {profile.error && <p className="text-xs text-destructive">{(profile.error as Error).message}</p>}
                {!profile.data && !profile.isLoading && !profile.error && <p className="text-xs text-muted-foreground">Conecte o Instagram para escolher os posts.</p>}
                <div className="grid grid-cols-4 gap-1">
                  {profile.data?.media.map((m) => (
                    <IgMediaTile
                      key={m.id}
                      media={m}
                      selected={mediaIds.includes(m.id)}
                      onClick={() => setMediaIds((ids) => (ids.includes(m.id) ? ids.filter((x) => x !== m.id) : [...ids, m.id]))}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{mediaIds.length} selecionado(s)</p>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /> Resposta pública escrita pela IA</Label>
              <Switch checked={!!a.use_ai} onCheckedChange={(v) => setA({ ...a, use_ai: v })} />
            </div>
            {a.use_ai ? (
              <Textarea rows={2} value={a.ai_instructions ?? ""} onChange={(e) => setA({ ...a, ai_instructions: e.target.value })} placeholder="Instruções: ex. agradeça, cite um versículo curto e diga que mandou no direct" />
            ) : (
              <div className="space-y-1.5">
                <Label>Respostas públicas (uma por linha — uma é sorteada)</Label>
                <Textarea rows={3} value={variants} onChange={(e) => setVariants(e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Mensagem no direct (private reply)</Label>
            <Textarea rows={4} value={a.dm_message ?? ""} onChange={(e) => setA({ ...a, dm_message: e.target.value })} />
            <p className="text-xs text-muted-foreground">Use {"{username}"} para o @ da pessoa. Pode incluir link. O Instagram permite 1 DM por comentário, em até 7 dias.</p>
          </div>

          <div className="flex items-center justify-between">
            <Label>Responder só 1 vez por pessoa</Label>
            <Switch checked={!!a.once_per_user} onCheckedChange={(v) => setA({ ...a, once_per_user: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Automations() {
  const { data: automations = [] } = useTable("automations", { ascending: true });
  const save = useSaveRow("automations");
  const remove = useRemoveRow("automations");
  const [editing, setEditing] = useState<Partial<Automation> | null>(null);

  return (
    <div>
      <PageHeader
        title="Automações de comentários"
        description="Quem comentar a palavra-chave recebe resposta pública e mensagem no direct, na hora."
        actions={<Button onClick={() => setEditing(blank)}><Plus className="mr-2 h-4 w-4" /> Nova automação</Button>}
      />

      {automations.length === 0 ? (
        <EmptyState icon={<Workflow className="h-8 w-8" />} title="Nenhuma automação ainda">
          Exemplo clássico: no vídeo, diga "comente ORAÇÃO que eu te mando". Crie a automação com a palavra "oração" e a mensagem do direct.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {automations.map((a) => (
            <Card key={a.id} className={a.active ? "" : "opacity-60"}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-xs text-muted-foreground">Disparou {a.triggered_count} vezes</p>
                  </div>
                  <Switch checked={a.active} onCheckedChange={(v) => save.mutate({ id: a.id, active: v })} aria-label="Ativar" />
                </div>
                <div className="flex flex-wrap gap-1">
                  {a.match_mode === "any" ? (
                    <Badge variant="secondary">qualquer comentário</Badge>
                  ) : (
                    a.keywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)
                  )}
                  {a.media_ids.length > 0 && <Badge variant="outline">{a.media_ids.length} post(s)</Badge>}
                  {a.use_ai && <Badge className="bg-violet-600">IA</Badge>}
                </div>
                {a.dm_message && (
                  <p className="flex gap-2 rounded-md bg-muted p-2 text-xs"><MessageSquareReply className="h-4 w-4 shrink-0" /> <span className="line-clamp-3 whitespace-pre-line">{a.dm_message}</span></p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(a)}><Pencil className="mr-1 h-3.5 w-3.5" /> Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm("Apagar automação?") && remove.mutate(a.id)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6 bg-muted/40">
        <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
          <p><b>Instagram:</b> respostas e DMs automáticas funcionam em posts, reels e lives da conta profissional conectada.</p>
          <p><b>TikTok:</b> a API oficial do TikTok não permite responder comentários automaticamente — lá o Studio faz agendamento e publicação.</p>
        </CardContent>
      </Card>

      {editing && <AutomationDialog value={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
