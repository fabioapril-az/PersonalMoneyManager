import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { computeCardStatementDate } from "@/lib/domain/creditCard";
import { protectedProcedure, router } from "../trpc";

const createExpenseSchema = z.object({
  date: z.coerce.date(),
  amount: z.number().positive("L'importo deve essere maggiore di zero."),
  categoryId: z.string().min(1, "Seleziona una categoria."),
  accountId: z.string().min(1, "Seleziona un metodo di pagamento."),
  description: z.string().trim().min(1, "Aggiungi una breve descrizione.").max(120),
  notes: z.string().trim().max(500).optional(),
});

const updateExpenseSchema = createExpenseSchema.extend({ id: z.string() });

export const expenseRouter = router({
  listCurrentPeriod: protectedProcedure.query(({ ctx }) => {
    const period = getCurrentFinancialPeriod();
    return ctx.prisma.expense.findMany({
      where: { userId: ctx.userId, date: { gte: period.start, lte: period.end } },
      include: { category: true },
      orderBy: { date: "desc" },
    });
  }),

  // L'inserimento rapido (PRD sezione 13): Importo, Categoria, Conto,
  // Descrizione. Rate sono ancora Fase 2 non implementata — qui il Payment
  // Plan è sempre a rata unica. Ma il TIPO di rata dipende dal conto:
  //
  //   - Conti "immediati" (C/C, PayPal, contanti, altro): PaymentPlan
  //     IMMEDIATE, PaymentSchedule PAID, CashMovement creato subito — i
  //     soldi escono ora.
  //   - Carta di credito (PRD sezione 6): PaymentPlan CREDIT_CARD,
  //     PaymentSchedule PENDING alla data del vero estratto conto, NESSUN
  //     CashMovement ora. Il movimento reale arriva quando la scadenza
  //     viene saldata (paymentSchedule.markPaid) — "impegni futuri" nel
  //     frattempo la mostra come non ancora avvenuta.
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
    assertCreditCardIsConfigured(account);

    return ctx.prisma.$transaction((tx) => createExpenseChain(tx, ctx.userId, input, account));
  }),

  // Nessun "patch" campo per campo: cancella la vecchia catena (Expense ->
  // PaymentPlan -> PaymentSchedule -> CashMovement, se esiste) e ricreala
  // con i nuovi valori, nella stessa transazione. Più semplice e meno
  // rischioso di aggiornare 4 tabelle in parallelo mantenendole coerenti a
  // mano — e riusa esattamente la stessa logica di create per decidere se
  // il risultato è una scadenza pagata subito o in attesa.
  update: protectedProcedure.input(updateExpenseSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.expense.findFirst({ where: { id: input.id, userId: ctx.userId } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

    const [category, account] = await Promise.all([
      ctx.prisma.category.findFirst({ where: { id: input.categoryId, userId: ctx.userId } }),
      ctx.prisma.account.findFirst({ where: { id: input.accountId, userId: ctx.userId } }),
    ]);
    if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria non trovata." });
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Conto non trovato." });
    assertCreditCardIsConfigured(account);

    return ctx.prisma.$transaction(async (tx) => {
      await deleteExpenseChain(tx, input.id);
      return createExpenseChain(tx, ctx.userId, input, account);
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
};

type AccountForExpense = { type: string; statementDay: number | null; name: string };

// Le carte di credito esistenti create prima di questa feature non hanno
// ancora un giorno di fatturazione — messaggio chiaro invece di un crash o
// di un fallback silenzioso e sbagliato.
function assertCreditCardIsConfigured(account: AccountForExpense) {
  if (account.type === "CREDIT_CARD" && account.statementDay == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Configura il giorno di fatturazione di "${account.name}" (vai su Conti) prima di registrare una spesa con questa carta.`,
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's transaction client type
async function createExpenseChain(tx: any, userId: string, input: ExpenseInput, account: AccountForExpense) {
  const expense = await tx.expense.create({
    data: {
      userId,
      date: input.date,
      amount: input.amount,
      categoryId: input.categoryId,
      description: input.description,
      notes: input.notes,
      // "PLANNED" (il default dello schema) è per le ricorrenze non ancora
      // confermate (PRD sezione 9). Un inserimento manuale è già un fatto
      // accaduto.
      status: "RECORDED",
    },
  });

  const isCreditCard = account.type === "CREDIT_CARD";

  const paymentPlan = await tx.paymentPlan.create({
    data: {
      expenseId: expense.id,
      type: isCreditCard ? "CREDIT_CARD" : "IMMEDIATE",
      accountId: input.accountId,
      installmentsCount: 1,
      startDate: input.date,
    },
  });

  const dueDate = isCreditCard ? computeCardStatementDate(input.date, account.statementDay as number) : input.date;

  const schedule = await tx.paymentSchedule.create({
    data: {
      paymentPlanId: paymentPlan.id,
      dueDate,
      amount: input.amount,
      status: isCreditCard ? "PENDING" : "PAID",
      installmentNo: 1,
    },
  });

  if (!isCreditCard) {
    await tx.cashMovement.create({
      data: {
        accountId: input.accountId,
        date: input.date,
        amount: -input.amount, // signed: negative = money out (input.amount is always positive, zod-validated)
        type: "OTHER",
        status: "EXECUTED",
        description: input.description,
        paymentScheduleId: schedule.id,
      },
    });
  }
  // Carta di credito: nessun CashMovement ora — vedi paymentSchedule.ts
  // markPaid, che lo crea alla data reale di addebito.

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
