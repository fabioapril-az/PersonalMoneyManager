import { getCurrentFinancialPeriod, getRecentPeriods } from "@/lib/domain/period";
import { publicProcedure, router } from "../trpc";
import { z } from "zod";

// First real endpoint, kept deliberately tiny: proves the tRPC wiring works
// end to end (schema -> domain logic -> client) before any auth/data model
// dependent router is built on top of it.
export const periodRouter = router({
  current: publicProcedure.query(() => getCurrentFinancialPeriod()),

  recent: publicProcedure
    .input(z.object({ count: z.number().int().min(1).max(24).default(6) }))
    .query(({ input }) => getRecentPeriods(input.count)),
});
