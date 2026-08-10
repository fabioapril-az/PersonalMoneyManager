import { router } from "../trpc";
import { periodRouter } from "./period";
import { userRouter } from "./user";
import { accountRouter } from "./account";
import { categoryRouter } from "./category";
import { incomeRouter } from "./income";
import { expenseRouter } from "./expense";
import { dashboardRouter } from "./dashboard";
import { budgetRouter } from "./budget";

export const appRouter = router({
  period: periodRouter,
  user: userRouter,
  account: accountRouter,
  category: categoryRouter,
  income: incomeRouter,
  expense: expenseRouter,
  dashboard: dashboardRouter,
  budget: budgetRouter,
});

export type AppRouter = typeof appRouter;
