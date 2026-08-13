import type { AccountType, CashMovementType, ReportGranularity, RecurringFrequency } from "./enums";

// Italian labels for the closed-set values in lib/domain/enums.ts — kept
// separate from the enums themselves so this file (UI concern) can grow
// without touching the validation source of truth.
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Conto corrente",
  CREDIT_CARD: "Carta di credito",
  PREPAID_CARD: "Carta ricaricabile",
  PAYPAL: "PayPal",
  CASH: "Contanti",
  OTHER: "Altro",
};

// Usate nella sezione "Movimenti di cassa" (PRD Rule 5) per distinguere a
// colpo d'occhio un movimento avvenuto ORA da una spesa decisa altrove nel
// tempo (rata, addebito carta) — OTHER non ha un'etichetta: è il caso "normale"
// (spesa immediata, stesso giorno) e la descrizione basta da sola.
export const CASH_MOVEMENT_TYPE_LABELS: Partial<Record<CashMovementType, string>> = {
  INCOME: "Entrata",
  TRANSFER: "Trasferimento",
  CARD_CHARGE: "Addebito carta",
  INSTALLMENT_PAYMENT: "Rata",
  WITHDRAWAL: "Prelievo",
  ADJUSTMENT: "Rettifica",
};

// Selettore vista nella pagina Report — vedi GRANULARITY_PERIOD_COUNT in
// lib/domain/period.ts per quanti periodi ciascuna vista aggrega.
export const REPORT_GRANULARITY_LABELS: Record<ReportGranularity, string> = {
  MONTHLY: "Mensile",
  QUARTERLY: "Trimestrale",
  YEARLY: "Annuale",
};

// Frequenza di un template ricorrente (PRD sezione 9) — vedi lib/domain/recurring.ts.
export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  WEEKLY: "Settimanale",
  MONTHLY: "Mensile",
  YEARLY: "Annuale",
};
