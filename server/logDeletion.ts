import type { DeletionEntityType } from "@/lib/domain/enums";

/**
 * Registra una cancellazione (DeletionLogEntry, vedi schema.prisma) — non
 * previsto dal PRD originale, aggiunto dopo essersi accorti che una spesa
 * cancellata sparisce senza lasciare traccia, rendendo impossibile
 * distinguere "l'ho cancellata" da "non l'ho mai salvata". Scrive uno
 * snapshot leggibile PRIMA che la riga vera sparisca — va sempre chiamata
 * con i dati già in mano (letti prima della delete), mai dopo.
 *
 * "prisma: any" come createExpenseChain/deleteExpenseChain (server/routers/
 * expense.ts): a volte è il client normale, a volte un tx di transazione —
 * stesso compromesso già accettato altrove nel progetto.
 */
export async function logDeletion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client or transaction client
  prisma: any,
  userId: string,
  entry: { entityType: DeletionEntityType; description: string; amount?: number | null; date?: Date | null }
) {
  await prisma.deletionLogEntry.create({
    data: {
      userId,
      entityType: entry.entityType,
      description: entry.description,
      amount: entry.amount ?? undefined,
      date: entry.date ?? undefined,
    },
  });
}
