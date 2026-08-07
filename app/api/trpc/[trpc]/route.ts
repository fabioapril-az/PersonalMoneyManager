import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/server/context";
import { appRouter } from "@/server/routers/_app";

// Single HTTP entrypoint used by client components (via lib/trpc/client.tsx).
// Server Components should prefer lib/trpc/server-caller.ts instead, which
// calls the router directly with no network hop.
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
