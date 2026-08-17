import type { RecurringFrequency } from "./enums";

// Ultimo giorno del mese `month` (0-based, come Date#getUTCMonth) dell'anno
// `year` — Date.UTC(year, month + 1, 0) è il "giorno 0" del mese successivo,
// cioè l'ultimo del mese richiesto. Stesso trucco usato altrove nel progetto
// per la matematica sui mesi in UTC.
function daysInUTCMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Prossima occorrenza di un template ricorrente (PRD sezione 9), a partire
 * dall'ultima generata (`current`). Tutto in UTC, come lib/domain/period.ts —
 * stessa ragione: qualunque calcolo sulle date fatto con l'ora locale rompe
 * vicino a mezzanotte per un utente non-UTC.
 *
 * `dayOfMonth` è il giorno "ancora" scelto alla creazione del template (1-31),
 * usato per MENSILE/ANNUALE per evitare una deriva quando un mese è più corto
 * di un altro: 31 gennaio -> 28 febbraio -> di nuovo 31 marzo, non 28 marzo
 * (si riparte sempre dall'ancora originale, mai dal giorno eventualmente
 * troncato dell'occorrenza precedente).
 */
export function computeNextRunDate(current: Date, frequency: RecurringFrequency, dayOfMonth: number): Date {
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();

  switch (frequency) {
    case "WEEKLY":
      return new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "MONTHLY": {
      const nextMonth = month + 1; // Date.UTC gestisce da solo lo sforamento in dicembre -> gennaio.
      const day = Math.min(dayOfMonth, daysInUTCMonth(year, nextMonth));
      return new Date(Date.UTC(year, nextMonth, day));
    }
    case "YEARLY": {
      const nextYear = year + 1;
      const day = Math.min(dayOfMonth, daysInUTCMonth(nextYear, month));
      return new Date(Date.UTC(nextYear, month, day));
    }
  }
}

export type DueOccurrences = {
  occurrences: Date[];
  nextRunDate: Date;
};

// Tetto di sicurezza al recupero arretrati per un singolo template in
// un'unica chiamata — non deve mai poter esplodere in un loop indefinito su
// dati corrotti (es. nextRunDate rimasto fermo per un bug).
const DEFAULT_MAX_CATCH_UP = 36;

/**
 * Quali occorrenze di un template ricorrente sono dovute a `now`, a partire
 * dall'ultima `nextRunDate` nota (PRD sezione 9, Regola 7) — una per ciascuna
 * scadenza mancata, non solo l'ultima (se l'utente non apre l'app per un
 * po', il recupero genera una spesa per ogni mese saltato, non una sola),
 * fino a `maxCatchUp` per sicurezza. Pura: non scrive nulla — vedi
 * server/generateDueRecurringExpenses.ts per l'esecuzione (crea le Expense,
 * salva la nextRunDate restituita qui).
 */
export function computeDueOccurrences(
  nextRunDate: Date,
  frequency: RecurringFrequency,
  dayOfMonth: number,
  now: Date,
  maxCatchUp: number = DEFAULT_MAX_CATCH_UP
): DueOccurrences {
  const occurrences: Date[] = [];
  let current = nextRunDate;
  while (current.getTime() <= now.getTime() && occurrences.length < maxCatchUp) {
    occurrences.push(current);
    current = computeNextRunDate(current, frequency, dayOfMonth);
  }
  return { occurrences, nextRunDate: current };
}
