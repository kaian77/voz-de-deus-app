import { useEffect, useState, type ReactNode } from "react";
import { Instagram } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { renderSlide } from "../lib/carousel";
import type { CarouselDesign, Platform, PostKind, PostStatus, Slide } from "../lib/types";

export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("h-4 w-4", className)} aria-hidden>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1 0-5.18c.27 0 .53.04.77.12V9.7a5.7 5.7 0 0 0-.77-.05 5.68 5.68 0 1 0 5.68 5.68V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.24-1.48Z" />
    </svg>
  );
}

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  return platform === "instagram" ? <Instagram className={cn("h-4 w-4 text-pink-600", className)} /> : <TikTokIcon className={className} />;
}

export const KIND_LABEL: Record<PostKind, string> = {
  image: "Imagem",
  carousel: "Carrossel",
  reel: "Reels",
  story: "Story",
  video: "Vídeo",
  photos: "Fotos (TikTok)",
};

const STATUS: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-slate-100 text-slate-700 border-slate-200" },
  pending_approval: { label: "Aguardando aprovação", className: "bg-amber-100 text-amber-800 border-amber-200" },
  scheduled: { label: "Agendado", className: "bg-blue-100 text-blue-800 border-blue-200" },
  publishing: { label: "Publicando…", className: "bg-violet-100 text-violet-800 border-violet-200" },
  published: { label: "Publicado", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  failed: { label: "Falhou", className: "bg-red-100 text-red-800 border-red-200" },
};

export function StatusBadge({ status }: { status: PostStatus }) {
  const s = STATUS[status];
  return (
    <Badge variant="outline" className={cn("font-medium", s.className)}>
      {s.label}
    </Badge>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center">
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
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

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "Sem data";
  return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
