import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { reportGranularitySchema } from "@/lib/domain/enums";
import { GRANULARITY_PERIOD_COUNT, getCurrentFinancialPeriod, getRecentPeriods } from "@/lib/domain/period";
import { protectedProcedure, router } from "../trpc";

const summaryInputSchema = z
  .object({
    referenceDate: z.coerce.date().optional(),
    // Mensile/Trimestrale/Annuale (PRD "report periodici", non in una
    // sezione specifica del PRD originale) — quanti periodi consecutivi
    // 27->26 aggregare, vedi GRANULARITY_PERIOD_COUNT. "Rolling", non
    // allineato al calendario: un trimestre sono gli ultimi 3 periodi che
    // finiscono con quello mostrato, non gen-mar/apr-giu fissi — quelli non
    // si allineerebbero mai con un periodo 27->26.
    granularity: reportGranularitySchema.default("MONTHLY"),
  })
  .optional();

// L'andamento mostra sempre il dettaglio mese-per-mese, indipendentemente
// dalla granularità scelta per la torta/i totali — anche nella vista
// Annuale, 12 barre mensili invece di 12 barre annuali (o 4 trimestrali).
const TREND_PERIODS_COUNT = 12;

export const reportRouter = router({
  // "Dove sto spendendo i miei soldi?" (una delle 3 domande della visione
  // originale, PRD sezione 1) — le due risposte che il resto della
  // dashboard non dà: la ripartizione per categoria della finestra mostrata
  // (1/3/12 periodi, secondo la granularità), e l'andamento di
  // Entrate/Spese sugli ultimi 12 periodi mensili.
  summary: protectedProcedure.input(summaryInputSchema).query(async ({ ctx, input }) => {
    // "period" è sempre il periodo più recente della finestra (l'ancora per
    // la navigazione avanti/indietro, vedi shiftPeriods lato client) — con
    // granularity MONTHLY la finestra è il periodo stesso.
    const period = getCurrentFinancialPeriod(input?.referenceDate);
    const isCurrentPeriod = period.key === getCurrentFinancialPeriod().key;
    const granularity = input?.granularity ?? "MONTHLY";
    const periodsInWindow = GRANULARITY_PERIOD_COUNT[granularity];

    const windowPeriods = getRecentPeriods(periodsInWindow, period.start); // più recente primo
    const windowStart = windowPeriods[windowPeriods.length - 1].start;
    const windowEnd = period.end;

    const [categories, expenses, incomeAgg] = await Promise.all([
      // Solo id/parentId/name/icon: basta per risalire alla categoria di
      // primo livello di ciascuna spesa (una sottocategoria conta nel
      // totale del suo genitore — vedi topLevelOf sotto).
      ctx.prisma.category.findMany({
        where: { userId: ctx.userId },
        select: { id: true, parentId: true, name: true, icon: true },
      }),
      ctx.prisma.expense.findMany({
        where: { userId: ctx.userId, date: { gte: windowStart, lte: windowEnd } },
        select: { categoryId: true, amount: true },
      }),
      ctx.prisma.income.aggregate({
        where: { userId: ctx.userId, date: { gte: windowStart, lte: windowEnd } },
        _sum: { amount: true },
      }),
    ]);
    const totalIncome = incomeAgg._sum.amount ?? new Prisma.Decimal(0);

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
    // getRecentPeriods, che li dà più recente-prima. Indipendente dalla
    // finestra di aggregazione sopra (sempre mensile, sempre 12).
    const recentPeriods = getRecentPeriods(TREND_PERIODS_COUNT, period.start).reverse();
    const trend = await Promise.all(
      recentPeriods.map(async (p) => {
        const [periodIncomeAgg, periodExpenseAgg] = await Promise.all([
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
          totalIncome: periodIncomeAgg._sum.amount ?? new Prisma.Decimal(0),
          totalExpense: periodExpenseAgg._sum.amount ?? new Prisma.Decimal(0),
        };
      })
    );

    return {
      period,
      windowStart,
      windowEnd,
      granularity,
      isCurrentPeriod,
      totalExpense,
      totalIncome,
      categoryBreakdown,
      trend,
    };
  }),
});
