import { describe, expect, it } from "vitest";
import { computeNextRunDate, computeDueOccurrences } from "./recurring";

describe("computeNextRunDate", () => {
  it("WEEKLY: advances by exactly 7 days", () => {
    const current = new Date(Date.UTC(2026, 7, 13)); // 13 Aug 2026 (Thursday)
    const next = computeNextRunDate(current, "WEEKLY", 13);
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
  });

  it("MONTHLY: advances to the same day next month", () => {
    const current = new Date(Date.UTC(2026, 0, 15)); // 15 Jan 2026
    const next = computeNextRunDate(current, "MONTHLY", 15);
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 1, 15)).toISOString());
  });

  it("MONTHLY: clamps to the last day of a shorter month", () => {
    const current = new Date(Date.UTC(2026, 0, 31)); // 31 Jan 2026
    const next = computeNextRunDate(current, "MONTHLY", 31);
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 1, 28)).toISOString()); // 2026 is not a leap year
  });

  it("MONTHLY: does not drift after a clamp — reanchors on the original dayOfMonth", () => {
    // 31 gen -> 28 feb (clamp) -> deve tornare 31 mar, non restare bloccato a 28.
    const afterJan = new Date(Date.UTC(2026, 1, 28));
    const next = computeNextRunDate(afterJan, "MONTHLY", 31);
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 2, 31)).toISOString());
  });

  it("MONTHLY: December rolls over into January of the next year", () => {
    const current = new Date(Date.UTC(2026, 11, 10)); // 10 Dec 2026
    const next = computeNextRunDate(current, "MONTHLY", 10);
    expect(next.toISOString()).toBe(new Date(Date.UTC(2027, 0, 10)).toISOString());
  });

  it("YEARLY: advances to the same month/day next year", () => {
    const current = new Date(Date.UTC(2026, 5, 1)); // 1 Jun 2026
    const next = computeNextRunDate(current, "YEARLY", 1);
    expect(next.toISOString()).toBe(new Date(Date.UTC(2027, 5, 1)).toISOString());
  });

  it("YEARLY: clamps 29 Feb to 28 Feb on a non-leap year", () => {
    const current = new Date(Date.UTC(2028, 1, 29)); // 2028 is a leap year
    const next = computeNextRunDate(current, "YEARLY", 29);
    expect(next.toISOString()).toBe(new Date(Date.UTC(2029, 1, 28)).toISOString());
  });
});

describe("computeDueOccurrences", () => {
  it("returns nothing due yet when nextRunDate is in the future", () => {
    const now = new Date(Date.UTC(2026, 7, 10));
    const result = computeDueOccurrences(new Date(Date.UTC(2026, 7, 15)), "MONTHLY", 15, now);
    expect(result.occurrences).toEqual([]);
    expect(result.nextRunDate.toISOString()).toBe(new Date(Date.UTC(2026, 7, 15)).toISOString());
  });

  it("returns exactly one occurrence when due today, and advances nextRunDate once", () => {
    const now = new Date(Date.UTC(2026, 7, 10));
    const result = computeDueOccurrences(new Date(Date.UTC(2026, 7, 10)), "MONTHLY", 10, now);
    expect(result.occurrences).toEqual([new Date(Date.UTC(2026, 7, 10))]);
    expect(result.nextRunDate.toISOString()).toBe(new Date(Date.UTC(2026, 8, 10)).toISOString());
  });

  it("catches up every missed occurrence, not just the latest one", () => {
    // L'app non è stata aperta per 3 mesi: tutte e 3 le occorrenze mancate
    // vanno generate, non solo l'ultima.
    const now = new Date(Date.UTC(2026, 10, 1)); // 1 Nov 2026
    const result = computeDueOccurrences(new Date(Date.UTC(2026, 7, 10)), "MONTHLY", 10, now); // ferma al 10 ago
    expect(result.occurrences).toEqual([
      new Date(Date.UTC(2026, 7, 10)),
      new Date(Date.UTC(2026, 8, 10)),
      new Date(Date.UTC(2026, 9, 10)),
    ]);
    expect(result.nextRunDate.toISOString()).toBe(new Date(Date.UTC(2026, 10, 10)).toISOString());
  });

  it("stops at maxCatchUp even if more occurrences would be due — a safety cap, not silent data loss", () => {
    const now = new Date(Date.UTC(2030, 0, 1));
    const result = computeDueOccurrences(new Date(Date.UTC(2026, 0, 10)), "MONTHLY", 10, now, 5);
    expect(result.occurrences).toHaveLength(5);
    // La nextRunDate salvata è comunque quella subito dopo l'ultima generata,
    // non "now" — la prossima chiamata riprenderà da lì, recuperando il
    // resto un pezzo alla volta invece di perderlo.
    expect(result.nextRunDate.toISOString()).toBe(new Date(Date.UTC(2026, 5, 10)).toISOString());
  });
});
