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
import { Checkbox } from "@/components/ui/checkbox";
import { computeCardStatementDate } from "@/lib/domain/creditCard";
import { splitIntoInstallments } from "@/lib/domain/installments";
import { todayInputValue } from "@/lib/domain/dateInput";

// Nessun timeZone: "UTC" qui — a differenza di dateFormatter in
// DashboardClient.tsx, questa formatta un'anteprima calcolata interamente
// lato client a partire dall'input dell'utente (stesso fuso di chi la
// guarda), quindi forzare UTC introdurrebbe un disallineamento invece di
// risolverlo.
const statementDateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

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
  const [isInstallments, setIsInstallments] = useState(false);
  const [installments, setInstallments] = useState("3");
  // "Spalma sul Budget" (bollette bimestrali, spese straordinarie a cavallo
  // di più mesi) — mutuamente esclusivo con le rate, vedi i due
  // onCheckedChange sotto: attivarne uno disattiva l'altro.
  const [isBudgetSpread, setIsBudgetSpread] = useState(false);
  const [budgetSpreadPeriods, setBudgetSpreadPeriods] = useState("2");

  const activeAccounts = accounts?.filter((a) => !a.archived) ?? [];
  const categoryOptions = buildCategoryOptions(categories ?? []);
  // Base UI's <Select> non deduce l'etichetta dal <SelectItem> selezionato
  // (a differenza di altre librerie) — senza questa mappa, <SelectValue>
  // mostra l'id grezzo invece del testo. Vedi anche EditExpenseDialog,
  // NewIncomeDialog, EditIncomeDialog, AccountsManager, CategoriesManager.
  const categoryItems = Object.fromEntries(categoryOptions.map((o) => [o.id, o.label]));
  const accountItems = Object.fromEntries(activeAccounts.map((a) => [a.id, a.name]));
  const selectedAccount = activeAccounts.find((a) => a.id === accountId);
  // Le rate prevalgono sulla logica "carta di credito" (vedi
  // server/routers/expense.ts) — l'anteprima estratto conto ha senso solo
  // se NON è a rate.
  const statementPreview =
    !isInstallments && selectedAccount?.type === "CREDIT_CARD" && selectedAccount.statementDay != null
      ? computeCardStatementDate(new Date(date), selectedAccount.statementDay)
      : null;
  const parsedAmountPreview = Number(amount.replace(",", "."));
  const parsedInstallmentsPreview = Number(installments);
  const installmentAmounts =
    isInstallments && Number.isFinite(parsedAmountPreview) && parsedAmountPreview > 0 && parsedInstallmentsPreview >= 2
      ? splitIntoInstallments(parsedAmountPreview, parsedInstallmentsPreview)
      : null;
  const parsedSpreadPreview = Number(budgetSpreadPeriods);
  const budgetSpreadShare =
    isBudgetSpread && Number.isFinite(parsedAmountPreview) && parsedAmountPreview > 0 && parsedSpreadPreview >= 2
      ? splitIntoInstallments(parsedAmountPreview, parsedSpreadPreview)[0]
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
    setIsInstallments(false);
    setInstallments("3");
    setIsBudgetSpread(false);
    setBudgetSpreadPeriods("2");
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

    createExpense.mutate({
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
              <p className="text-xs text-ink-500 dark:text-ink-400">
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
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Nessun conto — creane uno in &quot;Conti&quot; prima di continuare.
              </p>
            )}
            {statementPreview && (
              <p className="text-xs text-ink-500 dark:text-ink-400">
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
          <div className="group/field flex items-center gap-2">
            <Checkbox
              id="expense-installments-toggle"
              checked={isInstallments}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setIsInstallments(next);
                if (next) setIsBudgetSpread(false);
              }}
            />
            <Label htmlFor="expense-installments-toggle" className="font-normal">
              Pagamento a rate
            </Label>
          </div>
          {isInstallments && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-installments-count">Numero di rate</Label>
              <Input
                id="expense-installments-count"
                type="number"
                min={2}
                max={60}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                required
              />
              {installmentAmounts && (
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {installmentAmounts.length} rate: la 1ª (
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
                    installmentAmounts[0]
                  )}
                  ) pagata subito, le altre mensili — la trovi in &quot;Impegni futuri&quot;.
                </p>
              )}
            </div>
          )}
          <div className="group/field flex items-center gap-2">
            <Checkbox
              id="expense-budget-spread-toggle"
              checked={isBudgetSpread}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setIsBudgetSpread(next);
                if (next) setIsInstallments(false);
              }}
            />
            <Label htmlFor="expense-budget-spread-toggle" className="font-normal">
              Spalma sul Budget su più mesi
            </Label>
          </div>
          {isBudgetSpread && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-budget-spread-count">Quanti mesi copre (incluso questo)?</Label>
              <Input
                id="expense-budget-spread-count"
                type="number"
                min={2}
                max={60}
                value={budgetSpreadPeriods}
                onChange={(e) => setBudgetSpreadPeriods(e.target.value)}
                required
              />
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Per bollette bimestrali o spese straordinarie: esce dal conto per intero, subito, come sempre — solo
                il Budget mensile ne leggerà una quota
                {budgetSpreadShare != null &&
                  ` (${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(budgetSpreadShare)})`}{" "}
                in questo mese e in ciascuno dei successivi.
              </p>
            </div>
          )}
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
