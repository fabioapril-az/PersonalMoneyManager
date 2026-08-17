// Precaricata dal service worker all'installazione (public/sw.js) e servita
// al posto dell'errore generico del browser quando manca la connessione
// durante una navigazione — esclusa dal controllo di autenticazione
// (proxy.ts) apposta: deve restare raggiungibile anche se il controllo del
// login stesso non può avvenire (offline). Nessun dato, nessuna chiamata
// tRPC: solo testo statico.
export default function OfflinePage() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-ink-50 px-6 text-center dark:bg-ink-950">
      <p className="text-4xl">📡</p>
      <h1 className="text-lg font-semibold text-ink-950 dark:text-ink-50">Sei offline</h1>
      <p className="max-w-xs text-sm text-ink-500 dark:text-ink-400">
        Serve una connessione per vedere i tuoi dati aggiornati. Riprova appena torni online.
      </p>
    </div>
  );
}
