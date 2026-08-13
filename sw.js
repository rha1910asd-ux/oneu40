// 서비스 워커 — 두 가지 역할을 한다.
// 1) 앱을 "홈 화면에 추가"할 수 있게 만들어준다(안드로이드 크롬은 설치 가능하려면
//    서비스 워커가 있어야 한다 — 실제로 오프라인 캐싱을 하지 않아도 등록만 되어있으면 된다).
// 2) 푸시 알림이 오면 화면에 띄운다.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (_) {
    payload = { title: "오느", body: event.data.text() };
  }

  const title = payload.title || "오느";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림을 누르면 해당 화면으로 이동(이미 열려있는 탭이 있으면 그걸 포커스한다)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
