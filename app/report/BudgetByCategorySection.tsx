"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// timeZone: "UTC" — le date delle spese/scadenze sono giorni di calendario
// salvati a mezzanotte UTC, vedi il commento sull'omonimo formatter in
// DashboardClient.tsx.
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });
const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function formatAmount(value: unknown) {
  return currencyFormatter.format(Number(value));
}

// Stessa tavolozza (e stesso motivo per cui è fissa invece di leggere
// Category.color) della torta in ReportClient.tsx.
const CHART_COLORS = ["#00b8a9", "#ff4433", "#ffb100", "#7c5cfc", "#2da9ff", "#8bd450", "#ff4fa3", "#009488"];

type BudgetLine = {
  id: string;
  date: Date | string;
  description: string;
  categoryName: string;
  accountName: string | null;
  amount: unknown;
  installment: { no: number | null; count: number | null } | null;
  spreadTotalAmount: number | null;
};

type BudgetCategoryItem = {
  categoryId: string;
  name: string;
  icon: string | null;
  amount: unknown;
  percent: number;
  percentOfBudget: number | null;
  lines: BudgetLine[];
};

// Torta via conic-gradient CSS puro, nessuna libreria — vedi CategoryPieChart
// in ReportClient.tsx per il perché l'ultima fetta arriva sempre al 100%.
function BudgetPieChart({ items }: { items: BudgetCategoryItem[] }) {
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
      aria-label="Ripartizione del budget per categoria"
    />
  );
}

// Cosa distingue queste voci da quelle della torta "Dove vanno i miei soldi":
// qui una spesa a rate compare col solo importo della rata dovuta nel periodo,
// e una spesa spalmata con la sola quota del periodo — l'etichetta lo dice
// esplicitamente, altrimenti l'importo mostrato sembrerebbe sbagliato rispetto
// alla spesa che si ricorda di aver fatto.
function BudgetCategoryRow({ item, color }: { item: BudgetCategoryItem; color: string }) {
  const [open, setOpen] = useState(false);
  const hasLines = item.lines.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="flex items-center gap-3 text-left disabled:cursor-default"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasLines}
      >
        <span
          className="flex h-6 min-w-11 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-semibold text-black"
          style={{ backgroundColor: color }}
        >
          {item.percent.toFixed(0)}%
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink-800 dark:text-ink-200">
          {item.icon ? `${item.icon} ` : ""}
          {item.name}
          {item.percentOfBudget != null && (
            <span className="ml-1.5 text-xs text-ink-500 dark:text-ink-400">
              · {item.percentOfBudget.toFixed(0)}% del Budget
            </span>
          )}
        </span>
        <span className="shrink-0 text-sm font-medium text-ink-950 dark:text-ink-50">{formatAmount(item.amount)}</span>
        {hasLines && (
          <ChevronDown className={`size-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {open && hasLines && (
        <div className="flex flex-col gap-1 rounded-lg border border-ink-200 bg-white p-2 dark:border-ink-800 dark:bg-ink-900">
          {item.lines.map((line) => {
            const meta = [dateFormatter.format(new Date(line.date))];
            if (line.categoryName !== item.name) meta.push(line.categoryName);
            if (line.accountName) meta.push(line.accountName);
            if (line.installment?.no != null && line.installment.count != null) {
              meta.push(
                line.spreadTotalAmount != null
                  ? `quota ${line.installment.no}/${line.installment.count} di ${formatAmount(line.spreadTotalAmount)}`
                  : `rata ${line.installment.no}/${line.installment.count}`
              );
            }
            return (
              <div key={line.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-800 dark:text-ink-200">{line.description}</p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">{meta.join(" · ")}</p>
                </div>
                <span className="shrink-0 text-sm font-medium text-coral-600 dark:text-coral-400">
                  {formatAmount(line.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// "Cosa mi mangia il budget, e in quali categorie?" — la suddivisione per
// categoria di quello che concorre al Budget del periodo (regola ibrida: rate
// per rata, spalmate a quota, fuori le "Escludi dal Budget"), per default
// limitata alle spese marcate "Spesa ricorrente".
//
// Volutamente NON confrontabile voce per voce con la torta "Dove vanno i miei
// soldi": quella conta tutte le spese alla data d'acquisto per l'importo
// pieno. Il testo sotto il totale lo dice, invece di lasciar credere a un bug.
export function BudgetByCategorySection({
  data,
  onlyRecurring,
  onOnlyRecurringChange,
}: {
  data: {
    monthlyBudget: unknown;
    total: unknown;
    budgetSpent: unknown;
    categoryBreakdown: BudgetCategoryItem[];
  };
  onlyRecurring: boolean;
  onOnlyRecurringChange: (value: boolean) => void;
}) {
  const total = Number(data.total);
  const budgetSpent = Number(data.budgetSpent);
  const monthlyBudget = data.monthlyBudget == null ? null : Number(data.monthlyBudget);
  const percentOfBudget = monthlyBudget != null && monthlyBudget > 0 ? (total / monthlyBudget) * 100 : null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-ink-500 dark:text-ink-400">Budget per categoria</h2>

      <div className="flex items-center gap-2">
        <Checkbox
          id="budget-by-category-only-recurring"
          checked={onlyRecurring}
          onCheckedChange={(checked) => onOnlyRecurringChange(checked === true)}
        />
        <Label htmlFor="budget-by-category-only-recurring" className="font-normal">
          Solo spese ricorrenti
        </Label>
      </div>

      <Card className="flex flex-col gap-1.5 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-ink-800 dark:text-ink-200">
            {onlyRecurring ? "Budget impegnato da spese ricorrenti" : "Budget impegnato"}
          </span>
          <span className="text-lg font-semibold text-ink-950 dark:text-ink-50">{formatAmount(total)}</span>
        </div>
        {monthlyBudget != null && (
          <>
            <div className="h-1.5 w-full rounded-full bg-ink-200 dark:bg-ink-800">
              <div
                className={`h-1.5 rounded-full ${
                  (percentOfBudget ?? 0) > 100 ? "bg-coral-600 dark:bg-coral-400" : "bg-amber-500 dark:bg-amber-400"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, percentOfBudget ?? 0))}%` }}
              />
            </div>
            <span className="text-xs text-ink-500 dark:text-ink-400">
              {percentOfBudget != null && `${percentOfBudget.toFixed(0)}% `}
              del Budget mensile di {formatAmount(monthlyBudget)}
            </span>
          </>
        )}
        {onlyRecurring && (
          <span className="text-xs text-ink-500 dark:text-ink-400">
            su {formatAmount(budgetSpent)} di budget speso in tutto — la differenza sono spese occasionali.
          </span>
        )}
      </Card>

      {data.categoryBreakdown.length === 0 ? (
        <p className="text-center text-sm text-ink-500 dark:text-ink-400">
          {onlyRecurring
            ? "Nessuna spesa ricorrente che concorra al Budget in questo periodo."
            : "Nessuna spesa che concorra al Budget in questo periodo."}
        </p>
      ) : (
        <>
          <BudgetPieChart items={data.categoryBreakdown} />
          <div className="flex flex-col gap-2">
            {data.categoryBreakdown.map((item, index) => (
              <BudgetCategoryRow key={item.categoryId} item={item} color={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-ink-400 dark:text-ink-500">
        Conta quello che impegna il Budget di questo periodo: una spesa a rate per la sola rata in scadenza, una spesa
        spalmata per la sola quota del periodo, e mai le spese escluse dal Budget. Per questo i totali non coincidono
        con quelli di &quot;Dove vanno i miei soldi&quot;, che mostra ogni spesa per intero alla data d&apos;acquisto.
      </p>
    </div>
  );
}
