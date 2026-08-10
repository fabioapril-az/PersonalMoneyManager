import { router } from "../trpc";
import { periodRouter } from "./period";
import { userRouter } from "./user";
import { accountRouter } from "./account";
import { categoryRouter } from "./category";

export const appRouter = router({
  period: periodRouter,
  user: userRouter,
  account: accountRouter,
  category: categoryRouter,
});

export type AppRouter = typeof appRouter;
