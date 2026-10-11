import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "../lib/api";
import { Avatar, Panel, PlatformIcon } from "./bits";

// Tela exigida pelas diretrizes de compartilhamento do TikTok (Content Posting API — Direct Post):
// mostrar a conta, privacidade escolhida pelo criador (sem padrão), interações, divulgação comercial
// e a declaração de uso de música/conteúdo de marca.

export interface TikTokCreator {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

export interface TikTokOptions {
  privacy_level?: string;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
  commercial: boolean;
  brand_organic_toggle: boolean; // Sua marca
  brand_content_toggle: boolean; // Conteúdo de marca (parceria paga)
}

export const TIKTOK_DEFAULTS: TikTokOptions = {
  privacy_level: undefined,
  disable_comment: true,
  disable_duet: true,
  disable_stitch: true,
  commercial: false,
  brand_organic_toggle: false,
  brand_content_toggle: false,
};

const PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Todos",
  MUTUAL_FOLLOW_FRIENDS: "Amigos (seguidores que você segue de volta)",
  FOLLOWER_OF_CREATOR: "Seguidores",
  SELF_ONLY: "Só eu",
};

export function useTikTokCreator(enabled: boolean) {
  return useQuery({
    queryKey: ["tiktok-creator"],
    queryFn: () => api.invoke<TikTokCreator>("ai", { action: "tiktok_creator" }),
    enabled,
    retry: false,
    staleTime: 60 * 1000,
  });
}

/** Erros que impedem publicar no TikTok com as escolhas atuais. */
export function tiktokProblem(o: TikTokOptions, creator?: TikTokCreator, videoSeconds?: number): string | null {
  if (!o.privacy_level) return "Escolha quem pode ver o post no TikTok.";
  if (o.commercial && !o.brand_organic_toggle && !o.brand_content_toggle) {
    return "Na divulgação comercial do TikTok, marque “Sua marca”, “Conteúdo de marca” ou os dois.";
  }
  if (o.brand_content_toggle && o.privacy_level === "SELF_ONLY") return "Conteúdo de marca não pode ser publicado como “Só eu”.";
  const max = creator?.max_video_post_duration_sec;
  if (max && videoSeconds && videoSeconds > max) return `Esse vídeo tem ${Math.round(videoSeconds)}s; sua conta do TikTok aceita até ${max}s.`;
  return null;
}

export function toApiOptions(o: TikTokOptions) {
  return {
    privacy_level: o.privacy_level,
    disable_comment: o.disable_comment,
    disable_duet: o.disable_duet,
    disable_stitch: o.disable_stitch,
    brand_organic_toggle: o.commercial && o.brand_organic_toggle,
    brand_content_toggle: o.commercial && o.brand_content_toggle,
  };
}

export function fromApiOptions(raw: Record<string, unknown> | undefined): TikTokOptions {
  if (!raw) return TIKTOK_DEFAULTS;
  const organic = Boolean(raw.brand_organic_toggle);
  const branded = Boolean(raw.brand_content_toggle);
  return {
    privacy_level: typeof raw.privacy_level === "string" ? raw.privacy_level : undefined,
    disable_comment: raw.disable_comment !== false,
    disable_duet: raw.disable_duet !== false,
    disable_stitch: raw.disable_stitch !== false,
    commercial: organic || branded,
    brand_organic_toggle: organic,
    brand_content_toggle: branded,
  };
}

export default function TikTokSettings({ value, onChange, isVideo }: { value: TikTokOptions; onChange: (v: TikTokOptions) => void; isVideo: boolean }) {
  const creator = useTikTokCreator(true);
  const c = creator.data;
  const set = (patch: Partial<TikTokOptions>) => onChange({ ...value, ...patch });

  const interactions: { key: "disable_comment" | "disable_duet" | "disable_stitch"; label: string; blocked?: boolean; videoOnly?: boolean }[] = [
    { key: "disable_comment", label: "Comentários", blocked: c?.comment_disabled },
    { key: "disable_duet", label: "Dueto", blocked: c?.duet_disabled, videoOnly: true },
    { key: "disable_stitch", label: "Costura", blocked: c?.stitch_disabled, videoOnly: true },
  ];

  return (
    <Panel title={<span className="flex items-center gap-2"><PlatformIcon platform="tiktok" /> Publicação no TikTok</span>}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          {creator.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : creator.error ? (
            <p className="text-xs text-danger">{(creator.error as Error).message}</p>
          ) : (
            <>
              <Avatar name={c?.creator_nickname ?? c?.creator_username} src={c?.creator_avatar_url} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">Postando como {c?.creator_nickname ?? "sua conta"}</p>
                {c?.creator_username && <p className="truncate text-xs text-muted-foreground">@{c.creator_username}</p>}
              </div>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="tt-privacy">Quem pode ver este post</Label>
          <Select value={value.privacy_level ?? ""} onValueChange={(v) => set({ privacy_level: v })} disabled={!c}>
            <SelectTrigger id="tt-privacy" className={cn("h-9", !value.privacy_level && "text-muted-foreground")}>
              <SelectValue placeholder="Escolha a privacidade" />
            </SelectTrigger>
            <SelectContent>
              {(c?.privacy_level_options ?? []).map((p) => {
                const blocked = p === "SELF_ONLY" && value.commercial && value.brand_content_toggle;
                return (
                  <SelectItem key={p} value={p} disabled={blocked}>
                    {PRIVACY_LABEL[p] ?? p}{blocked ? " (indisponível para conteúdo de marca)" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {c?.max_video_post_duration_sec && isVideo && (
            <p className="text-xs text-muted-foreground">Sua conta aceita vídeos de até {c.max_video_post_duration_sec} segundos.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Permitir que as pessoas</Label>
          <div className="flex flex-wrap gap-4">
            {interactions.filter((i) => isVideo || !i.videoOnly).map((i) => (
              <label key={i.key} className={cn("flex items-center gap-2 text-[13px]", i.blocked && "opacity-50")}>
                <Checkbox checked={!value[i.key] && !i.blocked} disabled={i.blocked} onCheckedChange={(v) => set({ [i.key]: !v } as Partial<TikTokOptions>)} />
                {i.label}
                {i.blocked && <span className="text-xs text-muted-foreground">(desativado na sua conta)</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <label htmlFor="tt-commercial" className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[13px] font-medium">Divulgação de conteúdo comercial</span>
              <span className="block text-xs text-muted-foreground">Ative se o post promove você, uma marca, produto ou serviço.</span>
            </span>
            <Switch id="tt-commercial" checked={value.commercial} onCheckedChange={(v) => set({ commercial: v, ...(v ? {} : { brand_organic_toggle: false, brand_content_toggle: false }) })} />
          </label>
          {value.commercial && (
            <div className="space-y-2 border-t pt-3">
              <label className="flex items-start gap-2 text-[13px]">
                <Checkbox className="mt-0.5" checked={value.brand_organic_toggle} onCheckedChange={(v) => set({ brand_organic_toggle: Boolean(v) })} />
                <span>
                  <span className="font-medium">Sua marca</span>
                  <span className="block text-xs text-muted-foreground">Você está promovendo você mesmo ou o seu negócio. O post será marcado como “Conteúdo promocional”.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[13px]">
                <Checkbox
                  className="mt-0.5"
                  checked={value.brand_content_toggle}
                  onCheckedChange={(v) => set({ brand_content_toggle: Boolean(v), ...(v && value.privacy_level === "SELF_ONLY" ? { privacy_level: undefined } : {}) })}
                />
                <span>
                  <span className="font-medium">Conteúdo de marca</span>
                  <span className="block text-xs text-muted-foreground">Você está promovendo outra marca em troca de algo. O post será marcado como “Parceria paga”.</span>
                </span>
              </label>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Ao publicar, você concorda com a{" "}
          {value.commercial && value.brand_content_toggle && (
            <>
              <a className="underline underline-offset-2" href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Política de Conteúdo de Marca</a> e a{" "}
            </>
          )}
          <a className="underline underline-offset-2" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Confirmação de Uso de Música</a> do TikTok.
          Depois de publicado, o post pode levar alguns minutos para aparecer no seu perfil.
        </p>
      </div>
    </Panel>
  );
}
