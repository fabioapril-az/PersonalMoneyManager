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
import { todayInputValue } from "@/lib/domain/dateInput";

export function NewIncomeDialog() {
  const utils = trpc.useUtils();
  const { data: accounts } = trpc.account.list.useQuery();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [notes, setNotes] = useState("");

  const activeAccounts = accounts?.filter((a) => !a.archived) ?? [];
  // Base UI's <Select> non deduce l'etichetta dal <SelectItem> selezionato
  // — senza questa mappa, <SelectValue> mostra l'id grezzo invece del testo.
  const accountItems = Object.fromEntries(activeAccounts.map((a) => [a.id, a.name]));

  const createIncome = trpc.income.create.useMutation({
    onSuccess: () => {
      toast.success("Entrata registrata.");
      utils.dashboard.summary.invalidate();
      utils.account.list.invalidate();
      resetAndClose();
    },
    onError: (error) => toast.error(error.message || "Impossibile registrare l'entrata."),
  });

  function resetAndClose() {
    setAmount("");
    setSource("");
    setAccountId("");
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
    if (!accountId) {
      toast.error("Seleziona un conto.");
      return;
    }

    createIncome.mutate({
      amount: parsedAmount,
      source,
      accountId,
      date: new Date(date),
      notes: notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" variant="outline">+ Entrata</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuova entrata</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="income-amount">Importo (€)</Label>
            <Input
              id="income-amount"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="income-source">Provenienza</Label>
            <Input
              id="income-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Es. Stipendio, Bonus, Rimborso"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="income-account">Conto di accredito</Label>
            <Select items={accountItems} value={accountId} onValueChange={(value) => setAccountId(value ?? "")}>
              <SelectTrigger id="income-account" className="w-full">
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
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="income-date">Data</Label>
            <Input id="income-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="income-notes">Note (opzionale)</Label>
            <Input id="income-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createIncome.isPending}>
              {createIncome.isPending ? "Registrazione…" : "Registra entrata"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
