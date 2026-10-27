import { CSV_BOM, formatCsvAmount, formatCsvBoolean, formatCsvDate, toCsv } from "@/lib/domain/csv";
import { PAYMENT_PLAN_TYPE_LABELS, CASH_MOVEMENT_TYPE_LABELS } from "@/lib/domain/labels";
import type { PaymentPlanType, CashMovementType } from "@/lib/domain/enums";
import type { FinancialPeriod } from "@/lib/domain/period";
import { computeBudgetForPeriod } from "./computeBudgetForPeriod";
import type { Context } from "./context";

/**
 * I quattro export CSV della pagina "Esporta" (app/esporta). Tutti sul
 * singolo periodo 27->26 mostrato, mai su tutto lo storico.
 *
 *   - "spese":      ogni spesa del periodo, nessun filtro — per data della
 *                   DECISIONE di spesa (Expense.date, Rule 4: mai spostata);
 *   - "ricorrenti": le sole spese marcate "Spesa ricorrente"
 *                   (Expense.isRecurringCost) — un sottoinsieme di "spese",
 *                   stesse colonne, così i due file sono confrontabili riga
 *                   per riga;
 *   - "budget":     le righe che compongono il Budget del periodo, cioè
 *                   esattamente quello che mostra "Spese nel Budget"
 *                   (computeBudgetForPeriod). Colonne DIVERSE dagli altri due,
 *                   necessariamente: qui una riga non è sempre una spesa —
 *                   può essere la singola rata dovuta nel periodo o la quota
 *                   di una spesa spalmata, e l'importo della riga non è
 *                   l'importo della spesa. Le colonne "Tipo riga" e "Importo
 *                   totale spesa" servono a non far sembrare un errore un
 *                   importo che non corrisponde alla spesa ricordata.
 *   - "cassa":      i Movimenti di cassa del periodo (PRD Rule 5) — cosa è
 *                   successo DAVVERO sui conti, per data di CashMovement, non
 *                   di Expense/Income. Una rata o un addebito carta pagati in
 *                   questo periodo compaiono qui anche se la spesa che li ha
 *                   generati è stata decisa in un periodo precedente — è
 *                   l'unico dei quattro export a poter contenere righe che
 *                   "spese"/"ricorrenti" non hanno, per lo stesso motivo per
 *                   cui "Movimenti di cassa" (app/movimenti) è una sezione
 *                   separata da "Spese e entrate".
 *
 * Il formato (";", virgola decimale, BOM) e il perché stanno in
 * lib/domain/csv.ts.
 */

export const EXPORT_DATASETS = ["spese", "ricorrenti", "budget", "cassa"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export const EXPORT_DATASET_LABELS: Record<ExportDataset, string> = {
  spese: "Tutte le spese",
  ricorrenti: "Solo spese ricorrenti",
  budget: "Spese nel Budget",
  cassa: "Movimenti di cassa",
};

const EXPENSE_HEADER = [
  "Data",
  "Descrizione",
  "Categoria",
  "Sottocategoria",
  "Conto",
  "Importo",
  "Pagamento",
  "Rate",
  "Ricorrente",
  "Esclusa dal Budget",
  "Spalmata su (mesi)",
  "Da ricorrenza",
  "Note",
];

const BUDGET_HEADER = [
  "Data",
  "Descrizione",
  "Categoria",
  "Sottocategoria",
  "Conto",
  "Importo nel Budget",
  "Tipo riga",
  "Rata",
  "Importo totale spesa",
  "Ricorrente",
];

const CASH_MOVEMENT_HEADER = ["Data", "Data spesa", "Descrizione", "Conto", "Tipo", "Importo", "Rata"];

export async function buildExpenseExport(
  prisma: Context["prisma"],
  userId: string,
  dataset: ExportDataset,
  period: FinancialPeriod
): Promise<{ filename: string; content: string }> {
  // Categoria di primo livello + sottocategoria in due colonne separate:
  // nell'app una sottocategoria conta nel totale del genitore (vedi il report
  // per categoria), e in un foglio di calcolo serve poter fare entrambe le
  // letture senza rifare la gerarchia a mano.
  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true, parentId: true, name: true },
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  function categoryColumns(categoryId: string): [string, string] {
    const category = categoryById.get(categoryId);
    if (!category) return ["", ""];
    if (!category.parentId) return [category.name, ""];
    const parent = categoryById.get(category.parentId);
    return parent ? [parent.name, category.name] : [category.name, ""];
  }

  const content =
    dataset === "budget"
      ? await buildBudgetCsv(prisma, userId, period, categoryColumns)
      : dataset === "cassa"
        ? await buildCashMovementsCsv(prisma, userId, period)
        : await buildExpensesCsv(prisma, userId, period, dataset === "ricorrenti", categoryColumns);

  return { filename: `${dataset}_${period.key}.csv`, content: CSV_BOM + content };
}

async function buildExpensesCsv(
  prisma: Context["prisma"],
  userId: string,
  period: FinancialPeriod,
  onlyRecurring: boolean,
  categoryColumns: (categoryId: string) => [string, string]
) {
  const expenses = await prisma.expense.findMany({
    // status "not PLANNED": una ricorrenza generata ma non ancora confermata
    // (PRD sezione 9) è un promemoria, non una spesa — non deve finire in un
    // export che poi si usa per fare i conti. Stesso filtro di report/dashboard.
    where: {
      userId,
      date: { gte: period.start, lte: period.end },
      status: { not: "PLANNED" },
      ...(onlyRecurring ? { isRecurringCost: true } : {}),
    },
    select: {
      date: true,
      description: true,
      categoryId: true,
      amount: true,
      notes: true,
      isRecurringCost: true,
      excludeFromBudget: true,
      budgetSpreadPeriods: true,
      recurringTemplateId: true,
      paymentPlan: { select: { type: true, installmentsCount: true, account: { select: { name: true } } } },
    },
    orderBy: { date: "desc" },
  });

  const rows = expenses.map((e) => {
    const [category, subcategory] = categoryColumns(e.categoryId);
    return [
      formatCsvDate(e.date),
      e.description,
      category,
      subcategory,
      e.paymentPlan?.account.name ?? "",
      formatCsvAmount(Number(e.amount)),
      e.paymentPlan ? (PAYMENT_PLAN_TYPE_LABELS[e.paymentPlan.type as PaymentPlanType] ?? e.paymentPlan.type) : "",
      // Vuoto, non "1", quando non è a rate: una colonna piena di 1 da
      // filtrare è rumore in un foglio di calcolo.
      (e.paymentPlan?.installmentsCount ?? 1) > 1 ? String(e.paymentPlan?.installmentsCount) : "",
      formatCsvBoolean(e.isRecurringCost),
      formatCsvBoolean(e.excludeFromBudget),
      e.budgetSpreadPeriods != null ? String(e.budgetSpreadPeriods) : "",
      formatCsvBoolean(e.recurringTemplateId != null),
      e.notes ?? "",
    ];
  });

  return toCsv(EXPENSE_HEADER, rows);
}

async function buildBudgetCsv(
  prisma: Context["prisma"],
  userId: string,
  period: FinancialPeriod,
  categoryColumns: (categoryId: string) => [string, string]
) {
  const { budgetLines } = await computeBudgetForPeriod(prisma, userId, period);

  const rows = budgetLines.map((line) => {
    const [category, subcategory] = categoryColumns(line.categoryId);
    // "Quota" prima di "Rata": una riga spalmata ha entrambi i campi
    // valorizzati (installment porta il numero di quota), ed è la spalmatura
    // a spiegare l'importo ridotto.
    const kind = line.spreadTotalAmount != null ? "Quota spalmata" : line.installment != null ? "Rata" : "Spesa";
    return [
      formatCsvDate(line.date),
      line.description,
      category,
      subcategory,
      line.accountName ?? "",
      formatCsvAmount(Number(line.amount)),
      kind,
      line.installment?.no != null && line.installment.count != null
        ? `${line.installment.no}/${line.installment.count}`
        : "",
      // Compilato solo dove l'importo della riga NON è l'importo della spesa —
      // per una spesa intera ripetere lo stesso numero due volte sarebbe solo
      // una colonna in più da leggere.
      line.spreadTotalAmount != null ? formatCsvAmount(line.spreadTotalAmount) : "",
      formatCsvBoolean(line.isRecurringCost),
    ];
  });

  return toCsv(BUDGET_HEADER, rows);
}

async function buildCashMovementsCsv(prisma: Context["prisma"], userId: string, period: FinancialPeriod) {
  // Filtrato per data di CashMovement, non di Expense/Income — stessa query
  // di dashboard.summary (server/routers/dashboard.ts), così questo export
  // mostra esattamente le righe della sezione "Movimenti di cassa".
  const movements = await prisma.cashMovement.findMany({
    where: { date: { gte: period.start, lte: period.end }, account: { userId } },
    include: {
      account: { select: { name: true } },
      paymentSchedule: {
        select: {
          installmentNo: true,
          paymentPlan: { select: { installmentsCount: true, expense: { select: { date: true } } } },
        },
      },
      // Solo per "Data spesa" sotto — un'entrata non ha mai una data diversa
      // dal suo CashMovement (create insieme, vedi income.ts), ma la teniamo
      // comunque per coerenza di colonna con le righe generate da una spesa.
      income: { select: { date: true } },
    },
    orderBy: { date: "desc" },
  });

  const rows = movements.map((m) => {
    // "OTHER" non ha etichetta di proposito (CASH_MOVEMENT_TYPE_LABELS): è il
    // caso "normale" (spesa a pagamento immediato, stesso giorno) — stessa
    // convenzione della sezione "Movimenti di cassa" in app/movimenti.
    const typeLabel = CASH_MOVEMENT_TYPE_LABELS[m.type as CashMovementType] ?? "";
    // Data dell'ACQUISTO (Expense.date, mai spostata — Rule 4), non della
    // scadenza: per una rata o un addebito carta è diversa dalla colonna
    // "Data" sopra (il vero movimento), e serve a risalire a quando è stata
    // presa la decisione di spesa. Vuota per un trasferimento: lì le due
    // date coincidono sempre (un trasferimento è sempre immediato).
    const expenseDate = m.paymentSchedule?.paymentPlan.expense.date ?? m.income?.date ?? null;
    return [
      formatCsvDate(m.date),
      expenseDate ? formatCsvDate(expenseDate) : "",
      m.description ?? "",
      m.account.name,
      typeLabel,
      formatCsvAmount(Number(m.amount)),
      m.paymentSchedule?.installmentNo != null && m.paymentSchedule.paymentPlan.installmentsCount != null
        ? `${m.paymentSchedule.installmentNo}/${m.paymentSchedule.paymentPlan.installmentsCount}`
        : "",
    ];
  });

  return toCsv(CASH_MOVEMENT_HEADER, rows);
}
