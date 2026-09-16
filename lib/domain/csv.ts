/**
 * CSV "per Excel italiano", non CSV standard — una scelta deliberata: il file
 * serve a essere aperto con un doppio clic, non a essere importato da un altro
 * programma. Quindi tre convenzioni tutte necessarie insieme:
 *
 *   - separatore ";" invece di ",": Excel con impostazioni locali italiane usa
 *     la virgola come separatore DECIMALE, quindi legge un CSV virgola-separato
 *     tutto in una colonna sola;
 *   - virgola decimale negli importi ("1234,56"), così Excel li tratta da
 *     numeri e non da testo (con il punto li allineerebbe a sinistra e non ci
 *     si potrebbe sommare sopra);
 *   - BOM UTF-8 in testa al file (CSV_BOM sotto): senza, Excel apre il file in
 *     ANSI e "Città"/"€" diventano caratteri strani.
 *
 * Nessuna libreria: le regole di quoting del CSV stanno in una decina di righe
 * (escapeCsvCell) e valgono la pena di essere testate qui invece di aggiungere
 * una dipendenza al bundle.
 */

export const CSV_SEPARATOR = ";";

/** Da mettere in testa al file, non dentro le righe — vedi il commento sopra. */
export const CSV_BOM = "\uFEFF";

/**
 * Quoting solo quando serve (separatore, virgolette, o un a capo dentro una
 * cella — es. una nota su più righe). Le virgolette interne si raddoppiano,
 * come vuole il formato.
 */
export function escapeCsvCell(value: string): string {
  if (!/[";\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

/** Sempre 2 decimali e virgola decimale — vedi il commento in testa al file. */
export function formatCsvAmount(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/**
 * gg/mm/aaaa in UTC, non nel fuso di chi scarica: le date dell'app sono giorni
 * di calendario salvati a mezzanotte UTC (vedi lib/domain/period.ts), e
 * formattarle in un fuso avanti a UTC le farebbe scivolare al giorno dopo.
 */
export function formatCsvDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/**
 * CRLF come fine riga (non "\n"): è quello che il formato CSV prescrive ed è
 * quello che Excel su Windows si aspetta.
 */
export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(CSV_SEPARATOR)).join("\r\n");
}

/** "Si"/"No" invece di true/false: il file lo legge una persona, non un parser. */
export function formatCsvBoolean(value: boolean): string {
  return value ? "Si" : "No";
}
