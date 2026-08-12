"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { CASH_MOVEMENT_TYPE_LABELS } from "@/lib/domain/labels";
import type { CashMovementType } from "@/lib/domain/enums";
import { shiftPeriods, type FinancialPeriod } from "@/lib/domain/period";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EditExpenseDialog, type EditableExpense } from "../EditExpenseDialog";
import { EditIncomeDialog, type EditableIncome } from "../EditIncomeDialog";

// Spostato fuori dalla dashboard principale (troppa carne al fuoco lì,
// occupava spazio anche da chiuso) — resta tutto qui, solo un'altra pagina.
// Stessa convenzione di navigazione periodo di DashboardClient.tsx.
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });
const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function formatAmount(value: unknown) {
  return currencyFormatter.format(Number(value));
}

// Tavolozza pastello per il "chip" colorato dietro ogni icona — stessa tinta
// per la stessa chiave ogni volta, via hash deterministico. Stessa logica di
// DashboardClient.tsx (duplicata, non condivisa: sono due pagine indipendenti).
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

type PendingScheduleItem = {
  id: string;
  dueDate: Date | string;
  amount: unknown;
  installmentNo: number | null;
  paymentPlan: {
    type: string;
    installmentsCount: number | null;
    account: { name: string };
    expense: { id: string; description: string; category: { icon: string | null } };
  };
};

// La descrizione/data è un bottone separato da "Segna pagato" (non l'intera
// Card, che non può contenere un <button> annidato in un altro) — apre la
// modifica della spesa a monte, utile perché può essere stata decisa in un
// periodo diverso da quello mostrato.
function PendingScheduleCard({
  schedule,
  onMarkPaid,
  onEdit,
  disabled,
}: {
  schedule: PendingScheduleItem;
  onMarkPaid: () => void;
  onEdit: () => void;
  disabled: boolean;
}) {
  return (
    <Card className="flex flex-row items-center justify-between gap-2 p-3">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-70" onClick={onEdit}>
        <IconChip icon={schedule.paymentPlan.expense.category.icon} tintKey={schedule.paymentPlan.expense.description} />
        <div className="min-w-0">
          <p className="truncate text-sm text-ink-800 dark:text-ink-200">
            {schedule.paymentPlan.expense.description}
            {schedule.paymentPlan.type === "INSTALLMENTS" &&
              ` · rata ${schedule.installmentNo}/${schedule.paymentPlan.installmentsCount}`}
          </p>
          <p className="truncate text-xs text-ink-500 dark:text-ink-400">
            {schedule.paymentPlan.account.name} · addebito {dateFormatter.format(new Date(schedule.dueDate))}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-medium text-ink-950 dark:text-ink-50">{formatAmount(schedule.amount)}</span>
        <Button size="sm" variant="outline" disabled={disabled} onClick={onMarkPaid}>
          Segna pagato
        </Button>
      </div>
    </Card>
  );
}

// Due liste separate, non una sola "Impegni futuri": una rata resta a saldo
// manuale per scelta esplicita (potresti pagarla in anticipo, o scalare
// diversamente dall'addebito atteso), mentre un addebito carta di credito
// "semplice" avviene in banca in automatico alla data di fatturazione —
// quindi qui non compaiono più addebiti scaduti (settleOverdueCardCharges
// li salda da soli prima di questa query, vedi server/routers/paymentSchedule.ts),
// solo quelli futuri non ancora dovuti.
function PendingSchedulesSection({ onEditExpense }: { onEditExpense: (expenseId: string) => void }) {
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

  if (isLoading || !pending) return null;

  const installments = pending.filter((s) => s.paymentPlan.type === "INSTALLMENTS");
  const cardCharges = pending.filter((s) => s.paymentPlan.type !== "INSTALLMENTS");

  return (
    <>
      {installments.length > 0 && (
        <CollapsibleSection title={`Rate in corso (${installments.length})`}>
          <div className="flex flex-col gap-2">
            {installments.map((schedule) => (
              <PendingScheduleCard
                key={schedule.id}
                schedule={schedule}
                disabled={markPaid.isPending}
                onMarkPaid={() => markPaid.mutate({ id: schedule.id })}
                onEdit={() => onEditExpense(schedule.paymentPlan.expense.id)}
              />
            ))}
            <p className="text-xs text-ink-400 dark:text-ink-500">
              Rate non ancora saldate — segnale pagate a mano quando arriva l&apos;addebito reale.
            </p>
          </div>
        </CollapsibleSection>
      )}
      {cardCharges.length > 0 && (
        <CollapsibleSection title={`Carta di credito in attesa (${cardCharges.length})`}>
          <div className="flex flex-col gap-2">
            {cardCharges.map((schedule) => (
              <PendingScheduleCard
                key={schedule.id}
                schedule={schedule}
                disabled={markPaid.isPending}
                onMarkPaid={() => markPaid.mutate({ id: schedule.id })}
                onEdit={() => onEditExpense(schedule.paymentPlan.expense.id)}
              />
            ))}
            <p className="text-xs text-ink-400 dark:text-ink-500">
              Acquisti non ancora fatturati — verranno saldati da soli alla data di addebito, nessuna azione
              richiesta (il pulsante serve solo se sai già che è avvenuto prima del previsto).
            </p>
          </div>
        </CollapsibleSection>
      )}
    </>
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
        {movements.map((movement) => {
          const schedule = movement.paymentSchedule;
          const category = schedule?.paymentPlan.expense.category;
          const typeLabel = CASH_MOVEMENT_TYPE_LABELS[movement.type as CashMovementType];
          const isOutflow = Number(movement.amount) < 0;
          // Un'entrata/trasferimento non ha categoria — un'icona generica
          // regge il chip comunque, invece di lasciarlo vuoto.
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
                    {movement.account.name} · {dateFormatter.format(new Date(movement.date))}
                    {typeLabel ? ` · ${typeLabel}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`text-sm font-medium ${
                    isOutflow ? "text-coral-600 dark:text-coral-400" : "text-teal-600 dark:text-teal-400"
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
        <p className="text-xs text-ink-400 dark:text-ink-500">
          Quello che è successo davvero sui conti in questo periodo — comprese rate e addebiti carta saldati ora,
          anche se decisi in un periodo precedente.
        </p>
      </div>
    </CollapsibleSection>
  );
}

export function MovimentiClient() {
  const utils = trpc.useUtils();
  const [referenceDate, setReferenceDate] = useState<Date | undefined>(undefined);
  const { data, isLoading } = trpc.dashboard.summary.useQuery({ referenceDate });
  const [editingExpense, setEditingExpense] = useState<EditableExpense | null>(null);
  const [editingIncome, setEditingIncome] = useState<EditableIncome | null>(null);

  // "Rate in corso"/"Carta di credito in attesa" possono riferirsi a una
  // spesa decisa in un periodo diverso da quello mostrato — periodExpenses
  // (scoped al periodo corrente) non basterebbe a trovarla.
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

  const { period, isCurrentPeriod, periodExpenses, periodIncomes, cashMovements } = data;

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

  const movements = [
    ...periodExpenses.map((e) => ({
      id: e.id,
      kind: "expense" as const,
      date: e.date,
      label: e.description,
      icon: e.category.icon,
      sublabel: [
        e.category.name,
        e.paymentPlan?.account.name,
        e.paymentPlan?.installmentsCount ? `${e.paymentPlan.installmentsCount} rate` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      amount: -Number(e.amount),
      raw: e,
    })),
    ...periodIncomes.map((i) => ({
      id: i.id,
      kind: "income" as const,
      date: i.date,
      label: i.source,
      icon: "💶",
      sublabel: i.cashMovements[0]?.account.name ?? null,
      amount: Number(i.amount),
      raw: i,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-lg font-semibold text-ink-950 dark:text-ink-50">Movimenti</h1>
        <p className="text-sm font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
          {isCurrentPeriod ? "Periodo corrente" : "Periodo"}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" className="shrink-0" onClick={goToPreviousPeriod} aria-label="Periodo precedente">
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-base font-semibold text-ink-950 dark:text-ink-50">
            {dateFormatter.format(new Date(period.start))} → {dateFormatter.format(new Date(period.end))}
          </p>
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

      <PendingSchedulesSection onEditExpense={handleEditExpenseById} />

      <CashMovementsSection movements={cashMovements} />

      <CollapsibleSection title={`Spese e entrate (${movements.length})`} defaultOpen>
        <div className="flex flex-col gap-2">
          {movements.length === 0 && (
            <p className="text-sm text-ink-500 dark:text-ink-400">Nessun movimento in questo periodo.</p>
          )}
          {movements.map((movement) => (
            <button
              key={movement.id}
              type="button"
              className="w-full text-left"
              onClick={() =>
                movement.kind === "expense" ? setEditingExpense(movement.raw) : setEditingIncome(movement.raw)
              }
            >
              <Card className="flex flex-row items-center justify-between gap-3 p-3 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800">
                <div className="flex min-w-0 items-center gap-3">
                  <IconChip icon={movement.icon} tintKey={movement.label} />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-800 dark:text-ink-200">{movement.label}</p>
                    <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                      {dateFormatter.format(new Date(movement.date))}
                      {movement.sublabel ? ` · ${movement.sublabel}` : ""}
                    </p>
                  </div>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium ${
                    movement.amount < 0 ? "text-coral-600 dark:text-coral-400" : "text-teal-600 dark:text-teal-400"
                  }`}
                >
                  {formatAmount(movement.amount)}
                </span>
              </Card>
            </button>
          ))}
          <p className="text-xs text-ink-400 dark:text-ink-500">
            Le decisioni di spesa/entrata di questo periodo — clicca per modificare o eliminare.
          </p>
        </div>
      </CollapsibleSection>

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
