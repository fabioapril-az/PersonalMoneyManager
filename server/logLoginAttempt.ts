import type { Context } from "./context";
import type { LoginOutcome } from "@/lib/domain/enums";

/**
 * Registra un tentativo di login (LoginAttempt, vedi schema.prisma) —
 * chiamata da auth.ts per ogni esito, riuscito o no. userId è null quando
 * l'email non corrisponde a nessun utente (bot, email digitata a caso): non
 * c'è un utente a cui collegare la riga, ma vale comunque la pena
 * registrarlo — è comunque un segnale di qualcuno che bussa alla porta.
 */
export async function logLoginAttempt(
  prisma: Context["prisma"],
  entry: {
    userId: string | null;
    email: string;
    outcome: LoginOutcome;
    ipAddress: string | null;
    userAgent: string | null;
  }
) {
  await prisma.loginAttempt.create({ data: entry });
}
