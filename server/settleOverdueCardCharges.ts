import type { Context } from "./context";

/**
 * Un acquisto con carta di credito NON a rate viene addebitato in banca in
 * automatico alla data di fatturazione, che tu te ne ricordi o no — a
 * differenza di una rata, che resta a saldo manuale per scelta esplicita
 * dell'utente (ogni rata potrebbe non coincidere con l'addebito reale, es.
 * pagata in anticipo). Senza integrazione bancaria (Fase 5, non fatta),
 * simuliamo qui quell'automatismo: ad ogni lettura di saldi/impegni, ogni
 * PaymentSchedule di tipo CREDIT_CARD ancora PENDING con scadenza già
 * passata viene saldata da sola — stesso identico effetto di
 * paymentSchedule.markPaid, senza bisogno che l'utente clicchi nulla.
 *
 * Idempotente: chiamarla più volte nella stessa richiesta (da router
 * diversi) non ha effetti diversi dal chiamarla una sola volta, la seconda
 * chiamata semplicemente non trova più righe scadute.
 */
export async function settleOverdueCardCharges(prisma: Context["prisma"], userId: string) {
  const overdue = await prisma.paymentSchedule.findMany({
    where: {
      status: "PENDING",
      dueDate: { lte: new Date() },
      paymentPlan: { type: "CREDIT_CARD", expense: { userId } },
    },
    include: { paymentPlan: { include: { expense: true } } },
  });
  if (overdue.length === 0) return;

  await prisma.$transaction(
    overdue.flatMap((schedule) => [
      prisma.paymentSchedule.update({ where: { id: schedule.id }, data: { status: "PAID" } }),
      prisma.cashMovement.create({
        data: {
          accountId: schedule.paymentPlan.accountId,
          date: schedule.dueDate,
          amount: schedule.amount.negated(), // signed: money out
          type: "CARD_CHARGE",
          status: "EXECUTED",
          description: schedule.paymentPlan.expense.description,
          paymentScheduleId: schedule.id,
        },
      }),
    ])
  );
}
