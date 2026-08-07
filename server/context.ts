import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

/**
 * Built once per request. `userId` comes from the Auth.js JWT session
 * (auth.ts) — populated for both the HTTP route (app/api/trpc/[trpc]/route.ts,
 * via cookies on the request) and direct RSC calls
 * (lib/trpc/server-caller.ts). See server/trpc.ts `protectedProcedure` for
 * how routers depend on it without needing to know the auth mechanism.
 */
export async function createContext() {
  const session = await auth();

  return {
    prisma,
    userId: session?.user?.id as string | undefined,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
