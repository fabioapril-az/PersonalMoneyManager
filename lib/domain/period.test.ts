import { describe, expect, it } from "vitest";
import { getFinancialPeriod, getRecentPeriods, isWithinPeriod } from "./period";

describe("getFinancialPeriod", () => {
  it("puts the 27th itself in a period that starts that same day", () => {
    const period = getFinancialPeriod(new Date(2026, 7, 27)); // 27 Aug 2026
    expect(period.start).toEqual(new Date(2026, 7, 27, 0, 0, 0, 0));
    expect(period.end).toEqual(new Date(2026, 8, 26, 23, 59, 59, 999));
    expect(period.key).toBe("2026-08-27_2026-09-26");
  });

  it("puts the 26th in the period that STARTED the previous month", () => {
    const period = getFinancialPeriod(new Date(2026, 8, 26)); // 26 Sep 2026
    expect(period.start).toEqual(new Date(2026, 7, 27, 0, 0, 0, 0));
    expect(period.end).toEqual(new Date(2026, 8, 26, 23, 59, 59, 999));
  });

  it("puts a mid-period date (e.g. 5 Sep) in the Aug 27 -> Sep 26 period", () => {
    const period = getFinancialPeriod(new Date(2026, 8, 5)); // 5 Sep 2026
    expect(period.key).toBe("2026-08-27_2026-09-26");
  });

  it("rolls over the year correctly (December -> January)", () => {
    const period = getFinancialPeriod(new Date(2026, 11, 30)); // 30 Dec 2026
    expect(period.start).toEqual(new Date(2026, 11, 27, 0, 0, 0, 0));
    expect(period.end).toEqual(new Date(2027, 0, 26, 23, 59, 59, 999));
  });
});

describe("isWithinPeriod", () => {
  it("includes both boundary dates", () => {
    const period = getFinancialPeriod(new Date(2026, 7, 27));
    expect(isWithinPeriod(period.start, period)).toBe(true);
    expect(isWithinPeriod(period.end, period)).toBe(true);
  });

  it("excludes a date from the following period", () => {
    const period = getFinancialPeriod(new Date(2026, 7, 27));
    expect(isWithinPeriod(new Date(2026, 8, 27), period)).toBe(false);
  });
});

describe("getRecentPeriods", () => {
  it("returns N consecutive, non-overlapping periods, most recent first", () => {
    const periods = getRecentPeriods(3, new Date(2026, 8, 5)); // 5 Sep 2026
    expect(periods.map((p) => p.key)).toEqual([
      "2026-08-27_2026-09-26",
      "2026-07-27_2026-08-26",
      "2026-06-27_2026-07-26",
    ]);
  });
});
