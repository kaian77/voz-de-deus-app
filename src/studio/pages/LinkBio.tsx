import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Copy, Eye, Link2, Loader2, Plus, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSaveRow, useTable } from "../lib/hooks";
import type { BioLink as BioLinkType } from "../lib/types";
import { Avatar, PageHeader, Panel } from "../components/bits";

const BACKGROUNDS = [
  { name: "Lavanda", value: "#f5f3ff" },
  { name: "Neve", value: "#f8fafc" },
  { name: "Pêssego", value: "#fff1e8" },
  { name: "Menta", value: "#ecfdf5" },
  { name: "Noite", value: "#18181b" },
];
const ACCENTS = ["#7c3aed", "#2563eb", "#db2777", "#ea580c", "#059669", "#18181b"];
const BUTTONS: { id: BioLinkType["button_style"]; label: string; sample: string }[] = [
  { id: "rounded", label: "Suave", sample: "rounded-xl" },
  { id: "pill", label: "Pílula", sample: "rounded-full" },
  { id: "outline", label: "Contorno", sample: "rounded-xl border-2" },
];

type LinkItem = BioLinkType["links"][number];
type Form = Omit<BioLinkType, "id" | "user_id" | "created_at" | "updated_at">;

const blankForm = (username = "", avatar = ""): Form => ({
  slug: username.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9-]/g, "") || "seu-nome",
  display_name: username.replace(/^@/, "") || "Seu nome",
  username: username.replace(/^@/, "") || null,
  bio: "",
  avatar_url: avatar || null,
  background: "#f5f3ff",
  accent: "#7c3aed",
  button_style: "rounded",
  links: [{ id: crypto.randomUUID(), title: "Meu site", url: "https://", enabled: true }],
  status: "draft",
});

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export default function LinkBio() {
  const { data: pages = [], isLoading } = useTable("bio_links", { limit: 1 });
  const { data: accounts = [] } = useTable("social_accounts");
  const saveRow = useSaveRow("bio_links");
  const instagram = accounts.find((account) => account.platform === "instagram");
  const current = pages[0];
  const [form, setForm] = useState<Form>(() => blankForm());
  const [initializedId, setInitializedId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<Form["status"] | null>(null);
  const publicUrl = useMemo(() => typeof window === "undefined" ? "" : `${window.location.origin}/bio/${form.slug}`, [form.slug]);
  const visibleLinks = form.links.filter((item) => item.enabled && item.title.trim());

  useEffect(() => {
    if (isLoading || initializedId === (current?.id ?? "new")) return;
    setForm(current ? {
      slug: current.slug,
      display_name: current.display_name,
      username: current.username,
      bio: current.bio,
      avatar_url: current.avatar_url || instagram?.avatar_url || null,
      background: current.background,
      accent: current.accent,
      button_style: current.button_style,
      links: current.links?.length ? current.links : [],
      status: current.status,
    } : blankForm(instagram?.username ?? "", instagram?.avatar_url ?? ""));
    setInitializedId(current?.id ?? "new");
  }, [current, initializedId, instagram?.avatar_url, instagram?.username, isLoading]);

  const patch = <K extends keyof Form>(key: K, value: Form[K]) => setForm((old) => ({ ...old, [key]: value }));
  const patchLink = (id: string, field: keyof LinkItem, value: string | boolean) => patch("links", form.links.map((item) => item.id === id ? { ...item, [field]: value } : item));
  const moveLink = (index: number, step: -1 | 1) => {
    const next = [...form.links];
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch("links", next);
  };

  const save = async (status: Form["status"]) => {
    const slug = form.slug.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 40);
    if (slug.length < 2) return toast.error("Escolha um endereço com pelo menos 2 letras.");
    if (!form.display_name.trim()) return toast.error("Escreva o nome que vai aparecer na sua página.");
    if (status === "published" && !form.links.some((item) => item.enabled && item.title.trim() && safeUrl(item.url))) return toast.error("Adicione pelo menos um link válido antes de publicar.");
    const links = form.links.map((item) => ({ ...item, title: item.title.trim(), url: item.url.trim() }));
    setSavingStatus(status);
    try {
      const payload = { ...form, slug, links, status };
      const saved = current
        ? await saveRow.mutateAsync({ id: current.id, ...payload })
        : await saveRow.mutateAsync(payload);
      setForm((old) => ({ ...old, slug, status: saved.status }));
      toast.success(status === "published" ? "Seu Link na bio está publicado!" : "Rascunho salvo.");
    } catch (error) {
      const message = (error as Error).message;
      toast.error(/duplicate|unique/i.test(message) ? "Esse endereço já está sendo usado. Escolha outro." : message);
    } finally {
      setSavingStatus(null);
    }
  };

  const copyUrl = async () => {
    if (form.status !== "published") return toast.error("Publique sua página antes de copiar o link.");
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copiado. Cole na bio do Instagram!");
    } catch {
      toast.error("Não consegui copiar o link. Selecione e copie o endereço manualmente.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Link na bio"
        description="Reúna seu site, WhatsApp, loja e outros destinos em uma página bonita para colocar na bio do Instagram."
        actions={<Button variant="outline" size="sm" onClick={copyUrl} disabled={form.status !== "published"}><Copy /> Copiar meu link</Button>}
      />
      {form.status === "published" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><p className="font-semibold">Sua página está no ar</p><p className="truncate text-xs opacity-80">{publicUrl}</p></div>
          <Button size="sm" onClick={copyUrl}><Copy /> Copiar e colocar no Instagram</Button>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel title="Sua página" description="O endereço é curto e fácil de compartilhar." bodyClassName="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="bio-name">Nome</Label><Input id="bio-name" value={form.display_name} onChange={(event) => patch("display_name", event.target.value)} placeholder="Seu nome ou marca" /></div>
              <div className="space-y-1.5"><Label htmlFor="bio-handle">Instagram</Label><Input id="bio-handle" value={form.username ?? ""} onChange={(event) => patch("username", event.target.value.replace(/^@/, ""))} placeholder="@seuperfil" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="bio-slug">Endereço da sua página</Label><div className="flex items-center overflow-hidden rounded-md border bg-background"><span className="hidden whitespace-nowrap border-r px-3 py-2 text-xs text-muted-foreground sm:block">{typeof window !== "undefined" ? window.location.host : "instagram.paginaspro.app.br"}/bio/</span><Input id="bio-slug" className="border-0 shadow-none focus-visible:ring-0" value={form.slug} maxLength={40} onChange={(event) => patch("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="seu-nome" /></div><p className="text-xs text-muted-foreground">Use letras, números e hífen. Você poderá copiar o link depois de publicar.</p></div>
            <div className="space-y-1.5"><Label htmlFor="bio-description">Uma frase sobre você</Label><Textarea id="bio-description" rows={3} maxLength={220} value={form.bio ?? ""} onChange={(event) => patch("bio", event.target.value)} placeholder="Conte em poucas palavras o que as pessoas encontram nos seus links." /><p className="text-right text-[11px] text-muted-foreground">{(form.bio ?? "").length}/220</p></div>
            <div className="space-y-1.5"><Label htmlFor="bio-avatar">Foto de perfil · link da imagem</Label><Input id="bio-avatar" value={form.avatar_url ?? ""} onChange={(event) => patch("avatar_url", event.target.value || null)} placeholder="https://…" /><p className="text-xs text-muted-foreground">Usamos a foto do Instagram conectado se você deixar em branco.</p></div>
          </Panel>

          <Panel title="Seus botões" description="Adicione até 10 destinos. Arraste pela ordem com as setas." action={<Button size="sm" variant="outline" onClick={() => form.links.length < 10 ? patch("links", [...form.links, { id: crypto.randomUUID(), title: "", url: "https://", enabled: true }]) : toast.error("Você pode adicionar até 10 links.")}><Plus /> Adicionar link</Button>} bodyClassName="space-y-3 p-5">
            {form.links.length === 0 && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Adicione seu primeiro botão, como WhatsApp, loja ou canal.</p>}
            {form.links.map((item, index) => (
              <div key={item.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[28px_minmax(0,1fr)_76px]">
                <div className="flex gap-0.5 sm:flex-col"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Mover para cima" disabled={index === 0} onClick={() => moveLink(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Mover para baixo" disabled={index === form.links.length - 1} onClick={() => moveLink(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button></div>
                <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Texto do botão" value={item.title} onChange={(event) => patchLink(item.id, "title", event.target.value)} placeholder="Ex.: Fale comigo no WhatsApp" /><Input aria-label="Endereço do botão" value={item.url} onChange={(event) => patchLink(item.id, "url", event.target.value)} placeholder="https://…" /></div>
                <div className="flex items-center justify-end gap-1"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={item.enabled ? "Ocultar link" : "Mostrar link"} aria-label={item.enabled ? "Ocultar link" : "Mostrar link"} onClick={() => patchLink(item.id, "enabled", !item.enabled)}><Eye className={`h-4 w-4 ${item.enabled ? "" : "opacity-40"}`} /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-danger" aria-label="Remover link" onClick={() => patch("links", form.links.filter((link) => link.id !== item.id))}><Trash2 className="h-4 w-4" /></Button></div>
                {item.url && item.url !== "https://" && !safeUrl(item.url) && <p className="text-xs text-danger sm:col-start-2">Use um endereço completo, começando com https://, http://, mailto: ou tel:.</p>}
              </div>
            ))}
          </Panel>

          <Panel title="Aparência" description="Escolha uma cor e o formato dos botões. Veja o resultado ao lado." bodyClassName="space-y-5 p-5">
            <div><Label className="mb-2 block">Fundo da página</Label><div className="flex flex-wrap gap-2">{BACKGROUNDS.map((item) => <button key={item.value} type="button" onClick={() => patch("background", item.value)} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${form.background === item.value ? "border-foreground ring-2 ring-foreground/15" : "border-border"}`}><span className="h-4 w-4 rounded-full border" style={{ background: item.value }} />{item.name}</button>)}</div></div>
            <div><Label className="mb-2 block">Cor dos botões</Label><div className="flex flex-wrap items-center gap-2">{ACCENTS.map((accent) => <button key={accent} type="button" aria-label={`Usar cor ${accent}`} title={accent} onClick={() => patch("accent", accent)} className={`h-8 w-8 rounded-full border-2 ${form.accent === accent ? "border-foreground ring-2 ring-foreground/20" : "border-transparent"}`} style={{ background: accent }} />)}<Input aria-label="Escolher outra cor" type="color" value={form.accent} className="h-9 w-12 cursor-pointer p-1" onChange={(event) => patch("accent", event.target.value)} /></div></div>
            <div><Label className="mb-2 block">Formato dos botões</Label><div className="grid gap-2 sm:grid-cols-3">{BUTTONS.map((button) => <button key={button.id} type="button" onClick={() => patch("button_style", button.id)} className={`rounded-lg border p-3 text-left ${form.button_style === button.id ? "border-foreground bg-secondary/50" : ""}`}><span className={`mb-2 block h-8 ${button.sample}`} style={{ background: button.id === "outline" ? "transparent" : form.accent, borderColor: form.accent }} /><span className="text-xs font-medium">{button.label}</span></button>)}</div></div>
          </Panel>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{form.status === "published" ? "Sua página está pública. Salvar rascunho tira o link do ar." : "Você pode salvar e revisar antes de publicar."}</p>
            <div className="flex gap-2"><Button variant="outline" onClick={() => save("draft")} disabled={!!savingStatus}>{savingStatus === "draft" && <Loader2 className="animate-spin" />}Salvar rascunho</Button><Button onClick={() => save("published")} disabled={!!savingStatus}>{savingStatus === "published" ? <Loader2 className="animate-spin" /> : <Link2 />}Publicar meu link</Button></div>
          </div>
        </div>

        <aside className="xl:sticky xl:top-5">
          <Panel title="Prévia ao vivo" description="Assim sua página aparece no celular." action={<Smartphone className="h-4 w-4 text-muted-foreground" />} bodyClassName="p-5">
            <div className="mx-auto w-full max-w-[290px] rounded-[34px] border-[7px] border-zinc-900 bg-zinc-900 p-1 shadow-xl">
              <div className="min-h-[510px] overflow-hidden rounded-[26px] px-4 pb-5 pt-10 text-center" style={{ background: form.background, color: form.background === "#18181b" ? "#fafafa" : "#18181b" }}>
                <div className="mx-auto mb-3 h-[72px] w-[72px] overflow-hidden rounded-full bg-white/50">{form.avatar_url ? <img src={form.avatar_url} alt="Prévia da foto" className="h-full w-full object-cover" /> : <Avatar name={form.display_name || "@"} className="h-full w-full text-2xl" />}</div>
                <p className="font-semibold">{form.display_name || "Seu nome"}</p>
                {form.username && <p className="mt-0.5 text-xs opacity-65">@{form.username.replace(/^@/, "")}</p>}
                {form.bio && <p className="mx-auto mt-3 max-w-[230px] whitespace-pre-line text-xs leading-relaxed opacity-75">{form.bio}</p>}
                <div className="mt-5 space-y-2.5">{visibleLinks.map((item) => <div key={item.id} className={`flex min-h-11 items-center justify-center px-3 text-xs font-semibold ${form.button_style === "pill" ? "rounded-full" : "rounded-xl"} ${form.button_style === "outline" ? "border-2" : "text-white shadow-sm"}`} style={{ background: form.button_style === "outline" ? "transparent" : form.accent, borderColor: form.accent, color: form.button_style === "outline" ? form.accent : "#fff" }}>{item.title || "Seu link"}</div>)}</div>
                {!visibleLinks.length && <div className="mt-5 rounded-xl border border-dashed border-current/20 px-3 py-5 text-xs opacity-50">Seus links aparecem aqui</div>}
                <p className="mt-8 text-[9px] opacity-40">Criado com PáginasPro Instagram</p>
              </div>
            </div>
            {publicUrl && <p className="mt-4 flex items-center justify-center gap-1.5 break-all text-center text-[11px] text-muted-foreground"><Link2 className="h-3 w-3 shrink-0" />{publicUrl}</p>}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
