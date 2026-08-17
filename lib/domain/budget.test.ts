import { describe, expect, it } from "vitest";
import { selectBudgetExpenses, computeBudgetSpreadShare } from "./budget";
import { getFinancialPeriod } from "./period";

function expense(paymentPlan: { type: string; account: { excludeFromTotals: boolean } } | null) {
  return { paymentPlan };
}

describe("selectBudgetExpenses", () => {
  it("includes an IMMEDIATE payment", () => {
    const result = selectBudgetExpenses([expense({ type: "IMMEDIATE", account: { excludeFromTotals: false } })]);
    expect(result).toHaveLength(1);
  });

  it("includes a CREDIT_CARD payment (counts at purchase date, not statement date)", () => {
    const result = selectBudgetExpenses([expense({ type: "CREDIT_CARD", account: { excludeFromTotals: false } })]);
    expect(result).toHaveLength(1);
  });

  it("excludes an INSTALLMENTS payment — those count at each rata's due date instead", () => {
    const result = selectBudgetExpenses([expense({ type: "INSTALLMENTS", account: { excludeFromTotals: false } })]);
    expect(result).toHaveLength(0);
  });

  it("excludes any expense on an excludeFromTotals account, regardless of plan type", () => {
    const result = selectBudgetExpenses([
      expense({ type: "IMMEDIATE", account: { excludeFromTotals: true } }),
      expense({ type: "CREDIT_CARD", account: { excludeFromTotals: true } }),
    ]);
    expect(result).toHaveLength(0);
  });

  // Non dovrebbe mai capitare in pratica — dashboard.ts esclude già le spese
  // PLANNED (nessun paymentPlan) prima di arrivare qui — ma la firma del tipo
  // lo ammette, quindi documentiamo il comportamento attuale invece di
  // lasciarlo non specificato: un paymentPlan null passa il filtro (nessuno
  // dei due criteri di esclusione scatta).
  it("a null paymentPlan (unreachable today, see dashboard.ts) is not filtered out", () => {
    const result = selectBudgetExpenses([expense(null)]);
    expect(result).toHaveLength(1);
  });

  it("keeps only the eligible rows out of a mixed list", () => {
    const immediate = expense({ type: "IMMEDIATE", account: { excludeFromTotals: false } });
    const installments = expense({ type: "INSTALLMENTS", account: { excludeFromTotals: false } });
    const excluded = expense({ type: "IMMEDIATE", account: { excludeFromTotals: true } });
    const result = selectBudgetExpenses([immediate, installments, excluded]);
    expect(result).toEqual([immediate]);
  });
});

describe("computeBudgetSpreadShare", () => {
  // 28 ago 2026 cade nel periodo 27ago->26set (PERIOD_START_DAY = 27).
  const paidDate = new Date(Date.UTC(2026, 7, 28));
  const originPeriod = getFinancialPeriod(paidDate);

  it("attributes the first share to the period the expense was actually paid in", () => {
    const share = computeBudgetSpreadShare(paidDate, 1000, 4, originPeriod);
    expect(share).toEqual({ no: 1, count: 4, amount: 250, totalAmount: 1000 });
  });

  it("attributes later shares to the following periods, in order", () => {
    const secondPeriod = getFinancialPeriod(new Date(Date.UTC(2026, 8, 28))); // periodo successivo
    const share = computeBudgetSpreadShare(paidDate, 1000, 4, secondPeriod);
    expect(share).toEqual({ no: 2, count: 4, amount: 250, totalAmount: 1000 });
  });

  it("puts the rounding remainder on the last share, never loses or duplicates a cent", () => {
    // spreadPeriods = 3 -> indici 0,1,2 (origine + 2 avanti); ott 2026 è l'indice 2, l'ultima quota.
    const lastPeriod = getFinancialPeriod(new Date(Date.UTC(2026, 9, 28)));
    const share = computeBudgetSpreadShare(paidDate, 100, 3, lastPeriod);
    // 100/3 -> 33.33 + 33.33 + 33.34: l'avanzo va sull'ultima quota.
    expect(share?.amount).toBeCloseTo(33.34, 2);
  });

  it("never spreads backward — a period before the payment date returns null", () => {
    const previousPeriod = getFinancialPeriod(new Date(Date.UTC(2026, 6, 28)));
    expect(computeBudgetSpreadShare(paidDate, 1000, 4, previousPeriod)).toBeNull();
  });

  it("returns null once the spread window is over", () => {
    const fifthPeriod = getFinancialPeriod(new Date(Date.UTC(2026, 11, 28))); // 5° periodo, oltre le 4 quote
    expect(computeBudgetSpreadShare(paidDate, 1000, 4, fifthPeriod)).toBeNull();
  });

  it("a bimonthly bill split over 2 periods: 120€ in each", () => {
    expect(computeBudgetSpreadShare(paidDate, 240, 2, originPeriod)?.amount).toBe(120);
    const nextPeriod = getFinancialPeriod(new Date(Date.UTC(2026, 8, 28)));
    expect(computeBudgetSpreadShare(paidDate, 240, 2, nextPeriod)?.amount).toBe(120);
  });
});
