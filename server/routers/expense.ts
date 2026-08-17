import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { decideExpensePlan } from "@/lib/domain/expensePlan";
import { protectedProcedure, router } from "../trpc";

// z.object prima, .refine() dopo su ciascuna variante (create/update) — non
// il contrario: .refine() restituisce un ZodEffects, che non ha .extend(),
// quindi updateExpenseSchema non potrebbe aggiungere "id" se lo applicassimo
// una sola volta qui sopra.
const expenseFieldsSchema = z.object({
  date: z.coerce.date(),
  amount: z.number().positive("L'importo deve essere maggiore di zero."),
  categoryId: z.string().min(1, "Seleziona una categoria."),
  accountId: z.string().min(1, "Seleziona un metodo di pagamento."),
  description: z.string().trim().min(1, "Aggiungi una breve descrizione.").max(120),
  notes: z.string().trim().max(500).optional(),
  // Rate (PRD sezione 7): qualunque spesa, su qualunque conto. Se presente
  // e > 1, prevale sulla logica "carta di credito" — vedi createExpenseChain.
  installments: z.number().int().min(2).max(60).optional(),
  // "Spalma sul Budget" (schema.prisma: Expense.budgetSpreadPeriods) — per
  // spese "a cavallo" di più mesi (bollette bimestrali, spese condominiali
  // straordinarie). Mutuamente esclusivo con le rate, vedi sotto: il
  // Disponibile/CashMovement restano SEMPRE l'importo pieno, subito, a
  // differenza delle rate — solo il Budget legge questo campo.
  budgetSpreadPeriods: z.number().int().min(2).max(60).optional(),
});

function refineMutualExclusivity<T extends z.ZodType<{ installments?: number; budgetSpreadPeriods?: number }>>(
  schema: T
) {
  return schema.refine((data) => !(data.installments != null && data.budgetSpreadPeriods != null), {
    message: "Una spesa non può essere sia a rate sia spalmata sul Budget: scegli una delle due.",
    path: ["budgetSpreadPeriods"],
  });
}

const createExpenseSchema = refineMutualExclusivity(expenseFieldsSchema);
const updateExpenseSchema = refineMutualExclusivity(expenseFieldsSchema.extend({ id: z.string() }));

export const expenseRouter = router({
  // Per aprire la modifica di una spesa referenziata da fuori dal suo
  // periodo — es. una rata in "Rate in Corso" o una riga in "Cosa concorre
  // al Budget" può riferirsi a una spesa decisa in un periodo precedente,
  // quindi non presente tra i dati già caricati (period-scoped) del
  // dashboard corrente. Stessa forma di EditableExpense (EditExpenseDialog.tsx).
  getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const expense = await ctx.prisma.expense.findFirst({
      where: { id: input.id, userId: ctx.userId },
      // recurringTemplate: solo per una spesa PLANNED non ancora confermata
      // (nessun paymentPlan proprio) — dà comunque un conto di partenza da
      // pre-compilare nel form di modifica, vedi EditExpenseDialog.
      include: {
        paymentPlan: { select: { accountId: true, installmentsCount: true } },
        recurringTemplate: { select: { accountId: true } },
      },
    });
    if (!expense) throw new TRPCError({ code: "NOT_FOUND" });
    return expense;
  }),

  // "Ricorrenze da confermare" (app/movimenti): le occorrenze già generate da
  // un template (server/generateDueRecurringExpenses.ts) ma non ancora
  // confermate — non filtrate per periodo, sono promemoria in attesa
  // indipendentemente da quando ricadono.
  listPlanned: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.expense.findMany({
      where: { userId: ctx.userId, status: "PLANNED" },
      include: {
        category: true,
        paymentPlan: { select: { accountId: true, installmentsCount: true } },
        recurringTemplate: { select: { accountId: true } },
      },
      orderBy: { date: "asc" },
    })
  ),

  listCurrentPeriod: protectedProcedure.query(({ ctx }) => {
    const period = getCurrentFinancialPeriod();
    return ctx.prisma.expense.findMany({
      where: { userId: ctx.userId, date: { gte: period.start, lte: period.end } },
      include: { category: true },
      orderBy: { date: "desc" },
    });
  }),

  // L'inserimento rapido (PRD sezione 13): Importo, Categoria, Conto,
  // Descrizione, + Rate opzionale. Il TIPO di Payment Plan dipende da conto
  // e scelta rate:
  //
  //   - Rate scelte (qualunque conto): PaymentPlan INSTALLMENTS, N
  //     PaymentSchedule mensili dalla data d'acquisto (PRD sezione 7). La
  //     1a è pagata subito (CashMovement immediato), le altre PENDING.
  //   - Nessuna rata, carta di credito (PRD sezione 6): PaymentPlan
  //     CREDIT_CARD, 1 PaymentSchedule PENDING alla data del vero estratto
  //     conto, nessun CashMovement finché non viene saldata.
  //   - Nessuna rata, conto "immediato" (C/C, PayPal, contanti, altro):
  //     PaymentPlan IMMEDIATE, PaymentSchedule PAID, CashMovement subito.
  //
  // Sempre in una sola transazione: se una parte fallisce, non deve restare
  // nessun pezzo a metà (Rule 1).
  create: protectedProcedure.input(createExpenseSchema).mutation(async ({ ctx, input }) => {
    const [category, account] = await Promise.all([
      ctx.prisma.category.findFirst({ where: { id: input.categoryId, userId: ctx.userId } }),
      ctx.prisma.account.findFirst({ where: { id: input.accountId, userId: ctx.userId } }),
    ]);
    if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria non trovata." });
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Conto non trovato." });
    assertCreditCardIsConfigured(account, input.installments);

    return ctx.prisma.$transaction((tx) => createExpenseChain(tx, ctx.userId, input, account));
  }),

  // Nessun "patch" campo per campo: cancella la vecchia catena (Expense ->
  // PaymentPlan -> PaymentSchedule -> CashMovement, se esiste) e ricreala
  // con i nuovi valori, nella stessa transazione. Più semplice e meno
  // rischioso di aggiornare 4 tabelle in parallelo mantenendole coerenti a
  // mano — e riusa esattamente la stessa logica di create.
  //
  // Nota: se alcune rate erano già state segnate come pagate, modificare la
  // spesa le ricrea da zero (di nuovo tutte in attesa tranne la prima) — non
  // tiene traccia dei pagamenti già fatti sul piano precedente.
  //
  // Questo stesso percorso è anche il modo in cui si "conferma" una spesa
  // ricorrente PLANNED (PRD sezione 9): non esiste una mutation separata —
  // aprire "Ricorrenze da confermare", eventualmente correggere l'importo, e
  // premere Salva chiama proprio questa mutation, che crea per la prima
  // volta il vero PaymentPlan/CashMovement (deleteExpenseChain su una spesa
  // senza catena è un no-op) e porta lo status a RECORDED — vedi
  // createExpenseChain sotto. recurringTemplateId va portato avanti a mano:
  // la vecchia Expense viene cancellata e ricreata con un id nuovo, quindi
  // andrebbe perso senza ripassarlo esplicitamente qui.
  update: protectedProcedure.input(updateExpenseSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.expense.findFirst({ where: { id: input.id, userId: ctx.userId } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

    const [category, account] = await Promise.all([
      ctx.prisma.category.findFirst({ where: { id: input.categoryId, userId: ctx.userId } }),
      ctx.prisma.account.findFirst({ where: { id: input.accountId, userId: ctx.userId } }),
    ]);
    if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria non trovata." });
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Conto non trovato." });
    assertCreditCardIsConfigured(account, input.installments);

    return ctx.prisma.$transaction(async (tx) => {
      await deleteExpenseChain(tx, input.id);
      return createExpenseChain(tx, ctx.userId, input, account, existing.recurringTemplateId);
    });
  }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.expense.findFirst({ where: { id: input.id, userId: ctx.userId } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

    return ctx.prisma.$transaction(async (tx) => {
      await deleteExpenseChain(tx, input.id);
      return { success: true } as const;
    });
  }),
});

type ExpenseInput = {
  date: Date;
  amount: number;
  categoryId: string;
  accountId: string;
  description: string;
  notes?: string;
  installments?: number;
  budgetSpreadPeriods?: number;
};

type AccountForExpense = { type: string; statementDay: number | null; name: string };

// Le carte di credito esistenti create prima di questa feature non hanno
// ancora un giorno di fatturazione — messaggio chiaro invece di un crash o
// di un fallback silenzioso e sbagliato. Non serve se la spesa è a rate: in
// quel caso non si usa affatto lo scadenzario della carta (vedi sopra).
function assertCreditCardIsConfigured(account: AccountForExpense, installments?: number) {
  const isInstallments = installments != null && installments > 1;
  if (!isInstallments && account.type === "CREDIT_CARD" && account.statementDay == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Configura il giorno di fatturazione di "${account.name}" (vai su Conti) prima di registrare una spesa con questa carta.`,
    });
  }
}

async function createExpenseChain(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's transaction client type
  tx: any,
  userId: string,
  input: ExpenseInput,
  account: AccountForExpense,
  recurringTemplateId?: string | null
) {
  const expense = await tx.expense.create({
    data: {
      userId,
      date: input.date,
      amount: input.amount,
      categoryId: input.categoryId,
      description: input.description,
      notes: input.notes,
      // "PLANNED" (il default dello schema) è per le ricorrenze non ancora
      // confermate (PRD sezione 9) — questa funzione però è chiamata sia da
      // un inserimento manuale (già un fatto accaduto) sia dalla conferma di
      // una ricorrenza (expense.update, vedi sopra): in entrambi i casi il
      // risultato è una spesa reale, quindi sempre RECORDED qui.
      status: "RECORDED",
      recurringTemplateId: recurringTemplateId ?? undefined,
      // "Spalma sul Budget" (vedi il commento sul campo in schema.prisma) —
      // non tocca nulla di quello che segue (PaymentPlan/Schedule/
      // CashMovement): solo server/routers/dashboard.ts lo legge.
      budgetSpreadPeriods: input.budgetSpreadPeriods ?? undefined,
    },
  });

  // decideExpensePlan (lib/domain/expensePlan.ts) prende la decisione — tipo
  // di piano, quante scadenze, a quali date/importi/stato, quale genera
  // subito un movimento di cassa. Qui restano solo le scritture.
  const plan = decideExpensePlan({
    amount: input.amount,
    purchaseDate: input.date,
    installments: input.installments,
    account,
  });

  const paymentPlan = await tx.paymentPlan.create({
    data: {
      expenseId: expense.id,
      type: plan.type,
      accountId: input.accountId,
      installmentsCount: plan.installmentsCount,
      startDate: input.date,
    },
  });

  for (const schedule of plan.schedules) {
    const created = await tx.paymentSchedule.create({
      data: {
        paymentPlanId: paymentPlan.id,
        dueDate: schedule.dueDate,
        amount: schedule.amount,
        status: schedule.status,
        installmentNo: schedule.installmentNo,
      },
    });

    // Solo la scadenza segnata dal piano è un movimento reale ora — le altre
    // (rate successive alla prima, addebito carta non ancora fatturato)
    // restano in attesa ("Impegni futuri") finché non vengono saldate
    // (paymentSchedule.markPaid crea il CashMovement allora).
    if (schedule.createsCashMovementNow) {
      await tx.cashMovement.create({
        data: {
          accountId: input.accountId,
          date: input.date,
          amount: -schedule.amount, // signed: negative = money out (schedule.amount è sempre positivo)
          type: plan.type === "INSTALLMENTS" ? "INSTALLMENT_PAYMENT" : "OTHER",
          status: "EXECUTED",
          description: input.description,
          paymentScheduleId: created.id,
        },
      });
    }
  }

  return expense;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's transaction client type
async function deleteExpenseChain(tx: any, expenseId: string) {
  const paymentPlan = await tx.paymentPlan.findUnique({
    where: { expenseId },
    include: { schedules: true },
  });

  if (paymentPlan) {
    // CashMovement.paymentSchedule has onDelete: NoAction (schema.prisma) —
    // delete the movements first, or the Expense->PaymentPlan->
    // PaymentSchedule cascade fails with a foreign key violation.
    const scheduleIds = paymentPlan.schedules.map((s: { id: string }) => s.id);
    await tx.cashMovement.deleteMany({ where: { paymentScheduleId: { in: scheduleIds } } });
  }

  await tx.expense.delete({ where: { id: expenseId } });
}
