"use client";

import { trpc } from "@/lib/trpc/client";
import { LOGIN_OUTCOME_LABELS } from "@/lib/domain/labels";
import type { LoginOutcome } from "@/lib/domain/enums";
import { groupByCalendarDay } from "@/lib/domain/dateGroups";
import { Card } from "@/components/ui/card";

// deletedAt/createdAt qui è un vero istante (non un giorno di calendario
// puro come Expense.date) — niente timeZone: "UTC", va mostrato nel fuso di
// chi legge, stesso motivo di app/eliminazioni/DeletionLogClient.tsx.
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });
const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function outcomeColor(outcome: LoginOutcome): string {
  if (outcome === "SUCCESS") return "text-teal-600 dark:text-teal-400";
  return "text-coral-600 dark:text-coral-400";
}

// Sola lettura — ogni tentativo di login registrato da auth.ts, riuscito o
// no, con IP e dispositivo quando disponibili. Vedi anche "Notifiche di
// sicurezza" in Profilo per essere avvisati sul telefono in tempo reale sui
// tentativi falliti/blocchi, invece di dover controllare qui.
export function LoginAttemptsClient() {
  const { data: attempts, isLoading } = trpc.loginAttempt.list.useQuery();

  if (isLoading || !attempts) {
    return <p className="text-sm text-ink-500 dark:text-ink-400">Caricamento…</p>;
  }

  if (attempts.length === 0) {
    return (
      <p className="w-full max-w-2xl text-sm text-ink-500 dark:text-ink-400">Nessun tentativo di accesso registrato.</p>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {groupByCalendarDay(attempts, (attempt) => attempt.createdAt).map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
            {group.label ?? dateFormatter.format(group.date)}
          </p>
          {group.items.map((attempt) => (
            <Card key={attempt.id} className="flex flex-row items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className={`truncate text-sm font-medium ${outcomeColor(attempt.outcome as LoginOutcome)}`}>
                  {LOGIN_OUTCOME_LABELS[attempt.outcome as LoginOutcome]}
                </p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {attempt.email} · {dateTimeFormatter.format(new Date(attempt.createdAt))}
                </p>
                {(attempt.ipAddress || attempt.userAgent) && (
                  <p className="truncate text-xs text-ink-400 dark:text-ink-500">
                    {[attempt.ipAddress, attempt.userAgent].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
