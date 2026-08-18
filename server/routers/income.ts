import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { logDeletion } from "../logDeletion";
import { protectedProcedure, router } from "../trpc";

const createIncomeSchema = z.object({
  date: z.coerce.date(),
  amount: z.number().positive("L'importo deve essere maggiore di zero."),
  source: z.string().trim().min(1, "Indica la provenienza (es. Stipendio).").max(60),
  accountId: z.string().min(1, "Seleziona un conto."),
  notes: z.string().trim().max(500).optional(),
});

const updateIncomeSchema = createIncomeSchema.extend({ id: z.string() });

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

  update: protectedProcedure.input(updateIncomeSchema).mutation(async ({ ctx, input }) => {
    const income = await ctx.prisma.income.findFirst({ where: { id: input.id, userId: ctx.userId } });
    if (!income) throw new TRPCError({ code: "NOT_FOUND" });

    const account = await ctx.prisma.account.findFirst({
      where: { id: input.accountId, userId: ctx.userId },
    });
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Conto non trovato." });

    // No PaymentPlan/Schedule chain for Income (only Expense has one) — a
    // direct update of both rows is enough, no delete+recreate needed.
    return ctx.prisma.$transaction(async (tx) => {
      const updated = await tx.income.update({
        where: { id: input.id },
        data: { date: input.date, amount: input.amount, source: input.source, notes: input.notes },
      });

      await tx.cashMovement.updateMany({
        where: { incomeId: input.id },
        data: {
          accountId: input.accountId,
          date: input.date,
          amount: input.amount,
          description: input.source,
        },
      });

      return updated;
    });
  }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const income = await ctx.prisma.income.findFirst({ where: { id: input.id, userId: ctx.userId } });
    if (!income) throw new TRPCError({ code: "NOT_FOUND" });

    return ctx.prisma.$transaction(async (tx) => {
      // CashMovement.income has onDelete: NoAction (schema.prisma) — delete
      // it first, or Income.delete fails with a foreign key violation.
      await tx.cashMovement.deleteMany({ where: { incomeId: input.id } });
      await tx.income.delete({ where: { id: input.id } });
      await logDeletion(tx, ctx.userId, {
        entityType: "INCOME",
        description: income.source,
        amount: Number(income.amount),
        date: income.date,
      });
      return { success: true } as const;
    });
  }),
});
