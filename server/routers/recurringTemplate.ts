import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { recurringFrequencySchema } from "@/lib/domain/enums";
import { protectedProcedure, router } from "../trpc";

// name/amount/categoryId/accountId/frequency: campi editabili in ogni momento
// (cambiano solo i futuri template, mai le spese già generate in passato).
// startDate invece esiste solo in create: è il punto di partenza (da cui
// derivano dayOfMonth e la prima nextRunDate) — cambiarlo a posteriori
// rigenererebbe occorrenze già passate, vedi il commento su update sotto.
const templateFieldsSchema = z.object({
  name: z.string().trim().min(1, "Dai un nome alla ricorrenza.").max(120),
  amount: z.number().positive("L'importo deve essere maggiore di zero."),
  categoryId: z.string().min(1, "Seleziona una categoria."),
  accountId: z.string().min(1, "Seleziona un conto."),
  frequency: recurringFrequencySchema,
});
const createTemplateSchema = templateFieldsSchema.extend({ startDate: z.coerce.date() });
const updateTemplateSchema = templateFieldsSchema.extend({ id: z.string() });

async function assertCategoryAndAccountExist(
  prisma: import("../context").Context["prisma"],
  userId: string,
  categoryId: string,
  accountId: string
) {
  const [category, account] = await Promise.all([
    prisma.category.findFirst({ where: { id: categoryId, userId } }),
    prisma.account.findFirst({ where: { id: accountId, userId } }),
  ]);
  if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria non trovata." });
  if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Conto non trovato." });
}

export const recurringTemplateRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.recurringTemplate.findMany({
      where: { userId: ctx.userId },
      include: { category: true, account: { select: { name: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    })
  ),

  // Prima occorrenza = la data scelta dall'utente, letteralmente (non "il
  // prossimo giorno X del mese dopo oggi") — dayOfMonth (l'ancora per i mesi
  // corti, vedi lib/domain/recurring.ts) è solo derivato da quella data, non
  // un campo separato da scegliere a mano.
  create: protectedProcedure.input(createTemplateSchema).mutation(async ({ ctx, input }) => {
    await assertCategoryAndAccountExist(ctx.prisma, ctx.userId, input.categoryId, input.accountId);

    return ctx.prisma.recurringTemplate.create({
      data: {
        userId: ctx.userId,
        name: input.name,
        amount: input.amount,
        categoryId: input.categoryId,
        accountId: input.accountId,
        frequency: input.frequency,
        dayOfMonth: input.startDate.getUTCDate(),
        nextRunDate: input.startDate,
      },
    });
  }),

  // Niente startDate qui di proposito: cambiarla rigenererebbe da capo il
  // calcolo della prossima occorrenza, con il rischio di generare doppioni o
  // saltare occorrenze già passate. Modificare nome/importo/categoria/
  // conto/frequenza non tocca né le spese già generate né la data della
  // prossima occorrenza già in corso.
  update: protectedProcedure.input(updateTemplateSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.recurringTemplate.findFirst({ where: { id: input.id, userId: ctx.userId } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
    await assertCategoryAndAccountExist(ctx.prisma, ctx.userId, input.categoryId, input.accountId);

    return ctx.prisma.recurringTemplate.update({
      where: { id: input.id },
      data: {
        name: input.name,
        amount: input.amount,
        categoryId: input.categoryId,
        accountId: input.accountId,
        frequency: input.frequency,
      },
    });
  }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.recurringTemplate.findFirst({ where: { id: input.id, userId: ctx.userId } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.recurringTemplate.update({ where: { id: input.id }, data: { active: input.active } });
    }),

  // Cancella la regola, non la storia: le occorrenze già confermate
  // (RECORDED) restano come spese vere, solo scollegate dal template; quelle
  // ancora "da confermare" (PLANNED) sono solo promemoria non ancora reali e
  // vengono rimosse insieme al template.
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.recurringTemplate.findFirst({ where: { id: input.id, userId: ctx.userId } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

    await ctx.prisma.$transaction([
      ctx.prisma.expense.deleteMany({ where: { recurringTemplateId: input.id, status: "PLANNED" } }),
      ctx.prisma.expense.updateMany({ where: { recurringTemplateId: input.id }, data: { recurringTemplateId: null } }),
      ctx.prisma.recurringTemplate.delete({ where: { id: input.id } }),
    ]);
    return { success: true } as const;
  }),
});
