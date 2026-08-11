import { describe, expect, it } from "vitest";
import { computeInstallmentDueDate, splitIntoInstallments } from "./installments";

describe("computeInstallmentDueDate", () => {
  it("installment 1 falls on the purchase date itself", () => {
    const date = computeInstallmentDueDate(new Date(2026, 8, 5), 1); // 5 Sep 2026
    expect(date).toEqual(new Date(2026, 8, 5));
  });

  it("each subsequent installment is one month later, same day", () => {
    const date = computeInstallmentDueDate(new Date(2026, 8, 5), 3); // 5 Sep 2026, rata 3
    expect(date).toEqual(new Date(2026, 10, 5)); // 5 Nov 2026
  });

  it("rolls the year over", () => {
    const date = computeInstallmentDueDate(new Date(2026, 11, 20), 2); // 20 Dec 2026, rata 2
    expect(date).toEqual(new Date(2027, 0, 20));
  });

  it("clamps to the last day of a shorter target month", () => {
    // Acquisto 31 gennaio, rata 2 -> target febbraio (28 giorni, 2026 non bisestile)
    const date = computeInstallmentDueDate(new Date(2026, 0, 31), 2);
    expect(date).toEqual(new Date(2026, 1, 28));
  });
});

describe("splitIntoInstallments", () => {
  it("divides evenly when possible", () => {
    expect(splitIntoInstallments(900, 3)).toEqual([300, 300, 300]);
  });

  it("puts the rounding remainder on the last installment", () => {
    const amounts = splitIntoInstallments(100, 3);
    expect(amounts).toEqual([33.33, 33.33, 33.34]);
    expect(amounts.reduce((sum, a) => sum + a, 0)).toBeCloseTo(100, 2);
  });

  it("handles a single installment (edge case, should behave like no split)", () => {
    expect(splitIntoInstallments(150.5, 1)).toEqual([150.5]);
  });
});
