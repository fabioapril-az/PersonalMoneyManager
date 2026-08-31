import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { listAccountsWithBalance } from "../accountBalances";
import { generateDueRecurringExpenses } from "../generateDueRecurringExpenses";
import { computeBudgetForPeriod } from "../computeBudgetForPeriod";
import { protectedProcedure, router } from "../trpc";

export const dashboardRouter = router({
  // Tutto quello che serve alla home in una chiamata. referenceDate permette
  // di navigare avanti/indietro tra periodi (27→26): un qualsiasi giorno al
  // suo interno individua lo stesso periodo, quindi basta spostare questa
  // data di un giorno oltre l'inizio/fine del periodo corrente per ottenere
  // quello precedente/successivo — vedi handlePrevious/handleNext lato client.
  summary: protectedProcedure
    .input(z.object({ referenceDate: z.coerce.date().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Pigro come settleOverdueCardCharges (chiamato da listAccountsWithBalance
      // qui sotto): genera le occorrenze dovute PRIMA di leggere le spese del
      // periodo, altrimenti una ricorrenza appena generata per il periodo
      // mostrato non comparirebbe finché non si ricarica la pagina.
      await generateDueRecurringExpenses(ctx.prisma, ctx.userId);

      const period = getCurrentFinancialPeriod(input?.referenceDate);
      const isCurrentPeriod = period.key === getCurrentFinancialPeriod().key;

      const [incomes, cashMovements, accounts, user, { expenses, budgetSpent, budgetLines }] = await Promise.all([
        ctx.prisma.income.findMany({
          where: { userId: ctx.userId, date: { gte: period.start, lte: period.end } },
          // accountId non è un campo di Income (solo il suo CashMovement lo
          // sa) — serve per pre-compilare il conto quando si modifica. Il
          // nome del conto invece serve solo per mostrare "come" (su quale
          // conto) è stata accreditata, in "Spese e entrate".
          include: {
            cashMovements: { select: { accountId: true, account: { select: { name: true } } }, take: 1 },
          },
          orderBy: { date: "desc" },
        }),
        // "Movimenti di cassa" (PRD Rule 5): cosa è successo DAVVERO sui
        // conti in questo periodo, per data di CashMovement — non di
        // Expense/Income. Una rata o un addebito carta pagati in questo
        // periodo compaiono qui anche se la spesa che li ha generati è stata
        // decisa in un periodo precedente (a differenza di recentExpenses).
        ctx.prisma.cashMovement.findMany({
          where: { date: { gte: period.start, lte: period.end }, account: { userId: ctx.userId } },
          include: {
            account: { select: { id: true, name: true } },
            paymentSchedule: {
              select: {
                installmentNo: true,
                paymentPlan: {
                  select: {
                    type: true,
                    installmentsCount: true,
                    expense: { select: { category: { select: { icon: true, name: true } } } },
                  },
                },
              },
            },
          },
          orderBy: { date: "desc" },
        }),
        listAccountsWithBalance(ctx.prisma, ctx.userId),
        ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { monthlyBudget: true } }),
        // budgetSpent/budgetLines (regola ibrida + "spalma sul Budget", vedi
        // lib/domain/budget.ts) — estratto in server/computeBudgetForPeriod.ts
        // così anche il Budget settimanale (report.ts) legge esattamente lo
        // stesso calcolo, non una copia che potrebbe disallinearsi. `expenses`
        // torna indietro per essere riusato qui sotto (Spese/Spese e entrate),
        // invece di interrogarlo una seconda volta.
        computeBudgetForPeriod(ctx.prisma, ctx.userId, period),
      ]);

      // "Spese" (PRD sezione 11): sempre l'Expense per intero, alla data della
      // decisione di spesa — mai spalmata, mai posticipata (Rule 4).
      const totalIncome = incomes.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
      const totalExpense = expenses.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));

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
        // Permette al client di mostrare/nascondere il pulsante "Torna a oggi"
        // senza duplicare la logica di calcolo del periodo corrente.
        isCurrentPeriod,
        totalIncome,
        totalExpense,
        available,
        // Tetto di spesa complessivo scelto dall'utente, confrontato con
        // budgetSpent — non totalExpense, vedi sopra (app/budget). Null se non
        // impostato.
        monthlyBudget: user.monthlyBudget,
        budgetSpent,
        budgetLines,
        accounts,
        // Tutte quelle del periodo, non solo le ultime 5 — "Spese e entrate"
        // era l'unico modo per trovare e correggere una voce già inserita
        // (es. data sbagliata), e un tetto di 5 la rendeva impossibile da
        // trovare appena si superava quella soglia. È comunque comprimibile
        // (app/DashboardClient.tsx), quindi non occupa spazio se non serve.
        periodExpenses: expenses,
        periodIncomes: incomes,
        cashMovements,
      };
    }),
});
