import Link from "next/link";
import { auth } from "@/auth";
import { LogoutButton } from "./logout-button";
import { DashboardClient } from "./DashboardClient";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{session?.user?.email}</span>
        <div className="flex items-center gap-4">
          <Link href="/conti" className="text-sm text-zinc-600 hover:underline dark:text-zinc-300">
            Conti
          </Link>
          <Link href="/categorie" className="text-sm text-zinc-600 hover:underline dark:text-zinc-300">
            Categorie
          </Link>
          <Link href="/profilo" className="text-sm text-zinc-600 hover:underline dark:text-zinc-300">
            Profilo
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center px-6 py-16">
        <DashboardClient />
      </main>
    </div>
  );
}
