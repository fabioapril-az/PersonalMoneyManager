import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { reportGranularitySchema } from "@/lib/domain/enums";
import { GRANULARITY_PERIOD_COUNT, getCurrentFinancialPeriod, getRecentPeriods } from "@/lib/domain/period";
import { splitPeriodIntoWeeks, computeAdaptiveWeeklyBudget } from "@/lib/domain/budget";
import { computeBudgetForPeriod } from "../computeBudgetForPeriod";
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
        // status "not PLANNED": una ricorrenza non ancora confermata (PRD
        // sezione 9) è solo un promemoria, non conta ancora come spesa reale
        // — stesso filtro di dashboard.summary.
        where: { userId: ctx.userId, date: { gte: windowStart, lte: windowEnd }, status: { not: "PLANNED" } },
        // id/date/description in più rispetto al minimo che servirebbe al
        // solo totale: per rispondere a "cosa è stato classificato così"
        // cliccando una categoria — vedi categoryBreakdown[].expenses sotto.
        // isRecurringCost: per il totale "Spese ricorrenti" sotto — l'etichetta
        // manuale, non recurringTemplateId (vedi il commento sul campo in
        // schema.prisma).
        select: { id: true, date: true, description: true, categoryId: true, amount: true, isRecurringCost: true },
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
    // "Quanto della spesa di questa finestra è roba che torna comunque ogni
    // mese?" — un sottoinsieme di totalExpense (stesse spese, stessa finestra,
    // stesso filtro status), non un totale a parte: nessun conto su rate o
    // Budget qui, solo la somma delle spese marcate ricorrenti.
    const totalRecurringExpense = expenses
      .filter((e) => e.isRecurringCost)
      .reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));
    const totalsByTopCategory = new Map<string, Prisma.Decimal>();
    // Le spese vere e proprie dietro ogni fetta — una sottocategoria conta
    // nel totale del suo genitore (topLevelOf), ma qui teniamo il nome della
    // categoria effettivamente scelta (potrebbe essere la sottocategoria),
    // non quello del genitore, per non perdere quel dettaglio nell'elenco.
    const expensesByTopCategory = new Map<
      string,
      Array<{ id: string; date: Date; description: string; categoryName: string; amount: Prisma.Decimal }>
    >();
    for (const expense of expenses) {
      const top = topLevelOf(expense.categoryId);
      if (!top) continue;
      totalsByTopCategory.set(top.id, (totalsByTopCategory.get(top.id) ?? new Prisma.Decimal(0)).plus(expense.amount));

      const list = expensesByTopCategory.get(top.id) ?? [];
      list.push({
        id: expense.id,
        date: expense.date,
        description: expense.description,
        categoryName: categoryById.get(expense.categoryId)!.name,
        amount: expense.amount,
      });
      expensesByTopCategory.set(top.id, list);
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
          expenses: (expensesByTopCategory.get(categoryId) ?? []).sort((a, b) => b.date.getTime() - a.date.getTime()),
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
            where: { userId: ctx.userId, date: { gte: p.start, lte: p.end }, status: { not: "PLANNED" } },
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
      totalRecurringExpense,
      totalIncome,
      categoryBreakdown,
      trend,
    };
  }),

  // "Quanto posso ancora spendere prima del prossimo stipendio?" (PRD sezione
  // 1), letta settimana per settimana invece che a fine periodo — sempre sul
  // SOLO periodo mostrato (mai una finestra di più periodi: la granularità
  // Mensile/Trimestrale/Annuale sopra non c'entra qui, un budget settimanale
  // "trimestrale" non avrebbe senso).
  //
  // Il periodo (27->26, 28-31 giorni) è diviso in esattamente 4 "settimane"
  // fisse (lib/domain/budget.ts: splitPeriodIntoWeeks) — non settimane
  // solari vere: coerente con come il resto dell'app evita apposta il
  // calendario solare.
  //
  // Budget "adattivo" (lib/domain/budget.ts: computeAdaptiveWeeklyBudget):
  // una settimana già conclusa che sfora/risparmia sposta la differenza
  // sulle settimane ancora da venire, invece della semplice divisione fissa
  // per 4 — vedi il commento su quella funzione per i dettagli.
  weeklyBudget: protectedProcedure
    .input(z.object({ referenceDate: z.coerce.date().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const period = getCurrentFinancialPeriod(input?.referenceDate);
      const isCurrentPeriod = period.key === getCurrentFinancialPeriod().key;

      const [user, { budgetSpent, budgetLines }] = await Promise.all([
        ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { monthlyBudget: true } }),
        // Stessa identica regola ibrida + "spalma sul Budget"/"escludi dal
        // Budget" di dashboard.ts (server/computeBudgetForPeriod.ts) — qui
        // bucketizzata per settimana invece che sommata in un unico totale.
        computeBudgetForPeriod(ctx.prisma, ctx.userId, period),
      ]);

      const rawWeeks = splitPeriodIntoWeeks(period).map((week) => {
        const spent = budgetLines
          .filter((line) => line.date >= week.start && line.date <= week.end)
          .reduce((sum, line) => sum.plus(line.amount), new Prisma.Decimal(0));
        return { no: week.no, start: week.start, end: week.end, spent: Number(spent) };
      });

      const weeks =
        user.monthlyBudget != null
          ? computeAdaptiveWeeklyBudget(rawWeeks, Number(user.monthlyBudget), new Date())
          : rawWeeks.map((week) => ({ ...week, baseBudget: 0, adjustedBudget: 0, isFinal: false }));

      return { period, isCurrentPeriod, monthlyBudget: user.monthlyBudget, budgetSpent, weeks };
    }),
});
