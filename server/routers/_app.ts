import { router } from "../trpc";
import { periodRouter } from "./period";

export const appRouter = router({
  period: periodRouter,
});

export type AppRouter = typeof appRouter;
