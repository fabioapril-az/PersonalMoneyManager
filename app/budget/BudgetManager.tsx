"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function BudgetForm({ monthlyBudget, totalExpense }: { monthlyBudget: unknown; totalExpense: unknown }) {
  const utils = trpc.useUtils();
  // Inizializzato in modo lazy da props già risolte (il genitore mostra
  // "Caricamento…" finché la query non arriva, quindi questo componente
  // monta solo quando il dato è già disponibile) — niente useEffect di
  // sincronizzazione, stesso motivo di EditExpenseDialog.tsx.
  const [amount, setAmount] = useState(() => (monthlyBudget != null ? String(Number(monthlyBudget)) : ""));

  const setBudget = trpc.budget.set.useMutation({
    onSuccess: () => {
      toast.success("Budget aggiornato.");
      utils.dashboard.summary.invalidate();
    },
    onError: (error) => toast.error(error.message || "Impossibile aggiornare il budget."),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Importo non valido.");
      return;
    }
    setBudget.mutate({ amount: parsed });
  }

  function handleClear() {
    setAmount("");
    setBudget.mutate({ amount: null });
  }

  const spent = Number(totalExpense);
  const budget = monthlyBudget != null ? Number(monthlyBudget) : null;

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Label htmlFor="monthly-budget">Importo (€)</Label>
        <Input
          id="monthly-budget"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Es. 2000"
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={setBudget.isPending}>
            {setBudget.isPending ? "Salvataggio…" : "Salva"}
          </Button>
          {budget != null && (
            <Button type="button" variant="outline" onClick={handleClear} disabled={setBudget.isPending}>
              Rimuovi
            </Button>
          )}
        </div>
      </form>

      {budget != null && (
        <Card className="flex flex-col gap-1 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Speso in questo periodo</span>
            <span className="font-medium text-zinc-950 dark:text-zinc-50">{currencyFormatter.format(spent)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Residuo</span>
            <span
              className={`font-medium ${spent > budget ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
            >
              {currencyFormatter.format(budget - spent)}
            </span>
          </div>
        </Card>
      )}
    </>
  );
}

export function BudgetManager() {
  const { data: summary, isLoading } = trpc.dashboard.summary.useQuery();

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Budget mensile</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Un unico tetto di spesa per il periodo corrente, confrontato con il totale delle spese registrate —
        indipendente da quando registri le entrate.
      </p>

      {isLoading || !summary ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Caricamento…</p>
      ) : (
        <BudgetForm monthlyBudget={summary.monthlyBudget} totalExpense={summary.totalExpense} />
      )}
    </div>
  );
}
