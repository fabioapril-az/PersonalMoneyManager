"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

// Verifica in due passaggi (TOTP) — vedi lib/auth/totp.ts e auth.ts. Anche
// se qualcuno scoprisse la password, non basterebbe: serve anche il codice
// a 6 cifre dall'app authenticator (Google Authenticator, Authy, ecc.).
export function TwoFactorSetup() {
  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.user.me.useQuery();

  const [setupData, setSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  const totpSetup = trpc.user.totpSetup.useMutation({
    onSuccess: (data) => setSetupData(data),
    onError: (error) => toast.error(error.message || "Impossibile avviare la configurazione."),
  });

  const totpConfirm = trpc.user.totpConfirm.useMutation({
    onSuccess: () => {
      toast.success("Verifica in due passaggi attivata.");
      setSetupData(null);
      setConfirmCode("");
      utils.user.me.invalidate();
    },
    onError: (error) => toast.error(error.message || "Codice non valido."),
  });

  const totpDisable = trpc.user.totpDisable.useMutation({
    onSuccess: () => {
      toast.success("Verifica in due passaggi disattivata.");
      setDisableOpen(false);
      setDisableCode("");
      utils.user.me.invalidate();
    },
    onError: (error) => toast.error(error.message || "Codice non valido."),
  });

  if (isLoading || !me) {
    return <p className="text-sm text-ink-500 dark:text-ink-400">Caricamento…</p>;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <h2 className="text-sm font-medium text-ink-500 dark:text-ink-400">Verifica in due passaggi</h2>

      {me.totpEnabled && !disableOpen && (
        <Card className="flex flex-col gap-2 p-3">
          <p className="text-sm text-teal-600 dark:text-teal-400">Attiva — al login serve anche il codice.</p>
          <Button variant="outline" size="sm" className="self-start" onClick={() => setDisableOpen(true)}>
            Disattiva
          </Button>
        </Card>
      )}

      {me.totpEnabled && disableOpen && (
        <Card className="flex flex-col gap-3 p-3">
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Inserisci il codice attuale dall&apos;app authenticator per confermare.
          </p>
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={totpDisable.isPending}
              onClick={() => totpDisable.mutate({ code: disableCode })}
            >
              Conferma disattivazione
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDisableOpen(false)}>
              Annulla
            </Button>
          </div>
        </Card>
      )}

      {!me.totpEnabled && !setupData && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={totpSetup.isPending}
          onClick={() => totpSetup.mutate()}
        >
          {totpSetup.isPending ? "Generazione…" : "Attiva verifica in due passaggi"}
        </Button>
      )}

      {!me.totpEnabled && setupData && (
        <Card className="flex flex-col gap-3 p-3">
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Inquadra questo codice con Google Authenticator, Authy o simili — oppure inserisci la chiave a mano.
          </p>
          <Image
            src={setupData.qrDataUrl}
            alt="QR per la configurazione 2FA"
            width={200}
            height={200}
            unoptimized
            className="self-center rounded-lg border border-ink-200 dark:border-ink-800"
          />
          <p className="break-all text-center font-mono text-xs text-ink-500 dark:text-ink-400">{setupData.secret}</p>
          <Label htmlFor="totp-confirm-code">Poi inserisci qui il codice a 6 cifre per confermare</Label>
          <Input
            id="totp-confirm-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={totpConfirm.isPending} onClick={() => totpConfirm.mutate({ code: confirmCode })}>
              Conferma
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSetupData(null)}>
              Annulla
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
