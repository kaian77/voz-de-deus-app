import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Inbox, Loader2, Search, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api, isDemo, supabase } from "../lib/api";
import { useInvalidate, useSaveRow, useSettings, useTable } from "../lib/hooks";
import type { Conversation, Message } from "../lib/types";
import { Avatar, EmptyState, PageHeader, PlatformIcon, relativeTime, StatusDot } from "../components/bits";
import { IS_INSTAGRAM_PRODUCT } from "../lib/product";

const SENDER_LABEL: Record<Message["sender"], string> = { contact: "", ai: "Agente de IA", human: "Você", agent: "Claude" };
const nameOf = (c: Conversation) => c.contact_name ?? c.contact_username ?? `+${c.contact_id.split("@")[0]}`;

/** PáginasPro: prévia do site desta conversa — ver/copiar/mandar o link, ou criar com o que a conversa já tem. */
function PreviewBar({ conversation }: { conversation: Conversation }) {
  const { data: pages = [] } = useTable("landing_pages", { eq: { conversation_id: conversation.id } }, { refetchInterval: isDemo ? undefined : 15000 });
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<"build" | "send" | null>(null);
  const page = pages[0];
  const ready = page && !page.slug.startsWith("rascunho-");
  const working = page && ["queued", "working"].includes(String(page.auto_status ?? ""));
  const url = ready ? (page.status === "published" && page.domain ? `https://${page.domain}` : `https://paginaspro.app.br/p/${page.slug}`) : "";

  const build = async () => {
    setBusy("build");
    try {
      await api.invoke("inbox", { action: "pp_preview", conversation_id: conversation.id });
      invalidate("landing_pages");
      toast.success("Montando a prévia com o que a conversa já tem. Em 1 ou 2 minutos o link aparece aqui e chega para o cliente.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const send = async () => {
    setBusy("send");
    try {
      await api.invoke("inbox", { action: "send", conversation_id: conversation.id, text: `Aqui está a prévia do seu site: ${url}` });
      invalidate("messages");
      toast.success("Link enviado na conversa.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não consegui copiar. Segure o link para copiar.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-secondary/40 px-4 py-2 text-xs">
      <span className="font-medium">Site do cliente:</span>
      {ready ? (
        <>
          <a href={url} target="_blank" rel="noreferrer" className="min-w-0 max-w-full truncate text-brand underline">{url.replace(/^https:\/\//, "")}</a>
          <StatusDot tone={page.status === "published" ? "success" : "brand"}>{page.status === "published" ? "no ar" : "prévia"}</StatusDot>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copy}>Copiar</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={send} disabled={busy !== null}>{busy === "send" && <Loader2 className="animate-spin" />}Mandar o link</Button>
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs"><Link to="/studio/landings">Abrir no editor</Link></Button>
        </>
      ) : working ? (
        <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> montando a prévia…</span>
      ) : (
        <span className="text-muted-foreground">{page?.auto_status === "failed" ? `não deu certo${page.auto_error ? ` (${page.auto_error})` : ""}.` : "ainda não tem prévia."}</span>
      )}
      {!working && (
        <Button size="sm" variant={ready ? "ghost" : "default"} className="ml-auto h-7 text-xs" onClick={build} disabled={busy !== null}>
          {busy === "build" ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {ready ? "Refazer com a conversa" : "Criar prévia com a conversa"}
        </Button>
      )}
    </div>
  );
}

function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const { data: messages = [] } = useTable("messages", { eq: { conversation_id: conversation.id }, order: "created_at", ascending: true }, { refetchInterval: isDemo ? undefined : 15000 });
  const saveConv = useSaveRow("conversations");
  const invalidate = useInvalidate();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"send" | "suggest" | null>(null);
  const { data: accounts = [] } = useTable("social_accounts");
  const isPaginasPro = accounts.some((a) => a.id === conversation.account_id && a.meta?.brand === "paginaspro");
  const resume = async () => {
    try {
      const r = await api.invoke<{ replying: boolean }>("inbox", { action: "resume", conversation_id: conversation.id });
      invalidate("conversations");
      toast.success(r.replying ? "Devolvida para a IA. Ela responde em alguns segundos." : "Devolvida para a IA.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const bottom = useRef<HTMLDivElement>(null);
  const windowOpen = conversation.last_inbound_at && Date.now() - new Date(conversation.last_inbound_at).getTime() < 24 * 3600 * 1000;

  // Entre chaves: no Chrome novo scrollIntoView devolve uma Promise, e o React tentaria chamá-la como limpeza do efeito
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
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
      if (r.handoff) toast.info(`A IA sugere atendimento humano: ${r.handoff_reason}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const subtitle = conversation.contact_username
    ? `@${conversation.contact_username}`
    : conversation.channel === "whatsapp" ? `+${conversation.contact_id.split("@")[0]}` : "";

  return (
    <section className="flex h-[calc(100dvh-306px)] min-h-[400px] lg:h-[calc(100vh-200px)] lg:min-h-[520px] flex-col overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <Button variant="ghost" size="icon" className="-ml-2 h-8 w-8 lg:hidden" onClick={onBack} aria-label="Voltar para a lista"><ArrowLeft className="h-4 w-4" /></Button>
        <Avatar name={nameOf(conversation)} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
            {nameOf(conversation)} <PlatformIcon platform={conversation.channel} />
          </p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground" htmlFor={`ai-${conversation.id}`}>
          Agente de IA
          <Switch id={`ai-${conversation.id}`} checked={conversation.ai_enabled} onCheckedChange={(v) => saveConv.mutate({ id: conversation.id, ai_enabled: v })} />
        </label>
        {conversation.status === "needs_human" ? (
          <Button size="sm" variant="outline" className="h-8" onClick={resume}>Devolver para a IA</Button>
        ) : (
          <Button size="sm" variant="ghost" className="h-8" onClick={() => saveConv.mutate({ id: conversation.id, status: "needs_human", handoff_reason: "Assumida por você" })}>Assumir conversa</Button>
        )}
      </header>
      {isPaginasPro && <PreviewBar conversation={conversation} />}
      {conversation.status === "needs_human" && (
        <div className="flex items-center gap-2 border-b bg-secondary/50 px-4 py-2 text-xs">
          <StatusDot tone="warning">Com você</StatusDot>
          <span className="text-muted-foreground">{conversation.handoff_reason ?? "Atendimento humano"}. O agente fica pausado até você devolver para a IA (ela responde a última mensagem na hora).</span>
        </div>
      )}
      <div className="flex-1 space-y-3 overflow-y-auto bg-background px-4 py-5">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.direction === "out" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[78%] whitespace-pre-line rounded-lg px-3 py-2 text-[13px] leading-relaxed",
                m.direction === "out" ? "bg-foreground text-background" : "border bg-card",
              )}
            >
              {m.text}
            </div>
            <span className="mt-1 px-1 text-[11px] text-muted-foreground">
              {SENDER_LABEL[m.sender] && `${SENDER_LABEL[m.sender]} · `}
              {new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "")}
            </span>
            {m.error && <span className="px-1 text-[11px] text-danger">{m.error}</span>}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <footer className="border-t p-3">
        {!windowOpen && conversation.channel === "instagram" && (
          <p className="mb-2 text-xs text-muted-foreground">Passaram 24 horas desde a última mensagem desta pessoa. O Instagram só libera resposta quando ela escrever de novo.</p>
        )}
        <div className="rounded-md border focus-within:ring-1 focus-within:ring-ring">
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
            className="min-h-0 resize-none border-0 bg-transparent text-[13px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="Escreva uma resposta"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={suggest} disabled={!!busy}>
              {busy === "suggest" ? <Loader2 className="animate-spin" /> : <Sparkles />} Sugerir resposta
            </Button>
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] text-muted-foreground sm:inline">Enter envia · Shift+Enter quebra linha</span>
              <Button size="sm" className="h-7" onClick={send} disabled={!!busy || !text.trim()}>
                {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Enviar
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </section>
  );
}

export default function Messages() {
  const { data: conversations = [] } = useTable("conversations", { order: "last_message_at" }, { refetchInterval: isDemo ? undefined : 20000 });
  const { data: settings } = useSettings();
  const invalidate = useInvalidate();
  const { data: accounts = [] } = useTable("social_accounts");
  const [filter, setFilter] = useState<"all" | "needs_human" | "ai">("all");
  // Caixa separada por marca: Brax Pins (loja) ou PáginasPro (sites); a escolha fica salva neste aparelho
  const [brand, setBrandState] = useState<"brax" | "paginaspro">(() => {
    try {
      return localStorage.getItem("inbox-brand") === "paginaspro" ? "paginaspro" : "brax";
    } catch {
      return "brax";
    }
  });
  const setBrand = (b: "brax" | "paginaspro") => {
    setBrandState(b);
    setSelectedId(null);
    try {
      localStorage.setItem("inbox-brand", b);
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  };
  const ppAccounts = useMemo(() => new Set(accounts.filter((a) => a.meta?.brand === "paginaspro").map((a) => a.id)), [accounts]);
  const brandOf = (c: { account_id: string }) => (ppAccounts.has(c.account_id) ? "paginaspro" : "brax");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Tempo real: atualiza a caixa de entrada quando chega mensagem nova
  useEffect(() => {
    if (isDemo) return;
    // Nome único por montagem: o canal anterior ainda pode estar fechando, e reusar o mesmo nome derruba a página
    const channel = supabase!
      .channel(`inbox-${Math.random().toString(36).slice(2)}`)
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
      conversations
        .filter((c) => !IS_INSTAGRAM_PRODUCT || c.channel === "instagram")
        .filter((c) => IS_INSTAGRAM_PRODUCT || brandOf(c) === brand)
        .filter((c) => (filter === "needs_human" ? c.status === "needs_human" : filter === "ai" ? c.ai_enabled && c.status === "open" : c.status !== "closed"))
        .filter((c) => !query || nameOf(c).toLowerCase().includes(query.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversations, filter, query, brand, ppAccounts],
  );
  const selected = conversations.find((c) => c.id === selectedId) ?? (typeof window !== "undefined" && window.innerWidth >= 1024 ? list[0] : undefined);
  const waitingBy = (b: string) => conversations.filter((c) => c.status === "needs_human" && brandOf(c) === b).length;
  const waiting = waitingBy(brand);
  const FILTERS = [
    { id: "all", label: "Todas" },
    { id: "needs_human", label: `Com você${waiting ? ` (${waiting})` : ""}` },
    { id: "ai", label: "Com o agente" },
  ] as const;

  return (
    <div>
      <PageHeader title="Mensagens" description={IS_INSTAGRAM_PRODUCT ? "Acompanhe o direct do Instagram e assuma a conversa quando precisar." : "Direct do Instagram e WhatsApp. O agente responde e passa para você quando precisa."} />
      {settings && !settings.agent_enabled && brand === "brax" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-[13px]">
          <span><span className="font-medium">O agente de IA está desligado.</span> <span className="text-muted-foreground">As mensagens chegam aqui, mas ninguém responde automaticamente.</span></span>
          <Button asChild size="sm" variant="outline" className="h-8"><Link to="/studio/claude">Configurar agente</Link></Button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className={cn("flex flex-col overflow-hidden rounded-lg border bg-card", selectedId && "hidden lg:flex")}>
          <div className="space-y-2 border-b p-2">
            {!IS_INSTAGRAM_PRODUCT && ppAccounts.size > 0 && (
              <div className="grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
                {([["brax", "Brax Pins"], ["paginaspro", "PáginasPro"]] as const).map(([id, label]) => {
                  const n = waitingBy(id);
                  return (
                    <button key={id} onClick={() => setBrand(id)} className={cn("h-7 rounded text-xs font-medium", brand === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                      {label}{n ? ` (${n})` : ""}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-8 pl-8 text-[13px]" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar contato" aria-label="Buscar contato" />
            </div>
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)} className={cn("h-7 rounded px-2.5 text-xs font-medium", filter === f.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[calc(100vh-290px)] divide-y overflow-y-auto">
            {list.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Nenhuma conversa aqui.</p>}
            {list.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn("flex w-full items-start gap-3 px-3 py-3 text-left transition-colors", selected?.id === c.id ? "bg-secondary" : "hover:bg-secondary/50")}
              >
                <Avatar name={nameOf(c)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
                      <span className="truncate">{nameOf(c)}</span>
                      <PlatformIcon platform={c.channel} className="h-3 w-3 shrink-0" />
                    </p>
                    <span className="tabular shrink-0 text-[11px] text-muted-foreground">{relativeTime(c.last_message_at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {c.status === "needs_human" ? (
                      <StatusDot tone="warning" className="min-w-0 truncate font-normal text-foreground/70">{c.handoff_reason ?? "Com você"}</StatusDot>
                    ) : (
                      <span className="truncate text-xs text-muted-foreground">{c.ai_enabled ? "Agente respondendo" : "Agente desligado"}</span>
                    )}
                    {c.unread > 0 && <span className="tabular ml-auto rounded bg-foreground px-1.5 text-[10px] font-medium leading-4 text-background">{c.unread}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className={cn("min-w-0", !selectedId && "hidden lg:block")}>
          {selected ? (
            <Thread key={selected.id} conversation={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <EmptyState icon={<Inbox />} title="Nenhuma conversa selecionada">
              {IS_INSTAGRAM_PRODUCT ? "As mensagens aparecem aqui quando sua conta profissional do Instagram estiver conectada." : "As mensagens chegam sozinhas quando o Instagram e o WhatsApp estão conectados."}
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
