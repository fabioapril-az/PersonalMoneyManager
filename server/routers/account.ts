import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { accountTypeSchema } from "@/lib/domain/enums";
import { protectedProcedure, router } from "../trpc";

const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Il nome è obbligatorio.").max(60),
  type: accountTypeSchema,
  currency: z.string().trim().min(1).max(10).default("EUR"),
  openingBalance: z.number().finite().default(0),
});

export const accountRouter = router({
  // Archived accounts sort last, but are still returned — you can still see
  // (read-only) history against an archived account, see the schema note on
  // why accounts are archived rather than deleted.
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.account.findMany({
      where: { userId: ctx.userId },
      orderBy: [{ archived: "asc" }, { name: "asc" }],
    })
  ),

  create: protectedProcedure.input(createAccountSchema).mutation(({ ctx, input }) =>
    ctx.prisma.account.create({
      data: { ...input, userId: ctx.userId },
    })
  ),

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
