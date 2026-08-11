"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });
const monthFormatter = new Intl.DateTimeFormat("it-IT", { month: "short" });
const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function formatAmount(value: unknown) {
  return currencyFormatter.format(Number(value));
}

type CategoryBreakdownItem = {
  categoryId: string;
  name: string;
  icon: string | null;
  amount: unknown;
  percent: number;
};

// Barra relativa alla categoria più spesa del periodo (non al totale): così
// anche una sola categoria che vale il 90% delle spese riempie la barra
// senza schiacciare visivamente tutte le altre a zero.
function CategoryBar({ item, maxAmount }: { item: CategoryBreakdownItem; maxAmount: number }) {
  const widthPct = maxAmount > 0 ? (Number(item.amount) / maxAmount) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">
          {item.icon ? `${item.icon} ` : ""}
          {item.name}
        </span>
        <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
          {formatAmount(item.amount)} · {item.percent.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-2 rounded-full bg-red-500 dark:bg-red-400" style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}

type TrendPoint = {
  period: { start: Date | string; end: Date | string; key: string };
  totalIncome: unknown;
  totalExpense: unknown;
};

// Nessuna libreria di grafici (coerente con BudgetBar in DashboardClient.tsx)
// — due barre per periodo, altezza relativa al valore più alto tra tutti i
// periodi/serie mostrati, così le colonne restano comparabili tra loro.
function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const maxValue = Math.max(1, ...trend.flatMap((t) => [Number(t.totalIncome), Number(t.totalExpense)]));
  const maxBarHeight = 96;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-emerald-500 dark:bg-emerald-400" /> Entrate
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-500 dark:bg-red-400" /> Spese
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        {trend.map((t) => {
          const incomeHeight = (Number(t.totalIncome) / maxValue) * maxBarHeight;
          const expenseHeight = (Number(t.totalExpense) / maxValue) * maxBarHeight;
          return (
            <div
              key={t.period.key}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${dateFormatter.format(new Date(t.period.start))} → ${dateFormatter.format(new Date(t.period.end))} · Entrate ${formatAmount(
                t.totalIncome
              )} · Spese ${formatAmount(t.totalExpense)}`}
            >
              <div className="flex items-end gap-1" style={{ height: maxBarHeight }}>
                <div className="w-2.5 rounded-t bg-emerald-500 dark:bg-emerald-400" style={{ height: incomeHeight }} />
                <div className="w-2.5 rounded-t bg-red-500 dark:bg-red-400" style={{ height: expenseHeight }} />
              </div>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                {monthFormatter.format(new Date(t.period.start))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReportClient() {
  // Stessa convenzione di navigazione periodo di DashboardClient.tsx:
  // undefined => periodo corrente, altrimenti una data concreta al suo
  // interno.
  const [referenceDate, setReferenceDate] = useState<Date | undefined>(undefined);
  const { data, isLoading } = trpc.report.summary.useQuery({ referenceDate, periodsCount: 6 });

  if (isLoading || !data) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Caricamento…</p>;
  }

  const { period, isCurrentPeriod, totalExpense, categoryBreakdown, trend } = data;

  function goToPreviousPeriod() {
    const previous = new Date(period.start);
    previous.setDate(previous.getDate() - 1);
    setReferenceDate(previous);
  }
  function goToNextPeriod() {
    const next = new Date(period.end);
    next.setDate(next.getDate() + 1);
    setReferenceDate(next);
  }
  function goToCurrentPeriod() {
    setReferenceDate(undefined);
  }

  const maxCategoryAmount = categoryBreakdown.length > 0 ? Number(categoryBreakdown[0].amount) : 0;

  return (
    <div className="flex w-full max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Report</h1>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" className="shrink-0" onClick={goToPreviousPeriod} aria-label="Periodo precedente">
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {dateFormatter.format(new Date(period.start))} → {dateFormatter.format(new Date(period.end))}
          </p>
          <Button variant="outline" size="icon" className="shrink-0" onClick={goToNextPeriod} aria-label="Periodo successivo">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {!isCurrentPeriod && (
          <button type="button" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400" onClick={goToCurrentPeriod}>
            Torna a oggi
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Dove ho speso — {formatAmount(totalExpense)}
        </h2>
        {categoryBreakdown.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nessuna spesa in questo periodo.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {categoryBreakdown.map((item) => (
              <CategoryBar key={item.categoryId} item={item} maxAmount={maxCategoryAmount} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Andamento (ultimi {trend.length} periodi)</h2>
        <Card className="p-4">
          <TrendChart trend={trend} />
        </Card>
      </div>
    </div>
  );
}
