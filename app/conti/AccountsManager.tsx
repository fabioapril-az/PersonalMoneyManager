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

type AccountListItem = {
  id: string;
  name: string;
  type: string;
  balance: unknown;
  openingBalance: unknown;
  archived: boolean;
};

function AccountTypeSelect({ value, onChange, id }: { value: AccountType; onChange: (v: AccountType) => void; id: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AccountType)}>
      <SelectTrigger id={id} className="w-full">
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
  );
}

function AccountRow({ account }: { account: AccountListItem }) {
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(account.name);
  const [type, setType] = useState<AccountType>(account.type as AccountType);
  const [openingBalance, setOpeningBalance] = useState(String(Number(account.openingBalance)));

  const updateAccount = trpc.account.update.useMutation({
    onSuccess: () => {
      toast.success("Conto aggiornato.");
      utils.account.list.invalidate();
      utils.dashboard.summary.invalidate();
      setEditOpen(false);
    },
    onError: (error) => toast.error(error.message || "Impossibile aggiornare il conto."),
  });

  const setArchived = trpc.account.setArchived.useMutation({
    onSuccess: () => {
      utils.account.list.invalidate();
      utils.dashboard.summary.invalidate();
    },
    onError: (error) => toast.error(error.message || "Operazione non riuscita."),
  });

  function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedBalance = Number(openingBalance.replace(",", "."));
    if (Number.isNaN(parsedBalance)) {
      toast.error("Saldo iniziale non valido.");
      return;
    }
    updateAccount.mutate({ id: account.id, name, type, openingBalance: parsedBalance });
  }

  return (
    <Card className={`flex flex-row items-center justify-between p-4 ${account.archived ? "opacity-50" : ""}`}>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger
          render={
            <button type="button" className="rounded-md text-left hover:opacity-70">
              <p className="font-medium text-zinc-950 dark:text-zinc-50">{account.name}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {ACCOUNT_TYPE_LABELS[account.type as AccountType]} · {currencyFormatter.format(Number(account.balance))}
                {account.archived && " · Archiviato"}
              </p>
            </button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica conto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-account-name">Nome</Label>
              <Input id="edit-account-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-account-type">Tipo</Label>
              <AccountTypeSelect id="edit-account-type" value={type} onChange={setType} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-account-balance">Saldo iniziale (€)</Label>
              <Input
                id="edit-account-balance"
                inputMode="decimal"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Il saldo mostrato nella lista è questo valore + le spese/entrate registrate da allora.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateAccount.isPending}>
                {updateAccount.isPending ? "Salvataggio…" : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Button
        variant="outline"
        size="sm"
        disabled={setArchived.isPending}
        onClick={() => setArchived.mutate({ id: account.id, archived: !account.archived })}
      >
        {account.archived ? "Riattiva" : "Archivia"}
      </Button>
    </Card>
  );
}

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
      utils.dashboard.summary.invalidate();
      setOpen(false);
      setName("");
      setType("CHECKING");
      setOpeningBalance("0");
    },
    onError: (error) => toast.error(error.message || "Impossibile creare il conto."),
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
                <AccountTypeSelect id="account-type" value={type} onChange={setType} />
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
          <AccountRow key={account.id} account={account} />
        ))}
      </div>
    </div>
  );
}
