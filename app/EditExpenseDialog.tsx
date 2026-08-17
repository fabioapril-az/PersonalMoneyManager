"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toDateInputValue } from "@/lib/domain/dateInput";

function buildCategoryOptions(categories: { id: string; name: string; parentId: string | null; icon: string | null }[]) {
  const topLevel = categories.filter((c) => !c.parentId);
  const options: { id: string; label: string }[] = [];
  for (const parent of topLevel) {
    options.push({ id: parent.id, label: `${parent.icon ? `${parent.icon} ` : ""}${parent.name}` });
    for (const child of categories.filter((c) => c.parentId === parent.id)) {
      options.push({
        id: child.id,
        label: `${child.icon ? `${child.icon} ` : ""}${parent.name} › ${child.name}`,
      });
    }
  }
  return options;
}

export type EditableExpense = {
  id: string;
  amount: unknown;
  categoryId: string;
  description: string;
  date: string | Date;
  notes: string | null;
  paymentPlan: { accountId: string; installmentsCount: number | null } | null;
  // Presente solo su una spesa PLANNED non ancora confermata (PRD sezione 9)
  // — nessun paymentPlan proprio ancora, ma il template da cui è nata ha
  // comunque un conto "di default" da pre-compilare, invece di lasciare il
  // campo vuoto. Opzionale: le spese normali (già confermate) non lo hanno.
  recurringTemplate?: { accountId: string } | null;
  // "Spalma sul Budget" — vedi il commento sul campo in schema.prisma.
  budgetSpreadPeriods?: number | null;
};

export function EditExpenseDialog({
  expense,
  open,
  onOpenChange,
  title = "Modifica spesa",
  submitLabel = "Salva",
}: {
  expense: EditableExpense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  submitLabel?: string;
}) {
  const utils = trpc.useUtils();
  const { data: categories } = trpc.category.list.useQuery();
  const { data: accounts } = trpc.account.list.useQuery();

  // Stato inizializzato direttamente da `expense`, niente useEffect: il
  // genitore (DashboardClient) passa `key={expense.id}` così React monta
  // un'istanza fresca — con lo stato iniziale giusto — ogni volta che si
  // seleziona un movimento diverso, invece di sincronizzare props->state
  // dopo il render (anti-pattern, vedi react-hooks/set-state-in-effect).
  const [amount, setAmount] = useState(() => (expense ? String(Number(expense.amount)) : ""));
  const [categoryId, setCategoryId] = useState(() => expense?.categoryId ?? "");
  const [accountId, setAccountId] = useState(
    () => expense?.paymentPlan?.accountId ?? expense?.recurringTemplate?.accountId ?? ""
  );
  const [description, setDescription] = useState(() => expense?.description ?? "");
  const [date, setDate] = useState(() => (expense ? toDateInputValue(expense.date) : ""));
  const [notes, setNotes] = useState(() => expense?.notes ?? "");
  const initialInstallmentsCount = expense?.paymentPlan?.installmentsCount ?? 1;
  const [isInstallments, setIsInstallments] = useState(() => initialInstallmentsCount > 1);
  const [installments, setInstallments] = useState(() => String(Math.max(initialInstallmentsCount, 2)));
  const [isBudgetSpread, setIsBudgetSpread] = useState(() => (expense?.budgetSpreadPeriods ?? 0) >= 2);
  const [budgetSpreadPeriods, setBudgetSpreadPeriods] = useState(() =>
    String(Math.max(expense?.budgetSpreadPeriods ?? 2, 2))
  );

  const activeAccounts = accounts?.filter((a) => !a.archived) ?? [];
  const categoryOptions = buildCategoryOptions(categories ?? []);
  // Base UI's <Select> non deduce l'etichetta dal <SelectItem> selezionato
  // — senza questa mappa, <SelectValue> mostra l'id grezzo invece del testo.
  const categoryItems = Object.fromEntries(categoryOptions.map((o) => [o.id, o.label]));
  const accountItems = Object.fromEntries(activeAccounts.map((a) => [a.id, a.name]));

  function invalidateAndClose() {
    utils.dashboard.summary.invalidate();
    utils.account.list.invalidate();
    onOpenChange(false);
  }

  const updateExpense = trpc.expense.update.useMutation({
    onSuccess: () => {
      toast.success("Spesa aggiornata.");
      invalidateAndClose();
    },
    onError: (error) => toast.error(error.message || "Impossibile aggiornare la spesa."),
  });

  const deleteExpense = trpc.expense.delete.useMutation({
    onSuccess: () => {
      toast.success("Spesa eliminata.");
      invalidateAndClose();
    },
    onError: (error) => toast.error(error.message || "Impossibile eliminare la spesa."),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!expense) return;

    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Importo non valido.");
      return;
    }
    if (!categoryId || !accountId) {
      toast.error("Seleziona categoria e metodo di pagamento.");
      return;
    }
    const parsedInstallments = Number(installments);
    if (isInstallments && (!Number.isInteger(parsedInstallments) || parsedInstallments < 2)) {
      toast.error("Il numero di rate deve essere almeno 2.");
      return;
    }
    const parsedSpread = Number(budgetSpreadPeriods);
    if (isBudgetSpread && (!Number.isInteger(parsedSpread) || parsedSpread < 2)) {
      toast.error("Il numero di mesi deve essere almeno 2.");
      return;
    }

    updateExpense.mutate({
      id: expense.id,
      amount: parsedAmount,
      categoryId,
      accountId,
      description,
      date: new Date(date),
      notes: notes || undefined,
      installments: isInstallments ? parsedInstallments : undefined,
      budgetSpreadPeriods: isBudgetSpread ? parsedSpread : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-expense-amount">Importo (€)</Label>
            <Input id="edit-expense-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-expense-category">Categoria</Label>
            <Select items={categoryItems} value={categoryId} onValueChange={(value) => setCategoryId(value ?? "")}>
              <SelectTrigger id="edit-expense-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-expense-account">Metodo di pagamento</Label>
            <Select items={accountItems} value={accountId} onValueChange={(value) => setAccountId(value ?? "")}>
              <SelectTrigger id="edit-expense-account" className="w-full">
                <SelectValue placeholder="Seleziona conto" />
              </SelectTrigger>
              <SelectContent>
                {activeAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-expense-description">Descrizione</Label>
            <Input
              id="edit-expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-expense-date">Data</Label>
            <Input id="edit-expense-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-expense-notes">Note (opzionale)</Label>
            <Input id="edit-expense-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-expense-installments-toggle"
              checked={isInstallments}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setIsInstallments(next);
                if (next) setIsBudgetSpread(false);
              }}
            />
            <Label htmlFor="edit-expense-installments-toggle" className="font-normal">
              Pagamento a rate
            </Label>
          </div>
          {isInstallments && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-expense-installments-count">Numero di rate</Label>
              <Input
                id="edit-expense-installments-count"
                type="number"
                min={2}
                max={60}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                required
              />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Attenzione: modificando la spesa, il piano rate viene ricreato da zero — eventuali rate già
                segnate come pagate tornano in attesa (tranne la prima).
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-expense-budget-spread-toggle"
              checked={isBudgetSpread}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setIsBudgetSpread(next);
                if (next) setIsInstallments(false);
              }}
            />
            <Label htmlFor="edit-expense-budget-spread-toggle" className="font-normal">
              Spalma sul Budget su più mesi
            </Label>
          </div>
          {isBudgetSpread && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-expense-budget-spread-count">Quanti mesi copre (incluso questo)?</Label>
              <Input
                id="edit-expense-budget-spread-count"
                type="number"
                min={2}
                max={60}
                value={budgetSpreadPeriods}
                onChange={(e) => setBudgetSpreadPeriods(e.target.value)}
                required
              />
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Esce dal conto per intero, come sempre — solo il Budget mensile ne legge una quota in questo mese e
                in ciascuno dei successivi.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={updateExpense.isPending}>
              {updateExpense.isPending ? "Salvataggio…" : submitLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={deleteExpense.isPending}
              onClick={() => expense && deleteExpense.mutate({ id: expense.id })}
            >
              Elimina
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
