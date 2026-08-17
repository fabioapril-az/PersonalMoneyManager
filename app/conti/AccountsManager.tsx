"use client";

import { useState } from "react";
import Link from "next/link";
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
import { Checkbox } from "@/components/ui/checkbox";

const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

type AccountListItem = {
  id: string;
  name: string;
  type: string;
  balance: unknown;
  openingBalance: unknown;
  statementDay: number | null;
  excludeFromTotals: boolean;
  archived: boolean;
};

// Ticket pasto e benefit simili (spendibili, ma non "soldi tuoi") — vedi il
// commento su Account.excludeFromTotals in schema.prisma.
function ExcludeFromTotalsField({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
        <Label htmlFor={id} className="font-normal">
          Non conta come liquidità reale
        </Label>
      </div>
      <p className="text-xs text-ink-500 dark:text-ink-400">
        Per benefit come i ticket pasto: le spese restano visibili per categoria, ma questo conto non entra in
        &quot;Disponibile&quot; né nel Budget mensile.
      </p>
    </div>
  );
}

function AccountTypeSelect({ value, onChange, id }: { value: AccountType; onChange: (v: AccountType) => void; id: string }) {
  return (
    // items: Base UI's <Select> non deduce l'etichetta dal <SelectItem>
    // selezionato — senza questa mappa, <SelectValue> mostrerebbe il valore
    // grezzo dell'enum (es. "CREDIT_CARD") invece di "Carta di credito".
    <Select items={ACCOUNT_TYPE_LABELS} value={value} onValueChange={(v) => onChange(v as AccountType)}>
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

// Solo per le carte di credito (PRD sezione 6) — il giorno del mese in cui
// l'acquisto diventa un vero addebito, il mese successivo.
function StatementDayField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Giorno di fatturazione (1-31)</Label>
      <Input id={id} type="number" min={1} max={31} value={value} onChange={(e) => onChange(e.target.value)} required />
      <p className="text-xs text-ink-500 dark:text-ink-400">
        Un acquisto oggi verrà addebitato a questo giorno del mese successivo, non subito.
      </p>
    </div>
  );
}

function AccountRow({ account }: { account: AccountListItem }) {
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(account.name);
  const [type, setType] = useState<AccountType>(account.type as AccountType);
  const [openingBalance, setOpeningBalance] = useState(String(Number(account.openingBalance)));
  const [statementDay, setStatementDay] = useState(account.statementDay != null ? String(account.statementDay) : "");
  const [excludeFromTotals, setExcludeFromTotals] = useState(account.excludeFromTotals);

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
    if (type === "CREDIT_CARD" && !statementDay) {
      toast.error("Indica il giorno di fatturazione.");
      return;
    }
    updateAccount.mutate({
      id: account.id,
      name,
      type,
      openingBalance: parsedBalance,
      statementDay: type === "CREDIT_CARD" ? Number(statementDay) : null,
      excludeFromTotals,
    });
  }

  return (
    <Card className={`flex flex-row items-center justify-between gap-2 p-4 ${account.archived ? "opacity-50" : ""}`}>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger
          render={
            <button type="button" className="min-w-0 flex-1 rounded-md text-left hover:opacity-70">
              <p className="truncate font-medium text-ink-950 dark:text-ink-50">{account.name}</p>
              <p className="truncate text-sm text-ink-500 dark:text-ink-400">
                {ACCOUNT_TYPE_LABELS[account.type as AccountType]} · {currencyFormatter.format(Number(account.balance))}
                {account.excludeFromTotals && " · non conta come liquidità"}
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
            {type === "CREDIT_CARD" && (
              <StatementDayField id="edit-account-statement-day" value={statementDay} onChange={setStatementDay} />
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-account-balance">Saldo iniziale (€)</Label>
              <Input
                id="edit-account-balance"
                inputMode="decimal"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Il saldo mostrato nella lista è questo valore + le spese/entrate registrate da allora.
              </p>
            </div>
            <ExcludeFromTotalsField
              id="edit-account-exclude"
              checked={excludeFromTotals}
              onChange={setExcludeFromTotals}
            />
            <DialogFooter>
              <Button type="submit" disabled={updateAccount.isPending}>
                {updateAccount.isPending ? "Salvataggio…" : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="flex shrink-0 items-center gap-2">
        {/* Per verificare un addebito reale (es. l'estratto conto arrivato
            oggi) contro quello registrato — vedi app/conti/[id]. */}
        <Button variant="outline" size="sm" render={<Link href={`/conti/${account.id}`}>Movimenti</Link>} />
        <Button
          variant="outline"
          size="sm"
          disabled={setArchived.isPending}
          onClick={() => setArchived.mutate({ id: account.id, archived: !account.archived })}
        >
          {account.archived ? "Riattiva" : "Archivia"}
        </Button>
      </div>
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
  const [statementDay, setStatementDay] = useState("");
  const [excludeFromTotals, setExcludeFromTotals] = useState(false);

  const createAccount = trpc.account.create.useMutation({
    onSuccess: () => {
      toast.success("Conto creato.");
      utils.account.list.invalidate();
      utils.dashboard.summary.invalidate();
      setOpen(false);
      setName("");
      setType("CHECKING");
      setOpeningBalance("0");
      setStatementDay("");
      setExcludeFromTotals(false);
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
    if (type === "CREDIT_CARD" && !statementDay) {
      toast.error("Indica il giorno di fatturazione.");
      return;
    }
    createAccount.mutate({
      name,
      type,
      openingBalance: parsedBalance,
      statementDay: type === "CREDIT_CARD" ? Number(statementDay) : undefined,
      excludeFromTotals,
    });
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-950 dark:text-ink-50">I tuoi conti</h2>
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
              {type === "CREDIT_CARD" && (
                <StatementDayField id="account-statement-day" value={statementDay} onChange={setStatementDay} />
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-balance">Saldo iniziale (€)</Label>
                <Input
                  id="account-balance"
                  inputMode="decimal"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
              </div>
              <ExcludeFromTotalsField
                id="account-exclude"
                checked={excludeFromTotals}
                onChange={setExcludeFromTotals}
              />
              <DialogFooter>
                <Button type="submit" disabled={createAccount.isPending}>
                  {createAccount.isPending ? "Creazione…" : "Crea conto"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-sm text-ink-500 dark:text-ink-400">Caricamento…</p>}
      {!isLoading && accounts?.length === 0 && (
        <p className="text-sm text-ink-500 dark:text-ink-400">
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
