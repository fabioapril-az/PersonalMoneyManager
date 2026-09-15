"use client";

import { Card } from "@/components/ui/card";

// timeZone: "UTC" — vedi il commento sull'omonimo dateFormatter in
// DashboardClient.tsx: i confini di periodo/settimana sono mezzanotte UTC,
// senza forzare il fuso qui il browser li fa scivolare al giorno dopo.
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });
const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function formatAmount(value: unknown) {
  return currencyFormatter.format(Number(value));
}

type WeekBudgetItem = {
  no: number;
  start: Date | string;
  end: Date | string;
  spent: number;
  baseBudget: number;
  adjustedBudget: number;
  isFinal: boolean;
};

// Stessa barra ambra/corallo di BudgetBar (DashboardClient.tsx), qui riusata
// sia per il totale del mese sia per ciascuna settimana.
function ProgressBar({ percentUsed }: { percentUsed: number }) {
  const overBudget = percentUsed > 100;
  return (
    <div className="h-1.5 w-full rounded-full bg-ink-200 dark:bg-ink-800">
      <div
        className={`h-1.5 rounded-full ${overBudget ? "bg-coral-600 dark:bg-coral-400" : "bg-amber-500 dark:bg-amber-400"}`}
        style={{ width: `${Math.min(100, Math.max(0, percentUsed))}%` }}
      />
    </div>
  );
}

// "Quanto posso ancora spendere prima del prossimo stipendio?" (PRD sezione
// 1) letta settimana per settimana, invece che solo a fine periodo — sopra,
// il confronto sull'intero mese per contesto; sotto, le 4 settimane fisse
// del periodo mostrato (non settimane solari — vedi weeklyBudget in
// server/routers/report.ts).
//
// Budget "adattivo": una settimana già conclusa che sfora o risparmia
// rispetto al proprio budget sposta la differenza sulle settimane ancora da
// venire (lib/domain/budget.ts: computeAdaptiveWeeklyBudget) — la barra di
// ogni settimana confronta "spent" con "adjustedBudget", non con una
// semplice divisione fissa per 4. Quando i due differiscono, il budget
// base resta visibile tra parentesi per capire da dove arriva la modifica.
export function WeeklyBudgetSection({
  weeks,
  monthlyBudget,
  budgetSpent,
  isCurrentPeriod,
}: {
  weeks: WeekBudgetItem[];
  monthlyBudget: unknown;
  budgetSpent: unknown;
  isCurrentPeriod: boolean;
}) {
  if (monthlyBudget == null) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-ink-500 dark:text-ink-400">Budget settimanale</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Imposta un Budget mensile (pagina &quot;Budget&quot;) per vedere l&apos;andamento settimanale.
        </p>
      </div>
    );
  }

  const monthlyBudgetNumber = Number(monthlyBudget);
  const budgetSpentNumber = Number(budgetSpent);
  const monthPercentUsed = monthlyBudgetNumber > 0 ? (budgetSpentNumber / monthlyBudgetNumber) * 100 : 0;
  const now = new Date();

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink-500 dark:text-ink-400">Budget settimanale</h2>

      <Card className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-800 dark:text-ink-200">Intero periodo</span>
          <span className="text-xs text-ink-500 dark:text-ink-400">
            {formatAmount(budgetSpentNumber)} / {formatAmount(monthlyBudgetNumber)}
          </span>
        </div>
        <ProgressBar percentUsed={monthPercentUsed} />
      </Card>

      <div className="flex flex-col gap-2">
        {weeks.map((week) => {
          const percentUsed = week.adjustedBudget > 0 ? (week.spent / week.adjustedBudget) * 100 : 0;
          const start = new Date(week.start);
          const end = new Date(week.end);
          const isCurrentWeek = isCurrentPeriod && now >= start && now <= end;
          const isAdjusted = Math.abs(week.adjustedBudget - week.baseBudget) >= 0.01;
          return (
            <Card
              key={week.no}
              className={`flex flex-col gap-1.5 p-3 ${isCurrentWeek ? "ring-1 ring-teal-500 dark:ring-teal-400" : ""}`}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-800 dark:text-ink-200">
                  Settimana {week.no}
                  {isCurrentWeek && (
                    <span className="ml-1.5 text-xs font-normal text-teal-600 dark:text-teal-400">· in corso</span>
                  )}
                  {week.isFinal && !isCurrentWeek && (
                    <span className="ml-1.5 text-xs font-normal text-ink-400 dark:text-ink-500">· conclusa</span>
                  )}
                </span>
                <span className="text-xs text-ink-500 dark:text-ink-400">
                  {dateFormatter.format(start)} → {dateFormatter.format(end)}
                </span>
              </div>
              <ProgressBar percentUsed={percentUsed} />
              <span className="text-xs text-ink-500 dark:text-ink-400">
                {formatAmount(week.spent)} / {formatAmount(week.adjustedBudget)}
                {isAdjusted && ` (base ${formatAmount(week.baseBudget)})`}
              </span>
            </Card>
          );
        })}
        <p className="text-xs text-ink-400 dark:text-ink-500">
          Una settimana conclusa che sfora o risparmia sposta la differenza sulle settimane successive, abbassando o
          alzando il loro budget.
        </p>
      </div>
    </div>
  );
}
