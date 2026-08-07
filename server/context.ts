import { prisma } from "@/lib/prisma";

/**
 * Built once per request. `userId` is undefined until auth (Fase 1) is wired
 * up — see server/trpc.ts `protectedProcedure` for how routers depend on it
 * without needing to know the auth mechanism.
 */
export async function createContext() {
  return {
    prisma,
    userId: undefined as string | undefined,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
