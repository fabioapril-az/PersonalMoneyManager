"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function toDateInputValue(date: Date | string) {
  return new Date(date).toISOString().slice(0, 10);
}

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
  paymentPlan: { accountId: string } | null;
};

export function EditExpenseDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: EditableExpense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [accountId, setAccountId] = useState(() => expense?.paymentPlan?.accountId ?? "");
  const [description, setDescription] = useState(() => expense?.description ?? "");
  const [date, setDate] = useState(() => (expense ? toDateInputValue(expense.date) : ""));
  const [notes, setNotes] = useState(() => expense?.notes ?? "");

  const activeAccounts = accounts?.filter((a) => !a.archived) ?? [];
  const categoryOptions = buildCategoryOptions(categories ?? []);

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

    updateExpense.mutate({
      id: expense.id,
      amount: parsedAmount,
      categoryId,
      accountId,
      description,
      date: new Date(date),
      notes: notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica spesa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-expense-amount">Importo (€)</Label>
            <Input id="edit-expense-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-expense-category">Categoria</Label>
            <Select value={categoryId} onValueChange={(value) => setCategoryId(value ?? "")}>
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
            <Select value={accountId} onValueChange={(value) => setAccountId(value ?? "")}>
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
          <DialogFooter>
            <Button type="submit" disabled={updateExpense.isPending}>
              {updateExpense.isPending ? "Salvataggio…" : "Salva"}
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
