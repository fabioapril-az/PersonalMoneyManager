import { computeCardStatementDate } from "./creditCard";
import { computeInstallmentDueDate, splitIntoInstallments } from "./installments";
import type { PaymentPlanType, ScheduleStatus } from "./enums";

export type PlannedSchedule = {
  installmentNo: number;
  dueDate: Date;
  amount: number;
  status: ScheduleStatus;
  // Solo la prima rata (o l'unica scadenza, se non a rate e non carta di
  // credito) genera subito un vero movimento di cassa — le altre restano in
  // attesa finché non vengono saldate (PaymentSchedule PENDING).
  createsCashMovementNow: boolean;
};

export type ExpensePlan = {
  type: PaymentPlanType;
  installmentsCount: number;
  schedules: PlannedSchedule[];
};

export type ExpensePlanInput = {
  amount: number;
  purchaseDate: Date;
  // Rate (PRD sezione 7): qualunque spesa, su qualunque conto. Se presente e
  // > 1, prevale sulla logica "carta di credito" sotto — un acquisto a rate
  // con carta di credito genera un piano INSTALLMENTS, non CREDIT_CARD.
  installments?: number;
  account: { type: string; statementDay: number | null };
};

/**
 * Decide il PaymentPlan/PaymentSchedule di una spesa (PRD sezioni 6-7): quale
 * dei tre tipi, quante scadenze, a quali date/importi, con quale stato
 * iniziale, e quale (se c'è) genera subito un vero movimento di cassa. Pura:
 * nessuna scrittura — server/routers/expense.ts (createExpenseChain) esegue
 * la decisione, non la prende.
 *
 * - Rate scelte (qualunque conto): PaymentPlan INSTALLMENTS, una scadenza al
 *   mese dalla data d'acquisto. La 1ª è pagata subito, le altre in attesa.
 * - Nessuna rata, carta di credito: PaymentPlan CREDIT_CARD, 1 scadenza al
 *   vero giorno di fatturazione (mese dopo), nessun movimento finché non
 *   viene saldata.
 * - Nessuna rata, conto "immediato" (C/C, PayPal, contanti, altro):
 *   PaymentPlan IMMEDIATE, 1 scadenza già pagata, subito un movimento.
 */
export function decideExpensePlan(input: ExpensePlanInput): ExpensePlan {
  const isInstallments = input.installments != null && input.installments > 1;
  const isCreditCard = !isInstallments && input.account.type === "CREDIT_CARD";

  if (isInstallments) {
    const count = input.installments as number;
    const amounts = splitIntoInstallments(input.amount, count);
    return {
      type: "INSTALLMENTS",
      installmentsCount: count,
      schedules: amounts.map((amount, i) => {
        const installmentNo = i + 1;
        const isFirst = installmentNo === 1;
        return {
          installmentNo,
          dueDate: computeInstallmentDueDate(input.purchaseDate, installmentNo),
          amount,
          status: isFirst ? "PAID" : "PENDING",
          createsCashMovementNow: isFirst,
        };
      }),
    };
  }

  const dueDate = isCreditCard
    ? computeCardStatementDate(input.purchaseDate, input.account.statementDay as number)
    : input.purchaseDate;

  return {
    type: isCreditCard ? "CREDIT_CARD" : "IMMEDIATE",
    installmentsCount: 1,
    schedules: [
      {
        installmentNo: 1,
        dueDate,
        amount: input.amount,
        status: isCreditCard ? "PENDING" : "PAID",
        createsCashMovementNow: !isCreditCard,
      },
    ],
  };
}
