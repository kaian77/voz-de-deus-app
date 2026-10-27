// Leads da Montagem 3D: marcas de móveis com avaliações reclamando do manual/montagem.
// Mercado Livre (Brasil e de fora) roda na function `ai` (_shared/manual-leads.ts); Google Maps e Etsy no workflow
// "Leads do Google Maps" (video/manual_leads.py).
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, ExternalLink, Loader2, Search, Star, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useInvalidate, useSaveRow, useTable } from "../lib/hooks";
import type { LeadStatus, ManualLead, ManualSearch } from "../lib/types";
import { EmptyState, Panel, relativeTime, SectionLabel } from "./bits";
import { LEAD_STATUS } from "./LeadsMap";

type Source = ManualSearch["source"];
type Lang = "pt" | "en" | "es";

// Mercado Livre saiu da tela: a API recusa avaliações de anúncios de outros vendedores ("access denied"; código mantido em _shared/manual-leads.ts)
const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: "maps", label: "Google Maps", hint: "Lojas e fábricas de móveis de qualquer cidade do mundo, lendo as avaliações delas. País inteiro vira as maiores cidades dele. Leva de 20 a 60 minutos." },
  { id: "etsy", label: "Etsy", hint: "Lojas do Etsy (EUA e Europa). Precisa do secret ETSY_API_KEY (grátis em etsy.com/developers)." },
];

const ML_SITES: { id: string; label: string; flag: string; lang: Lang; preset: string }[] = [
  { id: "MLB", label: "Brasil", flag: "🇧🇷", lang: "pt", preset: "rack para tv, guarda-roupa, cômoda" },
  { id: "MLM", label: "México", flag: "🇲🇽", lang: "es", preset: "mueble para tv, ropero, escritorio" },
  { id: "MLA", label: "Argentina", flag: "🇦🇷", lang: "es", preset: "rack tv, placard, escritorio" },
  { id: "MCO", label: "Colômbia", flag: "🇨🇴", lang: "es", preset: "mueble tv, closet, escritorio" },
  { id: "MLC", label: "Chile", flag: "🇨🇱", lang: "es", preset: "rack tv, closet, escritorio" },
  { id: "MLU", label: "Uruguai", flag: "🇺🇾", lang: "es", preset: "rack tv, ropero, escritorio" },
  { id: "MPE", label: "Peru", flag: "🇵🇪", lang: "es", preset: "mueble tv, ropero, escritorio" },
];

const MAPS_PRESET: Record<Lang, string> = { pt: "loja de móveis, fábrica de móveis", en: "furniture store, furniture manufacturer", es: "tienda de muebles, fábrica de muebles" };
const FLAGS: Record<string, string> = { BR: "🇧🇷", MX: "🇲🇽", AR: "🇦🇷", CO: "🇨🇴", CL: "🇨🇱", UY: "🇺🇾", PE: "🇵🇪", US: "🇺🇸", ES: "🇪🇸", PT: "🇵🇹", GB: "🇬🇧", CA: "🇨🇦" };
const SRC_LABEL: Record<Source, string> = { ml: "Mercado Livre", maps: "Google Maps", etsy: "Etsy" };
const STATUS: Record<ManualSearch["status"], string> = { queued: "Na fila", running: "Lendo avaliações…", done: "Pronta", failed: "Falhou" };

function langOf(l: ManualLead, search?: ManualSearch): Lang {
  if (l.country === "BR" || l.country === "PT") return "pt";
  if (l.source === "maps" && search?.site && ["pt", "en", "es"].includes(search.site)) return search.site as Lang;
  if (l.source === "etsy" || ["US", "GB", "CA", "AU", "IE"].includes(l.country ?? "")) return "en";
  return "es";
}

/** 1ª mensagem (sem link: a demonstração vai depois que a pessoa responder). */
function pitch(l: ManualLead, lang: Lang) {
  if (lang === "en")
    return `Hi! I'm Bruno from PáginasPro. I noticed some ${l.name} customers mention in their reviews that the assembly instructions are hard to follow. ` +
      "I turn PDF assembly manuals into interactive 3D step-by-step guides that open on the phone from a QR code on the box: fewer support calls, fewer returns and better reviews. Can I send you a demo?";
  if (lang === "es")
    return `¡Hola! Soy Bruno, de PáginasPro. Vi que algunos clientes de ${l.name} comentan en las reseñas que el armado es difícil de entender. ` +
      "Convierto manuales de armado en PDF en un paso a paso 3D interactivo que se abre en el celular con un código QR en la caja: menos consultas, menos devoluciones y mejores reseñas. ¿Te mando una demostración?";
  return `Oi! Sou o Bruno, da PáginasPro. Vi que alguns clientes da ${l.name} comentam nas avaliações que a montagem é difícil de entender. ` +
    "Eu transformo o manual de montagem em PDF num passo a passo 3D interativo, que abre no celular pelo QR code da caixa: menos reclamação, menos devolução e avaliações melhores. Posso te mandar uma demonstração?";
}

const contactSearch = (l: ManualLead, lang: Lang) =>
  `https://www.google.com/search?q=${encodeURIComponent(`"${l.name}" ${lang === "en" ? "furniture contact" : lang === "es" ? "muebles contacto" : "móveis contato"}`)}`;

export default function ManualLeads() {
  const invalidate = useInvalidate();
  const [source, setSource] = useState<Source>("maps");
  const [site, setSite] = useState("MLB");
  const [mapsLang, setMapsLang] = useState<Lang>("en");
  const [query, setQuery] = useState(MAPS_PRESET.en);
  const [place, setPlace] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<LeadStatus | "all">("new");
  const [open, setOpen] = useState<string | null>(null);

  const { data: searches = [] } = useTable("manual_searches");
  const busy = searches.some((s) => s.status === "queued" || s.status === "running");
  const { data: leads = [] } = useTable("manual_leads", { limit: 2000 }, { refetchInterval: busy ? 8000 : undefined });
  useTable("manual_searches", undefined, { refetchInterval: busy ? 8000 : undefined });
  const save = useSaveRow("manual_leads");
  const byId = useMemo(() => new Map(searches.map((s) => [s.id, s])), [searches]);

  const shown = useMemo(
    () => leads.filter((l) => filter === "all" || l.status === filter).sort((a, b) => b.complaints - a.complaints || (a.rating ?? 5) - (b.rating ?? 5)),
    [leads, filter],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const pickSource = (s: Source) => {
    setSource(s);
    setQuery(s === "ml" ? ML_SITES.find((x) => x.id === site)!.preset : s === "maps" ? MAPS_PRESET[mapsLang] : "bookshelf, nightstand, desk");
  };

  const run = async (body: Record<string, unknown>, ok: string) => {
    setSending(true);
    try {
      const r = await api.invoke<ManualSearch & { started: boolean }>("ai", { action: "manual_search", ...body });
      if (r.started) toast.success(ok);
      else toast.error("Não consegui ligar a busca agora. Toque em \"Buscar de novo\" daqui a pouco.");
      invalidate("manual_searches");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const start = () => {
    if (!query.trim()) return toast.error("Diga o tipo de móvel");
    if (source === "maps" && !place.trim()) return toast.error("Diga a cidade e o país");
    run(
      { source, query, place: source === "maps" ? place : undefined, site: source === "ml" ? site : source === "maps" ? mapsLang : undefined },
      source === "ml" ? "Lendo as avaliações! Leva 1 a 3 minutos." : "Buscando! Leva de 20 a 60 minutos; pode sair da tela.",
    );
  };

  const setStatus = (l: ManualLead, status: LeadStatus) =>
    save.mutate({ id: l.id, status, ...(status === "contacted" && !l.contacted_at ? { contacted_at: new Date().toISOString() } : {}) });

  const copyPitch = (l: ManualLead, lang: Lang) =>
    navigator.clipboard.writeText(pitch(l, lang)).then(() => {
      toast.success("Mensagem copiada. Mande sem link; a demonstração vai quando responderem.");
      if (l.status === "new") setStatus(l, "contacted");
    });

  const src = SOURCES.find((s) => s.id === source)!;

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Achar móveis com manual ruim" description="Marcas cujos clientes reclamam do manual ou da montagem nas avaliações: os melhores clientes para a Montagem 3D.">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSource(s.id)}
                className={cn("rounded-full border px-3 py-1 text-xs", source === s.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[150px_1fr_auto]">
            {source === "ml" && (
              <Select value={site} onValueChange={(v) => { setSite(v); setQuery(ML_SITES.find((x) => x.id === v)!.preset); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ML_SITES.map((s) => <SelectItem key={s.id} value={s.id}>{s.flag} {s.label}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {source === "maps" && (
              <Select value={mapsLang} onValueChange={(v) => { setMapsLang(v as Lang); setQuery(MAPS_PRESET[v as Lang]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">Em inglês</SelectItem>
                  <SelectItem value="es">Em espanhol</SelectItem>
                  <SelectItem value="pt">Em português</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Input className={cn(source === "etsy" && "sm:col-span-2")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tipos de móvel, separados por vírgula" onKeyDown={(e) => e.key === "Enter" && source !== "maps" && start()} />
            {source === "maps" && (
              <Input className="sm:col-span-2" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Cidade ou país (ex.: Miami FL, Madrid, Estados Unidos)" onKeyDown={(e) => e.key === "Enter" && start()} />
            )}
            <Button onClick={start} disabled={sending} className={cn(source === "maps" && "sm:col-start-3 sm:row-start-2")}>
              {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}Buscar
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{src.hint}</p>
        </Panel>

        <Panel title="Buscas" bodyClassName="p-0">
          {searches.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">Nenhuma busca ainda.</p>
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto">
              {searches.map((s) => {
                const stuck = (s.status === "queued" || s.status === "running") && Date.now() - new Date(s.updated_at ?? s.created_at).getTime() > (s.source === "ml" ? 8 : 120) * 60_000;
                return (
                  <li key={s.id} className="px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {SRC_LABEL[s.source]}{s.source === "ml" ? ` ${ML_SITES.find((x) => x.id === s.site)?.flag ?? ""}` : s.place ? ` · ${s.place}` : ""} · {s.query}
                        </span>
                        <span className={cn("block text-xs", s.status === "failed" ? "text-danger" : "text-muted-foreground")}>
                          {s.status === "failed" ? s.error ?? "Falhou" : `${STATUS[s.status]}${s.status === "done" ? ` · ${s.found} marcas · ${s.scanned} avaliações lidas` : ""}`} · {relativeTime(s.created_at)}
                        </span>
                      </span>
                      {(s.status === "queued" || s.status === "running") && !stuck && <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                    {s.log && (s.status === "failed" || (s.status === "done" && !s.found)) && (
                      <p className="mt-1 break-words text-[11px] text-muted-foreground">
                        {Object.entries(s.log).filter(([k]) => k !== "errors").map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ")}
                        {Array.isArray(s.log.errors) && s.log.errors.length > 0 && <span className="block">{s.log.errors.join(" | ")}</span>}
                      </p>
                    )}
                    {(s.status === "failed" || s.status === "done" || stuck) && (
                      <button type="button" onClick={() => run({ retry_id: s.id }, "Buscando de novo!")} className="mt-1 text-xs font-medium hover:underline">
                        Buscar de novo
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
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
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={<Wrench className="h-5 w-5" />} title={leads.length ? "Nenhuma marca neste filtro" : "Nenhuma marca ainda"}>
            {leads.length ? "Troque o filtro acima." : "Faça uma busca: as marcas com mais reclamações de manual aparecem primeiro."}
          </EmptyState>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {shown.map((l) => {
              const lang = langOf(l, l.search_id ? byId.get(l.search_id) : undefined);
              const expanded = open === l.id;
              const samples = expanded ? l.samples : l.samples.slice(0, 1);
              return (
                <div key={l.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{l.country ? `${FLAGS[l.country] ?? l.country} ` : ""}{l.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        <span className="font-medium text-danger">{l.complaints} de {l.reviews_read} avaliações reclamam do manual/montagem</span>
                        {l.rating != null && <span className="flex items-center gap-0.5"><Star className="h-3 w-3" />{l.rating}</span>}
                        <span>{SRC_LABEL[l.source]}</span>
                        {l.url && <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 hover:underline">{l.source === "ml" ? "Anúncio" : "Ver"} <ExternalLink className="h-3 w-3" /></a>}
                        {l.contact?.site && l.contact.site !== l.url && <a href={l.contact.site} target="_blank" rel="noreferrer" className="hover:underline">{l.contact.site.replace(/^https?:\/\/(www\.)?/, "").slice(0, 30)}</a>}
                        {l.contact?.phone && <span className="tabular">{l.contact.phone}</span>}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={l.status} onValueChange={(v) => setStatus(l, v as LeadStatus)}>
                        <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(LEAD_STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-8" asChild>
                        <a href={contactSearch(l, lang)} target="_blank" rel="noreferrer"><Search className="mr-1.5 h-4 w-4" />Contato</a>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => copyPitch(l, lang)} title="Copiar a 1ª mensagem no idioma da marca">
                        <Copy className="mr-1 h-3.5 w-3.5" />Mensagem {lang.toUpperCase()}
                      </Button>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {samples.map((x, i) => (
                      <li key={i} className="rounded-md bg-secondary/60 px-3 py-2 text-xs">
                        <span className="text-muted-foreground">{x.rate != null ? `${"★".repeat(Math.max(0, Math.min(5, x.rate)))} · ` : ""}{x.product}</span>
                        <span className="mt-0.5 block">“{x.text}”</span>
                      </li>
                    ))}
                  </ul>
                  {l.samples.length > 1 && (
                    <button type="button" onClick={() => setOpen(expanded ? null : l.id)} className="mt-1.5 flex items-center gap-0.5 text-xs text-muted-foreground hover:underline">
                      {expanded ? "Menos frases" : `Mais ${l.samples.length - 1} ${l.samples.length === 2 ? "frase" : "frases"}`}<ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <SectionLabel className="mt-3">
          "Contato" procura o site e o Instagram da marca no Google. "Mensagem" copia a 1ª abordagem no idioma dela (sem link) e marca como contatado.
        </SectionLabel>
      </div>
    </div>
  );
}
