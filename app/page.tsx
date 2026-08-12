import { auth } from "@/auth";
import { LogoutButton } from "./logout-button";
import { BottomNav } from "./BottomNav";
import { DashboardClient } from "./DashboardClient";

export default async function Home() {
  const session = await auth();

  // h-dvh + overflow-hidden: la pagina in sé non scorre più — è
  // DashboardClient che divide altezza fissa (intestazione) e area con
  // scroll proprio (il resto), non un position: sticky che comunque si
  // sposta finché non raggiunge il margine.
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-50 dark:bg-ink-950">
      <header className="px-4 py-3 sm:px-6">
        <span className="min-w-0 truncate text-sm text-ink-500 dark:text-ink-400">{session?.user?.email}</span>
      </header>
      <main className="flex min-h-0 flex-1 flex-col items-center px-4 pt-2 sm:px-6 sm:pt-4">
        <DashboardClient />
      </main>
      <BottomNav logoutSlot={<LogoutButton />} />
    </div>
  );
}
