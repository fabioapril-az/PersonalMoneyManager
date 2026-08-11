import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { listAccountsWithBalance } from "../accountBalances";
import { protectedProcedure, router } from "../trpc";

export const dashboardRouter = router({
  // Tutto quello che serve alla home in una chiamata.
  summary: protectedProcedure.query(async ({ ctx }) => {
    const period = getCurrentFinancialPeriod();

    const [incomes, expenses, schedulesDueInPeriod, accounts, user] = await Promise.all([
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
      // Per il Budget, non per "Spese" — vedi sotto. Conta per data di
      // SCADENZA, non per status: una rata/addebito ancora PENDING ma
      // dovuto in questo periodo impegna comunque il budget del periodo,
      // indipendentemente da quando la segni pagata a mano. Escluse le
      // scadenze di conti "non soldi tuoi" (ticket pasto, ecc.).
      ctx.prisma.paymentSchedule.findMany({
        where: {
          dueDate: { gte: period.start, lte: period.end },
          paymentPlan: { expense: { userId: ctx.userId }, account: { excludeFromTotals: false } },
        },
        select: { amount: true },
      }),
      listAccountsWithBalance(ctx.prisma, ctx.userId),
      ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { monthlyBudget: true } }),
    ]);

    // "Spese" (PRD sezione 11): sempre l'Expense per intero, alla data della
    // decisione di spesa — mai spalmata, mai posticipata (Rule 4).
    const totalIncome = incomes.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
    const totalExpense = expenses.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));

    // "Budget" invece segue le scadenze reali (PRD sezione 7: "il budget del
    // periodo considera solamente le rate appartenenti al periodo") — una
    // spesa a rate o con carta di credito impegna il budget del periodo in
    // cui la singola rata/l'addebito è dovuto, non quello dell'acquisto.
    // Per una spesa a pagamento immediato coincide sempre con totalExpense
    // (l'unica sua PaymentSchedule scade lo stesso giorno).
    const budgetSpent = schedulesDueInPeriod.reduce((sum, s) => sum.plus(s.amount), new Prisma.Decimal(0));

    // Liquidità reale disponibile: somma dei saldi dei conti attivi e "reali"
    // (non ticket pasto/benefit, vedi Account.excludeFromTotals).
    // Deliberatamente NON "saldo - spese": le spese già pagate hanno già
    // abbassato il saldo del conto tramite il loro CashMovement (Rule 5) —
    // sottrarle di nuovo qui le conterebbe due volte (Rule 1). I conti
    // archiviati non contano: non sono più liquidità operativa.
    const available = accounts
      .filter((account) => !account.archived && !account.excludeFromTotals)
      .reduce((sum, account) => sum.plus(account.balance), new Prisma.Decimal(0));

    return {
      period,
      totalIncome,
      totalExpense,
      available,
      // Tetto di spesa complessivo scelto dall'utente, confrontato con
      // budgetSpent — non totalExpense, vedi sopra (app/budget). Null se non
      // impostato.
      monthlyBudget: user.monthlyBudget,
      budgetSpent,
      accounts,
      recentExpenses: expenses.slice(0, 5),
      recentIncomes: incomes.slice(0, 5),
    };
  }),
});
