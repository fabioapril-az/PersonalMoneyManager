import { describe, expect, it } from "vitest";
import { decideExpensePlan } from "./expensePlan";

const CHECKING = { type: "CHECKING", statementDay: null };
const CREDIT_CARD = { type: "CREDIT_CARD", statementDay: 15 };

describe("decideExpensePlan", () => {
  it("IMMEDIATE: a normal account with no installments pays now, in full", () => {
    const plan = decideExpensePlan({ amount: 30, purchaseDate: new Date(2026, 7, 5), account: CHECKING });
    expect(plan.type).toBe("IMMEDIATE");
    expect(plan.installmentsCount).toBe(1);
    expect(plan.schedules).toEqual([
      {
        installmentNo: 1,
        dueDate: new Date(2026, 7, 5),
        amount: 30,
        status: "PAID",
        createsCashMovementNow: true,
      },
    ]);
  });

  it("CREDIT_CARD: no installments defers the schedule to the statement date, no cash movement yet", () => {
    const plan = decideExpensePlan({ amount: 100, purchaseDate: new Date(2026, 7, 5), account: CREDIT_CARD });
    expect(plan.type).toBe("CREDIT_CARD");
    expect(plan.installmentsCount).toBe(1);
    expect(plan.schedules).toEqual([
      {
        installmentNo: 1,
        dueDate: new Date(2026, 8, 15), // mese dopo, al giorno di fatturazione
        amount: 100,
        status: "PENDING",
        createsCashMovementNow: false,
      },
    ]);
  });

  it("installments = 1 is treated exactly like no installments at all", () => {
    const withOne = decideExpensePlan({ amount: 30, purchaseDate: new Date(2026, 7, 5), installments: 1, account: CHECKING });
    const withNone = decideExpensePlan({ amount: 30, purchaseDate: new Date(2026, 7, 5), account: CHECKING });
    expect(withOne).toEqual(withNone);
  });

  it("INSTALLMENTS on a normal account: first schedule paid now, the rest pending, one per month", () => {
    const plan = decideExpensePlan({ amount: 300, purchaseDate: new Date(2026, 7, 5), installments: 3, account: CHECKING });
    expect(plan.type).toBe("INSTALLMENTS");
    expect(plan.installmentsCount).toBe(3);
    expect(plan.schedules).toHaveLength(3);
    expect(plan.schedules.map((s) => s.amount)).toEqual([100, 100, 100]);
    expect(plan.schedules.map((s) => s.status)).toEqual(["PAID", "PENDING", "PENDING"]);
    expect(plan.schedules.map((s) => s.createsCashMovementNow)).toEqual([true, false, false]);
    expect(plan.schedules.map((s) => s.dueDate)).toEqual([
      new Date(2026, 7, 5),
      new Date(2026, 8, 5),
      new Date(2026, 9, 5),
    ]);
  });

  it("installments override CREDIT_CARD entirely — a card split into rate is INSTALLMENTS, not CREDIT_CARD", () => {
    const plan = decideExpensePlan({ amount: 200, purchaseDate: new Date(2026, 7, 5), installments: 2, account: CREDIT_CARD });
    expect(plan.type).toBe("INSTALLMENTS");
    expect(plan.schedules[0].status).toBe("PAID");
    expect(plan.schedules[0].createsCashMovementNow).toBe(true);
  });

  it("splits an amount that doesn't divide evenly without losing or duplicating cents", () => {
    const plan = decideExpensePlan({ amount: 100, purchaseDate: new Date(2026, 7, 5), installments: 3, account: CHECKING });
    const total = plan.schedules.reduce((sum, s) => sum + s.amount, 0);
    expect(Math.round(total * 100)).toBe(10000);
  });
});
