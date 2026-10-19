import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Copy, Download, ExternalLink, Globe, Loader2, MapPin, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useInvalidate, useOffer, useSaveRow, useTable } from "../lib/hooks";
import type { Lead, LeadSearch, LeadStatus } from "../lib/types";
import { EmptyState, PageHeader, Panel, relativeTime, SectionLabel, WhatsAppIcon } from "../components/bits";
import LeadsMap, { areaColor, LEAD_STATUS } from "../components/LeadsMap";
import { offerMessages } from "../lib/offer";

const MSG_KEY = "studio-leads-msg";
const DEFAULT_MSG =
  "Oi, tudo bem? Vi a {nome} no Google Maps e reparei que vocês ainda não têm um site. " +
  "Eu crio páginas profissionais para {tema} que ajudam a trazer mais clientes pelo Google e pelo Instagram. " +
  "Posso te mostrar um modelo, sem compromisso?";

const SEARCH_STATUS: Record<LeadSearch["status"], string> = {
  queued: "Na fila",
  running: "Buscando…",
  done: "Pronta",
  failed: "Falhou",
};

function readMsg() {
  try {
    return localStorage.getItem(MSG_KEY) || DEFAULT_MSG;
  } catch {
    return DEFAULT_MSG;
  }
}

function fill(template: string, lead: Lead, search?: LeadSearch) {
  return template
    .split("{nome}").join(lead.name)
    .split("{tema}").join((search?.query ?? lead.category ?? "empresas").toLowerCase());
}

function exportCsv(leads: Lead[]) {
  const cols: (keyof Lead)[] = ["name", "category", "whatsapp", "phone", "social", "address", "rating", "reviews", "status", "maps_url"];
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...leads.map((l) => cols.map((c) => cell(c === "status" ? LEAD_STATUS[l.status].label : l[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Leads() {
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("");
  const [wanted, setWanted] = useState("30");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<LeadStatus | "all">("new");
  const [searchFilter, setSearchFilter] = useState("all");
  const [msg, setMsg] = useState(readMsg);

  const { data: searches = [] } = useTable("lead_searches");
  const busy = searches.some((s) => s.status === "queued" || s.status === "running");
  const { data: leads = [] } = useTable("leads", { limit: 2000 }, { refetchInterval: busy ? 10000 : undefined });
  const { data: pages = [] } = useTable("landing_pages");
  const offer = useOffer();
  useTable("lead_searches", undefined, { refetchInterval: busy ? 10000 : undefined });
  const save = useSaveRow("leads");

  useEffect(() => {
    try {
      localStorage.setItem(MSG_KEY, msg);
    } catch {
      /* storage indisponível */
    }
  }, [msg]);

  const byId = useMemo(() => new Map(searches.map((s) => [s.id, s])), [searches]);
  const shown = leads.filter((l) => (filter === "all" || l.status === filter) && (searchFilter === "all" || l.search_id === searchFilter));
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const start = async () => {
    if (!query.trim() || !place.trim()) return toast.error("Diga o que procurar e onde");
    setSending(true);
    try {
      const r = await api.invoke<LeadSearch & { started: boolean }>("ai", { action: "leads_search", query, place, wanted: Number(wanted) });
      toast.success(r.started ? "Buscando! Leva de 5 a 20 minutos; pode sair da tela." : "Na fila: o robô roda em até 4 horas.");
      setQuery("");
      invalidate("lead_searches");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const retry = async (s: LeadSearch) => {
    try {
      await api.invoke("ai", { action: "leads_search", retry_id: s.id });
      toast.success("Buscando de novo");
      invalidate("lead_searches");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const setStatus = (l: Lead, status: LeadStatus) =>
    save.mutate({ id: l.id, status, ...(status === "contacted" && !l.contacted_at ? { contacted_at: new Date().toISOString() } : {}) });

  // Mensagens de preço prontas (mensal e avulso), com o link da prévia se o lead já tem landing
  const copyOffer = (l: Lead, kind: "monthly" | "oneTime" | "premium") => {
    const page = pages.find((p) => p.lead_id === l.id && p.status !== "draft");
    const link = page ? (page.status === "published" && page.domain ? `https://${page.domain}` : `https://paginaspro.vercel.app/p/${page.slug}`) : null;
    navigator.clipboard.writeText(offerMessages(l.name, link, offer)[kind]).then(() => toast.success(kind === "monthly" ? "Mensagem do plano mensal copiada" : kind === "premium" ? "Mensagem do Premium copiada" : "Mensagem do avulso copiada"));
  };

  const openWhatsApp = (l: Lead) => {
    window.open(`https://wa.me/${l.whatsapp}?text=${encodeURIComponent(fill(msg, l, l.search_id ? byId.get(l.search_id) : undefined))}`, "_blank");
    if (l.status === "new") setStatus(l, "contacted");
  };

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Empresas do Google Maps sem site e com WhatsApp, para oferecer landing page. As áreas já pesquisadas ficam pintadas no mapa."
        actions={leads.length > 0 && <Button variant="outline" size="sm" onClick={() => exportCsv(shown)}><Download className="mr-1.5 h-4 w-4" />Planilha</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel title="Nova busca">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_110px_auto]">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="O quê (ex.: nutricionista)" />
              <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Onde (ex.: Sobradinho DF)" onKeyDown={(e) => e.key === "Enter" && start()} />
              <Select value={wanted} onValueChange={setWanted}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["10", "20", "30", "50", "100"].map((n) => <SelectItem key={n} value={n}>{n} leads</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={start} disabled={sending}>
                {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}Buscar
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Só entram empresas sem site próprio (quem só tem Instagram entra) e com celular. Quem já está na sua lista não se repete.</p>
          </Panel>

          <Panel bodyClassName="p-2">
            <LeadsMap searches={searches} leads={leads} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pt-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-sm border border-[#E3262E] bg-[#E3262E]/25" />Área já prospectada</span>
              {Object.entries(LEAD_STATUS).map(([k, s]) => (
                <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Mensagem padrão" description="{nome} vira o nome da empresa e {tema} o que você buscou.">
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={6} className="text-[13px]" />
            {msg !== DEFAULT_MSG && <button type="button" className="mt-1.5 text-xs text-muted-foreground hover:underline" onClick={() => setMsg(DEFAULT_MSG)}>Voltar ao texto sugerido</button>}
          </Panel>

          <Panel title="Buscas" bodyClassName="p-0">
            {searches.length === 0 ? (
              <p className="p-4 text-[13px] text-muted-foreground">Nenhuma busca ainda.</p>
            ) : (
              <ul className="max-h-72 divide-y overflow-y-auto">
                {searches.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSearchFilter(searchFilter === s.id ? "all" : s.id)}
                      className={cn("flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-secondary", searchFilter === s.id && "bg-secondary")}
                    >
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: areaColor(s.status) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{s.query} · {s.place}</span>
                        <span className={cn("block text-xs", s.status === "failed" ? "text-danger" : "text-muted-foreground")}>
                          {s.status === "failed" ? s.error ?? "Falhou" : `${SEARCH_STATUS[s.status]} · ${s.found}/${s.wanted} leads`} · {relativeTime(s.created_at)}
                        </span>
                      </span>
                      {(s.status === "queued" || s.status === "running") && <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    </button>
                    {s.status === "failed" && (
                      <button type="button" onClick={() => retry(s)} className="mb-2 ml-9 text-xs font-medium hover:underline">Tentar de novo</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {(["all", ...Object.keys(LEAD_STATUS)] as (LeadStatus | "all")[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn("rounded-full border px-3 py-1 text-xs", filter === k ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {k === "all" ? "Todos" : LEAD_STATUS[k].label} <span className="tabular opacity-70">{counts[k] ?? 0}</span>
            </button>
          ))}
          {searchFilter !== "all" && (
            <button type="button" className="ml-1 text-xs text-muted-foreground hover:underline" onClick={() => setSearchFilter("all")}>
              Só "{byId.get(searchFilter)?.query} · {byId.get(searchFilter)?.place}" ✕
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={<MapPin className="h-5 w-5" />} title={leads.length ? "Nenhum lead neste filtro" : "Sua lista está vazia"}>
            {leads.length ? "Troque o filtro acima." : "Faça uma busca: escolha o tipo de empresa e o bairro ou cidade."}
          </EmptyState>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {shown.map((l) => (
              <div key={l.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{l.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[l.category, l.address].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span className="tabular">{l.phone}</span>
                    {l.rating != null && <span className="flex items-center gap-0.5"><Star className="h-3 w-3" />{l.rating} ({l.reviews ?? 0})</span>}
                    {l.social && <a href={l.social} target="_blank" rel="noreferrer" className="hover:underline">{l.social.replace(/^https?:\/\/(www\.)?/, "").slice(0, 32)}</a>}
                    {l.maps_url && <a href={l.maps_url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 hover:underline">Maps <ExternalLink className="h-3 w-3" /></a>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={l.status} onValueChange={(v) => setStatus(l, v as LeadStatus)}>
                    <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEAD_STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(`/studio/landing?lead=${l.id}`)}>
                    <Globe className="mr-1.5 h-4 w-4" />Landing
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" disabled={!l.whatsapp} onClick={() => openWhatsApp(l)}>
                    <WhatsAppIcon className="mr-1.5 h-4 w-4" />Chamar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => copyOffer(l, "monthly")} title="Copiar mensagem do plano mensal">
                    <Copy className="mr-1 h-3.5 w-3.5" />Mensal
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => copyOffer(l, "oneTime")} title="Copiar mensagem do avulso">
                    <Copy className="mr-1 h-3.5 w-3.5" />Avulso
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => copyOffer(l, "premium")} title="Copiar mensagem do Premium">
                    <Copy className="mr-1 h-3.5 w-3.5" />Premium
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <SectionLabel className="mt-3">O botão Chamar abre o WhatsApp com a mensagem pronta e marca o lead como contatado.</SectionLabel>
      </div>
    </div>
  );
}
