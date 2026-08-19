// Service worker deliberatamente minimo — per un'app di dati finanziari, la
// cosa peggiore che potrebbe fare è mostrare un saldo/importo non aggiornato
// senza che sia ovvio che è vecchio. Quindi:
//
//   - NIENTE cache di chiamate tRPC/API o pagine autenticate: sempre e solo
//     dalla rete vera.
//   - L'unico scopo è (1) rendere l'app installabile (Chrome/Android richiede
//     un service worker con un fetch handler) e (2) mostrare una pagina di
//     cortesia offline (/offline) invece dell'errore generico del browser
//     quando manca la connessione durante la navigazione.
const OFFLINE_URL = "/offline";
const CACHE_NAME = "pmm-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Solo le navigazioni (caricamento di una pagina intera) — mai gli asset,
  // mai le chiamate tRPC: quelle devono sempre fallire "in chiaro" se manca
  // la rete, non essere sostituite silenziosamente da qualcosa di vecchio.
  if (event.request.mode !== "navigate") return;

  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

// Notifiche di sicurezza (tentativi di login falliti/blocchi — server/
// sendSecurityPush.ts) — mai dati finanziari nel payload, solo un titolo e
// un testo breve già pensati per essere mostrati così come sono.
self.addEventListener("push", (event) => {
  let data = { title: "Personal Money Manager", body: "" };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // Payload non in JSON: mostra comunque qualcosa invece di far fallire l'evento.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/192",
      badge: "/icons/192",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/accessi"));
});
