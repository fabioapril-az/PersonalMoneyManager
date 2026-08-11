import Link from "next/link";
import { auth } from "@/auth";
import { LogoutButton } from "./logout-button";
import { DashboardClient } from "./DashboardClient";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 px-4 py-4 sm:px-6">
        <span className="min-w-0 truncate text-sm text-zinc-500 dark:text-zinc-400">{session?.user?.email}</span>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Link href="/conti" className="text-sm text-zinc-600 hover:underline dark:text-zinc-300">
            Conti
          </Link>
          <Link href="/categorie" className="text-sm text-zinc-600 hover:underline dark:text-zinc-300">
            Categorie
          </Link>
          <Link href="/budget" className="text-sm text-zinc-600 hover:underline dark:text-zinc-300">
            Budget
          </Link>
          <Link href="/report" className="text-sm text-zinc-600 hover:underline dark:text-zinc-300">
            Report
          </Link>
          <Link href="/profilo" className="text-sm text-zinc-600 hover:underline dark:text-zinc-300">
            Profilo
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 py-8 sm:px-6 sm:py-16">
        <DashboardClient />
      </main>
    </div>
  );
}
