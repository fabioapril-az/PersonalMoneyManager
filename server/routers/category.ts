import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/app/generated/prisma/client";
import { protectedProcedure, router } from "../trpc";

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Il nome è obbligatorio.").max(60),
  parentId: z.string().nullish(),
});

export const categoryRouter = router({
  // Flat list (with parentId) — the client groups parents/children; no need
  // for a recursive query since the hierarchy is only 2 levels deep
  // (categoria/sottocategoria, PRD section 4).
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.category.findMany({
      where: { userId: ctx.userId },
      orderBy: { name: "asc" },
    })
  ),

  create: protectedProcedure.input(createCategorySchema).mutation(async ({ ctx, input }) => {
    if (input.parentId) {
      const parent = await ctx.prisma.category.findFirst({
        where: { id: input.parentId, userId: ctx.userId },
      });
      if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria padre non trovata." });
    }

    return ctx.prisma.category.create({
      data: { name: input.name, parentId: input.parentId ?? null, userId: ctx.userId },
    });
  }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const category = await ctx.prisma.category.findFirst({
      where: { id: input.id, userId: ctx.userId },
    });
    if (!category) throw new TRPCError({ code: "NOT_FOUND" });

    try {
      await ctx.prisma.category.delete({ where: { id: input.id } });
    } catch (error) {
      // onDelete: NoAction everywhere a Category is referenced (Expense,
      // Budget, RecurringTemplate, subcategorie) — this is by design, see
      // prisma/schema.prisma. Surface it as a clear, expected message
      // instead of a raw DB error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Questa categoria è in uso (spese, budget o sottocategorie) e non può essere eliminata.",
        });
      }
      throw error;
    }

    return { success: true } as const;
  }),
});
