import { describe, expect, it } from "vitest";
import { selectBudgetExpenses, computeBudgetSpreadShare, splitPeriodIntoWeeks, computeAdaptiveWeeklyBudget } from "./budget";
import { getFinancialPeriod } from "./period";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function expense(
  paymentPlan: { type: string; account: { excludeFromTotals: boolean } } | null,
  excludeFromBudget = false
) {
  return { paymentPlan, excludeFromBudget };
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

  it("excludes an expense explicitly marked excludeFromBudget, regardless of plan type", () => {
    const result = selectBudgetExpenses([
      expense({ type: "IMMEDIATE", account: { excludeFromTotals: false } }, true),
      expense({ type: "CREDIT_CARD", account: { excludeFromTotals: false } }, true),
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
    const excludedAccount = expense({ type: "IMMEDIATE", account: { excludeFromTotals: true } });
    const excludedFlag = expense({ type: "IMMEDIATE", account: { excludeFromTotals: false } }, true);
    const result = selectBudgetExpenses([immediate, installments, excludedAccount, excludedFlag]);
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

describe("splitPeriodIntoWeeks", () => {
  it("splits a 31-day period (starting in a 31-day month) into 7/7/7/10", () => {
    const period = getFinancialPeriod(new Date(Date.UTC(2026, 6, 27))); // lug 2026 (31gg) -> 27lug->26ago
    const weeks = splitPeriodIntoWeeks(period);
    expect(weeks).toHaveLength(4);
    expect(weeks[0]).toEqual({ no: 1, start: new Date(Date.UTC(2026, 6, 27)), end: new Date(Date.UTC(2026, 7, 2, 23, 59, 59, 999)) });
    expect(weeks[1].start.toISOString()).toBe(new Date(Date.UTC(2026, 7, 3)).toISOString());
    expect(weeks[2].start.toISOString()).toBe(new Date(Date.UTC(2026, 7, 10)).toISOString());
    expect(weeks[3].start.toISOString()).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    // L'ultima quota finisce sempre esattamente con il periodo, qualunque sia
    // il resto di giorni avanzati.
    expect(weeks[3].end.getTime()).toBe(period.end.getTime());
  });

  it("splits a 28-day period (shortest, Feb non-leap) evenly into four 7-day weeks", () => {
    const period = getFinancialPeriod(new Date(Date.UTC(2026, 1, 27))); // feb 2026 (non bisestile) -> 27feb->26mar, 28gg
    const weeks = splitPeriodIntoWeeks(period);
    for (const week of weeks) {
      const days = (week.end.getTime() - week.start.getTime() + 1) / MS_PER_DAY;
      expect(days).toBe(7);
    }
  });

  it("never leaves a gap or overlap between consecutive weeks", () => {
    const period = getFinancialPeriod(new Date(Date.UTC(2026, 6, 27)));
    const weeks = splitPeriodIntoWeeks(period);
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].start.getTime()).toBe(weeks[i - 1].end.getTime() + 1);
    }
    expect(weeks[0].start.getTime()).toBe(period.start.getTime());
    expect(weeks[weeks.length - 1].end.getTime()).toBe(period.end.getTime());
  });

  it("covers every day of the period exactly once, for a 29-day period too (leap Feb)", () => {
    const period = getFinancialPeriod(new Date(Date.UTC(2028, 1, 27))); // 2028 bisestile: 27feb->26mar, 29gg
    const weeks = splitPeriodIntoWeeks(period);
    const totalDays = weeks.reduce((sum, w) => sum + (w.end.getTime() - w.start.getTime() + 1) / MS_PER_DAY, 0);
    const periodDays = (period.end.getTime() - period.start.getTime() + 1) / MS_PER_DAY;
    expect(periodDays).toBe(29);
    expect(totalDays).toBe(periodDays);
  });
});

describe("computeAdaptiveWeeklyBudget", () => {
  // 4 settimane di comodo, non necessariamente da splitPeriodIntoWeeks — solo
  // date/ordine contano per questa funzione, non la loro lunghezza reale.
  const weeks = [
    { no: 1, start: new Date(Date.UTC(2026, 0, 1)), end: new Date(Date.UTC(2026, 0, 7, 23, 59, 59, 999)), spent: 0 },
    { no: 2, start: new Date(Date.UTC(2026, 0, 8)), end: new Date(Date.UTC(2026, 0, 14, 23, 59, 59, 999)), spent: 0 },
    { no: 3, start: new Date(Date.UTC(2026, 0, 15)), end: new Date(Date.UTC(2026, 0, 21, 23, 59, 59, 999)), spent: 0 },
    { no: 4, start: new Date(Date.UTC(2026, 0, 22)), end: new Date(Date.UTC(2026, 0, 28, 23, 59, 59, 999)), spent: 0 },
  ];

  it("with no week ended yet, every week just gets the flat base budget", () => {
    const now = new Date(Date.UTC(2025, 11, 31)); // prima che la settimana 1 inizi
    const result = computeAdaptiveWeeklyBudget(weeks, 800, now);
    for (const week of result) {
      expect(week.baseBudget).toBe(200);
      expect(week.adjustedBudget).toBe(200);
      expect(week.isFinal).toBe(false);
    }
  });

  it("an overspent finished week lowers the budget of every week after it, split evenly", () => {
    const input = weeks.map((w) => ({ ...w, spent: w.no === 1 ? 250 : 0 })); // settimana 1: sforata di 50
    const now = new Date(Date.UTC(2026, 0, 8)); // settimana 1 conclusa, settimana 2 appena iniziata
    const result = computeAdaptiveWeeklyBudget(input, 800, now);
    expect(result[0].isFinal).toBe(true);
    // -50 diviso sulle 3 settimane rimanenti = -16.67 ciascuna
    expect(result[1].adjustedBudget).toBeCloseTo(200 - 50 / 3, 2);
    expect(result[2].adjustedBudget).toBeCloseTo(200 - 50 / 3, 2);
    expect(result[3].adjustedBudget).toBeCloseTo(200 - 50 / 3, 2);
    expect(result[1].isFinal).toBe(false);
  });

  it("an underspent finished week raises the budget of every week after it, split evenly", () => {
    const input = weeks.map((w) => ({ ...w, spent: w.no === 1 ? 150 : 0 })); // settimana 1: risparmiati 50
    const now = new Date(Date.UTC(2026, 0, 8));
    const result = computeAdaptiveWeeklyBudget(input, 800, now);
    expect(result[1].adjustedBudget).toBeCloseTo(200 + 50 / 3, 2);
    expect(result[2].adjustedBudget).toBeCloseTo(200 + 50 / 3, 2);
    expect(result[3].adjustedBudget).toBeCloseTo(200 + 50 / 3, 2);
  });

  it("cascades week by week as each one concludes (full worked example)", () => {
    // Settimana 1: risparmia 50 (spesi 150 su 200) -> +16.67 a settimane 2,3,4.
    // Settimana 2: budget 216.67, spesi 250 -> sfora di 33.33 -> -16.67 a settimane 3,4.
    // Settimana 3: budget 200, spesi 180 -> risparmia 20 -> +20 a settimana 4.
    // Settimana 4: budget atteso 200 + 16.67 - 16.67 + 20 = 220.
    const input = [
      { ...weeks[0], spent: 150 },
      { ...weeks[1], spent: 250 },
      { ...weeks[2], spent: 180 },
      { ...weeks[3], spent: 220 },
    ];
    const now = new Date(Date.UTC(2026, 1, 1)); // dopo la fine di tutte e 4 le settimane
    const result = computeAdaptiveWeeklyBudget(input, 800, now);
    expect(result.every((w) => w.isFinal)).toBe(true);
    expect(result[0].adjustedBudget).toBe(200);
    expect(result[1].adjustedBudget).toBeCloseTo(200 + 50 / 3, 2);
    expect(result[2].adjustedBudget).toBeCloseTo(200, 2); // 216.67 - 33.33/2 = 200
    expect(result[3].adjustedBudget).toBeCloseTo(220, 2);
  });

  it("the last week's own diff never redistributes anywhere (no crash, nothing left to give it to)", () => {
    const input = weeks.map((w) => ({ ...w, spent: w.no === 4 ? 500 : 200 }));
    const now = new Date(Date.UTC(2026, 1, 1));
    const result = computeAdaptiveWeeklyBudget(input, 800, now);
    expect(result[3].isFinal).toBe(true);
    expect(Number.isFinite(result[3].adjustedBudget)).toBe(true);
  });
});
