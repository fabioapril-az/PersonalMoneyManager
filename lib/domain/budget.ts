import { splitIntoInstallments } from "./installments";
import { getFinancialPeriod, shiftPeriods, type FinancialPeriod } from "./period";

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

export type BudgetSpreadShare = {
  /** Posizione 1-based nella spalmatura, per l'etichetta "rata N/count" — non un vero PaymentSchedule. */
  no: number;
  count: number;
  /** Quota di competenza di targetPeriod (amount/count, coi centesimi in avanzo sull'ultima quota). */
  amount: number;
  /** L'importo pieno originale — mostrato accanto alla quota per non confonderla con una rata vera ancora da pagare. */
  totalAmount: number;
};

/**
 * "Spalma sul Budget" (Expense.budgetSpreadPeriods): se una spesa datata
 * `expenseDate`, spalmata su `spreadPeriods` periodi (>= 2) a partire da
 * quello in cui è stata pagata, tocca `targetPeriod`, restituisce la quota di
 * competenza — altrimenti null. Pura: decide solo l'importo, non tocca mai
 * Disponibile/Report (quelli restano sempre l'importo pieno alla vera data,
 * vedi il commento sul campo in prisma/schema.prisma).
 *
 * Sempre in avanti dalla data della spesa, mai indietro (PRD: "spalmata su
 * quello in cui pago e quello/i dopo") — mai su un periodo già passato
 * rispetto a expenseDate.
 */
export function computeBudgetSpreadShare(
  expenseDate: Date,
  totalAmount: number,
  spreadPeriods: number,
  targetPeriod: FinancialPeriod
): BudgetSpreadShare | null {
  const originPeriod = getFinancialPeriod(expenseDate);
  const amounts = splitIntoInstallments(totalAmount, spreadPeriods);

  for (let i = 0; i < spreadPeriods; i++) {
    const period = i === 0 ? originPeriod : shiftPeriods(originPeriod, i);
    if (period.key === targetPeriod.key) {
      return { no: i + 1, count: spreadPeriods, amount: amounts[i], totalAmount };
    }
  }
  return null;
}
