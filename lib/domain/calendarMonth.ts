/**
 * Mese solare (1° -> ultimo giorno del mese) — NON il periodo finanziario
 * 27->26 usato nel resto dell'app (lib/domain/period.ts). Serve solo per
 * confrontare i movimenti di un conto con un vero estratto conto esterno
 * (carta di credito, banca): quegli estratti seguono sempre il mese
 * solare, mai il ciclo 27->26 di quest'app — vedi server/routers/
 * account.ts (listMovements) e app/conti/[id].
 *
 * Stesse convenzioni di period.ts: tutto in UTC (ogni data che l'app salva
 * è mezzanotte UTC del giorno di calendario scelto), mai Date/mese
 * costruiti sull'ora locale — altrimenti lo stesso bug di fuso orario che
 * ha già colpito period.ts (vedi il suo commento in cima al file).
 */

export type CalendarMonth = {
  /** Inclusive start, 1° del mese alle 00:00:00 UTC. */
  start: Date;
  /** Inclusive end, ultimo giorno del mese alle 23:59:59.999 UTC. */
  end: Date;
  /** e.g. "2026-07", stabile e ordinabile. */
  key: string;
};

export function getCalendarMonth(reference: Date): CalendarMonth {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth(); // 0-11

  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  // Date.UTC(year, month + 1, 0) è il "giorno 0" del mese successivo, cioè
  // l'ultimo giorno di questo mese — stesso trucco di period.ts.
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  return { start, end, key: `${year}-${String(month + 1).padStart(2, "0")}` };
}

export function getCurrentCalendarMonth(now: Date = new Date()): CalendarMonth {
  return getCalendarMonth(now);
}

/**
 * Sposta avanti (count positivo) o indietro di N mesi solari interi — un
 * giorno UTC oltre il confine a ogni passo, mai setMonth (che opera sull'ora
 * locale e andrebbe alla deriva su un runtime non-UTC), stessa logica di
 * shiftPeriods in period.ts.
 */
export function shiftCalendarMonths(month: CalendarMonth, count: number): CalendarMonth {
  const step = count > 0 ? 1 : -1;
  let current = month;
  for (let i = 0; i < Math.abs(count); i++) {
    const reference =
      step > 0
        ? new Date(current.end.getTime() + 24 * 60 * 60 * 1000)
        : new Date(current.start.getTime() - 24 * 60 * 60 * 1000);
    current = getCalendarMonth(reference);
  }
  return current;
}
