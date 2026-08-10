import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { protectedProcedure, router } from "../trpc";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Inserisci la password attuale."),
  newPassword: z.string().min(8, "La nuova password deve avere almeno 8 caratteri."),
});

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { id: true, email: true, name: true },
    });
    return user;
  }),

  changePassword: protectedProcedure.input(changePasswordSchema).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "La password attuale non è corretta." });
    }

    const passwordHash = await hashPassword(input.newPassword);
    await ctx.prisma.user.update({ where: { id: ctx.userId }, data: { passwordHash } });

    return { success: true } as const;
  }),
});
