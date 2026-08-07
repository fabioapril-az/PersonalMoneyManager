import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/context";

/**
 * Direct, in-process call into the tRPC router — for use in React Server
 * Components. No HTTP round trip, no client-side cache: just the same
 * type-safe procedures the mobile/web client hooks call, minus the network.
 */
export async function createServerCaller() {
  const context = await createContext();
  return appRouter.createCaller(context);
}
