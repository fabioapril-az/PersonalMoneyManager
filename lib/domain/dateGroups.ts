/**
 * Raggruppa un elenco già ordinato per data decrescente in blocchi per
 * giorno di calendario ("Oggi"/"Ieri"/una data) — usato per liste che
 * possono allungarsi parecchio ("Spese e entrate", "Spese nel Budget"),
 * dove altrimenti la stessa data si ripeterebbe riga per riga.
 *
 * Stesso principio del resto del dominio (vedi period.ts): il giorno di
 * calendario di una data è sempre il suo giorno UTC, non quello del fuso di
 * chi guarda — coerente con come ogni data viene salvata (un
 * <input type="date"> è sempre mezzanotte UTC).
 */

function utcDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

export type DateGroup<T> = {
  key: string;
  /** "Oggi"/"Ieri", o null — in quel caso chi chiama formatta group.date da sé. */
  label: "Oggi" | "Ieri" | null;
  date: Date;
  items: T[];
};

export function groupByCalendarDay<T>(
  items: T[],
  getDate: (item: T) => Date | string,
  now: Date = new Date()
): DateGroup<T>[] {
  const todayKey = utcDateKey(now);
  const yesterdayKey = utcDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const groups: DateGroup<T>[] = [];
  for (const item of items) {
    const date = new Date(getDate(item));
    const key = utcDateKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
      continue;
    }
    groups.push({
      key,
      label: key === todayKey ? "Oggi" : key === yesterdayKey ? "Ieri" : null,
      date,
      items: [item],
    });
  }
  return groups;
}
