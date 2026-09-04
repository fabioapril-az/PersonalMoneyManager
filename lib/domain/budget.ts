import { splitIntoInstallments } from "./installments";
import { getFinancialPeriod, shiftPeriods, type FinancialPeriod } from "./period";

type BudgetEligibleExpense = {
  excludeFromBudget: boolean;
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
 * - marcate "Escludi dal Budget" (Expense.excludeFromBudget, es. un viaggio
 *   pagato con risparmi già accantonati): mai, a prescindere da tutto il
 *   resto — diverso da "a rate": qui la spesa semplicemente non è mai stata
 *   capacità di spesa di questo mese.
 */
export function selectBudgetExpenses<T extends BudgetEligibleExpense>(expenses: T[]): T[] {
  return expenses.filter(
    (e) => !e.excludeFromBudget && e.paymentPlan?.type !== "INSTALLMENTS" && !e.paymentPlan?.account.excludeFromTotals
  );
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

export type BudgetWeek = {
  /** 1-based, sempre 1-4. */
  no: number;
  start: Date;
  end: Date;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Divide il periodo (27->26, 28-31 giorni) in esattamente 4 "settimane" per
 * il Budget settimanale (Report) — le prime 3 sempre da 7 giorni, l'ultima
 * si prende i giorni avanzati (7-10, secondo la lunghezza del periodo).
 * Sempre esattamente 4 quote, mai un numero variabile: il budget settimanale
 * (budget mensile / 4) resta un valore fisso indipendente dal mese —
 * coerente con come il resto dell'app evita apposta il calendario solare
 * (mai settimane a cavallo di due periodi diversi, vedi period.ts).
 */
export function splitPeriodIntoWeeks(period: FinancialPeriod): BudgetWeek[] {
  const weeks: BudgetWeek[] = [];
  let start = period.start;
  for (let no = 1; no <= 4; no++) {
    const isLast = no === 4;
    const end = isLast ? period.end : new Date(start.getTime() + 7 * MS_PER_DAY - 1);
    weeks.push({ no, start, end });
    start = new Date(end.getTime() + 1);
  }
  return weeks;
}

export type AdaptiveWeeklyBudget = {
  no: number;
  start: Date;
  end: Date;
  spent: number;
  /** budget mensile / 4, sempre lo stesso valore per tutte le settimane. */
  baseBudget: number;
  /** baseBudget rettificato in base a quanto sforato/risparmiato nelle settimane precedenti già concluse. */
  adjustedBudget: number;
  /** La settimana è già conclusa (rispetto a `now`): la sua differenza è stata ridistribuita in avanti. */
  isFinal: boolean;
};

/**
 * Budget settimanale "adattivo" (non la semplice divisione per 4 — PRD non
 * originale): una settimana già CONCLUSA che sfora il proprio budget fa
 * scalare la differenza sulle settimane ancora da venire (dividendola in
 * parti uguali, budget più basso per ciascuna); una che risparmia fa
 * l'opposto (budget più alto). Una settimana ancora in corso o futura non
 * ridistribuisce nulla finché non è a sua volta conclusa — la sua
 * differenza non è ancora definitiva. L'ultima settimana non ha "settimane
 * dopo" a cui ridistribuire: il suo sforamento/risparmio finale si legge
 * dal confronto sull'intero periodo (Budget mensile), non qui.
 *
 * `now` è sempre l'istante reale (non legato al periodo mostrato): se stai
 * guardando un periodo passato, ogni sua settimana risulta già conclusa e
 * la ridistribuzione si applica per intero; se stai guardando quello
 * corrente, solo le settimane già finite contribuiscono.
 */
export function computeAdaptiveWeeklyBudget(
  weeks: { no: number; start: Date; end: Date; spent: number }[],
  monthlyBudget: number,
  now: Date
): AdaptiveWeeklyBudget[] {
  const baseBudget = monthlyBudget / weeks.length;
  const diffs: (number | null)[] = new Array(weeks.length).fill(null);
  const adjusted: number[] = new Array(weeks.length).fill(baseBudget);
  const isFinal: boolean[] = new Array(weeks.length).fill(false);

  for (let i = 0; i < weeks.length; i++) {
    let carry = 0;
    for (let j = 0; j < i; j++) {
      const diff = diffs[j];
      if (diff == null) continue;
      const remainingAfterJ = weeks.length - (j + 1);
      if (remainingAfterJ > 0) carry += diff / remainingAfterJ;
    }
    adjusted[i] = baseBudget + carry;

    const ended = weeks[i].end.getTime() < now.getTime();
    isFinal[i] = ended;
    if (ended) diffs[i] = adjusted[i] - weeks[i].spent;
  }

  return weeks.map((week, i) => ({
    no: week.no,
    start: week.start,
    end: week.end,
    spent: week.spent,
    baseBudget,
    adjustedBudget: adjusted[i],
    isFinal: isFinal[i],
  }));
}
