import Link from "next/link";
import { auth } from "@/auth";
import { createServerCaller } from "@/lib/trpc/server-caller";
import { LogoutButton } from "./logout-button";

// The current period depends on "now" (PRD section 3/11) — must be computed
// per-request, not baked in at build time, or it would stay frozen at
// whatever date the app happened to be built on.
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

export default async function Home() {
  const session = await auth();
  const trpc = await createServerCaller();
  const period = await trpc.period.current();

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
        <div className="flex w-full max-w-xl flex-col gap-2 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Periodo corrente
          </p>
          <h1 className="text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
            {dateFormatter.format(new Date(period.start))} → {dateFormatter.format(new Date(period.end))}
          </h1>
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            Fase 1 in corso: l&apos;inserimento rapido di Expense/Income arriva nel prossimo step.
          </p>
        </div>
      </main>
    </div>
  );
}
