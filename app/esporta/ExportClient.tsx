"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentFinancialPeriod, shiftPeriods } from "@/lib/domain/period";

// timeZone: "UTC" — i confini di periodo sono mezzanotte UTC, vedi il commento
// sull'omonimo formatter in DashboardClient.tsx.
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// I tre file, nell'ordine in cui hanno senso da leggere: il più filtrato
// prima. dataset combacia col segmento di rotta di app/api/export/[dataset].
const EXPORTS = [
  {
    dataset: "ricorrenti",
    label: "Solo spese ricorrenti",
    description: "Le spese marcate “Spesa ricorrente”. Sottoinsieme del terzo file, stesse colonne.",
  },
  {
    dataset: "budget",
    label: "Spese nel Budget",
    description:
      "Quello che compone il Budget del periodo: una spesa a rate compare per la sola rata in scadenza, una spesa spalmata per la sola quota, e le spese escluse dal Budget non ci sono.",
  },
  {
    dataset: "spese",
    label: "Tutte le spese",
    description: "Ogni spesa del periodo, senza filtri — ricorrenti e occasionali, dentro e fuori dal Budget.",
  },
] as const;

export function ExportClient() {
  // Stessa convenzione di navigazione periodo del resto dell'app: undefined =>
  // periodo corrente. Il periodo si calcola qui con le funzioni pure di
  // lib/domain/period.ts (nessuna query serve per disegnare questa pagina) e
  // viaggia verso il route handler come una data qualunque al suo interno.
  const [referenceDate, setReferenceDate] = useState<Date | undefined>(undefined);
  const period = getCurrentFinancialPeriod(referenceDate);
  const isCurrentPeriod = period.key === getCurrentFinancialPeriod().key;
  const query = `?p=${period.start.toISOString()}`;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setReferenceDate(shiftPeriods(period, -1).start)}
            aria-label="Periodo precedente"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-sm text-ink-600 dark:text-ink-300">
            {dateFormatter.format(period.start)} → {dateFormatter.format(period.end)}
          </p>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setReferenceDate(shiftPeriods(period, 1).start)}
            aria-label="Periodo successivo"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {!isCurrentPeriod && (
          <button
            type="button"
            className="text-xs text-ink-500 hover:underline dark:text-ink-400"
            onClick={() => setReferenceDate(undefined)}
          >
            Torna a oggi
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {EXPORTS.map((item) => (
          <Card key={item.dataset} className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink-950 dark:text-ink-50">{item.label}</span>
              <span className="text-xs text-ink-500 dark:text-ink-400">{item.description}</span>
            </div>
            {/* Un <a download> e non un fetch + Blob: la richiesta porta con
                sé i cookie di sessione da sola, e il nome del file arriva dal
                Content-Disposition del server invece di essere ricostruito
                qui. reloadDocument non serve: non è un Link di Next. */}
            <a
              href={`/api/export/${item.dataset}${query}`}
              download
              className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-ink-300 px-3 text-sm font-medium text-ink-800 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-100 dark:hover:bg-ink-800"
            >
              <Download className="size-4 text-teal-600 dark:text-teal-400" />
              Scarica CSV
            </a>
          </Card>
        ))}
      </div>

      <p className="text-xs text-ink-400 dark:text-ink-500">
        File CSV pronti per Excel italiano: separatore punto e virgola, virgola decimale, accenti corretti — si aprono
        con un doppio clic. Le ricorrenze generate e non ancora confermate non sono incluse in nessuno dei tre file:
        sono promemoria, non spese.
      </p>
    </div>
  );
}
