/**
 * Rate (PRD sezione 7): "qualunque spesa può essere rateizzata", su
 * qualunque conto — indipendente dalla logica delle carte di credito
 * (lib/domain/creditCard.ts). Se una spesa è a rate, quella logica prevale:
 * niente scadenza al ciclo estratto conto, solo scadenze mensili a partire
 * dalla data d'acquisto.
 */

/**
 * Data della rata N (1-based) di un piano che parte da purchaseDate, una al
 * mese, stesso giorno del mese di partenza — clampata se il mese di
 * destinazione ha meno giorni (stessa logica di computeCardStatementDate).
 * La rata 1 cade lo stesso giorno dell'acquisto (pagata subito).
 */
export function computeInstallmentDueDate(purchaseDate: Date, installmentNo: number): Date {
  const year = purchaseDate.getFullYear();
  const targetMonth = purchaseDate.getMonth() + (installmentNo - 1);
  const day = purchaseDate.getDate();

  const lastDayOfTargetMonth = new Date(year, targetMonth + 1, 0).getDate();
  return new Date(year, targetMonth, Math.min(day, lastDayOfTargetMonth));
}

/**
 * Divide un importo totale in `count` rate arrotondate ai centesimi. Il
 * resto (al massimo `count - 1` centesimi) va sull'ultima rata — mai perso,
 * mai duplicato, la somma delle rate è sempre esattamente l'importo totale.
 */
export function splitIntoInstallments(totalAmount: number, count: number): number[] {
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / count);
  const amounts = Array.from({ length: count }, () => baseCents);
  amounts[count - 1] += totalCents - baseCents * count;
  return amounts.map((cents) => cents / 100);
}
