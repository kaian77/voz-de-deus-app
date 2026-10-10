import { api } from "./api";
import { renderSlidesToJpeg } from "./carousel";
import type { CarouselDesign, MediaItem, Slide } from "./types";

/** Renderiza os slides desenhados em JPEG e envia para o storage, devolvendo a lista de mídias. */
export async function renderAndUploadSlides(slides: Slide[], design?: CarouselDesign | null): Promise<MediaItem[]> {
  const blobs = await renderSlidesToJpeg(slides, design ?? {});
  const media: MediaItem[] = [];
  for (let i = 0; i < blobs.length; i++) {
    media.push({ url: await api.upload(blobs[i], `slide-${i + 1}.jpg`), type: "image" });
  }
  return media;
}
