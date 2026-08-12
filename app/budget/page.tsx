import Link from "next/link";
import { LogoutButton } from "../logout-button";
import { BottomNav } from "../BottomNav";
import { BudgetManager } from "./BudgetManager";

export default function BudgetPage() {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-ink-50 px-6 py-16 pb-24 dark:bg-ink-950">
      <div className="w-full max-w-xl">
        <Link href="/" className="text-sm text-ink-500 hover:underline dark:text-ink-400">
          ← Torna alla dashboard
        </Link>
      </div>
      <BudgetManager />
      <BottomNav logoutSlot={<LogoutButton />} />
    </div>
  );
}
