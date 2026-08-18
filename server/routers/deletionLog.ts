import { protectedProcedure, router } from "../trpc";

// Solo lettura — niente create/update/delete qui: le righe le scrive
// server/logDeletion.ts, chiamato dai router che hanno una vera mutation
// "delete" (expense, income, transfer, recurringTemplate, category).
export const deletionLogRouter = router({
  // Le ultime 200 sono più che sufficienti per un uso personale — nessuna
  // paginazione, coerente con come "Spese e entrate" gestisce i suoi elenchi.
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.deletionLogEntry.findMany({
      where: { userId: ctx.userId },
      orderBy: { deletedAt: "desc" },
      take: 200,
    })
  ),
});
