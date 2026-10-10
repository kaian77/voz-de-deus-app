import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "../lib/api";
import { useRemoveRow, useTable } from "../lib/hooks";
import type { Platform } from "../lib/types";
import { PageHeader, PlatformIcon } from "../components/bits";
import WhatsAppConnect from "../components/WhatsAppConnect";

const INFO: Record<Platform, { name: string; features: string[]; note: string }> = {
  instagram: {
    name: "Instagram",
    features: ["Publicar posts, carrosséis, reels e stories", "Responder comentários e mandar DM automática", "Agente de IA respondendo o direct", "Ler perfil, posts e engajamento"],
    note: "Precisa ser conta Profissional (Criador de conteúdo ou Empresa).",
  },
  tiktok: {
    name: "TikTok",
    features: ["Publicar vídeos", "Publicar carrossel de fotos", "Agendar no mesmo calendário"],
    note: "Até o app ser aprovado na auditoria do TikTok, os posts saem como privados (só você vê).",
  },
};

export default function Accounts() {
  const { data: accounts = [] } = useTable("social_accounts");
  const remove = useRemoveRow("social_accounts");
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<Platform | null>(null);

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) toast.success(`${connected === "instagram" ? "Instagram" : "TikTok"} conectado!`);
    if (error) toast.error(error);
    if (connected || error) setParams({}, { replace: true });
  }, [params, setParams]);

  const connect = async (platform: Platform) => {
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
      <PageHeader title="Contas" description="Conecte as redes que o Studio vai gerenciar." />
      <div className="grid gap-6 md:grid-cols-2">
        {(["instagram", "tiktok"] as Platform[]).map((platform) => {
          const list = accounts.filter((a) => a.platform === platform);
          return (
            <Card key={platform}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><PlatformIcon platform={platform} className="h-5 w-5" /> {INFO[platform].name}</CardTitle>
                <CardDescription>{INFO[platform].note}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {INFO[platform].features.map((f) => <li key={f} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> {f}</li>)}
                </ul>
                {list.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
                    {a.avatar_url ? <img src={a.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-gradient-divine" />}
                    <div className="flex-1">
                      <p className="text-sm font-semibold">@{a.username ?? a.display_name}</p>
                      <p className="text-xs text-muted-foreground">{a.followers_count != null ? `${a.followers_count.toLocaleString("pt-BR")} seguidores` : "Conectada"}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => confirm("Desconectar esta conta?") && remove.mutate(a.id)}>
                      <Unplug className="mr-1 h-4 w-4" /> Desconectar
                    </Button>
                  </div>
                ))}
                <Button className="w-full" variant={list.length ? "outline" : "default"} onClick={() => connect(platform)} disabled={busy === platform}>
                  {busy === platform && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {list.length ? "Reconectar / adicionar outra" : `Conectar ${INFO[platform].name}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
        <WhatsAppConnect />
      </div>
    </div>
  );
}
