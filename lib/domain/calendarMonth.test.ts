import { describe, expect, it } from "vitest";
import { getCalendarMonth, shiftCalendarMonths } from "./calendarMonth";

describe("getCalendarMonth", () => {
  it("spans the 1st to the last day of the month, in UTC", () => {
    const month = getCalendarMonth(new Date(Date.UTC(2026, 6, 15))); // 15 lug 2026
    expect(month.start.toISOString()).toBe(new Date(Date.UTC(2026, 6, 1, 0, 0, 0, 0)).toISOString());
    expect(month.end.toISOString()).toBe(new Date(Date.UTC(2026, 6, 31, 23, 59, 59, 999)).toISOString());
    expect(month.key).toBe("2026-07");
  });

  it("handles a shorter month correctly (February)", () => {
    const month = getCalendarMonth(new Date(Date.UTC(2026, 1, 10))); // 2026 non bisestile
    expect(month.end.toISOString()).toBe(new Date(Date.UTC(2026, 1, 28, 23, 59, 59, 999)).toISOString());
  });

  it("any day in the month resolves to the same key", () => {
    expect(getCalendarMonth(new Date(Date.UTC(2026, 6, 1))).key).toBe("2026-07");
    expect(getCalendarMonth(new Date(Date.UTC(2026, 6, 31))).key).toBe("2026-07");
  });
});

describe("shiftCalendarMonths", () => {
  const july = getCalendarMonth(new Date(Date.UTC(2026, 6, 15)));

  it("moves forward by whole months", () => {
    expect(shiftCalendarMonths(july, 1).key).toBe("2026-08");
  });

  it("moves backward by whole months", () => {
    expect(shiftCalendarMonths(july, -1).key).toBe("2026-06");
  });

  it("rolls over the year boundary", () => {
    const december = getCalendarMonth(new Date(Date.UTC(2026, 11, 1)));
    expect(shiftCalendarMonths(december, 1).key).toBe("2027-01");
    expect(shiftCalendarMonths(july, -7).key).toBe("2025-12");
  });

  it("zero shift returns the same month", () => {
    expect(shiftCalendarMonths(july, 0).key).toBe("2026-07");
  });
});
