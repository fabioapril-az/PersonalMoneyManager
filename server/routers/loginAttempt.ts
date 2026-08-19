import { protectedProcedure, router } from "../trpc";

// Solo lettura — le righe le scrive auth.ts (server/logLoginAttempt.ts) a
// ogni tentativo di login. Le ultime 200 come per deletionLog: nessuna
// paginazione, sufficiente per un uso personale.
export const loginAttemptRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.loginAttempt.findMany({
      // Non filtrato per userId: un tentativo con email sconosciuta
      // (userId null) non è "di nessuno" — è comunque un segnale che
      // riguarda l'unico account dell'app, va mostrato comunque.
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  ),
});
