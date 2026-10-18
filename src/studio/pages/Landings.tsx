import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, ExternalLink, Globe, ImagePlus, Link2, Loader2, Monitor, Plus, RefreshCw, Send, Smartphone, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { renderLanding } from "@/landing/render";
import { api } from "../lib/api";
import { useInvalidate, useTable } from "../lib/hooks";
import type { LandingPage } from "../lib/types";
import { EmptyState, PageHeader, Panel, relativeTime } from "../components/bits";

const NICHES = ["Nutrição", "Medicina", "Odontologia", "Psicologia", "Fisioterapia", "Estética", "Dermatologia", "Pediatria", "Advocacia", "Contabilidade", "Personal trainer", "Salão de beleza"];

// Endereço neutro só das landing pages (o mesmo projeto da Vercel; o Studio continua no endereço dele)
const LANDING_HOST = "https://paginaspro.vercel.app";
const publicUrl = (p: LandingPage) => `${LANDING_HOST}/p/${p.slug}`;

type Form = Pick<LandingPage, "name" | "niche" | "city" | "whatsapp" | "instagram" | "address" | "hours" | "registry" | "notes" | "photos" | "logo">;
const EMPTY: Form = { name: "", niche: "", city: "", whatsapp: "", instagram: "", address: "", hours: "", registry: "", notes: "", photos: [], logo: null };
const toForm = (page: LandingPage): Form => ({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, page[k as keyof Form] ?? EMPTY[k as keyof Form]])) });

/** Resumo do que veio do Instagram/Google para mostrar no editor. */
function importSummary(i: LandingPage["imported"]) {
  if (!i?.at) return null;
  const part = (label: string, v?: string) =>
    !v ? null : v === "pending" ? `${label}: buscando (leva alguns minutos)` : v.startsWith("ok: ") ? `${label}: ${v.slice(4)}` : `${label}: ${v.replace(/^erro: /, "")}`;
  return [part("Google", i.maps), part("Instagram", i.instagram)].filter(Boolean).join(" · ");
}

function download(page: LandingPage) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([renderLanding(page)], { type: "text/html;charset=utf-8" }));
  a.download = `${page.slug.startsWith("rascunho-") ? "landing" : page.slug}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Editor({ page, onBack }: { page: LandingPage; onBack: () => void }) {
  const invalidate = useInvalidate();
  const [form, setForm] = useState<Form>(() => toForm(page));
  const [current, setCurrent] = useState(page);
  const [busy, setBusy] = useState<"upload" | "generate" | "publish" | "import" | null>(null);
  const [ask, setAsk] = useState("");
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const html = useMemo(() => (current.content ? renderLanding({ ...current, ...form }, { sample: current.status !== "published" }) : ""), [current, form]);

  const upload = async (files: FileList | null, logo = false) => {
    if (!files?.length) return;
    setBusy("upload");
    try {
      const urls = await Promise.all([...files].slice(0, logo ? 1 : 10).map((f) => api.upload(f, `landing-${f.name}`)));
      if (logo) set("logo", urls[0]);
      else set("photos", [...form.photos, ...urls].slice(0, 12));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.niche.trim()) throw new Error("Preencha o nome e a área");
    const saved = await api.update("landing_pages", current.id, { ...form, name: form.name.trim(), niche: form.niche.trim() });
    // fotos/logo tirados: apaga os arquivos do storage (não ocupam espaço à toa)
    const gone = [...current.photos, current.logo].filter((u): u is string => !!u && !saved.photos.includes(u) && saved.logo !== u);
    if (gone.length) api.invoke("ai", { action: "landing_remove_files", id: current.id, urls: gone }).catch(() => {});
    setCurrent(saved);
    return saved;
  };

  /** Puxa os dados reais do cliente (fotos, bio, horário, categoria) do Instagram e do Google Maps. */
  const importData = async (quiet = false) => {
    setBusy("import");
    try {
      await api.update("landing_pages", current.id, form);
      const r = await api.invoke<LandingPage>("ai", { action: "landing_import", id: current.id });
      setCurrent(r);
      setForm(toForm(r));
      invalidate("landing_pages");
      if (!quiet) toast.success(importSummary(r.imported) || "Nada novo para puxar");
    } catch (e) {
      if (!quiet) toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Lead novo: puxa os dados assim que abre. Google ainda buscando (lead antigo): confere a cada 20 s e puxa quando ficar pronto.
  useEffect(() => {
    if (!current.imported && (current.lead_id || current.instagram)) importData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (current.imported?.maps !== "pending" || !current.lead_id) return;
    const t = setInterval(async () => {
      const [lead] = await api.list("leads", { eq: { id: current.lead_id! } }).catch(() => []);
      if (lead && (lead.details_status === "done" || lead.details_status === "failed")) {
        clearInterval(t);
        importData(true);
      }
    }, 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.imported?.maps, current.lead_id]);

  const generate = async (instructions?: string) => {
    setBusy("generate");
    try {
      await save();
      if (!form.photos.length && !form.instagram && !current.lead_id) throw new Error("Envie pelo menos uma foto");
      const r = await api.invoke<LandingPage>("ai", { action: "landing_generate", id: current.id, instructions, fresh: !instructions });
      setCurrent(r);
      setForm(toForm(r));
      setAsk("");
      invalidate("landing_pages");
      toast.success(instructions ? "Ajuste feito" : "Página criada");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const publish = async (mode: "preview" | "published" | "draft" = "published") => {
    setBusy("publish");
    try {
      await save();
      const r = await api.invoke<LandingPage>("ai", { action: "landing_publish", id: current.id, mode, unpublish: mode === "draft" });
      setCurrent(r);
      invalidate("landing_pages");
      if (mode !== "draft") {
        await navigator.clipboard?.writeText(publicUrl(r)).catch(() => {});
        toast.success(mode === "preview" ? "Link de prévia pronto e copiado" : "Publicada! Link copiado.");
      } else toast.success("Página tirada do ar");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /** Abre o WhatsApp da cliente com o link (prévia ou site no ar) já na mensagem. */
  const sendToClient = () => {
    const n = String(form.whatsapp ?? "").replace(/\D/g, "");
    const first = form.name.split(/[\s·|-]+/)[0];
    const text =
      current.status === "preview"
        ? `Oi${first ? `, ${first}` : ""}! Preparei uma prévia do site de vocês: ${publicUrl(current)}\n\nDá uma olhada com calma, pode testar os botões. Se quiser mudar qualquer coisa (texto, cor, foto), é só me falar que eu ajusto.`
        : `Oi${first ? `, ${first}` : ""}! O site de vocês está no ar: ${publicUrl(current)}`;
    window.open(`https://wa.me/${n.length <= 11 && n ? `55${n}` : n}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const setColor = (key: "primary" | "ink" | "soft", value: string) =>
    current.content && setCurrent({ ...current, content: { ...current.content, colors: { ...current.content.colors, [key]: value } } });

  const saveColors = async () => {
    try {
      await api.update("landing_pages", current.id, { content: current.content });
      toast.success("Cores salvas");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Landing pages
      </button>
      <PageHeader
        title={form.name || "Nova landing page"}
        description={
          current.status === "published"
            ? `No ar em ${publicUrl(current)} · ${current.views} visitas`
            : current.status === "preview"
              ? `Prévia para a cliente: ${publicUrl(current)} · ${current.views} visitas (não aparece no Google)`
              : "Rascunho: só você vê."
        }
        actions={
          current.content && (
            <>
              <Button variant="outline" size="sm" onClick={() => download({ ...current, ...form })}><Download className="mr-1.5 h-4 w-4" />HTML</Button>
              {current.status === "draft" ? (
                <Button variant="outline" size="sm" onClick={() => publish("preview")} disabled={busy !== null}>
                  {busy === "publish" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}Link de prévia
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(publicUrl(current)).then(() => toast.success("Link copiado"))}><Copy className="mr-1.5 h-4 w-4" />Link</Button>
                  <Button variant="outline" size="sm" asChild><a href={publicUrl(current)} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Abrir</a></Button>
                  {form.whatsapp && <Button variant="outline" size="sm" onClick={sendToClient}><Send className="mr-1.5 h-4 w-4" />Mandar para a cliente</Button>}
                </>
              )}
              <Button size="sm" onClick={() => publish("published")} disabled={busy !== null}>
                {busy === "publish" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Globe className="mr-1.5 h-4 w-4" />}
                {current.status === "published" ? "Atualizar no ar" : "Publicar de vez"}
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel
            title="Dados do cliente"
            description={importSummary(current.imported) ?? "Fotos, bio, horário e especialidades vêm do Instagram e do Google Maps."}
            action={
              (form.instagram || current.lead_id) && (
                <Button variant="outline" size="sm" onClick={() => importData()} disabled={busy !== null}>
                  {busy === "import" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Puxar dados
                </Button>
              )
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome (como aparece no site)" className="sm:col-span-2"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Dra. Ana Souza · Nutricionista" /></Field>
              <Field label="Área">
                <Input list="niches" value={form.niche} onChange={(e) => set("niche", e.target.value)} placeholder="Nutrição" />
                <datalist id="niches">{NICHES.map((n) => <option key={n} value={n} />)}</datalist>
              </Field>
              <Field label="Cidade / bairro"><Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} placeholder="Sobradinho · DF" /></Field>
              <Field label="WhatsApp"><Input value={form.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="(61) 99999-9999" inputMode="tel" /></Field>
              <Field label="Instagram"><Input value={form.instagram ?? ""} onChange={(e) => set("instagram", e.target.value)} placeholder="@perfil" /></Field>
              <Field label="Endereço (aparece com mapa)" className="sm:col-span-2"><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
              <Field label="Horário (vazio = exemplo só na prévia)"><Input value={form.hours ?? ""} onChange={(e) => set("hours", e.target.value)} placeholder="Seg a sex: 8h às 18h" /></Field>
              <Field label="Registro (CRM, CRN...)"><Input value={form.registry ?? ""} onChange={(e) => set("registry", e.target.value)} placeholder="CRN-1 12345" /></Field>
              <Field label="Serviços, formação e diferenciais (quanto mais real, melhor)" className="sm:col-span-2">
                <Textarea rows={5} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Ex.: atende emagrecimento, gestantes e esportistas; pós em nutrição clínica; atendimento online e presencial; aceita Unimed." />
              </Field>
            </div>
          </Panel>

          <Panel
            title="Fotos"
            description="Da pessoa, do consultório, do trabalho. A IA escolhe a melhor para o topo."
            action={busy === "upload" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          >
            <div className="grid grid-cols-4 gap-2">
              {form.photos.map((p) => (
                <div key={p} className="group relative">
                  <img src={p} alt="" className="aspect-square w-full rounded-md object-cover" />
                  <button type="button" aria-label="Remover foto" onClick={() => set("photos", form.photos.filter((x) => x !== p))} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => photoInput.current?.click()} className="grid aspect-square place-items-center rounded-md border border-dashed text-muted-foreground hover:bg-secondary">
                <ImagePlus className="h-5 w-5" />
              </button>
            </div>
            <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <div className="mt-4 flex items-center gap-3">
              {form.logo ? <img src={form.logo} alt="" className="h-10 w-auto max-w-[120px] rounded border object-contain p-1" /> : <span className="text-xs text-muted-foreground">Sem logo (o nome vira o logo)</span>}
              <Button variant="outline" size="sm" onClick={() => logoInput.current?.click()}>{form.logo ? "Trocar logo" : "Enviar logo"}</Button>
              {form.logo && <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => set("logo", null)}>Remover</button>}
            </div>
            <input ref={logoInput} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files, true); e.target.value = ""; }} />
          </Panel>

          <Button className="w-full" size="lg" onClick={() => generate()} disabled={busy !== null}>
            {busy === "generate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {current.content ? "Refazer a página do zero" : "Criar a página com IA"}
          </Button>
          {busy === "generate" && <p className="text-center text-xs text-muted-foreground">A IA está olhando as fotos e escrevendo… leva cerca de 1 minuto.</p>}

          {current.content && (
            <Panel title="Pedir mudança à IA" description="Escreva o que você quer mudar ou cole aqui o que a cliente pediu no WhatsApp. O link continua o mesmo.">
              <Textarea rows={4} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ex.: a cliente quer o título mais direto, tirar o serviço de gestantes, cor mais clara e tom mais acolhedor." />
              <Button className="mt-2 w-full" variant="outline" onClick={() => generate(ask)} disabled={busy !== null || !ask.trim()}>{busy === "generate" ? "Ajustando…" : "Fazer a mudança"}</Button>
              <div className="mt-4 flex items-center gap-4">
                {(["primary", "ink", "soft"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="color" value={current.content!.colors[k]} onChange={(e) => setColor(k, e.target.value)} className="h-8 w-8 cursor-pointer rounded border bg-transparent p-0.5" />
                    {k === "primary" ? "Principal" : k === "ink" ? "Texto" : "Fundo"}
                  </label>
                ))}
                <Button size="sm" variant="ghost" onClick={saveColors}>Salvar cores</Button>
              </div>
            </Panel>
          )}
          {current.status !== "draft" && (
            <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => publish("draft")}>Tirar do ar</button>
          )}
        </div>

        <Panel
          bodyClassName="p-0"
          title="Prévia"
          action={
            current.content && (
              <div className="flex rounded-md border p-0.5">
                {(["mobile", "desktop"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setDevice(d)} aria-label={d === "mobile" ? "Celular" : "Computador"} className={cn("rounded px-2 py-1", device === d ? "bg-secondary text-foreground" : "text-muted-foreground")}>
                    {d === "mobile" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )
          }
        >
          {html ? (
            <div className="flex justify-center overflow-hidden bg-secondary/50 p-3">
              <iframe
                title="Prévia da landing page"
                srcDoc={html}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                className={cn("h-[78vh] rounded-md border bg-white shadow-sm transition-all", device === "mobile" ? "w-[390px] max-w-full" : "w-full")}
              />
            </div>
          ) : (
            <div className="grid h-[50vh] place-items-center p-6 text-center text-sm text-muted-foreground">
              Preencha os dados, envie as fotos e toque em "Criar a página com IA".
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function Landings() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: pages = [], isLoading } = useTable("landing_pages", { order: "updated_at" });
  const remove = async (p: LandingPage) => {
    try {
      await api.invoke("ai", { action: "landing_delete", id: p.id });
      invalidate("landing_pages");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const [creating, setCreating] = useState(false);
  const id = params.get("id");
  const leadId = params.get("lead");
  const open = pages.find((p) => p.id === id);

  const create = async (prefill: Partial<LandingPage> = {}) => {
    setCreating(true);
    try {
      const page = await api.insert("landing_pages", { slug: `rascunho-${crypto.randomUUID()}`, name: "", niche: "", photos: [], ...prefill });
      await invalidate("landing_pages");
      setParams({ id: page.id });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  // Vindo de um lead (botão na tela Leads): abre a página dele ou cria um rascunho com os dados do Maps
  useEffect(() => {
    if (!leadId || isLoading || creating) return;
    const existing = pages.find((p) => p.lead_id === leadId);
    if (existing) return setParams({ id: existing.id }, { replace: true });
    (async () => {
      const [lead] = await api.list("leads", { eq: { id: leadId } });
      if (!lead) return setParams({}, { replace: true });
      const search = lead.search_id ? (await api.list("lead_searches", { eq: { id: lead.search_id } }))[0] : undefined;
      const ig = lead.social?.includes("instagram.com") ? lead.social : null;
      create({
        lead_id: lead.id, name: lead.name, niche: search?.query ?? lead.category ?? "", city: search?.place ?? null,
        whatsapp: lead.phone, instagram: ig, address: lead.address, rating: lead.rating, reviews: lead.reviews,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, isLoading]);

  if (open) return <Editor key={open.id} page={open} onBack={() => setParams({})} />;
  if (id && isLoading) return <Loader2 className="mx-auto mt-20 h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div>
      <PageHeader
        title="Landing pages"
        description="Envie as fotos e os dados do cliente; a IA escreve, escolhe cores e fontes e você publica com um link."
        actions={<Button onClick={() => create()} disabled={creating}>{creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}Nova página</Button>}
      />
      {pages.length === 0 ? (
        <EmptyState icon={<Globe className="h-5 w-5" />} title="Nenhuma página ainda" action={<Button variant="outline" onClick={() => navigate("/studio/leads")}>Ver meus leads</Button>}>
          Crie do zero ou, na tela Leads, toque em "Landing" num lead para já vir com os dados dele.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pages.map((p) => (
            <article key={p.id} className="overflow-hidden rounded-lg border bg-card">
              <button type="button" className="block w-full text-left" onClick={() => setParams({ id: p.id })}>
                {p.photos[0] ? <img src={p.photos[0]} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="aspect-[16/9] bg-secondary" />}
                <div className="p-4">
                  <p className="truncate text-[13px] font-semibold">{p.name || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.niche || "—"} · {p.status === "published" ? `no ar · ${p.views} visitas` : p.status === "preview" ? `prévia · ${p.views} visitas` : "rascunho"} · {relativeTime(p.updated_at)}
                  </p>
                </div>
              </button>
              <div className="flex justify-end gap-1 border-t px-2 py-1.5">
                {p.status !== "draft" && (
                  <Button size="sm" variant="ghost" asChild><a href={publicUrl(p)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                )}
                <Button size="sm" variant="ghost" aria-label="Apagar" onClick={() => confirm(`Apagar a página de ${p.name || "sem nome"}?`) && remove(p)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
