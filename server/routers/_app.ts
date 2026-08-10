import { router } from "../trpc";
import { periodRouter } from "./period";
import { userRouter } from "./user";

export const appRouter = router({
  period: periodRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
