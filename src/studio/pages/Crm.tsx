// CRM da prospecção (Renda extra → CRM): funil dos leads da PáginasPro, do "prévia pronta" ao "fechou".
// Etapas vêm do próprio lead (lib/crm.ts): pronta para enviar, aguardando resposta, follow-up vencido, negociando,
// fechou (com valor e plano; pagamento pelo Mercado Pago fecha sozinho) e não fechou (com motivo).
// Tudo sai do WhatsApp do dono (wa.me) com a saudação da hora; resposta no WhatsApp conectado move para "Negociando".
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Check, Copy, ExternalLink, Flame, Globe, Loader2, MessageCircle, RotateCcw, Search, Sparkles, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useInvalidate, useOffer, useSaveRow, useTable } from "../lib/hooks";
import type { LandingPage, Lead } from "../lib/types";
import { EmptyState, PageHeader, WhatsAppIcon } from "../components/bits";
import { SendAll } from "../components/SendAll";
import { daysSince, followupMessage, humanize, outboxEta, LOST_REASONS, MAX_FOLLOWUPS, nextFollowupAt, PLANS, STAGES, stageOf, waLink, type Stage } from "../lib/crm";
import { api } from "../lib/api";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const ago = (days: number) => (days <= 0 ? "hoje" : days === 1 ? "ontem" : `há ${days} dias`);
const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

export default function Crm() {
  const { data: leads = [] } = useTable("leads", { limit: 3000 }, { refetchInterval: 30000 });
  const { data: pages = [] } = useTable("landing_pages");
  const save = useSaveRow("leads");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "new" | "upgrade">("all");
  const [mobileStage, setMobileStage] = useState<Stage>("followup");
  const [openId, setOpenId] = useState<string | null>(null);

  const pageOf = useMemo(() => {
    const byLead = new Map(pages.filter((p) => p.lead_id).map((p) => [p.lead_id!, p]));
    return (l: Lead) => pages.find((p) => p.id === l.landing_id) ?? byLead.get(l.id) ?? null;
  }, [pages]);

  const inFunnel = useMemo(() => leads.filter((l) => stageOf(l)), [leads]);
  const shown = inFunnel.filter((l) =>
    (kind === "all" || (l.kind ?? "new") === kind) &&
    (!q.trim() || `${l.name} ${l.category ?? ""} ${l.address ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const byStage = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s.key, [] as Lead[]])) as Record<Stage, Lead[]>;
    for (const l of shown) m[stageOf(l)!].push(l);
    // Mais urgente primeiro: follow-up mais atrasado, conversa mais antiga, fechado mais recente
    m.followup.sort((a, b) => (nextFollowupAt(a) ?? 0) - (nextFollowupAt(b) ?? 0));
    m.waiting.sort((a, b) => (nextFollowupAt(a) ?? 0) - (nextFollowupAt(b) ?? 0));
    m.talking.sort((a, b) => daysSince(b) - daysSince(a));
    m.won.sort((a, b) => new Date(b.closed_at ?? 0).getTime() - new Date(a.closed_at ?? 0).getTime());
    m.ready.sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0));
    return m;
  }, [shown]);

  // Números do funil (todos os leads, sem o filtro de busca)
  const kpi = useMemo(() => {
    const won = inFunnel.filter((l) => l.status === "won");
    const month = won.filter((l) => new Date(l.closed_at ?? l.updated_at).getTime() >= firstOfMonth());
    const contacted = inFunnel.filter((l) => ["contacted", "replied", "won", "lost"].includes(l.status)).length;
    const replied = inFunnel.filter((l) => l.replied_at || ["replied", "won"].includes(l.status)).length;
    return {
      monthValue: month.reduce((a, l) => a + Number(l.deal_value ?? 0), 0),
      monthCount: month.length,
      mrr: won.filter((l) => /mensal/i.test(l.deal_plan ?? "")).reduce((a, l) => a + Number(l.deal_value ?? 0), 0),
      total: won.reduce((a, l) => a + Number(l.deal_value ?? 0), 0),
      close: contacted ? Math.round((won.length / contacted) * 100) : 0,
      reply: contacted ? Math.round((replied / contacted) * 100) : 0,
      contacted,
    };
  }, [inFunnel]);
  const count = (s: Stage) => inFunnel.filter((l) => stageOf(l) === s).length;
  const open = openId ? leads.find((l) => l.id === openId) ?? null : null;

  const touch = (l: Lead, patch: Partial<Lead>, ok?: string) =>
    save.mutate({ id: l.id, ...patch }, { onSuccess: () => ok && toast.success(ok), onError: (e) => toast.error((e as Error).message) });

  const actions = {
    send: (l: Lead) => {
      window.open(waLink(l.whatsapp, l.prospect_message ?? ""), "_blank");
      const now = new Date().toISOString();
      touch(l, { status: "contacted", prospect_status: "sent", contacted_at: now, last_touch_at: now });
    },
    followup: (l: Lead) => {
      const page = pageOf(l);
      window.open(waLink(l.whatsapp, followupMessage(l, page ? `https://paginaspro.app.br/p/${page.slug}` : null)), "_blank");
      touch(l, { followups: (l.followups ?? 0) + 1, last_touch_at: new Date().toISOString() });
    },
    replied: (l: Lead) => touch(l, { status: "replied", replied_at: new Date().toISOString(), last_touch_at: new Date().toISOString() }, `${l.name} foi para Negociando`),
    won: (l: Lead, plan: string, value: number) => touch(l, { status: "won", deal_plan: plan, deal_value: value, closed_at: new Date().toISOString() }, `🎉 Fechou com ${l.name}!`),
    lost: (l: Lead, reason: string) => touch(l, { status: "lost", lost_reason: reason, closed_at: new Date().toISOString() }, "Movido para Não fechou"),
    reopen: (l: Lead) => touch(l, { status: "replied", lost_reason: null, closed_at: null, last_touch_at: new Date().toISOString() }, "Reaberto em Negociando"),
  };

  return (
    <div>
      <PageHeader
        title="CRM"
        description="Seu funil da PáginasPro: quem recebeu a prévia, quem precisa de follow-up, quem está negociando e quem fechou."
      />

      {/* Números */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Trophy className="h-4 w-4" />} label="Fechado no mês" value={brl(kpi.monthValue)} sub={`${kpi.monthCount} cliente${kpi.monthCount === 1 ? "" : "s"} · ${brl(kpi.total)} no total`} tone="green" />
        <Kpi icon={<RotateCcw className="h-4 w-4" />} label="Mensal recorrente" value={`${brl(kpi.mrr)}/mês`} sub="soma dos planos mensais" />
        <Kpi icon={<MessageCircle className="h-4 w-4" />} label="Respostas" value={`${kpi.reply}%`} sub={`fechamento ${kpi.close}% · ${kpi.contacted} contatados`} />
        <Kpi icon={<Flame className="h-4 w-4" />} label="Para fazer hoje" value={String(count("followup") + count("ready"))} sub={`${count("ready")} para enviar · ${count("followup")} follow-ups`} tone={count("followup") + count("ready") ? "amber" : undefined} />
      </div>

      {/* Funil */}
      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <div className="flex h-2.5 w-full">
          {STAGES.map((s) => <div key={s.key} style={{ flex: Math.max(count(s.key), 0.0001), background: s.color }} title={`${s.label}: ${count(s.key)}`} />)}
        </div>
        <div className="flex gap-1 overflow-x-auto p-2 lg:hidden">
          {STAGES.map((s) => (
            <button key={s.key} type="button" onClick={() => setMobileStage(s.key)}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs", mobileStage === s.key ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}>
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}<b className="tabular">{count(s.key)}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, ramo ou bairro" className="pl-8" />
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {([["all", "Todos"], ["new", "Sem site"], ["upgrade", "Upgrade"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-md px-3 py-1 text-xs font-medium", kind === k ? "bg-foreground text-background" : "text-muted-foreground")}>{label}</button>
          ))}
        </div>
      </div>

      {inFunnel.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Trophy className="h-5 w-5" />} title="Seu funil está vazio">
            Ligue a "Prospecção automática" em Leads e faça uma busca. Cada prévia pronta aparece aqui para enviar.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-4 lg:grid lg:grid-cols-6 lg:gap-3">
          {STAGES.map((s) => (
            <section key={s.key} className={cn("min-w-0", mobileStage !== s.key && "hidden lg:block")}>
              <header className="mb-2 hidden items-center gap-2 px-1 lg:flex">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <h3 className="text-[13px] font-semibold">{s.label}</h3>
                <span className="ml-auto rounded-full bg-secondary px-2 text-[11px] tabular">{byStage[s.key].length}</span>
              </header>
              <p className="mb-2 px-1 text-[11px] text-muted-foreground">{s.hint}</p>
              {s.key === "ready" && <div className="mb-2 px-1"><SendAll leads={byStage.ready} allLeads={leads} textOf={(l) => l.prospect_message ?? ""} label="Enviar todos" /></div>}
              {s.key === "followup" && <div className="mb-2 px-1"><SendAll leads={byStage.followup.filter((l) => (l.followups ?? 0) < MAX_FOLLOWUPS)} allLeads={leads} textOf={(l) => { const p = pageOf(l); return followupMessage(l, p ? `https://paginaspro.app.br/p/${p.slug}` : null); }} label="Follow-up em todos" /></div>}
              <div className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
                {byStage[s.key].length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nada aqui</p>}
                {byStage[s.key].slice(0, 80).map((l) => (
                  <LeadCard key={l.id} lead={l} stage={s.key} color={s.color} onOpen={() => setOpenId(l.id)} actions={actions} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && <LeadDetail lead={open} page={pageOf(open)} actions={actions} onSaveNotes={(notes) => touch(open, { notes }, "Anotação salva")} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone?: "green" | "amber" }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", tone === "green" && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30", tone === "amber" && "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30")}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</p>
      <p className="mt-1 text-xl font-semibold tabular sm:text-2xl">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

type Actions = {
  send: (l: Lead) => void; followup: (l: Lead) => void; replied: (l: Lead) => void;
  won: (l: Lead, plan: string, value: number) => void; lost: (l: Lead, reason: string) => void; reopen: (l: Lead) => void;
};

function KindBadge({ lead }: { lead: Lead }) {
  return lead.kind === "upgrade"
    ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">Upgrade</span>
    : <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-900">Sem site</span>;
}

function LeadCard({ lead: l, stage, color, onOpen, actions }: { lead: Lead; stage: Stage; color: string; onOpen: () => void; actions: Actions }) {
  const due = nextFollowupAt(l);
  const late = due ? Math.floor((Date.now() - due) / 86400_000) : 0;
  return (
    <article className="group rounded-xl border bg-card p-3 shadow-sm transition hover:shadow-md" style={{ borderLeft: `3px solid ${color}` }}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center gap-1.5"><KindBadge lead={l} />
          {stage === "won" && l.deal_value ? <span className="ml-auto text-xs font-semibold text-emerald-700 tabular">{brl(Number(l.deal_value))}</span> : null}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug">{l.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{l.category ?? ""}</p>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          {stage === "ready" && "prévia pronta"}
          {stage === "waiting" && `enviado ${ago(daysSince(l))}${l.followups ? ` · ${l.followups}º follow-up feito` : ""}`}
          {stage === "followup" && ((l.followups ?? 0) >= MAX_FOLLOWUPS ? "3 follow-ups sem resposta" : `${(l.followups ?? 0) + 1}º follow-up ${late > 0 ? `atrasado ${late}d` : "para hoje"}`)}
          {stage === "talking" && `respondeu ${ago(Math.floor((Date.now() - new Date(l.replied_at ?? l.last_touch_at ?? l.updated_at).getTime()) / 86400_000))}`}
          {stage === "won" && `${l.deal_plan ?? "fechado"} · ${l.closed_at ? new Date(l.closed_at).toLocaleDateString("pt-BR") : ""}`}
          {stage === "lost" && (l.lost_reason ?? "sem motivo")}
        </p>
      </button>
      {l.send_after ? <p className="mt-2 rounded-md bg-sky-50 px-2 py-1.5 text-[11px] text-sky-800">📤 Na fila: sai por volta das {outboxEta(l)}</p> : l.send_error ? <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700">Envio automático falhou: {l.send_error}</p> : null}
      {!l.send_after && <div className="mt-2 flex gap-1.5">
        {stage === "ready" && <Button size="sm" className="h-8 flex-1" disabled={!l.whatsapp} onClick={() => actions.send(l)}><WhatsAppIcon className="mr-1.5 h-4 w-4" />Enviar</Button>}
        {stage === "followup" && ((l.followups ?? 0) >= MAX_FOLLOWUPS
          ? <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => actions.lost(l, "Não respondeu")}><X className="mr-1.5 h-4 w-4" />Encerrar</Button>
          : <Button size="sm" className="h-8 min-w-0 flex-1 bg-amber-500 px-2 text-white hover:bg-amber-600" onClick={() => actions.followup(l)}><WhatsAppIcon className="mr-1 h-4 w-4 shrink-0" /><span className="truncate">Follow-up</span></Button>)}
        {(stage === "waiting" || stage === "followup") && <Button size="sm" variant="outline" className="h-8 shrink-0 px-2" onClick={() => actions.replied(l)} title="Respondeu"><MessageCircle className="h-4 w-4" /></Button>}
        {stage === "talking" && <Button size="sm" variant="outline" className="h-8 flex-1" onClick={onOpen}><Check className="mr-1.5 h-4 w-4" />Fechar negócio</Button>}
        {stage === "lost" && <Button size="sm" variant="ghost" className="h-8 flex-1 text-xs" onClick={() => actions.reopen(l)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reabrir</Button>}
      </div>}
    </article>
  );
}

function LeadDetail({ lead: l, page, actions, onSaveNotes }: { lead: Lead; page: LandingPage | null; actions: Actions; onSaveNotes: (n: string) => void }) {
  const navigate = useNavigate();
  const offer = useOffer();
  const stage = stageOf(l);
  const link = page ? `https://paginaspro.app.br/p/${page.slug}` : null;
  const [notes, setNotes] = useState(l.notes ?? "");
  const defaultPlan = l.kind === "upgrade" ? "Upgrade" : "À vista";
  const [plan, setPlan] = useState(defaultPlan);
  const priceOf = (p: string) => p === "Mensal" ? (l.kind === "upgrade" ? offer.upgradeMonthly : offer.monthly) : p === "Upgrade" ? offer.upgradeOneTime : p === "Premium" ? offer.premiumOneTime : p === "Link da bio" ? offer.bioOneTime : offer.oneTime;
  const [value, setValue] = useState(String(l.deal_value ?? priceOf(defaultPlan)));
  const [reason, setReason] = useState(LOST_REASONS[0]);
  const sendText = (text: string) => window.open(waLink(l.whatsapp, text), "_blank");

  const timeline = [
    ["Encontrado no Maps", l.created_at],
    l.prospect_at && ["Prévia montada", l.prospect_at],
    l.contacted_at && ["1ª mensagem enviada", l.contacted_at],
    (l.followups ?? 0) > 0 && [`${l.followups} follow-up${l.followups === 1 ? "" : "s"} (último)`, l.last_touch_at],
    l.replied_at && ["Respondeu", l.replied_at],
    l.closed_at && [l.status === "won" ? `Fechou · ${l.deal_plan ?? ""} ${l.deal_value ? brl(Number(l.deal_value)) : ""}` : `Não fechou · ${l.lost_reason ?? ""}`, l.closed_at],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="space-y-5 pb-8">
      <SheetHeader className="text-left">
        <div className="flex items-center gap-2"><KindBadge lead={l} /><span className="text-xs text-muted-foreground">{STAGES.find((s) => s.key === stage)?.label}</span></div>
        <SheetTitle className="text-lg leading-snug">{l.name}</SheetTitle>
        <p className="text-xs text-muted-foreground">{[l.category, l.address].filter(Boolean).join(" · ")}</p>
      </SheetHeader>

      <div className="flex flex-wrap gap-2 text-xs">
        {l.whatsapp && <Button size="sm" variant="outline" className="h-8" onClick={() => sendText("{saudacao}! ")}><WhatsAppIcon className="mr-1.5 h-4 w-4" />Conversar</Button>}
        {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 hover:bg-secondary"><Globe className="mr-1.5 h-3.5 w-3.5" />Prévia</a>}
        {page && <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(`/studio/landing?id=${page.id}`)}>Abrir no editor</Button>}
        {l.website && <a href={l.website} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 hover:bg-secondary">Site atual <ExternalLink className="ml-1 h-3 w-3" /></a>}
        {l.instagram && <a href={l.instagram} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 hover:bg-secondary">Instagram <ExternalLink className="ml-1 h-3 w-3" /></a>}
        {l.maps_url && <a href={l.maps_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 hover:bg-secondary">Maps <ExternalLink className="ml-1 h-3 w-3" /></a>}
      </div>

      {l.kind === "upgrade" && l.site_audit && (
        <div className="rounded-lg border p-3 text-xs">
          <p className="mb-1.5 font-medium">O que vi no site atual</p>
          <ul className="grid grid-cols-2 gap-1 text-muted-foreground">
            <li>{l.site_audit.ok ? "✅ abre" : "❌ não abriu"}</li>
            <li>{l.site_audit.mobile ? "✅ ajustado ao celular" : "❌ não ajusta ao celular"}</li>
            <li>{l.site_audit.whatsapp ? "✅ tem WhatsApp" : "❌ sem botão de WhatsApp"}</li>
            <li>{l.site_audit.https ? "✅ seguro (https)" : "❌ \"não seguro\""}</li>
          </ul>
        </div>
      )}

      {stage === "ready" && l.prospect_message && (
        <Block title="Mensagem pronta">
          <p className="whitespace-pre-line rounded-lg bg-secondary/60 p-3 text-xs">{humanize(l.prospect_message)}</p>
          <Button className="mt-2 w-full" onClick={() => actions.send(l)}><WhatsAppIcon className="mr-1.5 h-4 w-4" />Enviar pelo WhatsApp</Button>
        </Block>
      )}

      {(stage === "waiting" || stage === "followup") && (
        <Block title={`Próximo follow-up (${Math.min((l.followups ?? 0) + 1, MAX_FOLLOWUPS)}/${MAX_FOLLOWUPS})`}>
          <p className="whitespace-pre-line rounded-lg bg-secondary/60 p-3 text-xs">{humanize(followupMessage(l, link))}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant={stage === "followup" ? "default" : "outline"} onClick={() => actions.followup(l)} disabled={(l.followups ?? 0) >= MAX_FOLLOWUPS}><WhatsAppIcon className="mr-1.5 h-4 w-4" />Enviar</Button>
            <Button variant="outline" onClick={() => actions.replied(l)}><MessageCircle className="mr-1.5 h-4 w-4" />Respondeu</Button>
          </div>
        </Block>
      )}

      {(stage === "talking" || stage === "waiting" || stage === "followup") && (
        <>
          <ChatAssist lead={l} onWon={() => actions.won(l, l.kind === "upgrade" ? "Upgrade" : "À vista", Number(value) || 0)} onLost={() => actions.lost(l, "Não quer site agora")} />
          <PriceButton lead={l} />
          <Block title="Fechou?">
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <Select value={plan} onValueChange={(v) => { setPlan(v); setValue(String(priceOf(v))); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
              <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className="h-9" aria-label="Valor" />
            </div>
            <Button className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => actions.won(l, plan, Number(value.replace(",", ".")) || 0)}><Trophy className="mr-1.5 h-4 w-4" />Fechou!</Button>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" onClick={() => actions.lost(l, reason)}><X className="mr-1.5 h-4 w-4" />Não fechou</Button>
            </div>
          </Block>
        </>
      )}

      {(stage === "won" || stage === "lost") && (
        <Button variant="outline" className="w-full" onClick={() => actions.reopen(l)}><RotateCcw className="mr-1.5 h-4 w-4" />Reabrir em Negociando</Button>
      )}

      <Block title="Anotações">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Ex.: falou com a recepcionista, a dona volta segunda" className="text-[13px]" />
        {notes !== (l.notes ?? "") && <Button size="sm" className="mt-2" onClick={() => onSaveNotes(notes)}>Salvar anotação</Button>}
      </Block>

      <Block title="Histórico">
        <ol className="relative ml-1.5 space-y-3 border-l pl-4">
          {timeline.map(([label, at]) => (
            <li key={label} className="text-xs">
              <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-foreground" />
              <p className="font-medium">{label}</p>
              <p className="text-muted-foreground">{new Date(at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </li>
          ))}
        </ol>
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>{children}</section>;
}

type ChatMsg = { from: "me" | "client"; text: string; at: string };

/** Conversa no WhatsApp pessoal: o Bruno cola a resposta do cliente e a IA escreve a próxima mensagem dele. */
function ChatAssist({ lead: l, onWon, onLost }: { lead: Lead; onWon: () => void; onLost: () => void }) {
  const invalidate = useInvalidate();
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ reply: string; stage: string; note: string } | null>(null);
  const chat = (Array.isArray(l.chat) ? l.chat : []) as ChatMsg[];

  const suggest = async () => {
    if (!client.trim() && !chat.length) return toast.error("Cole o que o cliente respondeu");
    setBusy(true);
    try {
      const r = await api.invoke<{ reply: string; stage: string; note: string }>("ai", { action: "crm_reply", id: l.id, client });
      setDraft(r);
      setClient("");
      invalidate("leads");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const send = async (copyOnly = false) => {
    if (!draft?.reply.trim()) return;
    if (copyOnly) await navigator.clipboard.writeText(draft.reply).then(() => toast.success("Resposta copiada"));
    else window.open(waLink(l.whatsapp, draft.reply), "_blank");
    await api.invoke("ai", { action: "crm_sent", id: l.id, text: draft.reply }).catch(() => undefined);
    setDraft(null);
    invalidate("leads");
  };

  return (
    <Block title="Responder com a IA">
      {chat.length > 0 && (
        <div className="mb-2 max-h-56 space-y-1.5 overflow-y-auto rounded-lg bg-secondary/40 p-2">
          {chat.slice(-12).map((m, i) => (
            <p key={i} className={cn("max-w-[85%] whitespace-pre-line rounded-lg px-2.5 py-1.5 text-xs", m.from === "me" ? "ml-auto bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50" : "bg-card")}>{m.text}</p>
          ))}
        </div>
      )}
      <Textarea value={client} onChange={(e) => setClient(e.target.value)} rows={3} placeholder="Cole aqui o que o cliente respondeu no WhatsApp" className="text-[13px]" />
      <Button className="mt-2 w-full" variant="outline" onClick={suggest} disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}Sugerir resposta
      </Button>
      {draft && (
        <div className="mt-3 rounded-lg border p-3">
          {draft.note && <p className="mb-2 text-[11px] text-muted-foreground">💡 {draft.note}</p>}
          <Textarea value={draft.reply} onChange={(e) => setDraft({ ...draft, reply: e.target.value })} rows={5} className="text-[13px]" />
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <Button onClick={() => send()}><WhatsAppIcon className="mr-1.5 h-4 w-4" />Enviar pelo WhatsApp</Button>
            <Button variant="outline" onClick={() => send(true)} title="Copiar"><Copy className="h-4 w-4" /></Button>
          </div>
          {draft.stage === "won" && <Button size="sm" variant="ghost" className="mt-2 w-full text-emerald-700" onClick={onWon}><Trophy className="mr-1.5 h-4 w-4" />Parece que fechou: marcar como Fechou</Button>}
          {draft.stage === "lost" && <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={onLost}><X className="mr-1.5 h-4 w-4" />Recusou: mover para Não fechou</Button>}
        </div>
      )}
    </Block>
  );
}

/** Preço da proposta com o link de pagamento só deste cliente (Mercado Pago com o valor certo; pagou = publica e fecha). */
function PriceButton({ lead: l }: { lead: Lead }) {
  const [busy, setBusy] = useState(false);
  const build = async () => {
    const o = await api.invoke<{ url: string | null; oneTime: number; oneTimeLink: string; monthly: number; monthlyLink: string; change: number }>("ai", { action: "crm_offer", id: l.id });
    return `Fica ${brl(o.oneTime)} uma vez só (Pix, cartão ou boleto), ou ${brl(o.monthly)}/mês com alterações sempre que precisar.` +
      (o.oneTimeLink ? `\n\nPara fechar à vista, o pagamento é por aqui: ${o.oneTimeLink}\nAssim que o pagamento cai, o site vai pro ar na hora 🙂` : "") +
      (o.monthlyLink ? `\n\nSe preferir o mensal (cartão): ${o.monthlyLink}` : "");
  };
  const go = async (copyOnly: boolean) => {
    setBusy(true);
    try {
      const text = await build();
      if (copyOnly) await navigator.clipboard.writeText(text).then(() => toast.success("Mensagem de preço copiada"));
      else window.open(waLink(l.whatsapp, text), "_blank");
      api.invoke("ai", { action: "crm_sent", id: l.id, text }).catch(() => undefined);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Block title="Mandar preço e pagamento">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button variant="outline" onClick={() => go(false)} disabled={busy}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <WhatsAppIcon className="mr-1.5 h-4 w-4" />}{l.kind === "upgrade" ? "Preço do upgrade" : "Preço do site"}</Button>
        <Button variant="outline" onClick={() => go(true)} disabled={busy} title="Copiar"><Copy className="h-4 w-4" /></Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">O link à vista é só deste cliente, com o valor certo: quando ele paga, o site publica e o lead vai para Fechou sozinho.</p>
    </Block>
  );
}
