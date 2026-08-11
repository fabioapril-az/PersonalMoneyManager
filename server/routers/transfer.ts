import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";

const createTransferSchema = z
  .object({
    date: z.coerce.date(),
    amount: z.number().positive("L'importo deve essere maggiore di zero."),
    fromAccountId: z.string().min(1, "Seleziona il conto di partenza."),
    toAccountId: z.string().min(1, "Seleziona il conto di arrivo."),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    message: "Il conto di partenza e di arrivo devono essere diversi.",
    path: ["toAccountId"],
  });

export const transferRouter = router({
  // Un trasferimento tra due tuoi conti (Rule 2: "un trasferimento non è una
  // spesa") — niente Expense/Income, solo due CashMovement collegati da
  // transferGroupId: soldi che escono da un conto ed entrano nell'altro.
  // Non tocca Spese/Entrate/Budget; il totale di "Disponibile" resta
  // invariato (si spostano soldi, non se ne creano/spendono).
  create: protectedProcedure.input(createTransferSchema).mutation(async ({ ctx, input }) => {
    const [fromAccount, toAccount] = await Promise.all([
      ctx.prisma.account.findFirst({ where: { id: input.fromAccountId, userId: ctx.userId } }),
      ctx.prisma.account.findFirst({ where: { id: input.toAccountId, userId: ctx.userId } }),
    ]);
    if (!fromAccount || !toAccount) throw new TRPCError({ code: "NOT_FOUND", message: "Conto non trovato." });

    const transferGroupId = randomUUID();

    return ctx.prisma.$transaction(async (tx) => {
      await tx.cashMovement.create({
        data: {
          accountId: input.fromAccountId,
          date: input.date,
          amount: -input.amount, // signed: money out
          type: "TRANSFER",
          status: "EXECUTED",
          description: input.notes || `Trasferimento a ${toAccount.name}`,
          transferGroupId,
        },
      });
      await tx.cashMovement.create({
        data: {
          accountId: input.toAccountId,
          date: input.date,
          amount: input.amount, // signed: money in
          type: "TRANSFER",
          status: "EXECUTED",
          description: input.notes || `Trasferimento da ${fromAccount.name}`,
          transferGroupId,
        },
      });
      return { success: true } as const;
    });
  }),

  // Elimina entrambe le gambe insieme — cancellarne solo una lascerebbe un
  // conto squilibrato rispetto all'altro.
  delete: protectedProcedure
    .input(z.object({ transferGroupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const legs = await ctx.prisma.cashMovement.findMany({
        where: { transferGroupId: input.transferGroupId, account: { userId: ctx.userId } },
      });
      if (legs.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.cashMovement.deleteMany({ where: { transferGroupId: input.transferGroupId } });
      return { success: true } as const;
    }),
});
