/**
 * Financial period (PRD section 3): the app does NOT use the calendar month.
 * A period runs 27th of a month -> 26th of the next month (e.g. 27 Aug -> 26 Sep).
 *
 * This is intentionally a pure function, not a database table (see the note
 * in prisma/schema.prisma next to the missing FinancialPeriod model): every
 * report, budget window, and dashboard figure derives the period from a date
 * instead of trusting a stored value that could drift out of sync.
 */

const PERIOD_START_DAY = 27;

export type FinancialPeriod = {
  /** Inclusive start, always the 27th at 00:00:00. */
  start: Date;
  /** Inclusive end, always the 26th of the following month at 23:59:59.999. */
  end: Date;
  /** e.g. "2026-08-27_2026-09-26", stable and sortable — handy as a report key. */
  key: string;
};

/**
 * Every month has at least 28 days, so day 26 and day 27 always exist —
 * no end-of-month edge case to special-case here.
 */
export function getFinancialPeriod(reference: Date): FinancialPeriod {
  const year = reference.getFullYear();
  const month = reference.getMonth(); // 0-11
  const day = reference.getDate();

  // If we're on/after the 27th, the period started THIS month.
  // Otherwise it started LAST month.
  const startMonthOffset = day >= PERIOD_START_DAY ? 0 : -1;

  const start = new Date(year, month + startMonthOffset, PERIOD_START_DAY, 0, 0, 0, 0);
  const end = new Date(year, month + startMonthOffset + 1, PERIOD_START_DAY - 1, 23, 59, 59, 999);

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
    // Step one day before the current period's start to land in the previous one.
    const previousReference = new Date(cursor.start);
    previousReference.setDate(previousReference.getDate() - 1);
    cursor = getFinancialPeriod(previousReference);
  }
  return periods;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toPeriodKey(start: Date, end: Date): string {
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${fmt(start)}_${fmt(end)}`;
}
