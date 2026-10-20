import { api } from "./api";
import { renderSlidesToJpeg } from "./carousel";
import { renderReel } from "./reel";
import type { CarouselDesign, MediaItem, Post, Slide } from "./types";

/** Renderiza os slides desenhados em JPEG e envia para o storage, devolvendo a lista de mídias. */
export async function renderAndUploadSlides(slides: Slide[], design?: CarouselDesign | null): Promise<MediaItem[]> {
  const blobs = await renderSlidesToJpeg(slides, design ?? {});
  const media: MediaItem[] = [];
  for (let i = 0; i < blobs.length; i++) {
    media.push({ url: await api.upload(blobs[i], `slide-${i + 1}.jpg`), type: "image" });
  }
  return media;
}

/** Mídia de um post criado pela IA: Reel com slides vira MP4 gravado no navegador; carrossel vira JPEGs. */
export async function renderPostMedia(post: Pick<Post, "kind" | "slides" | "media" | "design">): Promise<MediaItem[]> {
  if (!post.slides?.length || post.media.length) return post.media;
  if (post.kind === "reel") return [{ url: await api.upload(await renderReel(post.slides, post.design ?? {}), "reel.mp4"), type: "video" }];
  return renderAndUploadSlides(post.kind === "carousel" ? post.slides : post.slides.slice(0, 1), post.design);
}
