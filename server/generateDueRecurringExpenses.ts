import type { Context } from "./context";
import { computeDueOccurrences } from "@/lib/domain/recurring";
import type { RecurringFrequency } from "@/lib/domain/enums";

/**
 * Genera automaticamente le spese dovute da ogni template ricorrente attivo
 * (PRD sezione 9, Regola 7) — stesso principio di settleOverdueCardCharges
 * (server/settleOverdueCardCharges.ts): nessun vero cron (il piano Azure Free
 * non lo permette), quindi lo si fa "pigramente" a ogni apertura della
 * dashboard (chiamata da dashboard.summary).
 *
 * Recupera anche le occorrenze arretrate se l'utente non apre l'app per un
 * po' — una spesa per ciascuna occorrenza mancata, non solo l'ultima, fino al
 * tetto di sicurezza di computeDueOccurrences (lib/domain/recurring.ts, dove
 * vive tutta la decisione "quali occorrenze sono dovute") — così non si
 * perde la storia (es. due mesi di Netflix non aperti diventano due spese
 * distinte, non una sola).
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
    const { occurrences, nextRunDate } = computeDueOccurrences(
      template.nextRunDate,
      template.frequency as RecurringFrequency,
      template.dayOfMonth,
      new Date()
    );
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
