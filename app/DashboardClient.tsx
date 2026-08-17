"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { shiftPeriods, type FinancialPeriod } from "@/lib/domain/period";
import { groupByCalendarDay } from "@/lib/domain/dateGroups";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewExpenseDialog } from "./NewExpenseDialog";
import { NewIncomeDialog } from "./NewIncomeDialog";
import { NewTransferDialog } from "./NewTransferDialog";
import { EditExpenseDialog, type EditableExpense } from "./EditExpenseDialog";

// timeZone: "UTC" — ogni data che l'app salva è mezzanotte UTC del giorno di
// calendario scelto (un <input type="date"> "YYYY-MM-DD" è sempre parsato
// come UTC). Senza forzarlo qui, il browser la reinterpreta nel proprio
// fuso: 23:59:59.999 UTC (fine periodo) + 2h (CEST) diventa il giorno dopo —
// il bug per cui il periodo sembrava finire il 27 invece del 26.
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });
const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function formatAmount(value: unknown) {
  return currencyFormatter.format(Number(value));
}

// Tavolozza pastello per il "chip" colorato dietro ogni icona — stessa tinta
// per la stessa chiave (descrizione) ogni volta, via hash deterministico.
// Category.color esiste nello schema ma non c'è ancora un picker per
// impostarlo: finché non c'è, questa è l'alternativa.
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

type BudgetLineItem = {
  id: string;
  expenseId: string;
  date: Date | string;
  description: string;
  categoryIcon: string | null;
  categoryName: string;
  accountName: string | null;
  amount: unknown;
  installment: { no: number | null; count: number | null } | null;
  // Presente solo per una quota "spalmata sul Budget" (Expense.
  // budgetSpreadPeriods) — l'importo pieno originale, mostrato accanto alla
  // quota per non confonderla con una rata vera ancora da pagare (qui
  // l'intero importo è già uscito dal conto, subito).
  spreadTotalAmount: number | null;
  isRecurring: boolean;
};

// Ambra quando va bene, non teal — terzo accento dedicato al budget (Direzione
// "Fresh Slate, Brillante"), corallo solo per il superamento.
function BudgetBar({ percentUsed }: { percentUsed: number }) {
  const clamped = Math.min(100, Math.max(0, percentUsed));
  const overBudget = percentUsed > 100;
  return (
    <div className="h-1.5 w-full rounded-full bg-ink-200 dark:bg-ink-800">
      <div
        className={`h-1.5 rounded-full ${overBudget ? "bg-coral-600 dark:bg-coral-400" : "bg-amber-500 dark:bg-amber-400"}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// Riquadro apri/chiudi generico, stile bottone (bordo, ombra, sfondo) invece
// di un semplice testo + freccia — così si legge subito come interattivo.
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-xl border border-ink-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:hover:bg-ink-800"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="text-sm font-medium text-ink-800 dark:text-ink-100">{title}</h2>
        <ChevronDown
          className={`size-4 shrink-0 text-teal-600 transition-transform dark:text-teal-400 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && children}
    </div>
  );
}

// Risponde direttamente a "cosa concorre al budget di questo mese": stessa
// identica selezione di budgetSpent (server/routers/dashboard.ts), riga per
// riga — una spesa a rate qui appare per la sola rata di competenza di
// questo periodo, non per l'importo intero come nella pagina "Movimenti".
// Cliccabile: la spesa a monte può essere stata decisa in un periodo diverso
// da quello mostrato (una rata in scadenza ora, comprata il mese scorso) —
// vedi expense.getById.
function BudgetBreakdownSection({
  lines,
  onEditExpense,
}: {
  lines: BudgetLineItem[];
  onEditExpense: (expenseId: string) => void;
}) {
  if (lines.length === 0) return null;

  return (
    <CollapsibleSection title={`Spese nel Budget (${lines.length})`} defaultOpen>
      <div className="flex flex-col gap-3">
        {groupByCalendarDay(lines, (line) => line.date).map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
              {group.label ?? dateFormatter.format(group.date)}
            </p>
            {group.items.map((line) => {
              // Una riga "spalmata sul Budget" riusa lo stesso campo
              // installment (per la dicitura "rata N/count") di una rata
              // vera, ma non lo è: qui l'importo intero è già uscito dal
              // conto, non c'è nessuna scadenza futura — vedi spreadTotalAmount.
              const isSpread = line.spreadTotalAmount != null;
              const meta = [
                line.accountName,
                line.installment && !isSpread ? "scadenza" : null,
                line.isRecurring ? "🔁 Ricorrente" : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <button
                  key={line.id}
                  type="button"
                  className="w-full text-left"
                  onClick={() => onEditExpense(line.expenseId)}
                >
                  <Card className="flex flex-row items-center justify-between gap-3 p-3 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800">
                    <div className="flex min-w-0 items-center gap-3">
                      <IconChip icon={line.categoryIcon} tintKey={line.description} />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-800 dark:text-ink-200">
                          {line.description}
                          {line.installment &&
                            ` · rata ${line.installment.no}/${line.installment.count}${
                              isSpread ? ` (spesa ${formatAmount(line.spreadTotalAmount)})` : ""
                            }`}
                        </p>
                        {meta && <p className="truncate text-xs text-ink-500 dark:text-ink-400">{meta}</p>}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-coral-600 dark:text-coral-400">
                      {formatAmount(-Number(line.amount))}
                    </span>
                  </Card>
                </button>
              );
            })}
          </div>
        ))}
        <p className="text-xs text-ink-400 dark:text-ink-500">
          Ogni riga che compone lo &quot;Speso&quot; del Budget qui sopra — pagamenti immediati e carta alla data
          d&apos;acquisto, rate alla loro scadenza, spese spalmate una quota per mese. Clicca per modificare la
          spesa.
        </p>
      </div>
    </CollapsibleSection>
  );
}

export function DashboardClient() {
  const utils = trpc.useUtils();
  // undefined => periodo corrente (il server sceglie "oggi"); una volta che
  // si naviga altrove diventa una data concreta dentro il periodo mostrato.
  const [referenceDate, setReferenceDate] = useState<Date | undefined>(undefined);
  const { data, isLoading } = trpc.dashboard.summary.useQuery({ referenceDate });
  const [editingExpense, setEditingExpense] = useState<EditableExpense | null>(null);

  // "Spese nel Budget" può riferirsi a una spesa decisa in un periodo
  // diverso da quello mostrato (una rata in scadenza ora, comprata il mese
  // scorso) — recuperata al volo con expense.getById invece di limitarsi ai
  // dati già caricati per il periodo corrente.
  async function handleEditExpenseById(expenseId: string) {
    try {
      const expense = await utils.expense.getById.fetch({ id: expenseId });
      setEditingExpense(expense);
    } catch {
      toast.error("Impossibile trovare la spesa.");
    }
  }

  if (isLoading || !data) {
    return <p className="text-sm text-ink-500 dark:text-ink-400">Caricamento…</p>;
  }

  const { period, isCurrentPeriod, totalIncome, totalExpense, available, monthlyBudget, budgetSpent, budgetLines } =
    data;

  // shiftPeriods vuole Date reali — ricostruito esplicitamente invece di
  // fidarsi del tipo inferito da tRPC (stessa cautela di app/report/ReportClient.tsx).
  const anchorPeriod: FinancialPeriod = {
    start: new Date(period.start),
    end: new Date(period.end),
    key: period.key,
  };
  function goToPreviousPeriod() {
    setReferenceDate(shiftPeriods(anchorPeriod, -1).start);
  }
  function goToNextPeriod() {
    setReferenceDate(shiftPeriods(anchorPeriod, 1).start);
  }
  function goToCurrentPeriod() {
    setReferenceDate(undefined);
  }
  const budgetAmount = monthlyBudget != null ? Number(monthlyBudget) : null;
  // Regola ibrida (non sempre = totalExpense) — vedi il commento su
  // budgetSpent in server/routers/dashboard.ts.
  const budgetPercentUsed = budgetAmount ? (Number(budgetSpent) / budgetAmount) * 100 : 0;

  return (
    // h-full: riempie lo spazio che <main> in app/page.tsx gli lascia (a sua
    // volta min-h-0 flex-1 dentro un contenitore h-dvh) — così l'intestazione
    // sotto è ferma per davvero fin dal primo pixel di scroll, non solo dopo
    // averla "raggiunta" come con position: sticky. Solo il div con
    // overflow-y-auto più sotto scorre.
    <div className="flex h-full w-full max-w-2xl flex-col">
      <div className="flex flex-col gap-6 pb-4">
        <div className="flex flex-col gap-2 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
            {isCurrentPeriod ? "Periodo corrente" : "Periodo"}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="icon" className="shrink-0" onClick={goToPreviousPeriod} aria-label="Periodo precedente">
              <ChevronLeft className="size-4" />
            </Button>
            <h1 className="text-2xl font-semibold text-ink-950 sm:text-3xl dark:text-ink-50">
              {dateFormatter.format(new Date(period.start))} → {dateFormatter.format(new Date(period.end))}
            </h1>
            <Button variant="outline" size="icon" className="shrink-0" onClick={goToNextPeriod} aria-label="Periodo successivo">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {!isCurrentPeriod && (
            <button type="button" className="text-xs text-ink-500 hover:underline dark:text-ink-400" onClick={goToCurrentPeriod}>
              Torna a oggi
            </button>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <NewExpenseDialog />
          <NewIncomeDialog />
          <NewTransferDialog />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card className="flex flex-col gap-1 p-2 text-center sm:p-4">
            <p className="text-xs text-ink-500 dark:text-ink-400">Entrate</p>
            <p className="text-sm font-semibold text-teal-600 sm:text-lg dark:text-teal-400">
              {formatAmount(totalIncome)}
            </p>
          </Card>
          <Card className="flex flex-col gap-1 p-2 text-center sm:p-4">
            <p className="text-xs text-ink-500 dark:text-ink-400">Spese</p>
            <p className="text-sm font-semibold text-coral-600 sm:text-lg dark:text-coral-400">
              {formatAmount(totalExpense)}
            </p>
          </Card>
          <Card className="flex flex-col gap-1 p-2 text-center sm:p-4">
            <p className="text-xs text-ink-500 dark:text-ink-400">Disponibile</p>
            <p className="text-sm font-semibold text-ink-950 sm:text-lg dark:text-ink-50">{formatAmount(available)}</p>
          </Card>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-500 dark:text-ink-400">Budget mensile</h2>
            <Link href="/budget" className="text-xs text-ink-500 hover:underline dark:text-ink-400">
              {budgetAmount != null ? "Gestisci" : "Imposta"}
            </Link>
          </div>
          {budgetAmount == null ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">
              Nessun budget impostato — vai su &quot;Budget&quot; per definirne uno.
            </p>
          ) : (
            <Card className="flex flex-col gap-1 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-800 dark:text-ink-200">Speso / Budget</span>
                <span className="text-ink-500 dark:text-ink-400">
                  {formatAmount(budgetSpent)} / {formatAmount(budgetAmount)}
                </span>
              </div>
              <BudgetBar percentUsed={budgetPercentUsed} />
            </Card>
          )}
        </div>
      </div>

      {/* min-h-0 è necessario perché un figlio flex non si restringa oltre
          il contenuto e forzi lo scroll sull'antenato invece che qui. */}
      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto pt-2 pb-4">
        <BudgetBreakdownSection lines={budgetLines} onEditExpense={handleEditExpenseById} />

        {/* Saldo conti (vedi "Conti"), Impegni futuri, Movimenti di cassa e
            Spese e entrate vivono in /movimenti — restano necessari, ma qui
            occupavano spazio senza essere il primo motivo per cui si apre la
            dashboard ogni giorno. */}
        <Link
          href="/movimenti"
          className="flex items-center justify-between rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800 shadow-sm transition-colors hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100 dark:hover:bg-ink-800"
        >
          Vedi tutti i movimenti
          <ChevronRight className="size-4 shrink-0 text-teal-600 dark:text-teal-400" />
        </Link>
      </div>

      <EditExpenseDialog
        key={editingExpense?.id ?? "none"}
        expense={editingExpense}
        open={editingExpense !== null}
        onOpenChange={(open) => !open && setEditingExpense(null)}
      />
    </div>
  );
}
