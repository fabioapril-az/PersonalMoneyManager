"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { ACCOUNT_TYPE_LABELS } from "@/lib/domain/labels";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/domain/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function AccountsManager() {
  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.account.list.useQuery();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("CHECKING");
  const [openingBalance, setOpeningBalance] = useState("0");

  const createAccount = trpc.account.create.useMutation({
    onSuccess: () => {
      toast.success("Conto creato.");
      utils.account.list.invalidate();
      setOpen(false);
      setName("");
      setType("CHECKING");
      setOpeningBalance("0");
    },
    onError: (error) => toast.error(error.message || "Impossibile creare il conto."),
  });

  const setArchived = trpc.account.setArchived.useMutation({
    onSuccess: () => utils.account.list.invalidate(),
    onError: (error) => toast.error(error.message || "Operazione non riuscita."),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedBalance = Number(openingBalance.replace(",", "."));
    if (Number.isNaN(parsedBalance)) {
      toast.error("Saldo iniziale non valido.");
      return;
    }
    createAccount.mutate({ name, type, openingBalance: parsedBalance });
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">I tuoi conti</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button>+ Nuovo conto</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuovo conto</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-name">Nome</Label>
                <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-type">Tipo</Label>
                <Select value={type} onValueChange={(value) => setType(value as AccountType)}>
                  <SelectTrigger id="account-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((accountType) => (
                      <SelectItem key={accountType} value={accountType}>
                        {ACCOUNT_TYPE_LABELS[accountType]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-balance">Saldo iniziale (€)</Label>
                <Input
                  id="account-balance"
                  inputMode="decimal"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createAccount.isPending}>
                  {createAccount.isPending ? "Creazione…" : "Crea conto"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-sm text-zinc-500 dark:text-zinc-400">Caricamento…</p>}
      {!isLoading && accounts?.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nessun conto ancora — creane uno per iniziare a registrare le spese.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {accounts?.map((account) => (
          <Card
            key={account.id}
            className={`flex flex-row items-center justify-between p-4 ${account.archived ? "opacity-50" : ""}`}
          >
            <div>
              <p className="font-medium text-zinc-950 dark:text-zinc-50">{account.name}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {ACCOUNT_TYPE_LABELS[account.type as AccountType]} ·{" "}
                {currencyFormatter.format(Number(account.openingBalance))}
                {account.archived && " · Archiviato"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={setArchived.isPending}
              onClick={() => setArchived.mutate({ id: account.id, archived: !account.archived })}
            >
              {account.archived ? "Riattiva" : "Archivia"}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
