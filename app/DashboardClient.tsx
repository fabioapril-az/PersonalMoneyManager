"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { CASH_MOVEMENT_TYPE_LABELS } from "@/lib/domain/labels";
import type { CashMovementType } from "@/lib/domain/enums";
import { shiftPeriods, type FinancialPeriod } from "@/lib/domain/period";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewExpenseDialog } from "./NewExpenseDialog";
import { NewIncomeDialog } from "./NewIncomeDialog";
import { NewTransferDialog } from "./NewTransferDialog";
import { EditExpenseDialog, type EditableExpense } from "./EditExpenseDialog";
import { EditIncomeDialog, type EditableIncome } from "./EditIncomeDialog";

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
// per la stessa chiave (descrizione/nome categoria) ogni volta, via hash
// deterministico. Category.color esiste nello schema ma non c'è ancora un
// picker per impostarlo: finché non c'è, questa è l'alternativa.
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
// questo periodo, non per l'importo intero come in "Spese e entrate".
// Cliccabile: la spesa a monte può essere stata decisa in un periodo diverso
// da quello mostrato (una rata in scadenza ora, comprata il mese scorso), e
// "Spese e entrate" (scoped al periodo corrente) non basterebbe a trovarla —
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
    <CollapsibleSection title={`Cosa concorre al Budget (${lines.length})`} defaultOpen>
      <div className="flex flex-col gap-2">
        {lines.map((line) => (
          <button key={line.id} type="button" className="w-full text-left" onClick={() => onEditExpense(line.expenseId)}>
            <Card className="flex flex-row items-center justify-between gap-3 p-3 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800">
              <div className="flex min-w-0 items-center gap-3">
                <IconChip icon={line.categoryIcon} tintKey={line.description} />
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-800 dark:text-ink-200">
                    {line.description}
                    {line.installment && ` · rata ${line.installment.no}/${line.installment.count}`}
                  </p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {line.accountName ? `${line.accountName} · ` : ""}
                    {dateFormatter.format(new Date(line.date))}
                    {line.installment ? " (scadenza)" : ""}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-sm font-medium text-coral-600 dark:text-coral-400">
                {formatAmount(-Number(line.amount))}
              </span>
            </Card>
          </button>
        ))}
        <p className="text-xs text-ink-400 dark:text-ink-500">
          Ogni riga che compone lo &quot;Speso&quot; del Budget qui sopra — pagamenti immediati e carta alla data
          d&apos;acquisto, rate alla loro scadenza. Clicca per modificare la spesa.
        </p>
      </div>
    </CollapsibleSection>
  );
}

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

export function DashboardClient() {
  const utils = trpc.useUtils();
  // undefined => periodo corrente (il server sceglie "oggi"); una volta che
  // si naviga altrove diventa una data concreta dentro il periodo mostrato.
  const [referenceDate, setReferenceDate] = useState<Date | undefined>(undefined);
  const { data, isLoading } = trpc.dashboard.summary.useQuery({ referenceDate });
  const [editingExpense, setEditingExpense] = useState<EditableExpense | null>(null);
  const [editingIncome, setEditingIncome] = useState<EditableIncome | null>(null);

  // "Rate in corso"/"Carta di credito in attesa" e "Cosa concorre al
  // Budget" possono riferirsi a una spesa decisa in un periodo diverso da
  // quello mostrato — periodExpenses (scoped al periodo corrente) non
  // basterebbe a trovarla, quindi la si recupera al volo con expense.getById
  // invece di limitarsi ai dati già caricati.
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

  const {
    period,
    isCurrentPeriod,
    totalIncome,
    totalExpense,
    available,
    monthlyBudget,
    budgetSpent,
    budgetLines,
    accounts,
    periodExpenses,
    periodIncomes,
    cashMovements,
  } = data;

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

  // Tutte le voci del periodo, non solo le ultime 5 — vedi il commento su
  // periodExpenses/periodIncomes in server/routers/dashboard.ts.
  const movements = [
    ...periodExpenses.map((e) => ({
      id: e.id,
      kind: "expense" as const,
      date: e.date,
      label: e.description,
      icon: e.category.icon,
      // Categoria (cosa) + conto e, se a rate, quante (come) — vedi il
      // commento su paymentPlan in server/routers/dashboard.ts. L'icona è nel
      // chip, non ripetuta qui.
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
      // Un'entrata non ha categoria — un'icona generica per il chip.
      icon: "💶",
      // Conto di accredito (come) — un'entrata non ha un "metodo di
      // pagamento", solo il conto su cui è arrivata.
      sublabel: i.cashMovements[0]?.account.name ?? null,
      amount: Number(i.amount),
      raw: i,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
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
          <p className="text-sm font-semibold text-ink-950 sm:text-lg dark:text-ink-50">
            {formatAmount(available)}
          </p>
        </Card>
      </div>

      <CollapsibleSection title="Saldo conti">
        <div className="flex flex-col gap-2">
          {accounts.length === 0 && (
            <p className="text-sm text-ink-500 dark:text-ink-400">
              Nessun conto ancora — vai su &quot;Conti&quot; per crearne uno.
            </p>
          )}
          {accounts.map((account) => (
            <Card key={account.id} className="flex flex-row items-center justify-between gap-2 p-3">
              <span className="min-w-0 truncate text-sm text-ink-800 dark:text-ink-200">{account.name}</span>
              <span className="shrink-0 text-sm font-medium text-ink-950 dark:text-ink-50">
                {formatAmount(account.balance)}
              </span>
            </Card>
          ))}
          <p className="text-xs text-ink-400 dark:text-ink-500">
            Saldo iniziale + movimenti registrati su ogni conto — per cambiare il saldo iniziale vai su
            &quot;Conti&quot;.
          </p>
        </div>
      </CollapsibleSection>

      <PendingSchedulesSection onEditExpense={handleEditExpenseById} />

      <CashMovementsSection movements={cashMovements} />

      <CollapsibleSection title={`Spese e entrate (${movements.length})`}>
        <div className="flex flex-col gap-2">
          {movements.length === 0 && (
            <p className="text-sm text-ink-500 dark:text-ink-400">
              Nessun movimento in questo periodo — usa i pulsanti sopra per iniziare.
            </p>
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
                    movement.amount < 0
                      ? "text-coral-600 dark:text-coral-400"
                      : "text-teal-600 dark:text-teal-400"
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

      {/* Budget in fondo, con il suo dettaglio riga-per-riga espanso di
          default (BudgetBreakdownSection) — tutto ciò da cui quelle righe
          provengono (Impegni futuri, Movimenti di cassa, Spese e entrate) è
          già stato mostrato sopra, per chi vuole più contesto prima. */}
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

      <BudgetBreakdownSection lines={budgetLines} onEditExpense={handleEditExpenseById} />

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
