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

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

// Un trasferimento tra due tuoi conti (es. ricarica Satispay dal conto
// corrente) — Rule 2: non è una spesa né un'entrata, quindi niente form
// "spesa"/"entrata" andava bene per questo caso. Vedi server/routers/transfer.ts.
export function NewTransferDialog() {
  const utils = trpc.useUtils();
  const { data: accounts } = trpc.account.list.useQuery();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [notes, setNotes] = useState("");

  const activeAccounts = accounts?.filter((a) => !a.archived) ?? [];
  // Base UI's <Select> non deduce l'etichetta dal <SelectItem> selezionato
  // — senza questa mappa, <SelectValue> mostra l'id grezzo invece del testo.
  const accountItems = Object.fromEntries(activeAccounts.map((a) => [a.id, a.name]));

  const createTransfer = trpc.transfer.create.useMutation({
    onSuccess: () => {
      toast.success("Trasferimento registrato.");
      utils.dashboard.summary.invalidate();
      utils.account.list.invalidate();
      resetAndClose();
    },
    onError: (error) => toast.error(error.message || "Impossibile registrare il trasferimento."),
  });

  function resetAndClose() {
    setAmount("");
    setFromAccountId("");
    setToAccountId("");
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
    if (!fromAccountId || !toAccountId) {
      toast.error("Seleziona entrambi i conti.");
      return;
    }
    if (fromAccountId === toAccountId) {
      toast.error("Il conto di partenza e di arrivo devono essere diversi.");
      return;
    }

    createTransfer.mutate({
      amount: parsedAmount,
      fromAccountId,
      toAccountId,
      date: new Date(date),
      notes: notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" variant="outline">+ Trasferimento</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuovo trasferimento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer-amount">Importo (€)</Label>
            <Input
              id="transfer-amount"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer-from">Da</Label>
            <Select items={accountItems} value={fromAccountId} onValueChange={(value) => setFromAccountId(value ?? "")}>
              <SelectTrigger id="transfer-from" className="w-full">
                <SelectValue placeholder="Conto di partenza" />
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
            <Label htmlFor="transfer-to">A</Label>
            <Select items={accountItems} value={toAccountId} onValueChange={(value) => setToAccountId(value ?? "")}>
              <SelectTrigger id="transfer-to" className="w-full">
                <SelectValue placeholder="Conto di arrivo" />
              </SelectTrigger>
              <SelectContent>
                {activeAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeAccounts.length < 2 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Servono almeno due conti — creane un altro in &quot;Conti&quot; prima di continuare.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer-date">Data</Label>
            <Input id="transfer-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer-notes">Note (opzionale)</Label>
            <Input id="transfer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createTransfer.isPending}>
              {createTransfer.isPending ? "Registrazione…" : "Registra trasferimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
