import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { settleOverdueCardCharges } from "../settleOverdueCardCharges";

export const paymentScheduleRouter = router({
  // "Impegni futuri" (PRD sezione 11): scadenze non ancora avvenute — rate
  // successive alla prima, e addebiti carta di credito non ancora scaduti
  // (quelli scaduti vengono saldati da solo prima di elencare, così questa
  // lista non mostra mai un addebito carta che in realtà è già avvenuto).
  listPending: protectedProcedure.query(async ({ ctx }) => {
    await settleOverdueCardCharges(ctx.prisma, ctx.userId);

    return ctx.prisma.paymentSchedule.findMany({
      where: { status: "PENDING", paymentPlan: { expense: { userId: ctx.userId } } },
      include: {
        paymentPlan: {
          include: {
            expense: { include: { category: true } },
            account: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });
  }),

  // Il momento in cui l'acquisto (o la rata) diventa un vero movimento di
  // denaro (PRD sezione 6: "Cash Movement, quando avviene realmente"). Crea
  // il CashMovement solo ora, alla data della scadenza — mai all'acquisto.
  markPaid: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const schedule = await ctx.prisma.paymentSchedule.findFirst({
      where: { id: input.id, paymentPlan: { expense: { userId: ctx.userId } } },
      include: { paymentPlan: { include: { expense: true } } },
    });
    if (!schedule) throw new TRPCError({ code: "NOT_FOUND" });
    if (schedule.status !== "PENDING") {
      throw new TRPCError({ code: "CONFLICT", message: "Questa scadenza è già stata saldata." });
    }

    return ctx.prisma.$transaction(async (tx) => {
      await tx.paymentSchedule.update({ where: { id: schedule.id }, data: { status: "PAID" } });

      await tx.cashMovement.create({
        data: {
          accountId: schedule.paymentPlan.accountId,
          date: schedule.dueDate,
          amount: schedule.amount.negated(), // signed: money out
          type: schedule.paymentPlan.type === "INSTALLMENTS" ? "INSTALLMENT_PAYMENT" : "CARD_CHARGE",
          status: "EXECUTED",
          description: schedule.paymentPlan.expense.description,
          paymentScheduleId: schedule.id,
        },
      });

      return { success: true } as const;
    });
  }),
});
