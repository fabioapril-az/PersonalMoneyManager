import type { Context } from "./context";
import { computeNextRunDate } from "@/lib/domain/recurring";
import type { RecurringFrequency } from "@/lib/domain/enums";

// Tetto di sicurezza al recupero arretrati per un singolo template in
// un'unica chiamata — non deve mai poter esplodere in un loop indefinito su
// dati corrotti (es. nextRunDate rimasto fermo per un bug).
const MAX_CATCH_UP_PER_TEMPLATE = 36;

/**
 * Genera automaticamente le spese dovute da ogni template ricorrente attivo
 * (PRD sezione 9, Regola 7) — stesso principio di settleOverdueCardCharges
 * (server/settleOverdueCardCharges.ts): nessun vero cron (il piano Azure Free
 * non lo permette), quindi lo si fa "pigramente" a ogni apertura della
 * dashboard (chiamata da dashboard.summary).
 *
 * Recupera anche le occorrenze arretrate se l'utente non apre l'app per un
 * po' — una spesa per ciascuna occorrenza mancata, non solo l'ultima, fino al
 * tetto di sicurezza sopra — così non si perde la storia (es. due mesi di
 * Netflix non aperti diventano due spese distinte, non una sola).
 *
 * Ogni occorrenza generata parte in stato PLANNED, non RECORDED: è solo un
 * promemoria finché l'utente non la conferma (expense.update, che la porta a
 * RECORDED creando il vero PaymentPlan/CashMovement — vedi quel router) — non
 * ha ancora un PaymentPlan, e non tocca Budget/Disponibile/Report finché resta
 * così (vedi il filtro su status in dashboard.summary e report.ts).
 *
 * Idempotente: chiamarla più volte nella stessa richiesta non genera doppioni
 * — ogni occorrenza generata avanza subito nextRunDate nella stessa
 * transazione, quindi una seconda chiamata non trova più nulla di scaduto.
 */
export async function generateDueRecurringExpenses(prisma: Context["prisma"], userId: string) {
  const due = await prisma.recurringTemplate.findMany({
    where: { userId, active: true, nextRunDate: { lte: new Date() } },
  });
  if (due.length === 0) return;

  for (const template of due) {
    const occurrences: Date[] = [];
    let nextRunDate = template.nextRunDate;
    while (nextRunDate.getTime() <= Date.now() && occurrences.length < MAX_CATCH_UP_PER_TEMPLATE) {
      occurrences.push(nextRunDate);
      nextRunDate = computeNextRunDate(nextRunDate, template.frequency as RecurringFrequency, template.dayOfMonth);
    }
    if (occurrences.length === 0) continue;

    await prisma.$transaction([
      ...occurrences.map((date) =>
        prisma.expense.create({
          data: {
            userId,
            date,
            amount: template.amount,
            categoryId: template.categoryId,
            description: template.name,
            status: "PLANNED",
            recurringTemplateId: template.id,
          },
        })
      ),
      prisma.recurringTemplate.update({ where: { id: template.id }, data: { nextRunDate } }),
    ]);
  }
}
