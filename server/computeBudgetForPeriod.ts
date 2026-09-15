import { Prisma } from "@/app/generated/prisma/client";
import { selectBudgetExpenses, computeBudgetSpreadShare } from "@/lib/domain/budget";
import type { FinancialPeriod } from "@/lib/domain/period";
import type { Context } from "./context";

/**
 * Il calcolo del Budget (regola ibrida, PRD "scenario ristorante con carta
 * di credito" + "spalma sul Budget", vedi lib/domain/budget.ts) — estratto
 * da dashboard.ts perché anche il Budget settimanale (report.ts) deve
 * leggere esattamente la stessa cosa: due punti dell'app che raccontano
 * "quanto ho speso nel Budget" non devono poter disallinearsi tra loro.
 *
 * Non include le query su Income/CashMovement/Account — quelle restano in
 * dashboard.ts, che le usa anche per Entrate/Disponibile/Movimenti di cassa,
 * cose che il Budget settimanale non tocca.
 */
export async function computeBudgetForPeriod(prisma: Context["prisma"], userId: string, period: FinancialPeriod) {
  const [expenses, schedulesDueInPeriod, pastSpreadExpenses] = await Promise.all([
    // status "not PLANNED": una ricorrenza generata ma non ancora confermata
    // (PRD sezione 9) non deve contare nel Budget finché l'utente non la
    // conferma — vedi expense.listPlanned e "Ricorrenze da confermare".
    prisma.expense.findMany({
      where: { userId, date: { gte: period.start, lte: period.end }, status: { not: "PLANNED" } },
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
    // Per il Budget (rate soltanto): conta per data di SCADENZA, non per
    // status — una rata ancora PENDING ma dovuta in questo periodo impegna
    // comunque il budget del periodo. Le spese con carta di credito NON sono
    // qui: contano alla data d'acquisto, insieme a quelle a pagamento
    // immediato — vedi budgetSpent sotto. Escluse le scadenze di conti "non
    // soldi tuoi" (ticket pasto, ecc.) e le spese "Escludi dal Budget"
    // (excludeFromBudget) — una spesa a rate può comunque essere finanziata
    // da risparmi già accantonati.
    prisma.paymentSchedule.findMany({
      where: {
        dueDate: { gte: period.start, lte: period.end },
        paymentPlan: {
          type: "INSTALLMENTS",
          expense: { userId, excludeFromBudget: false },
          account: { excludeFromTotals: false },
        },
      },
      include: {
        paymentPlan: {
          select: {
            installmentsCount: true,
            account: { select: { name: true } },
            expense: {
              select: {
                id: true,
                description: true,
                recurringTemplateId: true,
                // categoryId/isRecurringCost: per il report "Budget per
                // categoria" (report.budgetByCategory), che raggruppa queste
                // stesse righe per categoria di primo livello e sa filtrare
                // sull'etichetta "Spesa ricorrente".
                categoryId: true,
                isRecurringCost: true,
                category: { select: { icon: true, name: true } },
              },
            },
          },
        },
      },
    }),
    // "Spalma sul Budget" (Expense.budgetSpreadPeriods): spese pagate in un
    // periodo PRECEDENTE che possono comunque toccare il Budget di questo
    // periodo (una quota, non l'importo intero — vedi computeBudgetSpreadShare
    // sotto). Non filtrata per data d'inizio: per un uso personale il numero
    // di spese spalmate resta piccolo, e non conosciamo a priori quanto
    // indietro cercare (dipende da quanti periodi ciascuna copre).
    prisma.expense.findMany({
      where: { userId, budgetSpreadPeriods: { not: null }, date: { lt: period.start }, status: { not: "PLANNED" } },
      select: {
        id: true,
        date: true,
        amount: true,
        budgetSpreadPeriods: true,
        // Sempre false qui per costruzione (mutuamente esclusivo con
        // budgetSpreadPeriods, applicato in expense.ts) — selezionata
        // comunque per soddisfare il tipo di selectBudgetExpenses.
        excludeFromBudget: true,
        description: true,
        categoryId: true,
        isRecurringCost: true,
        category: { select: { icon: true, name: true } },
        paymentPlan: { select: { type: true, account: { select: { name: true, excludeFromTotals: true } } } },
      },
    }),
  ]);

  const budgetExpenses = selectBudgetExpenses(expenses);

  // Una spesa "spalmata sul Budget" pesa qui solo per la quota di questo
  // periodo, mai per l'importo intero. Per una spesa di QUESTO periodo la
  // quota è sempre la prima (indice 0, "rata 1"): il periodo d'origine di
  // computeBudgetSpreadShare coincide per costruzione con quello mostrato,
  // dato che e.date è già filtrata dentro [period.start, period.end] sopra.
  function budgetAmountFor(e: { date: Date; amount: Prisma.Decimal; budgetSpreadPeriods: number | null }) {
    if (e.budgetSpreadPeriods == null) return e.amount;
    return new Prisma.Decimal(computeBudgetSpreadShare(e.date, Number(e.amount), e.budgetSpreadPeriods, period)!.amount);
  }

  // Spese "spalmate sul Budget" pagate in un periodo PRECEDENTE la cui quota
  // ricade comunque in questo periodo. Mai all'indietro (computeBudgetSpreadShare
  // non restituisce mai un periodo precedente a quello di pagamento). Loop
  // esplicito invece di map+filter(Boolean): un .filter su un risultato
  // "T | null" non restringe da solo il tipo in TypeScript strict.
  const pastSpreadShares: {
    expense: (typeof pastSpreadExpenses)[number];
    share: NonNullable<ReturnType<typeof computeBudgetSpreadShare>>;
  }[] = [];
  for (const e of selectBudgetExpenses(pastSpreadExpenses)) {
    const share = computeBudgetSpreadShare(e.date, Number(e.amount), e.budgetSpreadPeriods as number, period);
    if (share) pastSpreadShares.push({ expense: e, share });
  }

  const budgetSpent = budgetExpenses
    .reduce((sum, e) => sum.plus(budgetAmountFor(e)), new Prisma.Decimal(0))
    .plus(schedulesDueInPeriod.reduce((sum, s) => sum.plus(s.amount), new Prisma.Decimal(0)))
    .plus(pastSpreadShares.reduce((sum, { share }) => sum.plus(share.amount), new Prisma.Decimal(0)));

  // Dettaglio "cosa concorre al budget", riga per riga invece che sommato —
  // vedi BudgetBreakdownSection (app/DashboardClient.tsx) e il Budget
  // settimanale (app/report/WeeklyBudgetSection.tsx), che bucketizzano
  // queste righe per settimana in base a `date`.
  const budgetLines = [
    ...budgetExpenses.map((e) => {
      const share =
        e.budgetSpreadPeriods != null ? computeBudgetSpreadShare(e.date, Number(e.amount), e.budgetSpreadPeriods, period) : null;
      return {
        id: e.id,
        expenseId: e.id,
        date: e.date,
        description: e.description,
        categoryId: e.categoryId,
        categoryIcon: e.category.icon,
        categoryName: e.category.name,
        isRecurringCost: e.isRecurringCost,
        accountName: e.paymentPlan?.account.name ?? null,
        amount: share ? new Prisma.Decimal(share.amount) : e.amount,
        installment: share ? { no: share.no, count: share.count } : (null as { no: number | null; count: number | null } | null),
        spreadTotalAmount: share ? share.totalAmount : null,
        isRecurring: e.recurringTemplateId != null,
      };
    }),
    ...schedulesDueInPeriod.map((s) => ({
      id: s.id,
      expenseId: s.paymentPlan.expense.id,
      date: s.dueDate,
      description: s.paymentPlan.expense.description,
      categoryId: s.paymentPlan.expense.categoryId,
      categoryIcon: s.paymentPlan.expense.category.icon,
      categoryName: s.paymentPlan.expense.category.name,
      isRecurringCost: s.paymentPlan.expense.isRecurringCost,
      accountName: s.paymentPlan.account.name,
      amount: s.amount,
      installment: { no: s.installmentNo, count: s.paymentPlan.installmentsCount },
      spreadTotalAmount: null as number | null,
      isRecurring: s.paymentPlan.expense.recurringTemplateId != null,
    })),
    ...pastSpreadShares.map(({ expense: e, share }) => ({
      id: `${e.id}-spread-${period.key}`,
      expenseId: e.id,
      date: e.date,
      description: e.description,
      categoryId: e.categoryId,
      categoryIcon: e.category.icon,
      categoryName: e.category.name,
      isRecurringCost: e.isRecurringCost,
      accountName: e.paymentPlan?.account.name ?? null,
      amount: new Prisma.Decimal(share.amount),
      installment: { no: share.no, count: share.count },
      spreadTotalAmount: share.totalAmount,
      isRecurring: false,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return { expenses, budgetSpent, budgetLines };
}
