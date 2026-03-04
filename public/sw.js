const CACHE_NAME = "flowtime-v5";
const OFFLINE_URL = "/";
const STATIC_ASSETS = ["/", "/home", "/vie", "/famille", "/reglages"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => cache.add(OFFLINE_URL)))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;
  if (request.url.includes("/api/") || request.url.includes("supabase")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match(OFFLINE_URL)))
    );
    return;
  }

  if (request.url.match(/\.(js|css|woff2?|png|jpg|svg|ico)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        }).catch(() => new Response("", { status: 404 }));
      })
    );
    return;
  }
});

// Schedule a notification after a delay (ms)
function scheduleNotification(title, body, tag, delayMs) {
  if (delayMs <= 0) return;
  setTimeout(() => {
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag,
      renotify: true,
      vibrate: [80, 40, 80, 40, 120],
      data: { url: "/home" },
      actions: [{ action: "view", title: "Voir le planning" }],
    });
  }, delayMs);
}

// Push notifications
self.addEventListener("push", (event) => {
  let data = {
    title: "FlowTime",
    body: "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "flowtime",
    url: "/home",
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  // If morning push includes scheduled reminders, plan them
  if (data.reminders && Array.isArray(data.reminders)) {
    const now = Date.now();
    for (const r of data.reminders) {
      const delayMs = r.timestamp - now;
      if (delayMs > 0) {
        scheduleNotification(r.title, r.body, r.tag || "flowtime-reminder", delayMs);
      }
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    renotify: true,
    vibrate: [80, 40, 80, 40, 120],
    data: { url: data.url || "/home" },
    actions: data.actions || [],
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  let url = event.notification.data?.url || "/home";

  if (event.action === "view") {
    url = "/home";
  } else if (event.action === "dismiss") {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
