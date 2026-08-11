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

export type EditableIncome = {
  id: string;
  amount: unknown;
  source: string;
  date: string | Date;
  notes: string | null;
  cashMovements: { accountId: string }[];
};

export function EditIncomeDialog({
  income,
  open,
  onOpenChange,
}: {
  income: EditableIncome | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: accounts } = trpc.account.list.useQuery();

  // Niente useEffect: vedi il commento in EditExpenseDialog.tsx — il
  // genitore rimonta questo componente con `key={income.id}` quando cambia
  // il movimento selezionato, quindi lo stato iniziale calcolato qui è
  // sempre già quello giusto.
  const [amount, setAmount] = useState(() => (income ? String(Number(income.amount)) : ""));
  const [source, setSource] = useState(() => income?.source ?? "");
  const [accountId, setAccountId] = useState(() => income?.cashMovements[0]?.accountId ?? "");
  const [date, setDate] = useState(() => (income ? toDateInputValue(income.date) : ""));
  const [notes, setNotes] = useState(() => income?.notes ?? "");

  const activeAccounts = accounts?.filter((a) => !a.archived) ?? [];
  // Base UI's <Select> non deduce l'etichetta dal <SelectItem> selezionato
  // — senza questa mappa, <SelectValue> mostra l'id grezzo invece del testo.
  const accountItems = Object.fromEntries(activeAccounts.map((a) => [a.id, a.name]));

  function invalidateAndClose() {
    utils.dashboard.summary.invalidate();
    utils.account.list.invalidate();
    onOpenChange(false);
  }

  const updateIncome = trpc.income.update.useMutation({
    onSuccess: () => {
      toast.success("Entrata aggiornata.");
      invalidateAndClose();
    },
    onError: (error) => toast.error(error.message || "Impossibile aggiornare l'entrata."),
  });

  const deleteIncome = trpc.income.delete.useMutation({
    onSuccess: () => {
      toast.success("Entrata eliminata.");
      invalidateAndClose();
    },
    onError: (error) => toast.error(error.message || "Impossibile eliminare l'entrata."),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!income) return;

    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Importo non valido.");
      return;
    }
    if (!accountId) {
      toast.error("Seleziona un conto.");
      return;
    }

    updateIncome.mutate({
      id: income.id,
      amount: parsedAmount,
      source,
      accountId,
      date: new Date(date),
      notes: notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica entrata</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-income-amount">Importo (€)</Label>
            <Input id="edit-income-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-income-source">Provenienza</Label>
            <Input id="edit-income-source" value={source} onChange={(e) => setSource(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-income-account">Conto di accredito</Label>
            <Select items={accountItems} value={accountId} onValueChange={(value) => setAccountId(value ?? "")}>
              <SelectTrigger id="edit-income-account" className="w-full">
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
            <Label htmlFor="edit-income-date">Data</Label>
            <Input id="edit-income-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-income-notes">Note (opzionale)</Label>
            <Input id="edit-income-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={updateIncome.isPending}>
              {updateIncome.isPending ? "Salvataggio…" : "Salva"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={deleteIncome.isPending}
              onClick={() => income && deleteIncome.mutate({ id: income.id })}
            >
              Elimina
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
