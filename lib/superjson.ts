import SuperJSON from "superjson";
import { Decimal } from "@prisma/client/runtime/client";

/**
 * Shared SuperJSON instance — MUST be the one imported by both
 * server/trpc.ts and lib/trpc/Provider.tsx, not the bare "superjson"
 * package default. SuperJSON only knows how to round-trip a class it
 * doesn't recognize (like Prisma's Decimal, used by every money field:
 * Account.openingBalance, Expense.amount, ecc.) if BOTH sides register the
 * same custom transformer — otherwise it silently serializes Decimal's
 * internal digit-array shape instead of the number, and every amount in the
 * UI breaks.
 */
SuperJSON.registerCustom<Decimal, string>(
  {
    isApplicable: (value): value is Decimal => value instanceof Decimal,
    serialize: (value) => value.toString(),
    deserialize: (value) => new Decimal(value),
  },
  "Decimal"
);

export { SuperJSON };
