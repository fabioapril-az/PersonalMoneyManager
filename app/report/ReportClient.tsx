"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// timeZone: "UTC" su entrambi — vedi il commento sull'omonimo dateFormatter
// in DashboardClient.tsx: i confini di periodo sono mezzanotte UTC, senza
// forzare il fuso qui il browser li fa scivolare al giorno dopo.
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("it-IT", { month: "short", timeZone: "UTC" });
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

// Una tavolozza fissa, non i colori dell'utente: Category.color esiste nello
// schema ma oggi non c'è un picker per impostarlo (solo l'icona) — finché non
// c'è, ogni fetta prende un colore per posizione (ciclico se le categorie
// superano la tavolozza), stabile perché categoryBreakdown è sempre ordinato
// per importo decrescente.
const CHART_COLORS = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#facc15",
  "#a3e635",
  "#4ade80",
  "#2dd4bf",
  "#38bdf8",
  "#818cf8",
  "#c084fc",
  "#f472b6",
];

// Torta via conic-gradient CSS puro — nessuna libreria di grafici, stesso
// principio di BudgetBar/TrendChart. L'ultima fetta arriva sempre esattamente
// al 100% (non alla somma degli step precedenti): la somma dei percent
// arrotondati singolarmente potrebbe non fare esattamente 100, lasciando
// altrimenti uno spicchio vuoto visibile all'inizio/fine del cerchio.
function CategoryPieChart({ items }: { items: CategoryBreakdownItem[] }) {
  // Somme cumulative senza mutare una variabile locale nel map (il linter
  // di React Compiler lo segnala anche se qui sarebbe innocuo, essendo
  // locale a questo render) — un prefix-sum immutabile calcolato a parte.
  const cumulativeEnds = items.reduce<number[]>((acc, item) => {
    const previous = acc.length > 0 ? acc[acc.length - 1] : 0;
    return [...acc, previous + item.percent];
  }, []);

  const stops = items.map((item, index) => {
    const color = CHART_COLORS[index % CHART_COLORS.length];
    const start = index === 0 ? 0 : cumulativeEnds[index - 1];
    const end = index === items.length - 1 ? 100 : cumulativeEnds[index];
    return `${color} ${start}% ${end}%`;
  });

  return (
    <div
      className="mx-auto size-48 shrink-0 rounded-full"
      style={{ background: `conic-gradient(${stops.join(", ")})` }}
      role="img"
      aria-label="Ripartizione delle spese per categoria"
    />
  );
}

// Legenda sotto la torta: stesso colore della fetta come badge percentuale,
// non più una barra — la torta è già il confronto visivo, questa lista serve
// solo a leggere nome/importo esatti.
function CategoryRow({ item, color }: { item: CategoryBreakdownItem; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-6 min-w-11 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {item.percent.toFixed(0)}%
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">
        {item.icon ? `${item.icon} ` : ""}
        {item.name}
      </span>
      <span className="shrink-0 text-sm font-medium text-zinc-950 dark:text-zinc-50">{formatAmount(item.amount)}</span>
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

  const { period, isCurrentPeriod, totalExpense, totalIncome, categoryBreakdown, trend } = data;

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

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Entrate</span>
            <span className="text-lg font-semibold text-zinc-500 dark:text-zinc-400">{formatAmount(totalIncome)}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Spese</span>
            <span className="text-lg font-semibold text-red-600 dark:text-red-400">{formatAmount(totalExpense)}</span>
          </div>
        </div>

        {categoryBreakdown.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Nessuna spesa in questo periodo.</p>
        ) : (
          <>
            <CategoryPieChart items={categoryBreakdown} />
            <div className="flex flex-col gap-2">
              {categoryBreakdown.map((item, index) => (
                <CategoryRow key={item.categoryId} item={item} color={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </div>
          </>
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
