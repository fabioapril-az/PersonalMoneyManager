import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // JWT sessions on purpose: Credentials-based auth has no OAuth tokens to
  // persist, so a database session/account table (Auth.js's Prisma
  // adapter) would just be unused overhead — the signed cookie IS the
  // session. See prisma/schema.prisma User.passwordHash comment.
  //
  // maxAge 90 days (Auth.js default is 30): personal app on a trusted
  // device — logging in again every few weeks is friction with no real
  // security upside here. The cookie auto-renews on activity (updateAge,
  // default 24h), so an active user effectively never sees the login page
  // again until they explicitly log out.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 90 },
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
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) return null;

        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;

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
