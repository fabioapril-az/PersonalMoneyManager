"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { CASH_MOVEMENT_TYPE_LABELS } from "@/lib/domain/labels";
import type { CashMovementType } from "@/lib/domain/enums";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewExpenseDialog } from "./NewExpenseDialog";
import { NewIncomeDialog } from "./NewIncomeDialog";
import { NewTransferDialog } from "./NewTransferDialog";
import { EditExpenseDialog, type EditableExpense } from "./EditExpenseDialog";
import { EditIncomeDialog, type EditableIncome } from "./EditIncomeDialog";

const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });
const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function formatAmount(value: unknown) {
  return currencyFormatter.format(Number(value));
}

type CashMovementItem = {
  id: string;
  date: Date | string;
  amount: unknown;
  type: string;
  description: string | null;
  account: { name: string };
  transferGroupId: string | null;
  paymentSchedule: {
    installmentNo: number | null;
    paymentPlan: {
      type: string;
      installmentsCount: number | null;
      expense: { category: { icon: string | null } };
    };
  } | null;
};

function BudgetBar({ percentUsed }: { percentUsed: number }) {
  const clamped = Math.min(100, Math.max(0, percentUsed));
  const overBudget = percentUsed > 100;
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div
        className={`h-1.5 rounded-full ${overBudget ? "bg-red-600 dark:bg-red-400" : "bg-emerald-600 dark:bg-emerald-400"}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// Riquadro apri/chiudi generico — "Saldo conti" con molti conti finiva per
// occupare da solo tutto lo schermo prima di arrivare al resto (budget,
// movimenti, ecc.), soprattutto su mobile.
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
      <button type="button" className="flex items-center justify-between" onClick={() => setOpen((v) => !v)}>
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</h2>
        <ChevronDown
          className={`size-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && children}
    </div>
  );
}

function PendingSchedulesSection() {
  const utils = trpc.useUtils();
  const { data: pending, isLoading } = trpc.paymentSchedule.listPending.useQuery();

  const markPaid = trpc.paymentSchedule.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Segnato come pagato.");
      utils.paymentSchedule.listPending.invalidate();
      utils.dashboard.summary.invalidate();
      utils.account.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Impossibile aggiornare la scadenza."),
  });

  if (isLoading || !pending || pending.length === 0) return null;

  // Come "Saldo conti": può contenere molte rate/addebiti e finire per
  // occupare tutto lo schermo prima del resto del contenuto.
  return (
    <CollapsibleSection title={`Impegni futuri (${pending.length})`}>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Addebiti carta e rate non ancora avvenuti — non contano ancora sul saldo del conto.
        </p>
        {pending.map((schedule) => (
          <Card key={schedule.id} className="flex flex-row items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-800 dark:text-zinc-200">
                {schedule.paymentPlan.expense.category.icon ? `${schedule.paymentPlan.expense.category.icon} ` : ""}
                {schedule.paymentPlan.expense.description}
                {schedule.paymentPlan.type === "INSTALLMENTS" &&
                  ` · rata ${schedule.installmentNo}/${schedule.paymentPlan.installmentsCount}`}
              </p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {schedule.paymentPlan.account.name} · addebito {dateFormatter.format(new Date(schedule.dueDate))}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                {formatAmount(schedule.amount)}
              </span>
              <Button size="sm" variant="outline" disabled={markPaid.isPending} onClick={() => markPaid.mutate({ id: schedule.id })}>
                Segna pagato
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </CollapsibleSection>
  );
}

// "Cosa è successo davvero sui conti" (PRD Rule 5), distinta da "Spese e
// entrate" (le decisioni, Rule 4): una rata o un addebito carta pagati in
// questo periodo compaiono qui per data di CashMovement, anche se la spesa
// che li ha generati è stata decisa in un periodo precedente.
function CashMovementsSection({ movements }: { movements: CashMovementItem[] }) {
  const utils = trpc.useUtils();

  const deleteTransfer = trpc.transfer.delete.useMutation({
    onSuccess: () => {
      toast.success("Trasferimento eliminato.");
      utils.dashboard.summary.invalidate();
      utils.account.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Impossibile eliminare il trasferimento."),
  });

  if (movements.length === 0) return null;

  return (
    <CollapsibleSection title={`Movimenti di cassa (${movements.length})`}>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Quello che è successo davvero sui conti in questo periodo — comprese rate e addebiti carta saldati ora,
          anche se decisi in un periodo precedente.
        </p>
        {movements.map((movement) => {
          const schedule = movement.paymentSchedule;
          const category = schedule?.paymentPlan.expense.category;
          const typeLabel = CASH_MOVEMENT_TYPE_LABELS[movement.type as CashMovementType];
          const isOutflow = Number(movement.amount) < 0;
          return (
            <Card key={movement.id} className="flex flex-row items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-800 dark:text-zinc-200">
                  {category?.icon ? `${category.icon} ` : ""}
                  {movement.description ?? "—"}
                  {schedule &&
                    schedule.paymentPlan.type === "INSTALLMENTS" &&
                    ` · rata ${schedule.installmentNo}/${schedule.paymentPlan.installmentsCount}`}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {movement.account.name} · {dateFormatter.format(new Date(movement.date))}
                  {typeLabel ? ` · ${typeLabel}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`text-sm font-medium ${
                    isOutflow ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {formatAmount(movement.amount)}
                </span>
                {/* Solo i trasferimenti si eliminano da qui: le altre righe
                    derivano da una Expense/Income/rata che si gestisce dalla
                    sua sezione dedicata, non ha senso duplicare l'azione qui. */}
                {movement.transferGroupId && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deleteTransfer.isPending}
                    onClick={() => deleteTransfer.mutate({ transferGroupId: movement.transferGroupId! })}
                  >
                    Elimina
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

export function DashboardClient() {
  // undefined => periodo corrente (il server sceglie "oggi"); una volta che
  // si naviga altrove diventa una data concreta dentro il periodo mostrato.
  const [referenceDate, setReferenceDate] = useState<Date | undefined>(undefined);
  const { data, isLoading } = trpc.dashboard.summary.useQuery({ referenceDate });
  const [editingExpense, setEditingExpense] = useState<EditableExpense | null>(null);
  const [editingIncome, setEditingIncome] = useState<EditableIncome | null>(null);

  if (isLoading || !data) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Caricamento…</p>;
  }

  const {
    period,
    isCurrentPeriod,
    totalIncome,
    totalExpense,
    available,
    monthlyBudget,
    budgetSpent,
    accounts,
    recentExpenses,
    recentIncomes,
    cashMovements,
  } = data;

  // Un giorno prima dell'inizio/dopo la fine del periodo mostrato individua
  // esattamente il periodo precedente/successivo (27→26).
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
  const budgetAmount = monthlyBudget != null ? Number(monthlyBudget) : null;
  // Budget segue le scadenze reali (budgetSpent), non "Spese" (totalExpense)
  // — vedi il commento in server/routers/dashboard.ts.
  const budgetPercentUsed = budgetAmount ? (Number(budgetSpent) / budgetAmount) * 100 : 0;

  const recentMovements = [
    ...recentExpenses.map((e) => ({
      id: e.id,
      kind: "expense" as const,
      date: e.date,
      label: e.description,
      // Categoria (cosa) + conto e, se a rate, quante (come) — vedi il
      // commento su paymentPlan in server/routers/dashboard.ts.
      sublabel: [
        e.category.icon ? `${e.category.icon} ${e.category.name}` : e.category.name,
        e.paymentPlan?.account.name,
        e.paymentPlan?.installmentsCount ? `${e.paymentPlan.installmentsCount} rate` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      amount: -Number(e.amount),
      raw: e,
    })),
    ...recentIncomes.map((i) => ({
      id: i.id,
      kind: "income" as const,
      date: i.date,
      label: i.source,
      // Conto di accredito (come) — un'entrata non ha un "metodo di
      // pagamento", solo il conto su cui è arrivata.
      sublabel: i.cashMovements[0]?.account.name ?? null,
      amount: Number(i.amount),
      raw: i,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {isCurrentPeriod ? "Periodo corrente" : "Periodo"}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" className="shrink-0" onClick={goToPreviousPeriod} aria-label="Periodo precedente">
            <ChevronLeft className="size-4" />
          </Button>
          <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl dark:text-zinc-50">
            {dateFormatter.format(new Date(period.start))} → {dateFormatter.format(new Date(period.end))}
          </h1>
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

      <div className="flex flex-wrap justify-center gap-3">
        <NewExpenseDialog />
        <NewIncomeDialog />
        <NewTransferDialog />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="flex flex-col gap-1 p-2 text-center sm:p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Entrate</p>
          <p className="text-sm font-semibold text-emerald-600 sm:text-lg dark:text-emerald-400">
            {formatAmount(totalIncome)}
          </p>
        </Card>
        <Card className="flex flex-col gap-1 p-2 text-center sm:p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Spese</p>
          <p className="text-sm font-semibold text-red-600 sm:text-lg dark:text-red-400">
            {formatAmount(totalExpense)}
          </p>
        </Card>
        <Card className="flex flex-col gap-1 p-2 text-center sm:p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Disponibile</p>
          <p className="text-sm font-semibold text-zinc-950 sm:text-lg dark:text-zinc-50">
            {formatAmount(available)}
          </p>
        </Card>
      </div>

      <CollapsibleSection title="Saldo conti">
        <div className="flex flex-col gap-2">
          {accounts.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nessun conto ancora — vai su &quot;Conti&quot; per crearne uno.
            </p>
          )}
          {accounts.map((account) => (
            <Card key={account.id} className="flex flex-row items-center justify-between gap-2 p-3">
              <span className="min-w-0 truncate text-sm text-zinc-800 dark:text-zinc-200">{account.name}</span>
              <span className="shrink-0 text-sm font-medium text-zinc-950 dark:text-zinc-50">
                {formatAmount(account.balance)}
              </span>
            </Card>
          ))}
        </div>
      </CollapsibleSection>

      <PendingSchedulesSection />

      <CashMovementsSection movements={cashMovements} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Budget mensile</h2>
          <Link href="/budget" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
            {budgetAmount != null ? "Gestisci" : "Imposta"}
          </Link>
        </div>
        {budgetAmount == null ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nessun budget impostato — vai su &quot;Budget&quot; per definirne uno.
          </p>
        ) : (
          <Card className="flex flex-col gap-1 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-800 dark:text-zinc-200">Speso / Budget</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {formatAmount(budgetSpent)} / {formatAmount(budgetAmount)}
              </span>
            </div>
            <BudgetBar percentUsed={budgetPercentUsed} />
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Spese e entrate</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Le decisioni di spesa/entrata di questo periodo — clicca per modificare o eliminare.
        </p>
        {recentMovements.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nessun movimento in questo periodo — usa i pulsanti sopra per iniziare.
          </p>
        )}
        {recentMovements.map((movement) => (
          <button
            key={movement.id}
            type="button"
            className="w-full text-left"
            onClick={() =>
              movement.kind === "expense" ? setEditingExpense(movement.raw) : setEditingIncome(movement.raw)
            }
          >
            <Card className="flex flex-row items-center justify-between gap-2 p-3 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-800 dark:text-zinc-200">{movement.label}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {dateFormatter.format(new Date(movement.date))}
                  {movement.sublabel ? ` · ${movement.sublabel}` : ""}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-medium ${
                  movement.amount < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {formatAmount(movement.amount)}
              </span>
            </Card>
          </button>
        ))}
      </div>

      <EditExpenseDialog
        key={editingExpense?.id ?? "none"}
        expense={editingExpense}
        open={editingExpense !== null}
        onOpenChange={(open) => !open && setEditingExpense(null)}
      />
      <EditIncomeDialog
        key={editingIncome?.id ?? "none"}
        income={editingIncome}
        open={editingIncome !== null}
        onOpenChange={(open) => !open && setEditingIncome(null)}
      />
    </div>
  );
}
