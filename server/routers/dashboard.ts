import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { listAccountsWithBalance } from "../accountBalances";
import { protectedProcedure, router } from "../trpc";

export const dashboardRouter = router({
  // Tutto quello che serve alla home in una chiamata.
  summary: protectedProcedure.query(async ({ ctx }) => {
    const period = getCurrentFinancialPeriod();

    const [incomes, expenses, accounts, user] = await Promise.all([
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
        // PaymentPlan, non sull'Expense stessa. installmentsCount serve per
        // pre-compilare il form di modifica se la spesa è a rate.
        include: { category: true, paymentPlan: { select: { accountId: true, installmentsCount: true } } },
        orderBy: { date: "desc" },
      }),
      listAccountsWithBalance(ctx.prisma, ctx.userId),
      ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { monthlyBudget: true } }),
    ]);

    const totalIncome = incomes.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
    const totalExpense = expenses.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));

    // Liquidità reale disponibile: somma dei saldi dei conti attivi.
    // Deliberatamente NON "saldo - spese": le spese già pagate hanno già
    // abbassato il saldo del conto tramite il loro CashMovement (Rule 5) —
    // sottrarle di nuovo qui le conterebbe due volte (Rule 1). I conti
    // archiviati non contano: non sono più liquidità operativa.
    const available = accounts
      .filter((account) => !account.archived)
      .reduce((sum, account) => sum.plus(account.balance), new Prisma.Decimal(0));

    return {
      period,
      totalIncome,
      totalExpense,
      available,
      // Tetto di spesa complessivo scelto dall'utente, confrontato con
      // totalExpense (vedi app/budget). Null se non impostato.
      monthlyBudget: user.monthlyBudget,
      accounts,
      recentExpenses: expenses.slice(0, 5),
      recentIncomes: incomes.slice(0, 5),
    };
  }),
});
