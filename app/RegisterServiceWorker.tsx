"use client";

import { useEffect } from "react";

// Registrazione minima, nessuna UI (vedi public/sw.js per cosa fa davvero:
// solo installabilità + pagina di cortesia offline, mai cache di dati
// finanziari). Fallita in silenzio: l'app funziona identica anche senza
// service worker, semplicemente senza installabilità/offline.
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
