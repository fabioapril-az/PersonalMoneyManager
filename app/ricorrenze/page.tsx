import Link from "next/link";
import { LogoutButton } from "../logout-button";
import { BottomNav } from "../BottomNav";
import { RecurringTemplatesManager } from "./RecurringTemplatesManager";

export default function RicorrenzePage() {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-ink-50 px-6 py-16 pb-24 dark:bg-ink-950">
      <div className="w-full max-w-xl">
        <Link href="/" className="text-sm text-ink-500 hover:underline dark:text-ink-400">
          ← Torna alla dashboard
        </Link>
      </div>
      <RecurringTemplatesManager />
      <BottomNav logoutSlot={<LogoutButton />} />
    </div>
  );
}
