import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { listAccountsWithBalance } from "../accountBalances";
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
      const period = getCurrentFinancialPeriod(input?.referenceDate);
      const isCurrentPeriod = period.key === getCurrentFinancialPeriod().key;

      const [incomes, expenses, schedulesDueInPeriod, cashMovements, accounts, user] = await Promise.all([
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
        ctx.prisma.expense.findMany({
          where: { userId: ctx.userId, date: { gte: period.start, lte: period.end } },
          // Stesso motivo: l'account "vero" di un'Expense vive nel suo
          // PaymentPlan, non sull'Expense stessa. installmentsCount serve per
          // pre-compilare il form di modifica se la spesa è a rate, e insieme
          // al nome del conto per mostrare "come" è stata pagata. type ed
          // excludeFromTotals servono al calcolo di budgetSpent sotto.
          include: {
            category: true,
            paymentPlan: {
              select: {
                accountId: true,
                installmentsCount: true,
                type: true,
                account: { select: { name: true, excludeFromTotals: true } },
              },
            },
          },
          orderBy: { date: "desc" },
        }),
        // Per il Budget (rate soltanto), non per "Spese" — vedi sotto. Conta
        // per data di SCADENZA, non per status: una rata ancora PENDING ma
        // dovuta in questo periodo impegna comunque il budget del periodo,
        // indipendentemente da quando la segni pagata a mano. Le spese con
        // carta di credito NON sono qui: contano alla data d'acquisto,
        // insieme a quelle a pagamento immediato — vedi budgetSpent sotto.
        // Escluse le scadenze di conti "non soldi tuoi" (ticket pasto, ecc.).
        // L'include serve solo a costruire budgetLines (il dettaglio "cosa
        // concorre al budget"), non al totale in sé.
        ctx.prisma.paymentSchedule.findMany({
          where: {
            dueDate: { gte: period.start, lte: period.end },
            paymentPlan: { type: "INSTALLMENTS", expense: { userId: ctx.userId }, account: { excludeFromTotals: false } },
          },
          include: {
            paymentPlan: {
              select: {
                installmentsCount: true,
                account: { select: { name: true } },
                // id: serve solo per aprire la modifica della spesa da
                // "Cosa concorre al Budget" (BudgetBreakdownSection) anche
                // quando è stata decisa in un periodo diverso da quello
                // mostrato — vedi expense.getById.
                expense: { select: { id: true, description: true, category: { select: { icon: true, name: true } } } },
              },
            },
          },
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
      ]);

      // "Spese" (PRD sezione 11): sempre l'Expense per intero, alla data della
      // decisione di spesa — mai spalmata, mai posticipata (Rule 4).
      const totalIncome = incomes.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
      const totalExpense = expenses.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));

      // "Budget": regola ibrida, diversa per ciascun metodo di pagamento
      // (deciso col confronto sul caso ristorante-con-carta):
      // - pagamento immediato o carta di credito: pesano alla data
      //   dell'ACQUISTO ("l'ho deciso oggi, lo sto spendendo oggi") — stesso
      //   importo, stesso periodo di totalExpense.
      // - a rate (PRD sezione 7: "il budget del periodo considera solamente
      //   le rate appartenenti al periodo"): pesano alla data di SCADENZA di
      //   ogni singola rata, una alla volta — non tutto l'importo in un
      //   colpo sul mese dell'acquisto.
      const budgetExpenses = expenses.filter(
        (e) => e.paymentPlan?.type !== "INSTALLMENTS" && !e.paymentPlan?.account.excludeFromTotals
      );
      const budgetSpent = budgetExpenses
        .reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0))
        .plus(schedulesDueInPeriod.reduce((sum, s) => sum.plus(s.amount), new Prisma.Decimal(0)));

      // Dettaglio "cosa concorre al budget" — stessa identica selezione di
      // budgetSpent sopra, riga per riga invece che sommata, perché capire
      // "cosa" lo consuma non era ovvio guardando Spese e entrate (mostra
      // l'importo intero di una spesa a rate, non la singola rata) o
      // Impegni futuri/Movimenti di cassa (mescolano scadenze future non
      // ancora del periodo, trasferimenti, entrate, ecc.).
      const budgetLines = [
        ...budgetExpenses.map((e) => ({
          id: e.id,
          expenseId: e.id,
          date: e.date,
          description: e.description,
          categoryIcon: e.category.icon,
          categoryName: e.category.name,
          accountName: e.paymentPlan?.account.name ?? null,
          amount: e.amount,
          installment: null as { no: number | null; count: number | null } | null,
        })),
        ...schedulesDueInPeriod.map((s) => ({
          id: s.id,
          // La riga è identificata dalla PaymentSchedule (id, usato come React
          // key), ma per aprirne la modifica serve la vera Expense a monte —
          // vedi il commento sopra sull'include di expense.id.
          expenseId: s.paymentPlan.expense.id,
          date: s.dueDate,
          description: s.paymentPlan.expense.description,
          categoryIcon: s.paymentPlan.expense.category.icon,
          categoryName: s.paymentPlan.expense.category.name,
          accountName: s.paymentPlan.account.name,
          amount: s.amount,
          installment: { no: s.installmentNo, count: s.paymentPlan.installmentsCount },
        })),
      ].sort((a, b) => b.date.getTime() - a.date.getTime());

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
