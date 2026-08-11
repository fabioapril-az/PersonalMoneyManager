import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { accountTypeSchema } from "@/lib/domain/enums";
import { listAccountsWithBalance } from "../accountBalances";
import { protectedProcedure, router } from "../trpc";

const statementDaySchema = z.number().int().min(1).max(31);

const createAccountSchema = z
  .object({
    name: z.string().trim().min(1, "Il nome è obbligatorio.").max(60),
    type: accountTypeSchema,
    currency: z.string().trim().min(1).max(10).default("EUR"),
    openingBalance: z.number().finite().default(0),
    // Obbligatorio solo per le carte di credito (PRD sezione 6) — vedi la
    // validazione sotto e il commento su Account.statementDay in schema.prisma.
    statementDay: statementDaySchema.optional(),
    // Ticket pasto e benefit simili: spendibili ma non "soldi tuoi" — vedi
    // il commento su Account.excludeFromTotals in schema.prisma.
    excludeFromTotals: z.boolean().default(false),
  })
  .refine((data) => data.type !== "CREDIT_CARD" || data.statementDay != null, {
    message: "Le carte di credito richiedono il giorno di fatturazione (1-31).",
    path: ["statementDay"],
  });

const updateAccountSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "Il nome è obbligatorio.").max(60).optional(),
  type: accountTypeSchema.optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  openingBalance: z.number().finite().optional(),
  statementDay: statementDaySchema.nullable().optional(),
  excludeFromTotals: z.boolean().optional(),
});

export const accountRouter = router({
  // Archived accounts sort last, but are still returned — you can still see
  // (read-only) history against an archived account, see the schema note on
  // why accounts are archived rather than deleted. Each account comes back
  // with its real `balance` (openingBalance + CashMovement), not just the
  // static openingBalance (PRD sezione 11).
  list: protectedProcedure.query(({ ctx }) => listAccountsWithBalance(ctx.prisma, ctx.userId)),

  create: protectedProcedure.input(createAccountSchema).mutation(({ ctx, input }) =>
    ctx.prisma.account.create({
      data: { ...input, userId: ctx.userId },
    })
  ),

  update: protectedProcedure.input(updateAccountSchema).mutation(async ({ ctx, input }) => {
    const account = await ctx.prisma.account.findFirst({
      where: { id: input.id, userId: ctx.userId },
    });
    if (!account) throw new TRPCError({ code: "NOT_FOUND" });

    // Zod non può vedere la riga esistente, quindi la coerenza
    // tipo-carta-di-credito/statementDay va controllata qui, considerando
    // sia il valore nuovo (se fornito) sia quello già salvato.
    const effectiveType = input.type ?? account.type;
    const effectiveStatementDay = input.statementDay !== undefined ? input.statementDay : account.statementDay;
    if (effectiveType === "CREDIT_CARD" && effectiveStatementDay == null) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Le carte di credito richiedono il giorno di fatturazione (1-31).",
      });
    }

    const { id, ...data } = input;
    return ctx.prisma.account.update({ where: { id }, data });
  }),

  setArchived: protectedProcedure
    .input(z.object({ id: z.string(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.account.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.account.update({
        where: { id: input.id },
        data: { archived: input.archived },
      });
    }),
});
