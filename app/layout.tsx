import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TrpcProvider } from "@/lib/trpc/Provider";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "./RegisterServiceWorker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Money Manager",
  description: "Quanto ho speso, dove, e quanto posso ancora spendere.",
  // manifest.icons (app/manifest.ts) copre l'installazione Android/desktop;
  // iOS storicamente ignora il manifest per "Aggiungi a Home" e vuole questi
  // meta tag specifici per aprirsi in standalone invece che dentro Safari.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Money Manager",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef7f5" }, // --background chiaro
    { media: "(prefers-color-scheme: dark)", color: "#101917" }, // --background scuro
  ],
  // Senza viewport-fit=cover, ogni env(safe-area-inset-*) usato in
  // app/BottomNav.tsx risolve sempre a 0 — il meta tag viewport di default
  // non fa "arrivare" il contenuto sotto l'indicatore home del telefono.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TrpcProvider>{children}</TrpcProvider>
        <Toaster />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
