import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bot, CheckCheck, Hand, Inbox, Loader2, Send, Sparkles, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api, isDemo, supabase } from "../lib/api";
import { useInvalidate, useSaveRow, useSettings, useTable } from "../lib/hooks";
import type { Conversation, Message } from "../lib/types";
import { EmptyState, PageHeader, PlatformIcon } from "../components/bits";

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={cn("h-4 w-4 text-emerald-600", className)} aria-hidden>
    <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A9.9 9.9 0 1 0 12.04 2Zm5.8 14.1c-.25.7-1.45 1.33-2 1.4-.52.08-1.17.11-1.89-.12-.43-.14-1-.32-1.7-.63-3-1.3-4.96-4.32-5.1-4.52-.15-.2-1.22-1.62-1.22-3.1 0-1.47.77-2.2 1.05-2.5.27-.3.6-.37.8-.37h.57c.18 0 .43-.07.67.51.25.6.84 2.07.92 2.22.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.38-.45.51-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.01 2.1 1.33 2.4 1.48.3.15.47.12.65-.08.17-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.73.82 2.03.97.3.15.5.22.57.35.08.12.08.72-.17 1.42Z" />
  </svg>
);

const ChannelIcon = ({ channel }: { channel: Conversation["channel"] }) =>
  channel === "whatsapp" ? <WhatsAppIcon /> : <PlatformIcon platform="instagram" />;

const SENDER: Record<Message["sender"], { label: string; icon: typeof Bot }> = {
  contact: { label: "", icon: User },
  ai: { label: "IA", icon: Bot },
  human: { label: "Você", icon: User },
  agent: { label: "Claude", icon: Sparkles },
};

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const { data: messages = [] } = useTable("messages", { eq: { conversation_id: conversation.id }, order: "created_at", ascending: true }, { refetchInterval: isDemo ? undefined : 15000 });
  const saveConv = useSaveRow("conversations");
  const invalidate = useInvalidate();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"send" | "suggest" | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const windowOpen = conversation.last_inbound_at && Date.now() - new Date(conversation.last_inbound_at).getTime() < 24 * 3600 * 1000;

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages.length]);
  useEffect(() => {
    if (conversation.unread) saveConv.mutate({ id: conversation.id, unread: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy("send");
    try {
      if (isDemo) await api.insert("messages", { conversation_id: conversation.id, direction: "out", sender: "human", text: text.trim(), error: null });
      else await api.invoke("inbox", { action: "send", conversation_id: conversation.id, text });
      setText("");
      invalidate("messages");
      invalidate("conversations");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const suggest = async () => {
    setBusy("suggest");
    try {
      const r = await api.invoke<{ reply: string; handoff: boolean; handoff_reason: string }>("inbox", { action: "suggest", conversation_id: conversation.id });
      setText(r.reply);
      if (r.handoff) toast.info(`A IA acha que um humano deve responder: ${r.handoff_reason}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b p-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Button>
        <ChannelIcon channel={conversation.channel} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{conversation.contact_name ?? conversation.contact_username ?? conversation.contact_id.split("@")[0]}</p>
          <p className="truncate text-xs text-muted-foreground">
            {conversation.contact_username ? `@${conversation.contact_username}` : conversation.channel === "whatsapp" ? `+${conversation.contact_id.split("@")[0]}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="ai" className="text-xs">IA responde</Label>
          <Switch id="ai" checked={conversation.ai_enabled} onCheckedChange={(v) => saveConv.mutate({ id: conversation.id, ai_enabled: v })} />
        </div>
        {conversation.status === "needs_human" ? (
          <Button size="sm" variant="outline" onClick={() => saveConv.mutate({ id: conversation.id, status: "open", handoff_reason: null })}>
            <CheckCheck className="mr-1 h-4 w-4" /> Resolvido
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => saveConv.mutate({ id: conversation.id, status: "needs_human", handoff_reason: "Assumido manualmente" })}>
            <Hand className="mr-1 h-4 w-4" /> Assumir
          </Button>
        )}
      </div>
      {conversation.status === "needs_human" && (
        <div className="bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <b>Precisa de você:</b> {conversation.handoff_reason ?? "atendimento humano"}. A IA fica pausada nesta conversa até você marcar como resolvido.
        </div>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
        {messages.map((m) => {
          const S = SENDER[m.sender];
          return (
            <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm", m.direction === "out" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-background")}>
                <p className="whitespace-pre-line">{m.text}</p>
                <p className={cn("mt-1 flex items-center gap-1 text-[10px]", m.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {S.label && <><S.icon className="h-3 w-3" /> {S.label} ·</>} {timeLabel(m.created_at)}
                </p>
                {m.error && <p className="text-[10px] text-red-200">{m.error}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <div className="space-y-2 border-t p-3">
        {!windowOpen && conversation.channel === "instagram" && (
          <p className="text-xs text-muted-foreground">Mais de 24h sem mensagem do contato — o Instagram não permite responder até ele escrever de novo.</p>
        )}
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Escreva sua resposta… (Enter envia, Shift+Enter quebra linha)"
        />
        <div className="flex justify-between gap-2">
          <Button variant="outline" size="sm" onClick={suggest} disabled={!!busy}>
            {busy === "suggest" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} Sugerir com IA
          </Button>
          <Button size="sm" onClick={send} disabled={!!busy || !text.trim()}>
            {busy === "send" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Enviar
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function Messages() {
  const { data: conversations = [] } = useTable("conversations", { order: "last_message_at" }, { refetchInterval: isDemo ? undefined : 20000 });
  const { data: settings } = useSettings();
  const invalidate = useInvalidate();
  const [filter, setFilter] = useState<"all" | "needs_human" | "ai">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Tempo real: atualiza a caixa de entrada quando chega mensagem nova
  useEffect(() => {
    if (isDemo) return;
    const channel = supabase!
      .channel("inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => invalidate("messages"))
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => invalidate("conversations"))
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(
    () =>
      conversations.filter((c) =>
        filter === "needs_human" ? c.status === "needs_human" : filter === "ai" ? c.ai_enabled && c.status === "open" : c.status !== "closed",
      ),
    [conversations, filter],
  );
  const selected = conversations.find((c) => c.id === selectedId);
  const waiting = conversations.filter((c) => c.status === "needs_human").length;

  return (
    <div>
      <PageHeader title="Mensagens" description="DMs do Instagram e WhatsApp num lugar só. A IA atende e te chama quando precisa de você." />
      {settings && !settings.agent_enabled && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="p-3 text-sm text-amber-900">
            O agente de IA está <b>desligado</b>. Ative e ensine como atender em <b>Claude &amp; API → Agente de mensagens</b>.
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className={cn("space-y-3", selected && "hidden lg:block")}>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">Todas</TabsTrigger>
              <TabsTrigger value="needs_human" className="flex-1">Precisa de você {waiting > 0 && <Badge className="ml-1 h-5 bg-amber-400 px-1.5 text-amber-950">{waiting}</Badge>}</TabsTrigger>
              <TabsTrigger value="ai" className="flex-1">Com a IA</TabsTrigger>
            </TabsList>
          </Tabs>
          {list.length === 0 && <EmptyState icon={<Inbox className="h-8 w-8" />} title="Nenhuma conversa aqui" />}
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={cn("flex w-full items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted", selectedId === c.id && "border-primary")}
            >
              <ChannelIcon channel={c.channel} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{c.contact_name ?? c.contact_username ?? c.contact_id.split("@")[0]}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{timeLabel(c.last_message_at)}</span>
                </div>
                <div className="flex items-center gap-1">
                  {c.status === "needs_human" ? (
                    <span className="truncate text-xs text-amber-700">✋ {c.handoff_reason ?? "Precisa de você"}</span>
                  ) : (
                    <span className="truncate text-xs text-muted-foreground">{c.ai_enabled ? "🤖 IA atendendo" : "IA desligada"}</span>
                  )}
                  {c.unread > 0 && <Badge className="ml-auto h-5 px-1.5">{c.unread}</Badge>}
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className={cn(!selected && "hidden lg:block")}>
          {selected ? (
            <Thread key={selected.id} conversation={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <EmptyState icon={<Inbox className="h-8 w-8" />} title="Escolha uma conversa">
              As mensagens chegam sozinhas pelos webhooks do Instagram e do WhatsApp.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
