import { createServerCaller } from "@/lib/trpc/server-caller";

const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

export default async function Home() {
  const trpc = await createServerCaller();
  const period = await trpc.period.current();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-2 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Periodo corrente
        </p>
        <h1 className="text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
          {dateFormatter.format(new Date(period.start))} → {dateFormatter.format(new Date(period.end))}
        </h1>
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Fase 1 in corso: dashboard, expense/income e autenticazione arrivano nei prossimi step.
        </p>
      </main>
    </div>
  );
}
