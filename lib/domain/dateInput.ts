/**
 * Bridges native <input type="date"> (plain "YYYY-MM-DD", no time zone) and
 * the app's stored dates (always UTC midnight for the chosen calendar day —
 * every date-only string the app parses, JS always interprets as UTC).
 */

// A stored date's calendar day IS its UTC calendar day (see above) —
// toISOString() is itself always UTC, so no conversion needed. Used to
// pre-fill an edit form from an already-saved date.
export function toDateInputValue(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

// "Today" instead means the user's LOCAL calendar day — deliberately NOT
// toISOString() (which gives UTC's today, up to a day behind local for any
// timezone ahead of UTC — e.g. Italy, in the hour or two right after local
// midnight). Used to default a NEW entry's date to what the user considers
// "today" right now.
export function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
