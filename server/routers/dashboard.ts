import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { listAccountsWithBalance } from "../accountBalances";
import { protectedProcedure, router } from "../trpc";

export const dashboardRouter = router({
  // Tutto quello che serve alla home in una chiamata (PRD sezione 11):
  // Entrate, Spese, Disponibile, saldo conti, movimenti recenti.
  summary: protectedProcedure.query(async ({ ctx }) => {
    const period = getCurrentFinancialPeriod();

    const [incomes, expenses, accounts] = await Promise.all([
      ctx.prisma.income.findMany({
        where: { userId: ctx.userId, date: { gte: period.start, lte: period.end } },
        // accountId non è un campo di Income (solo il suo CashMovement lo
        // sa) — serve per pre-compilare il conto quando si modifica.
        include: { cashMovements: { select: { accountId: true }, take: 1 } },
        orderBy: { date: "desc" },
      }),
      ctx.prisma.expense.findMany({
        where: { userId: ctx.userId, date: { gte: period.start, lte: period.end } },
        // Stesso motivo: l'account "vero" di un'Expense vive nel suo
        // PaymentPlan, non sull'Expense stessa.
        include: { category: true, paymentPlan: { select: { accountId: true } } },
        orderBy: { date: "desc" },
      }),
      listAccountsWithBalance(ctx.prisma, ctx.userId),
    ]);

    const totalIncome = incomes.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
    const totalExpense = expenses.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));

    return {
      period,
      totalIncome,
      totalExpense,
      // PRD sezione 11: Entrate - Spese del periodo, MAI il saldo conto.
      available: totalIncome.minus(totalExpense),
      accounts,
      recentExpenses: expenses.slice(0, 5),
      recentIncomes: incomes.slice(0, 5),
    };
  }),
});
