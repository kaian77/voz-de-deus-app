import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, ImagePlus, Loader2, Plus, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { useSettings, useTable } from "../lib/hooks";
import type { ProductDraft, ProductTemplate, ProductTemplateData } from "../lib/types";
import { EmptyState, PageHeader, Panel, relativeTime, StatusDot } from "../components/bits";

type Category = { id: number; name: string; parent: number | null };

async function loadBitmap(file: File) {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(`Não consegui abrir ${file.name}. Use fotos JPG ou PNG.`);
  }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao preparar a foto"))), "image/jpeg", 0.9));
}

/** Foto da loja: JPEG de até 2000px (a loja não precisa de mais e o envio fica rápido). */
async function storeImage(bitmap: ImageBitmap): Promise<Blob> {
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // PNG transparente vira fundo branco no JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return toJpeg(canvas);
}

/** Foto para as redes: 1080x1350 (4:5) com a foto inteira centralizada em fundo branco — o Instagram recusa fotos mais altas que 4:5. */
async function socialImage(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  return toJpeg(canvas);
}

// --------------------------------------------------------------------------------------------
// Modelo de cadastro
// --------------------------------------------------------------------------------------------

const NUMERIC = ["price", "promotional_price", "stock", "weight", "width", "height", "depth"] as const;
const TEXT = ["name_pattern", "sku_prefix", "description", "tags", "brand", "seo_title", "seo_description"] as const;

type Form = Record<(typeof NUMERIC)[number] | (typeof TEXT)[number], string> & {
  name: string;
  ai_description: boolean;
  published: boolean;
  free_shipping: boolean;
  category_ids: number[];
};

function toForm(t?: ProductTemplate): Form {
  const d = t?.data ?? {};
  const f = { name: t?.name ?? "Modelo padrão", ai_description: d.ai_description ?? false, published: d.published ?? true, free_shipping: d.free_shipping ?? false, category_ids: d.category_ids ?? [] } as Form;
  for (const k of NUMERIC) f[k] = d[k] == null ? "" : String(d[k]).replace(".", ",");
  for (const k of TEXT) f[k] = d[k] ?? "";
  if (!t) f.name_pattern = "{nome}";
  return f;
}

function fromForm(f: Form): ProductTemplateData {
  const d: ProductTemplateData = { ai_description: f.ai_description, published: f.published, free_shipping: f.free_shipping, category_ids: f.category_ids };
  for (const k of NUMERIC) {
    const v = f[k].trim().replace(",", ".");
    if (v === "") {
      if (k === "stock") d.stock = null;
      continue;
    }
    const n = Number(v);
    if (Number.isNaN(n)) throw new Error("Use só números nos campos de preço, estoque, peso e medidas.");
    d[k] = k === "stock" ? Math.round(n) : n;
  }
  for (const k of TEXT) if (f[k].trim()) d[k] = f[k].trim();
  return d;
}

function Field({ id, label, hint, className, children }: { id: string; label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TemplateEditor({ templates, categories }: { templates: ProductTemplate[]; categories: Category[] }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>("new");
  const [form, setForm] = useState<Form>(toForm());
  const [saving, setSaving] = useState(false);
  const current = templates.find((t) => t.id === selected);

  useEffect(() => {
    if (selected === "new" && templates.length) setSelected((templates.find((t) => t.is_default) ?? templates[0]).id);
  }, [templates, selected]);
  const currentKey = JSON.stringify(current ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(toForm(current)), [currentKey]);

  const text = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      const data = fromForm(form);
      const row = { name: form.name.trim() || "Modelo", data, is_default: current?.is_default ?? templates.length === 0 };
      const saved = current ? await api.update("product_templates", current.id, row) : await api.insert("product_templates", row);
      await qc.invalidateQueries({ queryKey: ["table", "product_templates"] });
      setSelected(saved.id);
      toast.success("Modelo salvo");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async () => {
    if (!current) return;
    for (const t of templates) if (t.is_default && t.id !== current.id) await api.update("product_templates", t.id, { is_default: false });
    await api.update("product_templates", current.id, { is_default: true });
    qc.invalidateQueries({ queryKey: ["table", "product_templates"] });
  };

  const toggleCategory = (id: number, on: boolean) =>
    setForm({ ...form, category_ids: on ? [...form.category_ids, id] : form.category_ids.filter((c) => c !== id) });

  return (
    <Panel
      title="Modelo de cadastro"
      description="Tudo que se repete entre produtos. No nome, na descrição e no SEO, {nome} vira o nome de cada produto."
      action={<Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />}Salvar modelo</Button>}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {templates.map((t) => (
            <button key={t.id} onClick={() => setSelected(t.id)} className={cn("h-7 rounded-md border px-3 text-xs font-medium", selected === t.id ? "border-foreground bg-foreground text-background" : "text-foreground/80 hover:bg-secondary")}>
              {t.name}{t.is_default ? " · padrão" : ""}
            </button>
          ))}
          <button onClick={() => { setSelected("new-blank"); setForm(toForm()); }} className={cn("inline-flex h-7 items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:text-foreground", selected === "new-blank" && "border-foreground text-foreground")}>
            <Plus className="h-3 w-3" /> Novo modelo
          </button>
          {current && !current.is_default && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={makeDefault}>Usar como padrão</Button>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="tpl-name" label="Nome do modelo"><Input id="tpl-name" className="h-9" value={form.name} onChange={text("name")} /></Field>
          <Field id="tpl-pattern" label="Padrão do nome do produto" hint="Ex.: Pin {nome} → Pin Zé Gotinha Veterinário">
            <Input id="tpl-pattern" className="h-9" value={form.name_pattern} onChange={text("name_pattern")} placeholder="{nome}" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field id="tpl-price" label="Preço (R$)"><Input id="tpl-price" inputMode="decimal" className="h-9" value={form.price} onChange={text("price")} placeholder="29,90" /></Field>
          <Field id="tpl-promo" label="Preço promocional"><Input id="tpl-promo" inputMode="decimal" className="h-9" value={form.promotional_price} onChange={text("promotional_price")} placeholder="Opcional" /></Field>
          <Field id="tpl-stock" label="Estoque"><Input id="tpl-stock" inputMode="numeric" className="h-9" value={form.stock} onChange={text("stock")} placeholder="Vazio = infinito" /></Field>
          <Field id="tpl-sku" label="Prefixo do SKU"><Input id="tpl-sku" className="h-9" value={form.sku_prefix} onChange={text("sku_prefix")} placeholder="PIN-" /></Field>
          <Field id="tpl-weight" label="Peso (kg)"><Input id="tpl-weight" inputMode="decimal" className="h-9" value={form.weight} onChange={text("weight")} placeholder="0,05" /></Field>
          <Field id="tpl-width" label="Largura (cm)"><Input id="tpl-width" inputMode="decimal" className="h-9" value={form.width} onChange={text("width")} /></Field>
          <Field id="tpl-height" label="Altura (cm)"><Input id="tpl-height" inputMode="decimal" className="h-9" value={form.height} onChange={text("height")} /></Field>
          <Field id="tpl-depth" label="Profundidade (cm)"><Input id="tpl-depth" inputMode="decimal" className="h-9" value={form.depth} onChange={text("depth")} /></Field>
        </div>

        <Field id="tpl-categories" label="Categorias">
          {categories.length ? (
            <div id="tpl-categories" className="flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-md border p-3">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-[13px]">
                  <Checkbox checked={form.category_ids.includes(c.id)} onCheckedChange={(v) => toggleCategory(c.id, Boolean(v))} />
                  {c.parent ? <span className="text-muted-foreground">↳</span> : null}{c.name}
                </label>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">As categorias aparecem aqui com a loja conectada.</p>}
        </Field>

        <Field id="tpl-description" label="Descrição-base" hint="Material, medidas, cuidados, envio... Escreva uma vez e vale para todos.">
          <Textarea id="tpl-description" rows={5} className="text-[13px]" value={form.description} onChange={text("description")} placeholder={"Pin {nome} em metal esmaltado, com fecho de borboleta.\n\nEnviamos para todo o Brasil."} />
        </Field>
        <label htmlFor="tpl-ai" className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
          <span>
            <span className="block text-[13px] font-medium">A IA escreve a descrição olhando a foto</span>
            <span className="block text-xs text-muted-foreground">Usa a descrição-base acima e acrescenta o que aparece em cada produto.</span>
          </span>
          <Switch id="tpl-ai" checked={form.ai_description} onCheckedChange={(v) => setForm({ ...form, ai_description: v })} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="tpl-tags" label="Tags"><Input id="tpl-tags" className="h-9" value={form.tags} onChange={text("tags")} placeholder="pins, presente, saúde" /></Field>
          <Field id="tpl-brand" label="Marca"><Input id="tpl-brand" className="h-9" value={form.brand} onChange={text("brand")} /></Field>
          <Field id="tpl-seo-title" label="Título para o Google (SEO)"><Input id="tpl-seo-title" className="h-9" value={form.seo_title} onChange={text("seo_title")} placeholder="Pin {nome} | Sua loja" /></Field>
          <Field id="tpl-seo-desc" label="Descrição para o Google (SEO)"><Input id="tpl-seo-desc" className="h-9" value={form.seo_description} onChange={text("seo_description")} /></Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="tpl-published" className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <span className="text-[13px] font-medium">Publicar na loja ao cadastrar</span>
            <Switch id="tpl-published" checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} />
          </label>
          <label htmlFor="tpl-free" className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <span className="text-[13px] font-medium">Frete grátis</span>
            <Switch id="tpl-free" checked={form.free_shipping} onCheckedChange={(v) => setForm({ ...form, free_shipping: v })} />
          </label>
        </div>
      </div>
    </Panel>
  );
}

// --------------------------------------------------------------------------------------------
// Fotos -> produtos
// --------------------------------------------------------------------------------------------

function DraftRow({ draft, templates, onCreate }: { draft: ProductDraft; templates: ProductTemplate[]; onCreate: (d: ProductDraft) => Promise<void> }) {
  const qc = useQueryClient();
  const [name, setName] = useState(draft.name ?? "");
  const [busy, setBusy] = useState<"suggest" | "create" | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setName(draft.name ?? ""), [draft.name]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["table", "product_drafts"] });
  const template = templates.find((t) => t.id === draft.template_id) ?? templates.find((t) => t.is_default) ?? templates[0];
  const finalName = name.trim() ? (template?.data.name_pattern || "{nome}").split("{nome}").join(name.trim()) : null;

  const saveName = async () => {
    if ((draft.name ?? "") !== name.trim()) await api.update("product_drafts", draft.id, { name: name.trim() || null }).catch((e) => toast.error(e.message));
  };

  const suggest = async () => {
    setBusy("suggest");
    try {
      const s = await api.invoke<{ name: string; description: string }>("ai", { action: "product_suggest", draft_id: draft.id });
      setName(s.name);
      await api.update("product_drafts", draft.id, { name: s.name, ...(template?.data.ai_description ? { overrides: { ...draft.overrides, description: s.description } } : {}) });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    setBusy("create");
    await saveName();
    await onCreate({ ...draft, name: name.trim() || null });
    setBusy(null);
  };

  const working = busy === "create" || draft.status === "creating";

  return (
    <article className="grid gap-3 px-4 py-3.5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
      <div className="flex gap-1.5">
        {draft.images.slice(0, 4).map((src, i) => (
          <img key={i} src={src} alt="" className="h-14 w-14 rounded-md border object-cover" loading="lazy" />
        ))}
        {draft.images.length > 4 && <span className="flex h-14 w-10 items-center justify-center text-xs text-muted-foreground">+{draft.images.length - 4}</span>}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex gap-2">
          <Input
            className="h-9"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            placeholder="Nome do produto (vazio = a IA dá o nome)"
            aria-label="Nome do produto"
          />
          <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={suggest} disabled={!!busy} title="Sugerir nome olhando a foto">
            {busy === "suggest" ? <Loader2 className="animate-spin" /> : <Sparkles />}
            <span className="hidden sm:inline">Sugerir</span>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {finalName && <span className="truncate">Na loja: <span className="text-foreground">{finalName}</span></span>}
          {templates.length > 1 && (
            <Select value={template?.id} onValueChange={(v) => api.update("product_drafts", draft.id, { template_id: v }).then(refresh)}>
              <SelectTrigger className="h-7 w-auto gap-1 border-dashed px-2 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {draft.status === "failed" && <span className="text-danger">{draft.error}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 md:justify-end">
        {confirming ? (
          <>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => api.remove("product_drafts", draft.id).then(refresh)}>Apagar</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => setConfirming(true)} aria-label="Apagar"><Trash2 /></Button>
            <Button size="sm" className="h-8" onClick={create} disabled={working || busy === "suggest"}>
              {working && <Loader2 className="animate-spin" />}
              {draft.status === "failed" ? "Tentar de novo" : working ? "Cadastrando" : "Cadastrar"}
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

export default function Products() {
  const qc = useQueryClient();
  const { data: accounts = [], isLoading } = useTable("social_accounts");
  const connected = accounts.some((a) => a.platform === "nuvemshop");
  const { data: templates = [] } = useTable("product_templates", { order: "created_at", ascending: true });
  const { data: drafts = [] } = useTable("product_drafts", { limit: 100 }, { refetchInterval: 15000 });
  const categories = useQuery({
    queryKey: ["store-categories"],
    queryFn: () => api.invoke<Category[]>("ai", { action: "store_categories" }),
    enabled: connected,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const { data: settings } = useSettings();
  const autopost = settings?.product_autopost ?? true;
  const setAutopost = async (v: boolean) => {
    try {
      await api.saveSettings({ product_autopost: v });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const [grouped, setGrouped] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const queue = drafts.filter((d) => d.status !== "created");
  const created = drafts.filter((d) => d.status === "created").slice(0, 12);
  const defaultTemplate = templates.find((t) => t.is_default) ?? templates[0];
  const refresh = () => qc.invalidateQueries({ queryKey: ["table", "product_drafts"] });

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    try {
      const photos: { store: string; social: string }[] = [];
      for (const [i, file] of list.entries()) {
        setUploading(`Enviando ${i + 1} de ${list.length}`);
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} não é uma imagem`);
        const bitmap = await loadBitmap(file);
        const base = file.name.replace(/\.\w+$/, "");
        photos.push({
          store: await api.upload(await storeImage(bitmap), `${base}.jpg`),
          social: await api.upload(await socialImage(bitmap), `${base}-4x5.jpg`),
        });
      }
      const groups = grouped ? [photos] : photos.map((p) => [p]);
      for (const g of groups) {
        await api.insert("product_drafts", {
          images: g.map((p) => p.store),
          template_id: defaultTemplate?.id ?? null,
          status: "pending",
          overrides: { social_images: g.map((p) => p.social) },
        });
      }
      refresh();
      toast.success(grouped ? "Fotos adicionadas como um produto" : `${groups.length} produto(s) na fila`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const createOne = async (draft: ProductDraft, quiet = false) => {
    try {
      const r = await api.invoke<{ post?: { status: string } | null }>("ai", { action: "product_create", draft_id: draft.id });
      if (r.post) qc.invalidateQueries({ queryKey: ["table", "posts"] });
      if (!quiet) {
        toast.success(r.post
          ? r.post.status === "pending_approval" ? "Produto na loja. O post de divulgação está esperando você em Aprovações." : "Produto na loja e post de divulgação agendado."
          : "Produto cadastrado na loja");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      refresh();
    }
  };

  const createAll = async () => {
    setBulk(true);
    for (const d of queue.filter((d) => d.status !== "creating")) await createOne(d, true);
    setBulk(false);
    toast.success("Pronto. Confira os cadastrados abaixo.");
  };

  if (!isLoading && !connected) {
    return (
      <div>
        <PageHeader title="Produtos" description="Mande as fotos e o Studio cadastra os produtos na sua loja." />
        <EmptyState icon={<ShoppingBag />} title="Conecte a sua loja Nuvemshop" action={<Button asChild size="sm"><Link to="/studio/contas">Ir para Contas</Link></Button>}>
          Com a loja conectada, você define um modelo de cadastro uma vez e depois é só mandar as fotos.
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Produtos" description="Mande as fotos, dê o nome (ou deixe a IA dar) e o Studio cadastra na loja usando o seu modelo." />
      <div className="grid gap-6">
        <Panel
          title="Fotos para cadastrar"
          description={defaultTemplate ? `Usa o modelo “${defaultTemplate.name}”. Cada foto vira um produto, a não ser que você junte.` : "Salve um modelo de cadastro abaixo antes de cadastrar."}
          action={queue.length > 1 ? (
            <Button size="sm" variant="outline" onClick={createAll} disabled={bulk || !defaultTemplate}>
              {bulk && <Loader2 className="animate-spin" />}Cadastrar todos ({queue.length})
            </Button>
          ) : undefined}
          bodyClassName="p-0"
        >
          <label htmlFor="autopost" className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <span>
              <span className="block text-[13px] font-medium">Divulgar no Instagram e no TikTok</span>
              <span className="block text-xs text-muted-foreground">
                Cada produto cadastrado vira um post com legenda feita pela IA, no próximo horário nobre (13h ou 19h).
                {settings?.approval_required !== false ? " Fica em Aprovações até você liberar." : " Publica sozinho."}
              </span>
            </span>
            <Switch id="autopost" checked={autopost} onCheckedChange={setAutopost} />
          </label>
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={grouped} onCheckedChange={(v) => setGrouped(Boolean(v))} />
              As fotos que vou enviar são do mesmo produto
            </label>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={!!uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
              {uploading ?? "Enviar fotos"}
            </Button>
          </div>
          {queue.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Nenhuma foto na fila. Envie as fotos dos produtos novos.</p>
          ) : (
            <div className="divide-y">
              {queue.map((d) => <DraftRow key={d.id} draft={d} templates={templates} onCreate={(x) => createOne(x)} />)}
            </div>
          )}
        </Panel>

        <TemplateEditor templates={templates} categories={categories.data ?? []} />

        {created.length > 0 && (
          <Panel title="Cadastrados recentemente" bodyClassName="p-0">
            <div className="divide-y">
              {created.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                  <img src={d.images[0]} alt="" className="h-9 w-9 rounded border object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground"><StatusDot tone="success">Na loja</StatusDot> · {relativeTime(d.created_at)}</p>
                  </div>
                  {d.product_url && (
                    <a href={d.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-2">
                      Ver na loja <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
