import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { protectedProcedure, router } from "../trpc";

const createIncomeSchema = z.object({
  date: z.coerce.date(),
  amount: z.number().positive("L'importo deve essere maggiore di zero."),
  source: z.string().trim().min(1, "Indica la provenienza (es. Stipendio).").max(60),
  accountId: z.string().min(1, "Seleziona un conto."),
  notes: z.string().trim().max(500).optional(),
});

export const incomeRouter = router({
  listCurrentPeriod: protectedProcedure.query(({ ctx }) => {
    const period = getCurrentFinancialPeriod();
    return ctx.prisma.income.findMany({
      where: { userId: ctx.userId, date: { gte: period.start, lte: period.end } },
      orderBy: { date: "desc" },
    });
  }),

  create: protectedProcedure.input(createIncomeSchema).mutation(async ({ ctx, input }) => {
    const account = await ctx.prisma.account.findFirst({
      where: { id: input.accountId, userId: ctx.userId },
    });
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Conto non trovato." });

    // Income + CashMovement together: an Income without its corresponding
    // real-money movement would show up in "Entrate" but never move any
    // account balance — Rule 5, cash-flow is driven by CashMovement only.
    return ctx.prisma.$transaction(async (tx) => {
      const income = await tx.income.create({
        data: {
          userId: ctx.userId,
          date: input.date,
          amount: input.amount,
          source: input.source,
          notes: input.notes,
        },
      });

      await tx.cashMovement.create({
        data: {
          accountId: input.accountId,
          date: input.date,
          amount: input.amount, // positive: money in
          type: "INCOME",
          status: "EXECUTED",
          description: input.source,
          incomeId: income.id,
        },
      });

      return income;
    });
  }),
});
