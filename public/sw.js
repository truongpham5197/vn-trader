// Service worker — chỉ nhận push. Không cache trang: bấm tab mà lấy HTML cũ
// rồi Next vẽ thêm một lớp → menu/nội dung bị trùng.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const networkOnly = (req) =>
  req.mode === "navigate" ||
  req.headers.get("RSC") === "1" ||
  req.headers.has("Next-Router-Prefetch") ||
  req.headers.has("Next-Router-State-Tree") ||
  req.headers.has("Next-Url");

self.addEventListener("fetch", (e) => {
  if (!networkOnly(e.request)) return;
  e.respondWith(fetch(e.request, { cache: "no-store" }).catch(() => fetch(e.request)));
});

self.addEventListener("push", (e) => {
  const d = (() => {
    try {
      return e.data ? e.data.json() : {};
    } catch {
      return { title: "VN Trader", body: e.data ? e.data.text() : "" };
    }
  })();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      if (!d.force && cs.some((c) => c.visibilityState === "visible" && c.focused)) return;
      return self.registration.showNotification(d.title || "VN Trader", {
        body: d.body || "",
        tag: d.tag,
        renotify: d.level === "danger" || d.level === "warn", // thay tin cũ vẫn rung lại (thẻ cùng tag)
        requireInteraction: d.level === "danger", // cắt lỗ/kill switch giữ trên màn hình tới khi bấm
        data: { url: d.url || "/" },
        icon: "/icon-192.png",
        badge: "/icon-192.png",
      });
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const c = cs.find((x) => x.url.startsWith(self.location.origin));
      if (c) return c.focus().then((w) => (w || c).navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
