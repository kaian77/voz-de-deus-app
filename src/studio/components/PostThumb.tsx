import { Film, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Post } from "../lib/types";
import { SlidePreview } from "./bits";

/** Capa do post: primeira mídia, ou primeiro slide desenhado, ou um placeholder. */
export function PostThumb({ post, className }: { post: Post; className?: string }) {
  const first = post.media?.[0];
  if (first?.type === "image") {
    return <img src={first.url} alt="" className={cn("aspect-[4/5] w-full rounded-md object-cover", className)} />;
  }
  if (first?.type === "video" && first.removed) {
    return (
      <div className={cn("flex aspect-[4/5] w-full flex-col items-center justify-center gap-1 rounded-md bg-muted text-xs text-muted-foreground", className)}>
        <Film className="h-5 w-5" />
        Vídeo publicado
      </div>
    );
  }
  if (first?.type === "video") {
    return (
      <div className={cn("relative aspect-[4/5] w-full overflow-hidden rounded-md bg-black", className)}>
        <video src={first.url} className="h-full w-full object-cover" muted preload="metadata" />
        <Film className="absolute right-2 top-2 h-4 w-4 text-white" />
      </div>
    );
  }
  if (post.slides?.length) {
    return <SlidePreview slide={post.slides[0]} index={0} total={post.slides.length} design={post.design} className={className} />;
  }
  return (
    <div className={cn("flex aspect-[4/5] w-full items-center justify-center rounded-md bg-muted text-muted-foreground", className)}>
      <ImageIcon className="h-6 w-6" />
    </div>
  );
}
