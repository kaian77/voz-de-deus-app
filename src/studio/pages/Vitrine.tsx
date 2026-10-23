import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2, Sparkles, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, isDemo } from "../lib/api";
import { useInstagramProfile, useTable } from "../lib/hooks";
import type { ProfileAudit } from "../lib/types";
import { Avatar, EmptyState, formatDateTime, PageHeader, Panel, SectionLabel, sentence } from "../components/bits";
import { IgMediaTile } from "../components/IgMediaTile";
import { PostThumb } from "../components/PostThumb";

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <SectionLabel className="mb-2">{title}</SectionLabel>
      <ul className="space-y-1.5 text-[13px] text-foreground/85">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/40" />{x}</li>
        ))}
      </ul>
    </div>
  );
}

function AuditView({ audit }: { audit: ProfileAudit }) {
  const a = audit.analysis;
  const copy = (t: string) =>
    navigator.clipboard.writeText(t).then(
      () => toast.success("Bio copiada. Cole em Editar perfil, no Instagram."),
      () => toast.error("Não consegui copiar. Selecione o texto e copie manualmente."),
    );
  return (
    <Panel
      title="Auditoria do perfil"
      description={`${audit.source === "agent" ? "Feita pelo Claude" : "Feita pela IA"} · ${formatDateTime(audit.created_at)}`}
      bodyClassName="space-y-6 p-5"
    >
      <div className="flex items-start gap-5">
        <div className="shrink-0">
          <p className="tabular text-[40px] font-semibold leading-none tracking-tight">{Math.round(a.score)}<span className="text-base font-normal text-muted-foreground">/100</span></p>
          <div className="mt-2 h-1 w-24 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-foreground" style={{ width: `${Math.max(0, Math.min(100, a.score))}%` }} />
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-foreground/85">{a.summary}</p>
      </div>

      <div>
        <SectionLabel className="mb-2">Sugestões de bio</SectionLabel>
        <div className="divide-y rounded-md border">
          {a.bio_suggestions.map((b, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2.5">
              <span className="tabular mt-0.5 text-xs text-muted-foreground">{i + 1}</span>
              <p className="flex-1 whitespace-pre-line text-[13px]">{b}</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copy(b)}><Copy /> Copiar</Button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Bullets title="Ações rápidas" items={a.quick_wins} />
        <Bullets title="Pilares de conteúdo" items={a.content_pillars} />
        <Bullets title="Destaques sugeridos" items={a.highlight_ideas} />
        <Bullets title="Melhores horários" items={a.best_times} />
      </div>

      <div>
        <SectionLabel className="mb-2">Grade</SectionLabel>
        <p className="text-[13px] leading-relaxed text-foreground/85">{a.grid_feedback}</p>
      </div>
    </Panel>
  );
}

export default function Vitrine() {
  const { data: accounts = [] } = useTable("social_accounts");
  const { data: audits = [] } = useTable("profile_audits");
  const { data: posts = [] } = useTable("posts");
  const profile = useInstagramProfile();
  const qc = useQueryClient();
  const ig = accounts.find((a) => a.platform === "instagram");

  const audit = useMutation({
    mutationFn: () => api.invoke<ProfileAudit>("ai", { action: "audit_profile", account_id: ig?.id }),
    onSuccess: async (row) => {
      if (isDemo) await api.insert("profile_audits", row); // no Supabase a função já salvou
      qc.invalidateQueries({ queryKey: ["table", "profile_audits"] });
      toast.success("Auditoria concluída");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!ig) {
    return (
      <div>
        <PageHeader title="Análise do perfil" description="Como seu perfil aparece para quem chega nele." />
        <EmptyState icon={<Store />} title="Conecte o Instagram primeiro">Vá em Contas e conecte sua conta profissional.</EmptyState>
      </div>
    );
  }

  const p = profile.data?.profile;
  const upcoming = posts
    .filter((x) => x.status === "scheduled" && x.platforms.includes("instagram") && x.kind !== "story")
    .sort((a, b) => (b.scheduled_at ?? "").localeCompare(a.scheduled_at ?? ""));
  const latest = audits[0];
  const best = profile.data?.best_times ?? [];
  const maxEng = Math.max(1, ...best.map((b) => b.avg_engagement));
  const website = p?.website ?? ig.meta.website;

  return (
    <div>
      <PageHeader
        title="Análise do perfil"
        description="Seu perfil como o visitante vê, a grade com o que já está agendado e as recomendações."
        actions={
          <Button size="sm" onClick={() => audit.mutate()} disabled={audit.isPending}>
            {audit.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Auditar perfil
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6 lg:self-start">
          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="p-4">
              <div className="mb-3 flex items-center gap-4">
                <Avatar name={ig.username} src={p?.profile_picture_url ?? ig.avatar_url} className="h-16 w-16 text-base" />
                <div className="tabular grid flex-1 grid-cols-3 text-center">
                  {[
                    [p?.media_count ?? ig.meta.media_count, "posts"],
                    [p?.followers_count ?? ig.followers_count, "seguidores"],
                    [p?.follows_count, "seguindo"],
                  ].map(([v, l]) => (
                    <div key={l as string}>
                      <p className="text-[15px] font-semibold">{v != null ? Number(v).toLocaleString("pt-BR") : "–"}</p>
                      <p className="text-[11px] text-muted-foreground">{l}</p>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[13px] font-semibold">{p?.name ?? ig.display_name}</p>
              <p className="whitespace-pre-line text-[13px] leading-snug">{p?.biography ?? ig.meta.biography}</p>
              {website && <p className="truncate text-[13px] font-medium text-brand">{website.replace(/^https?:\/\//, "")}</p>}
            </div>
            <div className="grid grid-cols-3 gap-px bg-border">
              {upcoming.map((post) => (
                <div key={post.id} className="relative bg-card">
                  <PostThumb post={post} className="rounded-none" />
                  <span className="absolute left-1 top-1 rounded bg-foreground/85 px-1 text-[9px] font-medium uppercase tracking-wide text-background">Agendado</span>
                </div>
              ))}
              {profile.data?.media.map((m) => (
                <a key={m.id} href={m.permalink} target="_blank" rel="noreferrer" className="bg-card">
                  <IgMediaTile media={m} className="rounded-none" />
                </a>
              ))}
            </div>
            {profile.isLoading && <p className="p-4 text-xs text-muted-foreground">Carregando posts…</p>}
            {profile.error && <p className="p-4 text-xs text-danger">{(profile.error as Error).message}</p>}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          {best.length > 0 && (
            <Panel title="Horários com mais engajamento" description="Média de curtidas e comentários dos seus últimos posts por horário">
              <div className="space-y-2.5">
                {best.map((b) => (
                  <div key={b.slot} className="grid grid-cols-[130px_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
                    <span>{sentence(b.slot)}</span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${(b.avg_engagement / maxEng) * 100}%` }} />
                    </div>
                    <span className="tabular text-xs text-muted-foreground">{b.avg_engagement.toLocaleString("pt-BR")} · {b.posts} post{b.posts > 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {latest ? (
            <AuditView audit={latest} />
          ) : (
            <EmptyState icon={<Sparkles />} title="Nenhuma auditoria ainda">
              Clique em “Auditar perfil” ou peça ao Claude: “analise minha vitrine e me dê uma bio nova”.
            </EmptyState>
          )}
          <p className="text-xs text-muted-foreground">
            O Instagram não permite alterar bio, foto ou destaques por API. O Studio sugere e você aplica em Editar perfil.
          </p>
        </div>
      </div>
    </div>
  );
}
