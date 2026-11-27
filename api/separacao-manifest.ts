// Manifesto do app "Separação" da equipe: instalar no celular (tela inicial) abrindo direto em /studio/separacao/<chave>.
// A chave vem do link da equipe; aqui só é conferido o formato (quem valida é a function `packing`).
import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const k = new URL(req.url ?? "/", "http://x").searchParams.get("k") ?? "";
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(k)) {
    res.statusCode = 404;
    res.end("{}");
    return;
  }
  const path = `/studio/separacao/${k}`;
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.end(JSON.stringify({
    id: path,
    name: "Separação Brax",
    short_name: "Separação",
    description: "Mostre a etiqueta e o app fala o que vai no pacote.",
    start_url: path,
    scope: path,
    display: "standalone",
    orientation: "portrait",
    background_color: "#d9bf94",
    theme_color: "#151310",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }));
}
