import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

export const pushRouter = router({
  // Serve al client per costruire la sottoscrizione (PushManager.subscribe)
  // — null se le chiavi VAPID non sono ancora configurate sul server (vedi
  // server/sendSecurityPush.ts), nel qual caso l'attivazione resta disabilitata.
  vapidPublicKey: protectedProcedure.query(() => process.env.VAPID_PUBLIC_KEY ?? null),

  // Upsert per endpoint: lo stesso browser che si "ri-sottoscrive" (es. dopo
  // aver cancellato i permessi e ridato il consenso) genera lo stesso
  // endpoint o uno nuovo a seconda del caso — in entrambi aggiorna invece di
  // duplicare.
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().min(1),
        p256dh: z.string().min(1),
        auth: z.string().min(1),
        userAgent: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        update: { userId: ctx.userId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent },
        create: {
          userId: ctx.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent,
        },
      });
      return { success: true } as const;
    }),

  unsubscribe: protectedProcedure.input(z.object({ endpoint: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.pushSubscription.deleteMany({ where: { endpoint: input.endpoint, userId: ctx.userId } });
    return { success: true } as const;
  }),
});
