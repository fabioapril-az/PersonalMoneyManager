"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewExpenseDialog } from "./NewExpenseDialog";
import { NewIncomeDialog } from "./NewIncomeDialog";
import { EditExpenseDialog, type EditableExpense } from "./EditExpenseDialog";
import { EditIncomeDialog, type EditableIncome } from "./EditIncomeDialog";

const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });
const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function formatAmount(value: unknown) {
  return currencyFormatter.format(Number(value));
}

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

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Impegni futuri</h2>
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
  );
}

export function DashboardClient() {
  const { data, isLoading } = trpc.dashboard.summary.useQuery();
  const [editingExpense, setEditingExpense] = useState<EditableExpense | null>(null);
  const [editingIncome, setEditingIncome] = useState<EditableIncome | null>(null);

  if (isLoading || !data) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Caricamento…</p>;
  }

  const { period, totalIncome, totalExpense, available, monthlyBudget, accounts, recentExpenses, recentIncomes } =
    data;
  const budgetAmount = monthlyBudget != null ? Number(monthlyBudget) : null;
  const budgetPercentUsed = budgetAmount ? (Number(totalExpense) / budgetAmount) * 100 : 0;

  const recentMovements = [
    ...recentExpenses.map((e) => ({
      id: e.id,
      kind: "expense" as const,
      date: e.date,
      label: e.description,
      sublabel: e.category.icon ? `${e.category.icon} ${e.category.name}` : e.category.name,
      amount: -Number(e.amount),
      raw: e,
    })),
    ...recentIncomes.map((i) => ({
      id: i.id,
      kind: "income" as const,
      date: i.date,
      label: i.source,
      sublabel: null,
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
                {formatAmount(totalExpense)} / {formatAmount(budgetAmount)}
              </span>
            </div>
            <BudgetBar percentUsed={budgetPercentUsed} />
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Movimenti recenti</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Clicca su un movimento per modificarlo o eliminarlo.</p>
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
