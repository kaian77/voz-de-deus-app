import { Film, Heart, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IgMedia } from "../lib/types";

export function IgMediaTile({ media, selected, onClick, className }: { media: IgMedia; selected?: boolean; onClick?: () => void; className?: string }) {
  const src = media.thumbnail_url ?? (media.media_type === "VIDEO" ? undefined : media.media_url);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("group relative aspect-[4/5] w-full overflow-hidden rounded-sm bg-gradient-to-br from-slate-200 to-slate-300", selected && "ring-4 ring-primary", className)}
    >
      {src ? (
        <img src={src} alt={media.caption?.slice(0, 60) ?? ""} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-[10px] text-slate-600">{media.caption?.slice(0, 40)}</span>
      )}
      {media.media_product_type === "REELS" && <Film className="absolute right-1 top-1 h-3.5 w-3.5 text-white drop-shadow" />}
      <span className="absolute inset-0 flex items-center justify-center gap-3 bg-black/50 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
        <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {media.like_count ?? 0}</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {media.comments_count ?? 0}</span>
      </span>
    </button>
  );
}
