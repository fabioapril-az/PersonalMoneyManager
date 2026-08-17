import { ImageResponse } from "next/og";
import { IconArt } from "./icons/iconArt";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<IconArt size={32} />, { ...size });
}
