import type { DefaultSession } from "next-auth";

// Module augmentation: adds `id` to session.user and `userId` to the JWT,
// matching what auth.ts's callbacks actually populate.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}
