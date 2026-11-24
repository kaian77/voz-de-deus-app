// Service worker do Cantinho do bebê (/bebe/): deixa o app abrir sem internet depois da 1ª visita.
// Página: rede primeiro (pega versão nova), cópia guardada se estiver sem internet. Arquivos com hash (/assets/),
// ícones e o leitor de nota (tesseract, do jsDelivr): cópia guardada primeiro.
const CACHE = "cantinho-v2";
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

// avisos (mêsversário, fraldas, compromissos, remédios) mandados pela função `bebe`
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Cantinho do bebê" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Cantinho do bebê", {
      body: data.body || "",
      icon: "/bebe/icon-192.png",
      badge: "/bebe/icon-192.png",
      data: { url: data.url || "/bebe/" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/bebe/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.includes("/bebe")) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
