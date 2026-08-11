import { describe, expect, it } from "vitest";
import { computeCardStatementDate } from "./creditCard";

describe("computeCardStatementDate", () => {
  it("falls in the month after the purchase, at the configured day", () => {
    const date = computeCardStatementDate(new Date(2026, 8, 5), 15); // 5 Sep 2026
    expect(date).toEqual(new Date(2026, 9, 15)); // 15 Oct 2026
  });

  it("rolls the year over at December", () => {
    const date = computeCardStatementDate(new Date(2026, 11, 20), 10); // 20 Dec 2026
    expect(date).toEqual(new Date(2027, 0, 10)); // 10 Jan 2027
  });

  it("clamps to the last day of the target month instead of rolling over", () => {
    // Acquisto a gennaio, statementDay 31 -> target è febbraio (28 giorni nel 2026, non bisestile)
    const date = computeCardStatementDate(new Date(2026, 0, 10), 31);
    expect(date).toEqual(new Date(2026, 1, 28));
  });
});
