import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Sparkles, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useInstagramProfile, useRemoveRow, useSaveRow, useSettings, useTable } from "../lib/hooks";
import { api } from "../lib/api";
import { IgMediaTile } from "../components/IgMediaTile";
import type { Automation } from "../lib/types";
import { EmptyState, PageHeader, SectionLabel } from "../components/bits";

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl [&_label]:text-xs">
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
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="quero, link, preço" />
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
              <Label className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-muted-foreground" /> Resposta pública escrita pela IA</Label>
              <Switch checked={!!a.use_ai} onCheckedChange={(v) => setA({ ...a, use_ai: v })} />
            </div>
            {a.use_ai ? (
              <Textarea rows={2} value={a.ai_instructions ?? ""} onChange={(e) => setA({ ...a, ai_instructions: e.target.value })} placeholder="Instruções: ex. agradeça o comentário e diga que mandou o link no direct" />
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
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const autoLink = settings?.auto_post_link ?? true;
  const setAutoLink = async (v: boolean) => {
    try {
      await api.saveSettings({ auto_post_link: v });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Automações"
        description="Quem comentar a palavra-chave recebe uma resposta pública e uma mensagem no direct, na hora."
        actions={<Button size="sm" onClick={() => setEditing(blank)}><Plus /> Nova automação</Button>}
      />

      <label htmlFor="auto_post_link" className="mb-4 flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
        <span>
          <span className="block text-[13px] font-medium">Automação automática em cada post novo</span>
          <span className="block text-xs text-muted-foreground">
            Quando sair um post no Instagram (pelo Studio ou pelo app), o Studio descobre o pin do post e cria uma automação só para ele:
            quem comentar a palavra da legenda (ex.: “comente EU QUERO”) recebe no direct o link desse produto.
          </span>
        </span>
        <Switch id="auto_post_link" checked={autoLink} onCheckedChange={setAutoLink} />
      </label>

      {automations.length === 0 ? (
        <EmptyState icon={<Workflow />} title="Nenhuma automação" action={<Button size="sm" onClick={() => setEditing(blank)}><Plus /> Criar a primeira</Button>}>
          Exemplo clássico: no vídeo, diga “comente QUERO que eu te mando o link”. Crie a automação com a palavra “quero” e a mensagem do direct.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b bg-secondary/40 text-left">
                <th className="px-4 py-2"><SectionLabel>Automação</SectionLabel></th>
                <th className="px-4 py-2"><SectionLabel>Quando comentarem</SectionLabel></th>
                <th className="px-4 py-2"><SectionLabel>Ações</SectionLabel></th>
                <th className="px-4 py-2 text-right"><SectionLabel>Disparos</SectionLabel></th>
                <th className="px-4 py-2"><SectionLabel>Ativa</SectionLabel></th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {automations.map((a) => (
                <tr key={a.id} className={a.active ? "" : "text-muted-foreground"}>
                  <td className="px-4 py-3">
                    <button className="text-left font-medium hover:underline" onClick={() => setEditing(a)}>{a.name}</button>
                    <p className="text-xs text-muted-foreground">{a.media_ids.length ? `${a.media_ids.length} post(s) específico(s)` : "Todos os posts e reels"}</p>
                  </td>
                  <td className="px-4 py-3">
                    {a.match_mode === "any" ? (
                      <span className="text-muted-foreground">Qualquer comentário</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {a.keywords.map((k) => <code key={k} className="rounded border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px] uppercase">{k}</code>)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground/80">
                    {[a.use_ai ? "Resposta pela IA" : a.reply_variants.length ? `${a.reply_variants.length} resposta(s) pública(s)` : null, a.dm_message ? "Mensagem no direct" : null].filter(Boolean).join(" + ")}
                  </td>
                  <td className="tabular px-4 py-3 text-right">{a.triggered_count.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3"><Switch checked={a.active} onCheckedChange={(v) => save.mutate({ id: a.id, active: v })} aria-label={`Ativar ${a.name}`} /></td>
                  <td className="px-2 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ações"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(a)}>Editar</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => remove.mutate(a.id)}>Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 grid gap-4 text-xs text-muted-foreground sm:grid-cols-2">
        <p><span className="font-medium text-foreground">Instagram.</span> Funciona em posts, reels e lives da conta profissional conectada. O Instagram permite uma mensagem no direct por comentário, em até 7 dias.</p>
        <p><span className="font-medium text-foreground">TikTok.</span> A API oficial não permite responder comentários automaticamente. No TikTok, o Studio agenda e publica.</p>
      </div>

      {editing && <AutomationDialog value={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
