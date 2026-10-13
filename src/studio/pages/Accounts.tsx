import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import { useRemoveRow, useTable } from "../lib/hooks";
import type { Platform, SocialAccount } from "../lib/types";
import { Avatar, PageHeader, PlatformIcon, StatusDot } from "../components/bits";
import WhatsAppConnect from "../components/WhatsAppConnect";
import SaleAlerts from "../components/SaleAlerts";

const INFO: Record<Platform, { name: string; features: string; note: string }> = {
  instagram: {
    name: "Instagram",
    features: "Publica posts, carrosséis, reels e stories. Responde comentários e mensagens do direct. Lê perfil e engajamento.",
    note: "Exige conta profissional (criador de conteúdo ou empresa).",
  },
  tiktok: {
    name: "TikTok",
    features: "Publica vídeos e carrosséis de fotos no mesmo calendário do Instagram.",
    note: "Até o app ser aprovado na auditoria do TikTok, os posts saem como privados.",
  },
};

export function ConnectedAccount({ account, onRemove }: { account: SocialAccount; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2">
      <Avatar name={account.username ?? account.display_name} src={account.avatar_url} className="h-7 w-7" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{["whatsapp", "nuvemshop", "mercadolivre", "shopee"].includes(account.platform) ? account.display_name : `@${account.username ?? account.display_name}`}</p>
        <p className="tabular truncate text-xs text-muted-foreground">
          {account.platform === "nuvemshop"
            ? account.username
            : account.platform === "mercadolivre" || account.platform === "shopee"
            ? account.meta.analysis
              ? `${account.meta.analysis.listings} anúncios ativos`
              : "Conectada"
            : account.platform === "whatsapp"
            ? `${account.meta.label ? `${account.meta.label} · ` : ""}+${account.username} · ${account.meta.provider === "waha" ? "WAHA" : "API oficial"}`
            : account.followers_count != null ? `${account.followers_count.toLocaleString("pt-BR")} seguidores` : "Conectada"}
        </p>
      </div>
      {confirming ? (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={onRemove}>Desconectar</Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setConfirming(true)}>Desconectar</Button>
      )}
    </div>
  );
}

const MARKETPLACES = [
  {
    id: "mercadolivre" as const,
    name: "Mercado Livre",
    text: "Lê os seus anúncios, descobre o padrão de preço em relação à loja e publica os produtos novos copiando categoria, tipo de anúncio, frete e garantia de um anúncio seu.",
  },
  {
    id: "shopee" as const,
    name: "Shopee",
    text: "Lê os seus anúncios, os preços e os dados fiscais e compara com a loja. A publicação automática vem em seguida.",
  },
];

function Analysis({ account }: { account: SocialAccount }) {
  const [busy, setBusy] = useState(false);
  const { refetch } = useTable("social_accounts");
  const a = account.meta.analysis;
  const run = async () => {
    setBusy(true);
    try {
      await api.invoke("ai", { action: "marketplace_analyze", platform: account.platform });
      await refetch();
      toast.success("Anúncios analisados");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-md border bg-secondary/40 px-3 py-2 text-xs">
      {a ? (
        <>
          <p><span className="font-medium">Preço:</span> {a.rule_text}</p>
          <p className="text-muted-foreground">{a.matched} de {a.listings} anúncios comparados com a loja</p>
          {a.samples.slice(0, 3).map((s) => (
            <p key={s.name} className="truncate text-muted-foreground">
              {s.name}: loja R$ {s.store.toFixed(2).replace(".", ",")} → R$ {s.marketplace.toFixed(2).replace(".", ",")}
            </p>
          ))}
        </>
      ) : (
        <p className="text-muted-foreground">Os anúncios ainda não foram analisados.</p>
      )}
      <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={run} disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}Analisar de novo
      </Button>
      {account.platform === "mercadolivre" && <MlSync account={account} />}
    </div>
  );
}

/** Sincroniza todos os produtos da loja com o Mercado Livre (o cron processa alguns por minuto). */
function MlSync({ account }: { account: SocialAccount }) {
  const [busy, setBusy] = useState(false);
  const { refetch } = useTable("social_accounts");
  const s = account.meta.ml_sync;
  const running = !!s?.queue.length;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void refetch(), 20_000);
    return () => clearInterval(t);
  }, [running, refetch]);
  const start = async () => {
    setBusy(true);
    try {
      const r = await api.invoke<{ total: number; minutes: number }>("ai", { action: "ml_sync_start" });
      await refetch();
      toast.success(`${r.total} produtos na fila (uns ${r.minutes} min)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const updated = s?.done.filter((d) => d.updated).length ?? 0;
  const created = (s?.done.length ?? 0) - updated;
  return (
    <div className="mt-2 border-t pt-2">
      {s && (
        <>
          <p>
            <span className="font-medium">Sincronização:</span>{" "}
            {running ? `${s.total - s.queue.length} de ${s.total} produtos` : `concluída (${s.total} produtos)`}
          </p>
          <p className="text-muted-foreground">
            {updated} atualizados · {created} criados · {s.skipped.length} fora (kits/teste) · {s.errors.length} com erro
          </p>
          {s.errors.slice(-3).map((e) => (
            <p key={e.id} className="truncate text-danger" title={e.error}>{e.name}: {e.error}</p>
          ))}
        </>
      )}
      <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={start} disabled={busy || running}>
        {(busy || running) && <Loader2 className="animate-spin" />}
        {running ? "Sincronizando…" : "Sincronizar com a loja"}
      </Button>
    </div>
  );
}

export default function Accounts() {
  const { data: accounts = [] } = useTable("social_accounts");
  const remove = useRemoveRow("social_accounts");
  const shops = accounts.filter((a) => a.platform === "nuvemshop");
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<Platform | "nuvemshop" | "mercadolivre" | "shopee" | null>(null);

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      toast.success({ instagram: "Instagram conectado", tiktok: "TikTok conectado", nuvemshop: "Loja Nuvemshop conectada", mercadolivre: "Mercado Livre conectado", shopee: "Shopee conectada" }[connected] ?? "Conta conectada");
    }
    if (error) toast.error(error);
    if (connected || error) setParams({}, { replace: true });
  }, [params, setParams]);

  const connect = async (platform: Platform | "nuvemshop" | "mercadolivre" | "shopee") => {
    setBusy(platform);
    try {
      const { url } = await api.invoke<{ url: string }>(`oauth-${platform}?action=start`);
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Contas" description="As redes que o Studio publica, responde e acompanha." />
      <div className="divide-y rounded-lg border bg-card">
        {(["instagram", "tiktok"] as Platform[]).map((platform) => {
          const list = accounts.filter((a) => a.platform === platform);
          return (
            <section key={platform} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
              <div className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"><PlatformIcon platform={platform} className="h-5 w-5 text-foreground" /></span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{INFO[platform].name}</h2>
                    {list.length > 0 ? <StatusDot tone="success">Conectado</StatusDot> : <StatusDot tone="neutral">Não conectado</StatusDot>}
                  </div>
                  <p className="mt-1 text-[13px] text-foreground/80">{INFO[platform].features}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{INFO[platform].note}</p>
                </div>
              </div>
              <div className="space-y-2">
                {list.map((a) => <ConnectedAccount key={a.id} account={a} onRemove={() => remove.mutate(a.id)} />)}
                <Button size="sm" className="w-full" variant={list.length ? "outline" : "default"} onClick={() => connect(platform)} disabled={busy === platform}>
                  {busy === platform && <Loader2 className="animate-spin" />}
                  {list.length ? "Conectar outra conta" : `Conectar ${INFO[platform].name}`}
                </Button>
              </div>
            </section>
          );
        })}
        <WhatsAppConnect />
        <SaleAlerts />
        <section className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"><PlatformIcon platform="nuvemshop" className="h-5 w-5 text-foreground" /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Loja Nuvemshop</h2>
                {shops.length > 0 ? <StatusDot tone="success">Conectada</StatusDot> : <StatusDot tone="neutral">Não conectada</StatusDot>}
              </div>
              <p className="mt-1 text-[13px] text-foreground/80">
                Acompanha pedidos, pagamentos e rastreio. O agente de mensagens consulta produtos, preços e estoque ao vivo e responde
                “cadê meu pedido?” quando o cliente informa o número do pedido e o e-mail da compra.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Também cadastra e edita produtos a partir das fotos (página Produtos). Pedidos são só leitura.</p>
            </div>
          </div>
          <div className="space-y-2">
            {shops.map((a) => <ConnectedAccount key={a.id} account={a} onRemove={() => remove.mutate(a.id)} />)}
            {shops.length === 0 && (
              <Button size="sm" className="w-full" onClick={() => connect("nuvemshop")} disabled={busy === "nuvemshop"}>
                {busy === "nuvemshop" && <Loader2 className="animate-spin" />}
                Conectar loja
              </Button>
            )}
          </div>
        </section>
        {MARKETPLACES.map((m) => {
          const list = accounts.filter((a) => a.platform === m.id);
          return (
            <section key={m.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
              <div className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"><Store className="h-5 w-5 text-foreground" /></span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{m.name}</h2>
                    {list.length > 0 ? <StatusDot tone="success">Conectado</StatusDot> : <StatusDot tone="neutral">Não conectado</StatusDot>}
                  </div>
                  <p className="mt-1 text-[13px] text-foreground/80">{m.text}</p>
                </div>
              </div>
              <div className="space-y-2">
                {list.map((a) => (
                  <div key={a.id} className="space-y-2">
                    <ConnectedAccount account={a} onRemove={() => remove.mutate(a.id)} />
                    <Analysis account={a} />
                  </div>
                ))}
                {list.length === 0 && (
                  <Button size="sm" className="w-full" onClick={() => connect(m.id)} disabled={busy === m.id}>
                    {busy === m.id && <Loader2 className="animate-spin" />}
                    Conectar {m.name}
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
