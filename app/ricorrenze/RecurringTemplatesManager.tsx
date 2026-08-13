"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { RECURRING_FREQUENCY_LABELS } from "@/lib/domain/labels";
import { RECURRING_FREQUENCIES, type RecurringFrequency } from "@/lib/domain/enums";
import { todayInputValue } from "@/lib/domain/dateInput";
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
// timeZone UTC: nextRunDate è una data pura (mezzanotte UTC), stesso motivo
// di dateFormatter in app/movimenti/MovimentiClient.tsx.
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });

// Categoria + sottocategoria come lista piatta con indentazione visiva —
// stessa funzione duplicata in NewExpenseDialog.tsx/EditExpenseDialog.tsx
// (piccolo helper di UI, non logica di dominio: coerente con la convenzione
// del progetto di duplicarli invece di condividerli).
function buildCategoryOptions(
  categories: { id: string; name: string; parentId: string | null; icon: string | null }[]
) {
  const topLevel = categories.filter((c) => !c.parentId);
  const options: { id: string; label: string }[] = [];
  for (const parent of topLevel) {
    options.push({ id: parent.id, label: `${parent.icon ? `${parent.icon} ` : ""}${parent.name}` });
    for (const child of categories.filter((c) => c.parentId === parent.id)) {
      options.push({ id: child.id, label: `${child.icon ? `${child.icon} ` : ""}${parent.name} › ${child.name}` });
    }
  }
  return options;
}

type TemplateListItem = {
  id: string;
  name: string;
  amount: unknown;
  categoryId: string;
  accountId: string;
  frequency: string;
  nextRunDate: string | Date;
  active: boolean;
  category: { name: string; icon: string | null };
  account: { name: string };
};

function FrequencySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: RecurringFrequency;
  onChange: (value: RecurringFrequency) => void;
}) {
  return (
    // items: vedi il commento in AccountTypeSelect (app/conti/AccountsManager.tsx)
    // — senza questa mappa <SelectValue> mostrerebbe l'id grezzo dell'enum.
    <Select items={RECURRING_FREQUENCY_LABELS} value={value} onValueChange={(v) => onChange(v as RecurringFrequency)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RECURRING_FREQUENCIES.map((frequency) => (
          <SelectItem key={frequency} value={frequency}>
            {RECURRING_FREQUENCY_LABELS[frequency]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TemplateRow({
  template,
  categoryOptions,
  categoryItems,
  activeAccounts,
  accountItems,
}: {
  template: TemplateListItem;
  categoryOptions: { id: string; label: string }[];
  categoryItems: Record<string, string>;
  activeAccounts: { id: string; name: string }[];
  accountItems: Record<string, string>;
}) {
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(template.name);
  const [amount, setAmount] = useState(String(Number(template.amount)));
  const [categoryId, setCategoryId] = useState(template.categoryId);
  const [accountId, setAccountId] = useState(template.accountId);
  const [frequency, setFrequency] = useState<RecurringFrequency>(template.frequency as RecurringFrequency);

  function invalidateAll() {
    utils.recurringTemplate.list.invalidate();
    utils.expense.listPlanned.invalidate();
    utils.dashboard.summary.invalidate();
  }

  const updateTemplate = trpc.recurringTemplate.update.useMutation({
    onSuccess: () => {
      toast.success("Ricorrenza aggiornata.");
      invalidateAll();
      setEditOpen(false);
    },
    onError: (error) => toast.error(error.message || "Impossibile aggiornare la ricorrenza."),
  });

  const setActive = trpc.recurringTemplate.setActive.useMutation({
    onSuccess: invalidateAll,
    onError: (error) => toast.error(error.message || "Operazione non riuscita."),
  });

  const deleteTemplate = trpc.recurringTemplate.delete.useMutation({
    onSuccess: () => {
      toast.success("Ricorrenza eliminata.");
      invalidateAll();
    },
    onError: (error) => toast.error(error.message || "Impossibile eliminare la ricorrenza."),
  });

  function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Importo non valido.");
      return;
    }
    if (!categoryId || !accountId) {
      toast.error("Seleziona categoria e conto.");
      return;
    }
    updateTemplate.mutate({ id: template.id, name, amount: parsedAmount, categoryId, accountId, frequency });
  }

  return (
    <Card className={`flex flex-row items-center justify-between gap-2 p-4 ${!template.active ? "opacity-50" : ""}`}>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger
          render={
            <button type="button" className="min-w-0 flex-1 rounded-md text-left hover:opacity-70">
              <p className="truncate font-medium text-ink-950 dark:text-ink-50">
                {template.category.icon ? `${template.category.icon} ` : ""}
                {template.name}
              </p>
              <p className="truncate text-sm text-ink-500 dark:text-ink-400">
                {currencyFormatter.format(Number(template.amount))} ·{" "}
                {RECURRING_FREQUENCY_LABELS[template.frequency as RecurringFrequency]} · {template.account.name}
              </p>
              <p className="truncate text-xs text-ink-400 dark:text-ink-500">
                {template.active
                  ? `Prossima: ${dateFormatter.format(new Date(template.nextRunDate))}`
                  : "In pausa"}
              </p>
            </button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica ricorrenza</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-template-name">Nome</Label>
              <Input id="edit-template-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-template-amount">Importo (€)</Label>
              <Input
                id="edit-template-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-template-category">Categoria</Label>
              <Select items={categoryItems} value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
                <SelectTrigger id="edit-template-category" className="w-full">
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
              <Label htmlFor="edit-template-account">Conto</Label>
              <Select items={accountItems} value={accountId} onValueChange={(v) => setAccountId(v ?? "")}>
                <SelectTrigger id="edit-template-account" className="w-full">
                  <SelectValue />
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
              <Label htmlFor="edit-template-frequency">Frequenza</Label>
              <FrequencySelect id="edit-template-frequency" value={frequency} onChange={setFrequency} />
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Cambia solo le prossime occorrenze, non tocca quelle già generate né la prossima data già in corso.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateTemplate.isPending}>
                {updateTemplate.isPending ? "Salvataggio…" : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={setActive.isPending}
          onClick={() => setActive.mutate({ id: template.id, active: !template.active })}
        >
          {template.active ? "Metti in pausa" : "Riattiva"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={deleteTemplate.isPending}
          onClick={() => deleteTemplate.mutate({ id: template.id })}
        >
          Elimina
        </Button>
      </div>
    </Card>
  );
}

// Spese fisse che si ripetono a una cadenza scelta (Netflix, assicurazione,
// mutuo — PRD sezione 9): ogni scadenza genera automaticamente una spesa da
// confermare, non subito una spesa vera (vedi "Ricorrenze da confermare" in
// app/movimenti/MovimentiClient.tsx e server/generateDueRecurringExpenses.ts).
export function RecurringTemplatesManager() {
  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.recurringTemplate.list.useQuery();
  const { data: categories } = trpc.category.list.useQuery();
  const { data: accounts } = trpc.account.list.useQuery();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("MONTHLY");
  const [startDate, setStartDate] = useState(todayInputValue());

  const activeAccounts = accounts?.filter((a) => !a.archived) ?? [];
  const categoryOptions = buildCategoryOptions(categories ?? []);
  const categoryItems = Object.fromEntries(categoryOptions.map((o) => [o.id, o.label]));
  const accountItems = Object.fromEntries(activeAccounts.map((a) => [a.id, a.name]));

  const createTemplate = trpc.recurringTemplate.create.useMutation({
    onSuccess: () => {
      toast.success("Ricorrenza creata.");
      utils.recurringTemplate.list.invalidate();
      setOpen(false);
      setName("");
      setAmount("");
      setCategoryId("");
      setAccountId("");
      setFrequency("MONTHLY");
      setStartDate(todayInputValue());
    },
    onError: (error) => toast.error(error.message || "Impossibile creare la ricorrenza."),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Importo non valido.");
      return;
    }
    if (!categoryId || !accountId) {
      toast.error("Seleziona categoria e conto.");
      return;
    }
    createTemplate.mutate({
      name,
      amount: parsedAmount,
      categoryId,
      accountId,
      frequency,
      startDate: new Date(startDate),
    });
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-950 dark:text-ink-50">Ricorrenze</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button>+ Nuova ricorrenza</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuova ricorrenza</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="template-name">Nome</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Es. Netflix"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="template-amount">Importo (€)</Label>
                <Input
                  id="template-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="template-category">Categoria</Label>
                <Select items={categoryItems} value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
                  <SelectTrigger id="template-category" className="w-full">
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
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="template-account">Conto</Label>
                <Select items={accountItems} value={accountId} onValueChange={(v) => setAccountId(v ?? "")}>
                  <SelectTrigger id="template-account" className="w-full">
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
                <Label htmlFor="template-frequency">Frequenza</Label>
                <FrequencySelect id="template-frequency" value={frequency} onChange={setFrequency} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="template-start-date">Prima occorrenza</Label>
                <Input
                  id="template-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  Da questa data in poi verrà generata automaticamente, a questa cadenza, una spesa &quot;da
                  confermare&quot; — non conta nel Budget finché non la confermi.
                </p>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createTemplate.isPending}>
                  {createTemplate.isPending ? "Creazione…" : "Crea ricorrenza"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-sm text-ink-500 dark:text-ink-400">Caricamento…</p>}
      {!isLoading && templates?.length === 0 && (
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Nessuna ricorrenza ancora — usale per spese fisse come Netflix, assicurazione o mutuo: verranno generate
          automaticamente a ogni scadenza, da confermare in &quot;Movimenti&quot;.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {templates?.map((template) => (
          <TemplateRow
            key={template.id}
            template={template}
            categoryOptions={categoryOptions}
            categoryItems={categoryItems}
            activeAccounts={activeAccounts}
            accountItems={accountItems}
          />
        ))}
      </div>
    </div>
  );
}
