import { z } from "zod";
import { TRPCError } from "@trpc/server";
import QRCode from "qrcode";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateTotpSecret, buildOtpauthUri, verifyTotpCode } from "@/lib/auth/totp";
import { protectedProcedure, router } from "../trpc";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Inserisci la password attuale."),
  newPassword: z.string().min(8, "La nuova password deve avere almeno 8 caratteri."),
});

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { id: true, email: true, name: true, totpEnabled: true },
    });
    return user;
  }),

  // Genera un nuovo segreto e lo salva subito (totpEnabled resta false finché
  // totpConfirm non verifica un primo codice — vedi il commento sul campo in
  // schema.prisma). Rigenerarlo più volte prima di confermare è innocuo:
  // sovrascrive solo il segreto ancora inattivo.
  totpSetup: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const secret = generateTotpSecret();
    await ctx.prisma.user.update({ where: { id: ctx.userId }, data: { totpSecret: secret, totpEnabled: false } });

    const otpauthUri = buildOtpauthUri(secret, user.email);
    const qrDataUrl = await QRCode.toDataURL(otpauthUri);
    return { secret, qrDataUrl };
  }),

  totpConfirm: protectedProcedure
    .input(z.object({ code: z.string().length(6, "Il codice deve avere 6 cifre.") }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (!user.totpSecret) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Avvia prima la configurazione." });
      }
      if (!verifyTotpCode(user.totpSecret, user.email, input.code)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Codice non valido." });
      }
      await ctx.prisma.user.update({ where: { id: ctx.userId }, data: { totpEnabled: true } });
      return { success: true } as const;
    }),

  // Richiede il codice attuale (non la password): chi ha già una sessione
  // valida ha comunque accesso ai dati — questo passaggio serve solo a
  // impedire che disattivarlo sia un'azione da un click, non a bloccare un
  // attaccante già dentro (a quel punto ha già vinto).
  totpDisable: protectedProcedure
    .input(z.object({ code: z.string().length(6, "Il codice deve avere 6 cifre.") }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (!user.totpEnabled || !user.totpSecret) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La verifica in due passaggi non è attiva." });
      }
      if (!verifyTotpCode(user.totpSecret, user.email, input.code)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Codice non valido." });
      }
      await ctx.prisma.user.update({ where: { id: ctx.userId }, data: { totpEnabled: false, totpSecret: null } });
      return { success: true } as const;
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
