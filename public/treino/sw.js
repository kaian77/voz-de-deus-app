// Service worker do app FORMA (/treino): só os avisos de lembrete de treino. Sem cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "FORMA" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "FORMA", {
      body: data.body || "",
      icon: "/treino/icon-192.png",
      badge: "/treino/icon-192.png",
      vibrate: [120, 60, 120],
      data: { url: data.url || "/treino" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/treino", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.includes("/treino"));
      if (open) return open.focus();
      return self.clients.openWindow(url);
    }),
  );
});
