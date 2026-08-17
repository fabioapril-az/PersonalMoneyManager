import { ImageResponse } from "next/og";
import { IconArt } from "../iconArt";

// force-static: vedi il commento in app/icons/192/route.tsx.
export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(<IconArt size={512} maskable />, { width: 512, height: 512 });
}
