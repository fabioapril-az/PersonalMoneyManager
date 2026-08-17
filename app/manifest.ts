import type { MetadataRoute } from "next";

// PWA (gap segnalato in precedenza): nome/icone/colori per l'installazione
// da telefono. Le icone sono generate via next/og (app/icons/*/route.tsx),
// non file statici — stesso stile/colore dell'app senza dover mantenere
// asset separati. Next registra automaticamente questo file come
// /manifest.webmanifest e aggiunge da solo il <link rel="manifest"> in
// <head> — nessun riferimento manuale necessario in app/layout.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Personal Money Manager",
    short_name: "Money Manager",
    description: "Quanto ho speso, dove, e quanto posso ancora spendere.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef7f5", // --background (light), app/globals.css
    theme_color: "#eef7f5",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
