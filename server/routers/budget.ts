import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

// Un unico tetto di spesa mensile complessivo (User.monthlyBudget), non per
// categoria — vedi il commento su quel campo in schema.prisma. Confrontato
// con il totale delle Expense del periodo (dashboard.summary), non con
// "Disponibile" (che resta Entrate-Spese, PRD sezione 11).
export const budgetRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { monthlyBudget: true },
    });
    return { monthlyBudget: user.monthlyBudget };
  }),

  set: protectedProcedure
    .input(z.object({ amount: z.number().nonnegative("Il budget non può essere negativo.").nullable() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.update({
        where: { id: ctx.userId },
        data: { monthlyBudget: input.amount },
        select: { monthlyBudget: true },
      });
      return user;
    }),
});
