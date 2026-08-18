import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { verifyTotpCode } from "@/lib/auth/totp";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  // Presente solo se l'utente ha attivato il 2FA (lib/auth/totp.ts) — il
  // form di login lo mostra sempre, ma resta vuoto/ignorato finché non è
  // stato attivato (vedi la logica sotto).
  totpCode: z.string().optional(),
});

// Blocco temporaneo dopo troppi tentativi falliti (password sbagliata O
// codice 2FA sbagliato) — pensato per un singolo utente: 5 tentativi,
// 15 minuti di blocco, salvato sulla riga User (non in memoria, vedi il
// commento sui campi in schema.prisma).
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // JWT sessions on purpose: Credentials-based auth has no OAuth tokens to
  // persist, so a database session/account table (Auth.js's Prisma
  // adapter) would just be unused overhead — the signed cookie IS the
  // session. See prisma/schema.prisma User.passwordHash comment.
  //
  // maxAge 14 giorni (era 90): un'app di soldi non dovrebbe lasciare una
  // sessione rubata/dimenticata su un dispositivo valida per mesi. Il
  // cookie si rinnova comunque da solo con l'uso (updateAge, default 24h),
  // quindi un utente attivo non rivede il login più spesso di prima — cambia
  // solo quanto resta valida una sessione su un dispositivo NON più in uso.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  // Required outside Vercel (e.g. Azure App Service): without this, Auth.js
  // rejects requests with an "UntrustedHost" error because it can't
  // auto-verify the host behind a platform reverse proxy.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "Codice 2FA", type: "text" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) return null;

        // Un solo messaggio generico per ogni causa di fallimento (vedi
        // app/login/actions.ts) — non riveliamo se è colpa della password,
        // del codice, o di un blocco in corso: a un attaccante non serve
        // sapere quale delle tre cose sta sbagliando.
        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
          return null;
        }

        const passwordValid = await verifyPassword(parsed.data.password, user.passwordHash);
        const totpValid = !user.totpEnabled || (!!user.totpSecret && !!parsed.data.totpCode && verifyTotpCode(user.totpSecret, user.email, parsed.data.totpCode));

        if (!passwordValid || !totpValid) {
          const attempts = user.failedLoginAttempts + 1;
          const lockingOut = attempts >= MAX_FAILED_ATTEMPTS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: lockingOut ? 0 : attempts,
              lockedUntil: lockingOut ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
            },
          });
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    // Propagate the user id: token -> session, so server/context.ts can
    // read ctx.userId without an extra DB round trip per request.
    jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.userId && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
    // Drives proxy.ts's route protection: returning false here is what
    // makes Auth.js redirect an anonymous request to pages.signIn ("/login")
    // — this callback IS the enforcement, proxy.ts is just the re-export.
    authorized({ auth: session }) {
      return Boolean(session?.user);
    },
  },
});
