import { ImageResponse } from "next/og";
import { IconArt } from "../iconArt";

// URL stabile referenziata da app/manifest.ts — non la convenzione speciale
// app/icon.tsx (una sola taglia, hash generato), qui serve un percorso fisso
// e prevedibile per l'array "icons" del manifest.
//
// force-static: l'icona non cambia mai a runtime — senza questo, un Route
// Handler "normale" (a differenza di icon.tsx/apple-icon.tsx) è dinamico di
// default e rigenera il PNG a ogni richiesta invece di servirlo dalla cache
// generata al build.
export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(<IconArt size={192} />, { width: 192, height: 192 });
}
