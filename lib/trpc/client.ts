import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers/_app";

// The same hooks a future Capacitor-wrapped build or a React Native app
// would use — they only need the API's base URL to differ (see Provider.tsx).
export const trpc = createTRPCReact<AppRouter>();
