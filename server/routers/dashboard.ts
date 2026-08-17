import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { selectBudgetExpenses, computeBudgetSpreadShare } from "@/lib/domain/budget";
import { listAccountsWithBalance } from "../accountBalances";
import { generateDueRecurringExpenses } from "../generateDueRecurringExpenses";
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

      const [incomes, expenses, schedulesDueInPeriod, cashMovements, accounts, user, pastSpreadExpenses] =
        await Promise.all([
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
          // status "not PLANNED": una ricorrenza generata ma non ancora
          // confermata (PRD sezione 9) è solo un promemoria — non deve
          // contare in Spese/Budget/Disponibile finché l'utente non la
          // conferma (expense.update). Vive altrove, vedi expense.listPlanned
          // e "Ricorrenze da confermare" in app/movimenti.
          where: { userId: ctx.userId, date: { gte: period.start, lte: period.end }, status: { not: "PLANNED" } },
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
                // "Spese nel Budget" (BudgetBreakdownSection) anche quando è
                // stata decisa in un periodo diverso da quello mostrato —
                // vedi expense.getById. recurringTemplateId: per segnalare in
                // UI le voci nate da una ricorrenza confermata (PRD sezione 9).
                expense: {
                  select: {
                    id: true,
                    description: true,
                    recurringTemplateId: true,
                    category: { select: { icon: true, name: true } },
                  },
                },
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
        // "Spalma sul Budget" (Expense.budgetSpreadPeriods, vedi schema.prisma
        // e lib/domain/budget.ts): spese pagate in un periodo PRECEDENTE a
        // questo che possono comunque toccare il Budget del periodo mostrato
        // (una quota, non l'importo intero — vedi computeBudgetSpreadShare
        // sotto). Non filtrata per data d'inizio: per un uso personale il
        // numero di spese spalmate resta piccolo, e non conosciamo a priori
        // quanto indietro cercare (dipende da quanti periodi ciascuna copre).
        ctx.prisma.expense.findMany({
          where: {
            userId: ctx.userId,
            budgetSpreadPeriods: { not: null },
            date: { lt: period.start },
            status: { not: "PLANNED" },
          },
          select: {
            id: true,
            date: true,
            amount: true,
            budgetSpreadPeriods: true,
            description: true,
            category: { select: { icon: true, name: true } },
            paymentPlan: { select: { type: true, account: { select: { name: true, excludeFromTotals: true } } } },
          },
        }),
      ]);

      // "Spese" (PRD sezione 11): sempre l'Expense per intero, alla data della
      // decisione di spesa — mai spalmata, mai posticipata (Rule 4).
      const totalIncome = incomes.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
      const totalExpense = expenses.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));

      // "Budget": regola ibrida, diversa per ciascun metodo di pagamento
      // (deciso col confronto sul caso ristorante-con-carta):
      // - pagamento immediato o carta di credito: pesano alla data
      //   dell'ACQUISTO ("l'ho deciso oggi, lo sto spendendo oggi") — stesso
      //   importo, stesso periodo di totalExpense. A meno che non sia
      //   "spalmata sul Budget" (budgetSpreadPeriods, vedi sotto): allora pesa
      //   solo per la sua quota di questo periodo.
      // - a rate (PRD sezione 7: "il budget del periodo considera solamente
      //   le rate appartenenti al periodo"): pesano alla data di SCADENZA di
      //   ogni singola rata, una alla volta — non tutto l'importo in un
      //   colpo sul mese dell'acquisto.
      const budgetExpenses = selectBudgetExpenses(expenses);

      // Una spesa "spalmata sul Budget" (schema.prisma: Expense.
      // budgetSpreadPeriods) pesa qui solo per la quota di questo periodo,
      // mai per l'importo intero — a differenza di totalExpense sopra, che
      // resta sempre l'importo pieno alla data vera (Rule 4, mai spalmato).
      // Per una spesa di QUESTO periodo la quota è sempre la prima (indice 0,
      // "rata 1"): il periodo d'origine di computeBudgetSpreadShare coincide
      // per costruzione con quello mostrato, dato che e.date è già filtrata
      // dentro [period.start, period.end] più sopra.
      function budgetAmountFor(e: { date: Date; amount: Prisma.Decimal; budgetSpreadPeriods: number | null }) {
        if (e.budgetSpreadPeriods == null) return e.amount;
        return new Prisma.Decimal(computeBudgetSpreadShare(e.date, Number(e.amount), e.budgetSpreadPeriods, period)!.amount);
      }

      // Spese "spalmate sul Budget" pagate in un periodo PRECEDENTE
      // (pastSpreadExpenses sopra) la cui quota ricade comunque in questo
      // periodo — es. bolletta bimestrale pagata il mese scorso, la cui 2ª
      // quota pesa su questo. Mai all'indietro (computeBudgetSpreadShare non
      // restituisce mai un periodo precedente a quello di pagamento).
      // Loop esplicito invece di map+filter(Boolean): un .filter su un
      // risultato "T | null" non restringe da solo il tipo in TypeScript
      // strict, servirebbe un type predicate — così è più semplice e diretto.
      const pastSpreadShares: { expense: (typeof pastSpreadExpenses)[number]; share: NonNullable<ReturnType<typeof computeBudgetSpreadShare>> }[] =
        [];
      for (const e of selectBudgetExpenses(pastSpreadExpenses)) {
        const share = computeBudgetSpreadShare(e.date, Number(e.amount), e.budgetSpreadPeriods as number, period);
        if (share) pastSpreadShares.push({ expense: e, share });
      }

      const budgetSpent = budgetExpenses
        .reduce((sum, e) => sum.plus(budgetAmountFor(e)), new Prisma.Decimal(0))
        .plus(schedulesDueInPeriod.reduce((sum, s) => sum.plus(s.amount), new Prisma.Decimal(0)))
        .plus(pastSpreadShares.reduce((sum, { share }) => sum.plus(share.amount), new Prisma.Decimal(0)));

      // Dettaglio "cosa concorre al budget" — stessa identica selezione di
      // budgetSpent sopra, riga per riga invece che sommata, perché capire
      // "cosa" lo consuma non era ovvio guardando Spese e entrate (mostra
      // l'importo intero di una spesa a rate, non la singola rata) o
      // Impegni futuri/Movimenti di cassa (mescolano scadenze future non
      // ancora del periodo, trasferimenti, entrate, ecc.).
      const budgetLines = [
        ...budgetExpenses.map((e) => {
          const share = e.budgetSpreadPeriods != null
            ? computeBudgetSpreadShare(e.date, Number(e.amount), e.budgetSpreadPeriods, period)
            : null;
          return {
            id: e.id,
            expenseId: e.id,
            date: e.date,
            description: e.description,
            categoryIcon: e.category.icon,
            categoryName: e.category.name,
            accountName: e.paymentPlan?.account.name ?? null,
            amount: share ? new Prisma.Decimal(share.amount) : e.amount,
            installment: share ? { no: share.no, count: share.count } : (null as { no: number | null; count: number | null } | null),
            // Solo per una riga "spalmata sul Budget" — mostrato accanto alla
            // quota apposta perché non sia scambiata per una rata vera ancora
            // da pagare (qui l'intero importo è già uscito dal conto).
            spreadTotalAmount: share ? share.totalAmount : null,
            // Generata da una ricorrenza confermata (PRD sezione 9) — vedi
            // "🔁 Ricorrente" in DashboardClient.tsx/MovimentiClient.tsx.
            isRecurring: e.recurringTemplateId != null,
          };
        }),
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
          spreadTotalAmount: null as number | null,
          isRecurring: s.paymentPlan.expense.recurringTemplateId != null,
        })),
        ...pastSpreadShares.map(({ expense: e, share }) => ({
          // Non l'id della spesa (già usato come chiave altrove, e questa riga
          // non è "la" spesa ma una sua quota) — un id sintetico stabile.
          id: `${e.id}-spread-${period.key}`,
          expenseId: e.id,
          // La data VERA del pagamento, non una data finta dentro questo
          // periodo: non è successo nulla "oggi", è una quota di competenza
          // di una spesa pagata altrove — mostrarla aiuta a capire che è un
          // riporto, non un nuovo movimento.
          date: e.date,
          description: e.description,
          categoryIcon: e.category.icon,
          categoryName: e.category.name,
          accountName: e.paymentPlan?.account.name ?? null,
          amount: new Prisma.Decimal(share.amount),
          installment: { no: share.no, count: share.count },
          spreadTotalAmount: share.totalAmount,
          isRecurring: false,
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
