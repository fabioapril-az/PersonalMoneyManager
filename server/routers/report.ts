import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentFinancialPeriod, getRecentPeriods } from "@/lib/domain/period";
import { protectedProcedure, router } from "../trpc";

const summaryInputSchema = z
  .object({
    referenceDate: z.coerce.date().optional(),
    periodsCount: z.number().int().min(1).max(24).default(6),
  })
  .optional();

export const reportRouter = router({
  // "Dove sto spendendo i miei soldi?" (una delle 3 domande della visione
  // originale, PRD sezione 1) — le due risposte che il resto della
  // dashboard non dà: la ripartizione per categoria del periodo mostrato, e
  // l'andamento di Entrate/Spese sugli ultimi periodi.
  summary: protectedProcedure.input(summaryInputSchema).query(async ({ ctx, input }) => {
    const period = getCurrentFinancialPeriod(input?.referenceDate);
    const isCurrentPeriod = period.key === getCurrentFinancialPeriod().key;
    const periodsCount = input?.periodsCount ?? 6;

    const [categories, expenses] = await Promise.all([
      // Solo id/parentId/name/icon: basta per risalire alla categoria di
      // primo livello di ciascuna spesa (una sottocategoria conta nel
      // totale del suo genitore — vedi topLevelOf sotto).
      ctx.prisma.category.findMany({
        where: { userId: ctx.userId },
        select: { id: true, parentId: true, name: true, icon: true },
      }),
      ctx.prisma.expense.findMany({
        where: { userId: ctx.userId, date: { gte: period.start, lte: period.end } },
        select: { categoryId: true, amount: true },
      }),
    ]);

    const categoryById = new Map(categories.map((c) => [c.id, c]));
    function topLevelOf(categoryId: string) {
      const category = categoryById.get(categoryId);
      if (!category) return null;
      if (!category.parentId) return category;
      return categoryById.get(category.parentId) ?? category;
    }

    // Somma in JS, non groupBy SQL — stesso motivo di listAccountsWithBalance
    // (server/accountBalances.ts): volumi piccoli, niente da verificare sul
    // comportamento groupBy dell'adapter mssql.
    const totalExpense = expenses.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));
    const totalsByTopCategory = new Map<string, Prisma.Decimal>();
    for (const expense of expenses) {
      const top = topLevelOf(expense.categoryId);
      if (!top) continue;
      totalsByTopCategory.set(top.id, (totalsByTopCategory.get(top.id) ?? new Prisma.Decimal(0)).plus(expense.amount));
    }

    const categoryBreakdown = Array.from(totalsByTopCategory.entries())
      .map(([categoryId, amount]) => {
        const category = categoryById.get(categoryId)!;
        return {
          categoryId,
          name: category.name,
          icon: category.icon,
          amount,
          percent: totalExpense.isZero() ? 0 : amount.div(totalExpense).times(100).toNumber(),
        };
      })
      .sort((a, b) => b.amount.comparedTo(a.amount));

    // Ultimi N periodi, dal più vecchio al più recente (per leggere il
    // grafico da sinistra a destra come una timeline) — a differenza di
    // getRecentPeriods, che li dà più recente-prima.
    const recentPeriods = getRecentPeriods(periodsCount, period.start).reverse();
    const trend = await Promise.all(
      recentPeriods.map(async (p) => {
        const [incomeAgg, expenseAgg] = await Promise.all([
          ctx.prisma.income.aggregate({
            where: { userId: ctx.userId, date: { gte: p.start, lte: p.end } },
            _sum: { amount: true },
          }),
          ctx.prisma.expense.aggregate({
            where: { userId: ctx.userId, date: { gte: p.start, lte: p.end } },
            _sum: { amount: true },
          }),
        ]);
        return {
          period: p,
          totalIncome: incomeAgg._sum.amount ?? new Prisma.Decimal(0),
          totalExpense: expenseAgg._sum.amount ?? new Prisma.Decimal(0),
        };
      })
    );

    return {
      period,
      isCurrentPeriod,
      totalExpense,
      categoryBreakdown,
      trend,
    };
  }),
});
