import { ImageResponse } from "next/og";
import { IconArt } from "./icons/iconArt";

// 180x180: taglia raccomandata per l'icona da schermata Home su iOS.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IconArt size={180} />, { ...size });
}
