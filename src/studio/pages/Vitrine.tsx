import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Copy, Loader2, Sparkles, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, isDemo } from "../lib/api";
import { useInstagramProfile, useTable } from "../lib/hooks";
import type { ProfileAudit } from "../lib/types";
import { EmptyState, formatDateTime, PageHeader } from "../components/bits";
import { IgMediaTile } from "../components/IgMediaTile";
import { PostThumb } from "../components/PostThumb";

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {items.map((x, i) => <li key={i}>• {x}</li>)}
      </ul>
    </div>
  );
}

function AuditView({ audit }: { audit: ProfileAudit }) {
  const a = audit.analysis;
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Bio copiada! Cole no Instagram em Editar perfil."));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {audit.source === "agent" ? <Bot className="h-4 w-4 text-violet-600" /> : <Sparkles className="h-4 w-4 text-violet-600" />}
          Auditoria da vitrine
        </CardTitle>
        <span className="text-xs text-muted-foreground">{formatDateTime(audit.created_at)}</span>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold">{Math.round(a.score)}</div>
          <div className="flex-1">
            <Progress value={a.score} />
            <p className="mt-2 text-sm text-muted-foreground">{a.summary}</p>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Sugestões de bio</p>
          <div className="space-y-2">
            {a.bio_suggestions.map((b, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border p-3">
                <p className="flex-1 whitespace-pre-line text-sm">{b}</p>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(b)} aria-label="Copiar"><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <List title="Ações rápidas" items={a.quick_wins} />
          <List title="Pilares de conteúdo" items={a.content_pillars} />
          <List title="Destaques (stories fixos)" items={a.highlight_ideas} />
          <List title="Melhores horários" items={a.best_times} />
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">Grade</p>
          <p className="text-sm text-muted-foreground">{a.grid_feedback}</p>
        </div>
      </CardContent>
    </Card>
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
      toast.success("Auditoria pronta!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!ig) {
    return (
      <div>
        <PageHeader title="Vitrine" description="Como seu perfil aparece para quem chega nele." />
        <EmptyState icon={<Store className="h-8 w-8" />} title="Conecte o Instagram primeiro">Vá em Contas e conecte sua conta profissional.</EmptyState>
      </div>
    );
  }

  const p = profile.data?.profile;
  const upcoming = posts
    .filter((x) => x.status === "scheduled" && x.platforms.includes("instagram") && x.kind !== "story")
    .sort((a, b) => (b.scheduled_at ?? "").localeCompare(a.scheduled_at ?? ""));
  const latest = audits[0];

  return (
    <div>
      <PageHeader
        title="Vitrine"
        description="Seu perfil, a grade futura (com o que está agendado) e a auditoria com sugestões."
        actions={
          <Button onClick={() => audit.mutate()} disabled={audit.isPending}>
            {audit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Auditar com IA
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="self-start">
          <CardContent className="p-4">
            <div className="mb-4 flex items-center gap-4">
              {p?.profile_picture_url || ig.avatar_url ? (
                <img src={p?.profile_picture_url ?? ig.avatar_url!} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-gradient-divine" />
              )}
              <div className="grid flex-1 grid-cols-3 text-center text-sm">
                <div><p className="font-bold">{p?.media_count ?? ig.meta.media_count ?? "–"}</p><p className="text-xs text-muted-foreground">posts</p></div>
                <div><p className="font-bold">{(p?.followers_count ?? ig.followers_count ?? 0).toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">seguidores</p></div>
                <div><p className="font-bold">{p?.follows_count ?? "–"}</p><p className="text-xs text-muted-foreground">seguindo</p></div>
              </div>
            </div>
            <p className="text-sm font-semibold">{p?.name ?? ig.display_name}</p>
            <p className="whitespace-pre-line text-sm">{p?.biography ?? ig.meta.biography}</p>
            {(p?.website ?? ig.meta.website) && <p className="text-sm font-medium text-blue-800">{p?.website ?? ig.meta.website}</p>}

            <div className="mt-4 grid grid-cols-3 gap-0.5">
              {upcoming.map((post) => (
                <div key={post.id} className="relative">
                  <PostThumb post={post} className="rounded-none" />
                  <Badge className="absolute left-1 top-1 h-4 px-1 text-[9px]">agendado</Badge>
                </div>
              ))}
              {profile.data?.media.map((m) => <IgMediaTile key={m.id} media={m} onClick={() => m.permalink && window.open(m.permalink, "_blank")} />)}
            </div>
            {profile.isLoading && <p className="mt-3 text-xs text-muted-foreground">Carregando posts…</p>}
            {profile.error && <p className="mt-3 text-xs text-destructive">{(profile.error as Error).message}</p>}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {profile.data?.best_times?.length ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Horários com mais engajamento (seus últimos posts)</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {profile.data.best_times.map((b) => <Badge key={b.slot} variant="secondary" className="capitalize">{b.slot} · {b.avg_engagement} interações</Badge>)}
              </CardContent>
            </Card>
          ) : null}
          {latest ? (
            <AuditView audit={latest} />
          ) : (
            <EmptyState icon={<Sparkles className="h-8 w-8" />} title="Nenhuma auditoria ainda">
              Clique em "Auditar com IA" ou peça ao Claude: "analise minha vitrine e me dê uma bio nova".
            </EmptyState>
          )}
          <p className="text-xs text-muted-foreground">
            A API do Instagram não permite alterar bio, foto ou destaques automaticamente — o Studio sugere e você aplica com um toque em Editar perfil.
          </p>
        </div>
      </div>
    </div>
  );
}
