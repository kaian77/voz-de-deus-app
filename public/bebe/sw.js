// Service worker do Cantinho do bebê (/bebe/): deixa o app abrir sem internet depois da 1ª visita.
// Página: rede primeiro (pega versão nova), cópia guardada se estiver sem internet. Arquivos com hash (/assets/),
// ícones e o leitor de nota (tesseract, do jsDelivr): cópia guardada primeiro.
const CACHE = "cantinho-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/bebe/", copy));
          return res;
        })
        .catch(() => caches.match("/bebe/")),
    );
    return;
  }
  const same = url.origin === location.origin;
  const keep = (same && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/bebe/"))) || url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "tessdata.projectnaptha.com";
  if (!keep) return;
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === "opaque") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
