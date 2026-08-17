import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/app/generated/prisma/client";
import { accountTypeSchema } from "@/lib/domain/enums";
import { getCurrentCalendarMonth } from "@/lib/domain/calendarMonth";
import { listAccountsWithBalance } from "../accountBalances";
import { settleOverdueCardCharges } from "../settleOverdueCardCharges";
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

  // "Cosa è successo davvero su QUESTO conto" (PRD Rule 5), un mese alla
  // volta — per verificare un addebito reale (es. l'estratto conto della
  // carta di credito arrivato oggi) contro quello che l'app ha registrato:
  // la pagina "Movimenti" mescola tutti i conti insieme, qui c'è solo quello
  // scelto, con un totale direttamente confrontabile.
  //
  // Mese SOLARE (lib/domain/calendarMonth.ts), non il periodo 27->26 del
  // resto dell'app (lib/domain/period.ts): un vero estratto conto — carta
  // di credito o banca — segue sempre il mese solare, mai il ciclo di
  // questa app. Unica eccezione in tutto il progetto, deliberata: qui lo
  // scopo è confrontarsi con un documento esterno che usa quella
  // convenzione, non leggere il budget interno dell'app.
  listMovements: protectedProcedure
    .input(z.object({ accountId: z.string(), referenceDate: z.coerce.date().optional() }))
    .query(async ({ ctx, input }) => {
      const account = await ctx.prisma.account.findFirst({ where: { id: input.accountId, userId: ctx.userId } });
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });

      // Salda da sola ogni carta di credito scaduta prima di leggere — stesso
      // motivo di listAccountsWithBalance (server/accountBalances.ts):
      // altrimenti un addebito appena avvenuto potrebbe non comparire ancora.
      await settleOverdueCardCharges(ctx.prisma, ctx.userId);

      const month = getCurrentCalendarMonth(input.referenceDate);
      const isCurrentMonth = month.key === getCurrentCalendarMonth().key;

      const movements = await ctx.prisma.cashMovement.findMany({
        where: { accountId: input.accountId, date: { gte: month.start, lte: month.end } },
        include: {
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
      });

      const total = movements.reduce((sum, m) => sum.plus(m.amount), new Prisma.Decimal(0));

      return { account, month, isCurrentMonth, movements, total };
    }),
});
