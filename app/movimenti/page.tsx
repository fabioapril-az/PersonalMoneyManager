import Link from "next/link";
import { LogoutButton } from "../logout-button";
import { BottomNav } from "../BottomNav";
import { MovimentiClient } from "./MovimentiClient";

export default function MovimentiPage() {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-ink-50 px-4 py-8 pb-24 sm:px-6 sm:py-16 dark:bg-ink-950">
      <div className="w-full max-w-2xl">
        <Link href="/" className="text-sm text-ink-500 hover:underline dark:text-ink-400">
          ← Torna alla dashboard
        </Link>
      </div>
      <MovimentiClient />
      <BottomNav logoutSlot={<LogoutButton />} />
    </div>
  );
}
