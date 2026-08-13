import { describe, expect, it } from "vitest";
import { groupByCalendarDay } from "./dateGroups";

describe("groupByCalendarDay", () => {
  const now = new Date(Date.UTC(2026, 7, 13)); // 13 Aug 2026

  it("groups consecutive items on the same UTC day together", () => {
    const items = [
      { id: "a", date: new Date(Date.UTC(2026, 7, 13, 0, 0)) },
      { id: "b", date: new Date(Date.UTC(2026, 7, 13, 0, 0)) },
      { id: "c", date: new Date(Date.UTC(2026, 7, 12, 0, 0)) },
    ];
    const groups = groupByCalendarDay(items, (i) => i.date, now);
    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["c"]);
  });

  it("labels today and yesterday, leaves older dates unlabeled", () => {
    const items = [
      { id: "today", date: new Date(Date.UTC(2026, 7, 13)) },
      { id: "yesterday", date: new Date(Date.UTC(2026, 7, 12)) },
      { id: "older", date: new Date(Date.UTC(2026, 7, 9)) },
    ];
    const groups = groupByCalendarDay(items, (i) => i.date, now);
    expect(groups.map((g) => g.label)).toEqual(["Oggi", "Ieri", null]);
  });

  it("does not merge two identical dates separated by a different one", () => {
    const items = [
      { id: "a", date: new Date(Date.UTC(2026, 7, 13)) },
      { id: "b", date: new Date(Date.UTC(2026, 7, 12)) },
      { id: "c", date: new Date(Date.UTC(2026, 7, 13)) },
    ];
    const groups = groupByCalendarDay(items, (i) => i.date, now);
    expect(groups).toHaveLength(3);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupByCalendarDay([], (i: { date: Date }) => i.date, now)).toEqual([]);
  });
});
