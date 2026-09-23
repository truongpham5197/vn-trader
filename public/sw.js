// Service worker — nhận thông báo đẩy (Web Push) khi web đang đóng / tab ẩn.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
      // Đang mở & nhìn thấy web → chuông/toast trong trang đã báo, khỏi hiện trùng
      if (cs.some((c) => c.visibilityState === "visible" && c.focused)) return;
      return self.registration.showNotification(d.title || "VN Trader", {
        body: d.body || "",
        tag: d.tag,
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
