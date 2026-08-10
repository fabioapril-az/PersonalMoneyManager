import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { protectedProcedure, router } from "../trpc";

const upsertBudgetSchema = z.object({
  categoryId: z.string(),
  amount: z.number().nonnegative("Il budget non può essere negativo."),
});

export const budgetRouter = router({
  // Budget + speso/residuo/percentuale del periodo corrente, per ogni
  // categoria che ha un budget impostato (PRD sezione 14). "Speso" è sempre
  // basato sull'Expense, mai sul CashMovement (Rule 4) — e sulla categoria
  // esatta, senza risalire alle sottocategorie verso il padre (scelta
  // deliberata per restare semplice: budget su una sottocategoria non
  // "consuma" quello del padre).
  list: protectedProcedure.query(async ({ ctx }) => {
    const period = getCurrentFinancialPeriod();

    const [budgets, expenses] = await Promise.all([
      ctx.prisma.budget.findMany({
        where: { userId: ctx.userId },
        include: { category: true },
        orderBy: { category: { name: "asc" } },
      }),
      ctx.prisma.expense.findMany({
        where: { userId: ctx.userId, date: { gte: period.start, lte: period.end } },
        select: { categoryId: true, amount: true },
      }),
    ]);

    const spentByCategory = new Map<string, Prisma.Decimal>();
    for (const expense of expenses) {
      const current = spentByCategory.get(expense.categoryId) ?? new Prisma.Decimal(0);
      spentByCategory.set(expense.categoryId, current.plus(expense.amount));
    }

    return budgets.map((budget) => {
      const spent = spentByCategory.get(budget.categoryId) ?? new Prisma.Decimal(0);
      const amount = new Prisma.Decimal(budget.amount);
      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.category.name,
        categoryIcon: budget.category.icon,
        amount,
        spent,
        remaining: amount.minus(spent),
        percentUsed: amount.isZero() ? 0 : spent.dividedBy(amount).times(100).toNumber(),
      };
    });
  }),

  upsert: protectedProcedure.input(upsertBudgetSchema).mutation(async ({ ctx, input }) => {
    const category = await ctx.prisma.category.findFirst({
      where: { id: input.categoryId, userId: ctx.userId },
    });
    if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria non trovata." });

    return ctx.prisma.budget.upsert({
      where: { userId_categoryId: { userId: ctx.userId, categoryId: input.categoryId } },
      update: { amount: input.amount },
      create: { userId: ctx.userId, categoryId: input.categoryId, amount: input.amount },
    });
  }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const budget = await ctx.prisma.budget.findFirst({ where: { id: input.id, userId: ctx.userId } });
    if (!budget) throw new TRPCError({ code: "NOT_FOUND" });

    await ctx.prisma.budget.delete({ where: { id: input.id } });
    return { success: true } as const;
  }),
});
