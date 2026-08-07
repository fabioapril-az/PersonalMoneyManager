import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson, // lets Decimal/Date survive the client<->server hop untouched
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Placeholder until auth (Fase 1 of the roadmap) lands: throws if no user is
// attached to the request context, so every router can already opt in to
// "this needs a logged-in user" without knowing how auth is implemented yet.
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new Error("UNAUTHORIZED");
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
