import type { AccountType } from "./enums";

// Italian labels for the closed-set values in lib/domain/enums.ts — kept
// separate from the enums themselves so this file (UI concern) can grow
// without touching the validation source of truth.
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Conto corrente",
  CREDIT_CARD: "Carta di credito",
  PAYPAL: "PayPal",
  CASH: "Contanti",
  OTHER: "Altro",
};
