import { z } from "zod";

/**
 * Single source of truth for every "closed set of values" field in the data
 * model (Account.type, Expense.status, ecc.).
 *
 * Why these aren't Prisma `enum` blocks: SQL Server's connector does not
 * support native enums at all (Postgres does, MySQL emulates them — SQL
 * Server flatly rejects `enum` in schema.prisma with "the current connector
 * does not support enums"). So these fields are plain `String` columns in
 * prisma/schema.prisma, and the closed set is enforced here instead: a
 * `readonly` tuple for exhaustive TypeScript types, and a matching Zod schema
 * for runtime validation at every tRPC procedure boundary. Never trust a
 * string from the DB or the network without parsing it through one of these.
 */

// PREPAID_CARD (carta ricaricabile: Postepay, Hype, ecc.) è puramente
// un'etichetta più chiara di "Altro" — stessa identica logica di qualunque
// conto non CREDIT_CARD (pagamento immediato, nessuna fatturazione
// differita): ricarica = Trasferimento, spesa = pagamento immediato.
export const ACCOUNT_TYPES = ["CHECKING", "CREDIT_CARD", "PREPAID_CARD", "PAYPAL", "CASH", "OTHER"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);

export const PAYMENT_PLAN_TYPES = [
  "IMMEDIATE",
  "CREDIT_CARD",
  "INSTALLMENTS",
  "PAYPAL",
  "BANK_TRANSFER",
  "OTHER",
] as const;
export type PaymentPlanType = (typeof PAYMENT_PLAN_TYPES)[number];
export const paymentPlanTypeSchema = z.enum(PAYMENT_PLAN_TYPES);

export const EXPENSE_STATUSES = ["PLANNED", "RECORDED", "RECONCILED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export const expenseStatusSchema = z.enum(EXPENSE_STATUSES);

export const SCHEDULE_STATUSES = ["PENDING", "PAID", "CANCELLED"] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
export const scheduleStatusSchema = z.enum(SCHEDULE_STATUSES);

export const CASH_MOVEMENT_TYPES = [
  "INCOME",
  "TRANSFER",
  "CARD_CHARGE",
  "INSTALLMENT_PAYMENT",
  "WITHDRAWAL",
  "ADJUSTMENT",
  "OTHER",
] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];
export const cashMovementTypeSchema = z.enum(CASH_MOVEMENT_TYPES);

export const CASH_MOVEMENT_STATUSES = ["PLANNED", "EXECUTED", "RECONCILED"] as const;
export type CashMovementStatus = (typeof CASH_MOVEMENT_STATUSES)[number];
export const cashMovementStatusSchema = z.enum(CASH_MOVEMENT_STATUSES);

export const RECURRING_FREQUENCIES = ["WEEKLY", "MONTHLY", "YEARLY"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];
export const recurringFrequencySchema = z.enum(RECURRING_FREQUENCIES);

// Non un campo di un modello Prisma (il Report non salva nulla) — un input
// tRPC comunque validato qui per restare nello stesso posto di ogni altro
// "insieme chiuso di valori" dell'app.
export const REPORT_GRANULARITIES = ["MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];
export const reportGranularitySchema = z.enum(REPORT_GRANULARITIES);

// Cosa può essere cancellato e finire nel registro delle cancellazioni
// (DeletionLogEntry, vedi schema.prisma) — un tipo per ciascun router che ha
// una mutation "delete".
export const DELETION_ENTITY_TYPES = ["EXPENSE", "INCOME", "TRANSFER", "RECURRING_TEMPLATE", "CATEGORY"] as const;
export type DeletionEntityType = (typeof DELETION_ENTITY_TYPES)[number];
export const deletionEntityTypeSchema = z.enum(DELETION_ENTITY_TYPES);
