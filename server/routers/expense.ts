import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { protectedProcedure, router } from "../trpc";

const createExpenseSchema = z.object({
  date: z.coerce.date(),
  amount: z.number().positive("L'importo deve essere maggiore di zero."),
  categoryId: z.string().min(1, "Seleziona una categoria."),
  accountId: z.string().min(1, "Seleziona un metodo di pagamento."),
  description: z.string().trim().min(1, "Aggiungi una breve descrizione.").max(120),
  notes: z.string().trim().max(500).optional(),
});

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
  // Descrizione. Rate e ricorrenza sono Fase 2/3 della roadmap — qui il
  // Payment Plan è sempre "immediato", un'unica rata pagata subito. Expense
  // + PaymentPlan + PaymentSchedule + CashMovement in una sola transazione:
  // se una qualunque fallisce, non deve restare nessun pezzo a metà (Rule 1,
  // mai doppio conteggio — vale anche al contrario, mai un pezzo orfano).
  create: protectedProcedure.input(createExpenseSchema).mutation(async ({ ctx, input }) => {
    const [category, account] = await Promise.all([
      ctx.prisma.category.findFirst({ where: { id: input.categoryId, userId: ctx.userId } }),
      ctx.prisma.account.findFirst({ where: { id: input.accountId, userId: ctx.userId } }),
    ]);
    if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria non trovata." });
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Conto non trovato." });

    return ctx.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          userId: ctx.userId,
          date: input.date,
          amount: input.amount,
          categoryId: input.categoryId,
          description: input.description,
          notes: input.notes,
          // "PLANNED" (il default dello schema) è per le ricorrenze non
          // ancora confermate (PRD sezione 9). Un inserimento manuale è
          // già un fatto accaduto.
          status: "RECORDED",
        },
      });

      const paymentPlan = await tx.paymentPlan.create({
        data: {
          expenseId: expense.id,
          type: "IMMEDIATE",
          accountId: input.accountId,
          installmentsCount: 1,
          startDate: input.date,
        },
      });

      const schedule = await tx.paymentSchedule.create({
        data: {
          paymentPlanId: paymentPlan.id,
          dueDate: input.date,
          amount: input.amount,
          status: "PAID",
          installmentNo: 1,
        },
      });

      await tx.cashMovement.create({
        data: {
          accountId: input.accountId,
          date: input.date,
          amount: -input.amount, // signed: negative = money out (input.amount is always positive, zod-validated)
          type: account.type === "CREDIT_CARD" ? "CARD_CHARGE" : "OTHER",
          status: "EXECUTED",
          description: input.description,
          paymentScheduleId: schedule.id,
        },
      });

      return expense;
    });
  }),
});
