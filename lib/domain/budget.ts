type BudgetEligibleExpense = {
  paymentPlan: { type: string; account: { excludeFromTotals: boolean } } | null;
};

/**
 * Quali spese del periodo contano nel Budget mensile (regola ibrida, PRD
 * "scenario ristorante con carta di credito" — vedi il commento su
 * budgetSpent in server/routers/dashboard.ts):
 *
 * - pagamento immediato o carta di credito: sì, pesano alla data
 *   dell'acquisto (stesso importo di totalExpense).
 * - a rate: no, quelle pesano alla scadenza di ciascuna rata, sommate a
 *   parte (schedulesDueInPeriod in dashboard.ts) — qui verrebbero contate
 *   per l'importo intero, doppiando il conteggio (Rule 1).
 * - conti "non soldi tuoi" (Account.excludeFromTotals, es. ticket pasto):
 *   mai, indipendentemente dal tipo di piano.
 */
export function selectBudgetExpenses<T extends BudgetEligibleExpense>(expenses: T[]): T[] {
  return expenses.filter((e) => e.paymentPlan?.type !== "INSTALLMENTS" && !e.paymentPlan?.account.excludeFromTotals);
}
