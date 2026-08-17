import { describe, expect, it } from "vitest";
import { selectBudgetExpenses } from "./budget";

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
