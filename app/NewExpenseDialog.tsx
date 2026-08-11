"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeCardStatementDate } from "@/lib/domain/creditCard";

const statementDateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

// Categoria + sottocategoria (PRD sezione 4) come lista piatta con
// indentazione visiva — solo 2 livelli, non serve un tree component.
function buildCategoryOptions(
  categories: { id: string; name: string; parentId: string | null; icon: string | null }[]
) {
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

export function NewExpenseDialog() {
  const utils = trpc.useUtils();
  const { data: categories } = trpc.category.list.useQuery();
  const { data: accounts } = trpc.account.list.useQuery();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [notes, setNotes] = useState("");

  const activeAccounts = accounts?.filter((a) => !a.archived) ?? [];
  const categoryOptions = buildCategoryOptions(categories ?? []);
  // Base UI's <Select> non deduce l'etichetta dal <SelectItem> selezionato
  // (a differenza di altre librerie) — senza questa mappa, <SelectValue>
  // mostra l'id grezzo invece del testo. Vedi anche EditExpenseDialog,
  // NewIncomeDialog, EditIncomeDialog, AccountsManager, CategoriesManager.
  const categoryItems = Object.fromEntries(categoryOptions.map((o) => [o.id, o.label]));
  const accountItems = Object.fromEntries(activeAccounts.map((a) => [a.id, a.name]));
  const selectedAccount = activeAccounts.find((a) => a.id === accountId);
  const statementPreview =
    selectedAccount?.type === "CREDIT_CARD" && selectedAccount.statementDay != null
      ? computeCardStatementDate(new Date(date), selectedAccount.statementDay)
      : null;

  const createExpense = trpc.expense.create.useMutation({
    onSuccess: () => {
      toast.success("Spesa registrata.");
      utils.dashboard.summary.invalidate();
      utils.account.list.invalidate();
      resetAndClose();
    },
    onError: (error) => toast.error(error.message || "Impossibile registrare la spesa."),
  });

  function resetAndClose() {
    setAmount("");
    setCategoryId("");
    setAccountId("");
    setDescription("");
    setDate(todayInputValue());
    setNotes("");
    setOpen(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Importo non valido.");
      return;
    }
    if (!categoryId || !accountId) {
      toast.error("Seleziona categoria e metodo di pagamento.");
      return;
    }

    createExpense.mutate({
      amount: parsedAmount,
      categoryId,
      accountId,
      description,
      date: new Date(date),
      notes: notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg">+ Spesa</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuova spesa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-amount">Importo (€)</Label>
            <Input
              id="expense-amount"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-category">Categoria</Label>
            <Select items={categoryItems} value={categoryId} onValueChange={(value) => setCategoryId(value ?? "")}>
              <SelectTrigger id="expense-category" className="w-full">
                <SelectValue placeholder="Seleziona categoria" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoryOptions.length === 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Nessuna categoria — creane una in &quot;Categorie&quot; prima di continuare.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-account">Metodo di pagamento</Label>
            <Select items={accountItems} value={accountId} onValueChange={(value) => setAccountId(value ?? "")}>
              <SelectTrigger id="expense-account" className="w-full">
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
            {activeAccounts.length === 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Nessun conto — creane uno in &quot;Conti&quot; prima di continuare.
              </p>
            )}
            {statementPreview && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Verrà addebitata il {statementDateFormatter.format(statementPreview)}, non subito.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-description">Descrizione</Label>
            <Input
              id="expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Es. Cena al ristorante"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-date">Data</Label>
            <Input id="expense-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-notes">Note (opzionale)</Label>
            <Input id="expense-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createExpense.isPending}>
              {createExpense.isPending ? "Registrazione…" : "Registra spesa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
