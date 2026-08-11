import { Prisma } from "@/app/generated/prisma/client";
import type { Context } from "./context";
import { settleOverdueCardCharges } from "./settleOverdueCardCharges";

/**
 * Saldo reale di ogni account (PRD sezione 11): openingBalance + somma dei
 * CashMovement — mai basato su Expense/Income direttamente (Rule 5: "il
 * cash-flow è basato sui Cash Movement"). Sommati in JS invece di un
 * `groupBy` SQL: per un uso personale il volume di CashMovement resta
 * piccolo, e questo evita di dipendere da comportamenti groupBy specifici
 * dell'adapter mssql che non abbiamo ancora verificato a fondo.
 */
export async function listAccountsWithBalance(prisma: Context["prisma"], userId: string) {
  // Prima di calcolare i saldi, salda da sola ogni carta di credito il cui
  // addebito è già scaduto — altrimenti il saldo mostrato resterebbe più
  // alto di quello reale finché l'utente non clicca "Segna pagato" a mano.
  await settleOverdueCardCharges(prisma, userId);

  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });

  const movements = await prisma.cashMovement.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    select: { accountId: true, amount: true },
  });

  const sumByAccount = new Map<string, Prisma.Decimal>();
  for (const movement of movements) {
    const current = sumByAccount.get(movement.accountId) ?? new Prisma.Decimal(0);
    sumByAccount.set(movement.accountId, current.plus(movement.amount));
  }

  return accounts.map((account) => ({
    ...account,
    balance: new Prisma.Decimal(account.openingBalance).plus(sumByAccount.get(account.id) ?? 0),
  }));
}
