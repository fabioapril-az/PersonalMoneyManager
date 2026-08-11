/**
 * Data del vero addebito di un acquisto con carta di credito (PRD sezione 6):
 * sempre il mese successivo all'acquisto, al giorno di fatturazione
 * configurato sull'account (Account.statementDay).
 *
 * Semplificazione MVP dichiarata: non modella cicli di fatturazione con
 * cut-off infra-mese (le regole esatte variano da banca a banca — es. "gli
 * acquisti dal 27 al 26 finiscono nell'estratto del mese dopo"). Chi saldi
 * una PaymentSchedule può comunque correggere la data se necessario.
 */
export function computeCardStatementDate(purchaseDate: Date, statementDay: number): Date {
  const year = purchaseDate.getFullYear();
  const targetMonth = purchaseDate.getMonth() + 1; // sempre il mese successivo

  // Clamp al giorno più vicino esistente in quel mese (es. statementDay=31
  // in un mese con 30 giorni non deve "rollare" a marzo).
  const lastDayOfTargetMonth = new Date(year, targetMonth + 1, 0).getDate();
  const day = Math.min(statementDay, lastDayOfTargetMonth);

  return new Date(year, targetMonth, day);
}
