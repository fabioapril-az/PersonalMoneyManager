import type { ReportGranularity } from "./enums";

/**
 * Financial period (PRD section 3): the app does NOT use the calendar month.
 * A period runs 27th of a month -> 26th of the next month (e.g. 27 Aug -> 26 Sep).
 *
 * This is intentionally a pure function, not a database table (see the note
 * in prisma/schema.prisma next to the missing FinancialPeriod model): every
 * report, budget window, and dashboard figure derives the period from a date
 * instead of trusting a stored value that could drift out of sync.
 *
 * Everything here works in UTC calendar terms, deliberately — not the
 * server's or the browser's local timezone. Every date the app stores
 * (Expense.date, Income.date, ecc.) comes from a plain "YYYY-MM-DD" <input
 * type="date">, which JS always parses as UTC midnight; computing period
 * boundaries the same way keeps them exactly aligned with those stored
 * dates, regardless of which timezone the Node process or the browser
 * happens to run in (a real bug: a period end built with the LOCAL Date
 * constructor and displayed with a plain Intl.DateTimeFormat rendered as the
 * 27th instead of the 26th for any reader ahead of UTC, e.g. Italy in
 * summer — 23:59:59.999 UTC + 2h rolls into the next calendar day). The one
 * accepted trade-off: getCurrentFinancialPeriod()'s default "now" is judged
 * by its UTC calendar day, so right after LOCAL midnight (until UTC midnight
 * catches up, a window of at most ~14h depending on timezone) the app can
 * still consider "today" part of yesterday — never observed as a real
 * problem for a single-user, single-timezone app.
 */

const PERIOD_START_DAY = 27;

export type FinancialPeriod = {
  /** Inclusive start, always the 27th at 00:00:00 UTC. */
  start: Date;
  /** Inclusive end, always the 26th of the following month at 23:59:59.999 UTC. */
  end: Date;
  /** e.g. "2026-08-27_2026-09-26", stable and sortable — handy as a report key. */
  key: string;
};

/**
 * Every month has at least 28 days, so day 26 and day 27 always exist —
 * no end-of-month edge case to special-case here.
 */
export function getFinancialPeriod(reference: Date): FinancialPeriod {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth(); // 0-11
  const day = reference.getUTCDate();

  // If we're on/after the 27th, the period started THIS month.
  // Otherwise it started LAST month.
  const startMonthOffset = day >= PERIOD_START_DAY ? 0 : -1;

  const start = new Date(Date.UTC(year, month + startMonthOffset, PERIOD_START_DAY, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + startMonthOffset + 1, PERIOD_START_DAY - 1, 23, 59, 59, 999));

  return { start, end, key: toPeriodKey(start, end) };
}

export function getCurrentFinancialPeriod(now: Date = new Date()): FinancialPeriod {
  return getFinancialPeriod(now);
}

export function isWithinPeriod(date: Date, period: FinancialPeriod): boolean {
  return date >= period.start && date <= period.end;
}

/** The N most recent periods, most recent first — used for trend reports (PRD section 12). */
export function getRecentPeriods(count: number, reference: Date = new Date()): FinancialPeriod[] {
  const periods: FinancialPeriod[] = [];
  let cursor = getCurrentFinancialPeriod(reference);
  for (let i = 0; i < count; i++) {
    periods.push(cursor);
    // One UTC day (as milliseconds, not setDate — setDate operates on LOCAL
    // calendar parts, which would drift from cursor.start's UTC-midnight
    // instant on any non-UTC runtime) before the current period's start
    // lands in the previous one.
    const previousReference = new Date(cursor.start.getTime() - 24 * 60 * 60 * 1000);
    cursor = getFinancialPeriod(previousReference);
  }
  return periods;
}

/**
 * Moves forward (positive count) or backward (negative) by whole periods —
 * used both by the Report page's granularity windows (jump by 3/12 periods
 * at once instead of 1, see GRANULARITY_PERIOD_COUNT) and by period
 * navigation on the dashboard (jump by exactly 1). One UTC day past the
 * boundary each step, same reasoning as getRecentPeriods above — never
 * setDate, which drifts on any non-UTC runtime.
 */
export function shiftPeriods(period: FinancialPeriod, count: number): FinancialPeriod {
  const step = count > 0 ? 1 : -1;
  let current = period;
  for (let i = 0; i < Math.abs(count); i++) {
    const reference =
      step > 0
        ? new Date(current.end.getTime() + 24 * 60 * 60 * 1000)
        : new Date(current.start.getTime() - 24 * 60 * 60 * 1000);
    current = getFinancialPeriod(reference);
  }
  return current;
}

/**
 * How many consecutive financial periods each Report granularity aggregates
 * — deliberately "rolling" (the last N periods ending at whichever one is
 * currently shown), not calendar-aligned quarters/years: those never line up
 * cleanly with a 27->26 period anyway.
 */
export const GRANULARITY_PERIOD_COUNT: Record<ReportGranularity, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toPeriodKey(start: Date, end: Date): string {
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return `${fmt(start)}_${fmt(end)}`;
}
