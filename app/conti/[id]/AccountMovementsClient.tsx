"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { CASH_MOVEMENT_TYPE_LABELS } from "@/lib/domain/labels";
import type { CashMovementType } from "@/lib/domain/enums";
import { shiftCalendarMonths, type CalendarMonth } from "@/lib/domain/calendarMonth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Stesso formatter/tavolozza di MovimentiClient.tsx (duplicati apposta,
// pagine indipendenti — vedi la convenzione già stabilita nel progetto).
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });
const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
// Mese solare (vedi il commento in account.listMovements sul perché), non il
// periodo 27->26 — "luglio 2026", non un intervallo di date.
const monthFormatter = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatAmount(value: unknown) {
  return currencyFormatter.format(Number(value));
}

const CHIP_TINTS = ["#ffe4da", "#d7edff", "#ece3ff", "#d9f5ec", "#fff2cf", "#ffe0ec", "#e3f0d9"];
function chipTint(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return CHIP_TINTS[hash % CHIP_TINTS.length];
}

function IconChip({ icon, tintKey }: { icon: string | null; tintKey: string }) {
  if (!icon) return null;
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-base"
      style={{ backgroundColor: chipTint(tintKey) }}
    >
      {icon}
    </span>
  );
}

// Per verificare un addebito reale (es. l'estratto conto della carta di
// credito arrivato oggi) contro quello che l'app ha registrato — a
// differenza di "Movimenti di cassa" in app/movimenti, che mescola tutti i
// conti insieme, qui c'è solo quello scelto, un periodo alla volta, con un
// totale direttamente confrontabile con l'estratto vero.
export function AccountMovementsClient({ accountId }: { accountId: string }) {
  const [referenceDate, setReferenceDate] = useState<Date | undefined>(undefined);
  const { data, isLoading } = trpc.account.listMovements.useQuery({ accountId, referenceDate });

  if (isLoading || !data) {
    return <p className="text-sm text-ink-500 dark:text-ink-400">Caricamento…</p>;
  }

  const { account, month, isCurrentMonth, movements, total, expenses, expensesTotal } = data;

  const anchorMonth: CalendarMonth = {
    start: new Date(month.start),
    end: new Date(month.end),
    key: month.key,
  };
  function goToPreviousMonth() {
    setReferenceDate(shiftCalendarMonths(anchorMonth, -1).start);
  }
  function goToNextMonth() {
    setReferenceDate(shiftCalendarMonths(anchorMonth, 1).start);
  }
  function goToCurrentMonth() {
    setReferenceDate(undefined);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="w-full">
        <Link href="/conti" className="text-sm text-ink-500 hover:underline dark:text-ink-400">
          ← Torna ai conti
        </Link>
      </div>

      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-lg font-semibold text-ink-950 dark:text-ink-50">{account.name}</h1>
        <p className="text-sm font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
          {isCurrentMonth ? "Mese corrente" : "Mese"}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" className="shrink-0" onClick={goToPreviousMonth} aria-label="Mese precedente">
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-base font-semibold text-ink-950 dark:text-ink-50">
            {capitalize(monthFormatter.format(new Date(month.start)))}
          </p>
          <Button variant="outline" size="icon" className="shrink-0" onClick={goToNextMonth} aria-label="Mese successivo">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {!isCurrentMonth && (
          <button type="button" className="text-xs text-ink-500 hover:underline dark:text-ink-400" onClick={goToCurrentMonth}>
            Torna a oggi
          </button>
        )}
        <p className="text-xs text-ink-400 dark:text-ink-500">
          Mese solare, non il periodo 27→26 usato nel resto dell&apos;app — per confrontare con un vero estratto
          conto.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-500 dark:text-ink-400">Spese di questo mese ({expenses.length})</h2>
          <span
            className={`text-sm font-semibold ${
              Number(expensesTotal) > 0 ? "text-coral-600 dark:text-coral-400" : "text-ink-950 dark:text-ink-50"
            }`}
          >
            {formatAmount(expensesTotal)}
          </span>
        </div>
        <p className="text-xs text-ink-400 dark:text-ink-500">
          Data d&apos;ACQUISTO — cosa hai comprato con questo conto in questo mese, comprese le spese non ancora
          addebitate (carta di credito). È l&apos;elenco confrontabile con &quot;le transazioni di questo mese&quot;
          di un vero estratto conto.
        </p>
        {expenses.length === 0 && (
          <p className="text-sm text-ink-500 dark:text-ink-400">Nessuna spesa registrata su questo conto in questo mese.</p>
        )}
        {expenses.map((expense) => (
          <Card key={expense.id} className="flex flex-row items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <IconChip icon={expense.category.icon} tintKey={expense.description} />
              <div className="min-w-0">
                <p className="truncate text-sm text-ink-800 dark:text-ink-200">
                  {expense.description}
                  {expense.paymentPlan?.type === "INSTALLMENTS" && ` · ${expense.paymentPlan?.installmentsCount} rate`}
                </p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {expense.category.name} · {dateFormatter.format(new Date(expense.date))}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-sm font-medium text-coral-600 dark:text-coral-400">
              {formatAmount(-Number(expense.amount))}
            </span>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-500 dark:text-ink-400">Movimenti reali di questo mese ({movements.length})</h2>
          <span
            className={`text-sm font-semibold ${
              Number(total) < 0 ? "text-coral-600 dark:text-coral-400" : "text-teal-600 dark:text-teal-400"
            }`}
          >
            {formatAmount(total)}
          </span>
        </div>
        <p className="text-xs text-ink-400 dark:text-ink-500">
          Data del vero movimento di cassa — per carta di credito è sempre il mese SUCCESSIVO a quello d&apos;acquisto
          (data di fatturazione, PRD sezione 6). Confrontalo con quanto ti è stato realmente addebitato.
        </p>
        {movements.length === 0 && (
          <p className="text-sm text-ink-500 dark:text-ink-400">Nessun movimento su questo conto in questo mese.</p>
        )}
        {movements.map((movement) => {
          const schedule = movement.paymentSchedule;
          const category = schedule?.paymentPlan.expense.category;
          const typeLabel = CASH_MOVEMENT_TYPE_LABELS[movement.type as CashMovementType];
          const isOutflow = Number(movement.amount) < 0;
          const icon = category?.icon ?? (movement.type === "INCOME" ? "💶" : movement.type === "TRANSFER" ? "🔁" : "💳");
          return (
            <Card key={movement.id} className="flex flex-row items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <IconChip icon={icon} tintKey={movement.description ?? movement.type} />
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-800 dark:text-ink-200">
                    {movement.description ?? "—"}
                    {schedule &&
                      schedule.paymentPlan.type === "INSTALLMENTS" &&
                      ` · rata ${schedule.installmentNo}/${schedule.paymentPlan.installmentsCount}`}
                  </p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {dateFormatter.format(new Date(movement.date))}
                    {typeLabel ? ` · ${typeLabel}` : ""}
                  </p>
                </div>
              </div>
              <span
                className={`shrink-0 text-sm font-medium ${
                  isOutflow ? "text-coral-600 dark:text-coral-400" : "text-teal-600 dark:text-teal-400"
                }`}
              >
                {formatAmount(movement.amount)}
              </span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
