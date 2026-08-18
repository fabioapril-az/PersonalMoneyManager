"use client";

import { trpc } from "@/lib/trpc/client";
import { DELETION_ENTITY_TYPE_LABELS } from "@/lib/domain/labels";
import type { DeletionEntityType } from "@/lib/domain/enums";
import { groupByCalendarDay } from "@/lib/domain/dateGroups";
import { Card } from "@/components/ui/card";

// timeZone: "UTC" solo per entry.date (la data PROPRIA dell'entità
// cancellata, es. Expense.date — un giorno di calendario puro, mezzanotte
// UTC, stesso motivo di ogni altro dateFormatter nell'app). deletedAt invece
// è un vero istante (Date.now() del server al momento della cancellazione):
// niente forzatura UTC, va mostrato nel fuso di chi legge.
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });
const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const currencyFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function formatAmount(value: unknown) {
  return currencyFormatter.format(Number(value));
}

// Sola lettura — nessuna azione possibile qui (niente "ripristina", niente
// "elimina il log stesso"): è uno storico, non un cestino. Vedi
// DeletionLogEntry in schema.prisma sul perché esiste.
export function DeletionLogClient() {
  const { data: entries, isLoading } = trpc.deletionLog.list.useQuery();

  if (isLoading || !entries) {
    return <p className="text-sm text-ink-500 dark:text-ink-400">Caricamento…</p>;
  }

  if (entries.length === 0) {
    return (
      <p className="w-full max-w-2xl text-sm text-ink-500 dark:text-ink-400">
        Nessuna cancellazione registrata — da qui in poi, ogni spesa/entrata/trasferimento/ricorrenza/categoria che
        elimini resta qui, con uno snapshot di cosa c&apos;era.
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {groupByCalendarDay(entries, (entry) => entry.deletedAt).map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
            {group.label ?? dateFormatter.format(group.date)}
          </p>
          {group.items.map((entry) => (
            <Card key={entry.id} className="flex flex-row items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink-800 dark:text-ink-200">
                  {entry.description}{" "}
                  <span className="text-xs text-ink-400 dark:text-ink-500">
                    ({DELETION_ENTITY_TYPE_LABELS[entry.entityType as DeletionEntityType]})
                  </span>
                </p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  Eliminata il {dateTimeFormatter.format(new Date(entry.deletedAt))}
                  {entry.date && ` · datata ${dateFormatter.format(new Date(entry.date))}`}
                </p>
              </div>
              {entry.amount != null && (
                <span className="shrink-0 text-sm font-medium text-ink-950 dark:text-ink-50">
                  {formatAmount(entry.amount)}
                </span>
              )}
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
