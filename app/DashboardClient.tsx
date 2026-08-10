"use client";

import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/card";
import { NewExpenseDialog } from "./NewExpenseDialog";
import { NewIncomeDialog } from "./NewIncomeDialog";

const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });
const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function formatAmount(value: unknown) {
  return currencyFormatter.format(Number(value));
}

export function DashboardClient() {
  const { data, isLoading } = trpc.dashboard.summary.useQuery();

  if (isLoading || !data) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Caricamento…</p>;
  }

  const { period, totalIncome, totalExpense, available, accounts, recentExpenses, recentIncomes } = data;

  const recentMovements = [
    ...recentExpenses.map((e) => ({
      id: e.id,
      date: e.date,
      label: e.description,
      sublabel: e.category.icon ? `${e.category.icon} ${e.category.name}` : e.category.name,
      amount: -Number(e.amount),
    })),
    ...recentIncomes.map((i) => ({
      id: i.id,
      date: i.date,
      label: i.source,
      sublabel: null,
      amount: Number(i.amount),
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Periodo corrente
        </p>
        <h1 className="text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
          {dateFormatter.format(new Date(period.start))} → {dateFormatter.format(new Date(period.end))}
        </h1>
      </div>

      <div className="flex justify-center gap-3">
        <NewExpenseDialog />
        <NewIncomeDialog />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="flex flex-col gap-1 p-4 text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Entrate</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {formatAmount(totalIncome)}
          </p>
        </Card>
        <Card className="flex flex-col gap-1 p-4 text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Spese</p>
          <p className="text-lg font-semibold text-red-600 dark:text-red-400">{formatAmount(totalExpense)}</p>
        </Card>
        <Card className="flex flex-col gap-1 p-4 text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Disponibile</p>
          <p className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{formatAmount(available)}</p>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Saldo conti</h2>
        {accounts.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nessun conto ancora — vai su &quot;Conti&quot; per crearne uno.
          </p>
        )}
        {accounts.map((account) => (
          <Card key={account.id} className="flex flex-row items-center justify-between p-3">
            <span className="text-sm text-zinc-800 dark:text-zinc-200">{account.name}</span>
            <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              {formatAmount(account.balance)}
            </span>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Movimenti recenti</h2>
        {recentMovements.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nessun movimento in questo periodo — usa i pulsanti sopra per iniziare.
          </p>
        )}
        {recentMovements.map((movement) => (
          <Card key={movement.id} className="flex flex-row items-center justify-between p-3">
            <div>
              <p className="text-sm text-zinc-800 dark:text-zinc-200">{movement.label}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {dateFormatter.format(new Date(movement.date))}
                {movement.sublabel ? ` · ${movement.sublabel}` : ""}
              </p>
            </div>
            <span
              className={`text-sm font-medium ${
                movement.amount < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {formatAmount(movement.amount)}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
