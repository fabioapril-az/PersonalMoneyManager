"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
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

const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function BudgetProgressBar({ percentUsed }: { percentUsed: number }) {
  const clamped = Math.min(100, Math.max(0, percentUsed));
  const overBudget = percentUsed > 100;
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div
        className={`h-1.5 rounded-full ${overBudget ? "bg-red-600 dark:bg-red-400" : "bg-emerald-600 dark:bg-emerald-400"}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

type CategoryWithBudget = {
  id: string;
  name: string;
  icon: string | null;
  budget: {
    id: string;
    amount: unknown;
    spent: unknown;
    remaining: unknown;
    percentUsed: number;
  } | null;
};

function BudgetRow({ category }: { category: CategoryWithBudget }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(() => (category.budget ? String(Number(category.budget.amount)) : ""));

  const upsertBudget = trpc.budget.upsert.useMutation({
    onSuccess: () => {
      toast.success("Budget salvato.");
      utils.budget.list.invalidate();
      setOpen(false);
    },
    onError: (error) => toast.error(error.message || "Impossibile salvare il budget."),
  });

  const deleteBudget = trpc.budget.delete.useMutation({
    onSuccess: () => {
      toast.success("Budget rimosso.");
      utils.budget.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Impossibile rimuovere il budget."),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Importo non valido.");
      return;
    }
    upsertBudget.mutate({ categoryId: category.id, amount: parsed });
  }

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-zinc-950 dark:text-zinc-50">
          {category.icon ? `${category.icon} ` : ""}
          {category.name}
        </span>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm">
                  {category.budget ? "Modifica" : "Imposta budget"}
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Budget · {category.name}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`budget-amount-${category.id}`}>Budget mensile (€)</Label>
                  <Input
                    id={`budget-amount-${category.id}`}
                    inputMode="decimal"
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={upsertBudget.isPending}>
                    {upsertBudget.isPending ? "Salvataggio…" : "Salva"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          {category.budget && (
            <Button
              variant="ghost"
              size="sm"
              disabled={deleteBudget.isPending}
              onClick={() => deleteBudget.mutate({ id: category.budget!.id })}
            >
              Rimuovi
            </Button>
          )}
        </div>
      </div>

      {category.budget && (
        <>
          <BudgetProgressBar percentUsed={category.budget.percentUsed} />
          <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
            <span>
              {currencyFormatter.format(Number(category.budget.spent))} di{" "}
              {currencyFormatter.format(Number(category.budget.amount))}
            </span>
            <span className={category.budget.percentUsed > 100 ? "font-medium text-red-600 dark:text-red-400" : ""}>
              {Number(category.budget.remaining) >= 0
                ? `${currencyFormatter.format(Number(category.budget.remaining))} residui`
                : `${currencyFormatter.format(Math.abs(Number(category.budget.remaining)))} oltre budget`}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

export function BudgetManager() {
  const { data: categories, isLoading: categoriesLoading } = trpc.category.list.useQuery();
  const { data: budgets, isLoading: budgetsLoading } = trpc.budget.list.useQuery();

  const isLoading = categoriesLoading || budgetsLoading;

  const categoriesWithBudget: CategoryWithBudget[] =
    categories?.map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      budget: budgets?.find((b) => b.categoryId === category.id) ?? null,
    })) ?? [];

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Budget per categoria</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Quanto puoi ancora spendere in ogni categoria nel periodo corrente — indipendente dalle entrate registrate.
      </p>

      {isLoading && <p className="text-sm text-zinc-500 dark:text-zinc-400">Caricamento…</p>}
      {!isLoading && categoriesWithBudget.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nessuna categoria ancora — vai su &quot;Categorie&quot; per crearne una.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {categoriesWithBudget.map((category) => (
          <BudgetRow key={category.id} category={category} />
        ))}
      </div>
    </div>
  );
}
