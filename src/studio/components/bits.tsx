import { useEffect, useState, type ReactNode } from "react";
import { Instagram, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderSlide } from "../lib/carousel";
import type { CarouselDesign, Platform, PostKind, PostStatus, Slide } from "../lib/types";

/** Aplica a identidade do Studio no <html> enquanto o painel está montado. */
export function useStudioTheme() {
  useEffect(() => {
    document.documentElement.classList.add("studio-theme");
    const previous = document.title;
    document.title = "Social Studio";
    return () => {
      document.documentElement.classList.remove("studio-theme");
      document.title = previous;
    };
  }, []);
}

export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("h-4 w-4", className)} aria-hidden>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1 0-5.18c.27 0 .53.04.77.12V9.7a5.7 5.7 0 0 0-.77-.05 5.68 5.68 0 1 0 5.68 5.68V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.24-1.48Z" />
    </svg>
  );
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("h-4 w-4", className)} aria-hidden>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A9.9 9.9 0 1 0 12.04 2Zm5.8 14.1c-.25.7-1.45 1.33-2 1.4-.52.08-1.17.11-1.89-.12-.43-.14-1-.32-1.7-.63-3-1.3-4.96-4.32-5.1-4.52-.15-.2-1.22-1.62-1.22-3.1 0-1.47.77-2.2 1.05-2.5.27-.3.6-.37.8-.37h.57c.18 0 .43-.07.67.51.25.6.84 2.07.92 2.22.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.38-.45.51-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.01 2.1 1.33 2.4 1.48.3.15.47.12.65-.08.17-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.73.82 2.03.97.3.15.5.22.57.35.08.12.08.72-.17 1.42Z" />
    </svg>
  );
}

/** Ícones de rede em tom neutro — a cor fica para estados, não para logos. */
export function PlatformIcon({ platform, className }: { platform: Platform | "whatsapp" | "nuvemshop"; className?: string }) {
  const cls = cn("h-3.5 w-3.5 text-foreground/70", className);
  if (platform === "instagram") return <Instagram className={cls} strokeWidth={1.9} />;
  if (platform === "whatsapp") return <WhatsAppIcon className={cls} />;
  if (platform === "nuvemshop") return <ShoppingBag className={cls} strokeWidth={1.9} />;
  return <TikTokIcon className={cls} />;
}

export const PLATFORM_LABEL = { instagram: "Instagram", tiktok: "TikTok", whatsapp: "WhatsApp", nuvemshop: "Nuvemshop" } as const;

export const KIND_LABEL: Record<PostKind, string> = {
  image: "Imagem",
  carousel: "Carrossel",
  reel: "Reels",
  story: "Story",
  video: "Vídeo",
  photos: "Fotos",
};

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";
const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground/50",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function StatusDot({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-foreground/80", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} />
      {children}
    </span>
  );
}

export const STATUS: Record<PostStatus, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "neutral" },
  pending_approval: { label: "Para aprovar", tone: "warning" },
  scheduled: { label: "Agendado", tone: "brand" },
  publishing: { label: "Publicando", tone: "brand" },
  published: { label: "Publicado", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
};

export function StatusBadge({ status }: { status: PostStatus }) {
  return <StatusDot tone={STATUS[status].tone}>{STATUS[status].label}</StatusDot>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Bloco com borda e cabeçalho fino — o "cartão" padrão do Studio. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground", className)}>{children}</p>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border bg-card text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, src, className }: { name?: string | null; src?: string | null; className?: string }) {
  const initials = (name ?? "?").replace(/^@/, "").split(/[\s._]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  if (src) return <img src={src} alt="" className={cn("h-8 w-8 shrink-0 rounded-full object-cover", className)} />;
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground/70", className)}>
      {initials}
    </span>
  );
}

/** Miniatura de um slide renderizado no mesmo motor que gera os JPEGs finais. */
export function SlidePreview({ slide, index, total, design, className }: { slide: Slide; index: number; total: number; design?: CarouselDesign | null; className?: string }) {
  const [src, setSrc] = useState<string>();
  const key = JSON.stringify([slide, index, total, design]);
  useEffect(() => {
    let alive = true;
    renderSlide(slide, index, total, design ?? {}).then((c) => {
      if (alive) setSrc(c.toDataURL("image/jpeg", 0.7));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div className={cn("aspect-[4/5] overflow-hidden rounded-md bg-muted", className)}>
      {src && <img src={src} alt={slide.title} className="h-full w-full object-cover" />}
    </div>
  );
}

/** Só a primeira letra maiúscula ("Outubro de 2026", não "Outubro De 2026"). */
export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "Sem data";
  return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "");
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(/\./g, "");
}

export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
