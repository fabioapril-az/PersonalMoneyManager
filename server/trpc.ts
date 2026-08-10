import { initTRPC, TRPCError } from "@trpc/server";
import { SuperJSON } from "@/lib/superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: SuperJSON, // lets Decimal/Date survive the client<->server hop untouched
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Requires a logged-in user (see server/context.ts, auth.ts). Narrows
// ctx.userId from `string | undefined` to `string` for every router that
// uses this instead of publicProcedure.
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
