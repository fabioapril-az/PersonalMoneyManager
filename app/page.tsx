import { auth } from "@/auth";
import { LogoutButton } from "./logout-button";
import { BottomNav } from "./BottomNav";
import { DashboardClient } from "./DashboardClient";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col bg-ink-50 dark:bg-ink-950">
      <header className="px-4 py-3 sm:px-6">
        <span className="min-w-0 truncate text-sm text-ink-500 dark:text-ink-400">{session?.user?.email}</span>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pt-2 pb-24 sm:px-6 sm:pt-4">
        <DashboardClient />
      </main>
      <BottomNav logoutSlot={<LogoutButton />} />
    </div>
  );
}
