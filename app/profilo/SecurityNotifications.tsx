"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// La chiave pubblica VAPID arriva come base64url (RFC 4648 §5) — PushManager
// vuole invece un Uint8Array appoggiato su un vero ArrayBuffer (non
// SharedArrayBuffer, da cui il costruttore esplicito invece di
// Uint8Array.from), da qui la conversione manuale.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

type Support = "checking" | "unsupported" | "subscribed" | "not-subscribed";

// Notifiche push (Web Push) solo per eventi di sicurezza — tentativi di
// login falliti/blocchi (server/sendSecurityPush.ts), mai i login riusciti.
// Su iPhone funziona solo se l'app è davvero installata (icona in Home, non
// aperta dentro Safari) — limitazione di Apple, non dell'app.
export function SecurityNotifications() {
  const [status, setStatus] = useState<Support>("checking");
  const { data: vapidPublicKey } = trpc.push.vapidPublicKey.useQuery();
  const subscribe = trpc.push.subscribe.useMutation();
  const unsubscribe = trpc.push.unsubscribe.useMutation();

  useEffect(() => {
    checkStatus();
    async function checkStatus() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setStatus(existing ? "subscribed" : "not-subscribed");
    }
  }, []);

  async function handleEnable() {
    if (!vapidPublicKey) {
      toast.error("Notifiche non configurate sul server.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast.error("Permesso negato dal browser.");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const json = subscription.toJSON();
    if (!json.keys) {
      toast.error("Sottoscrizione non valida.");
      return;
    }
    subscribe.mutate(
      { endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, userAgent: navigator.userAgent },
      {
        onSuccess: () => {
          toast.success("Notifiche attivate su questo dispositivo.");
          setStatus("subscribed");
        },
        onError: (error) => toast.error(error.message || "Impossibile attivare le notifiche."),
      }
    );
  }

  async function handleDisable() {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (!existing) {
      setStatus("not-subscribed");
      return;
    }
    const endpoint = existing.endpoint;
    await existing.unsubscribe();
    unsubscribe.mutate(
      { endpoint },
      {
        onSuccess: () => {
          toast.success("Notifiche disattivate su questo dispositivo.");
          setStatus("not-subscribed");
        },
      }
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <h2 className="text-sm font-medium text-ink-500 dark:text-ink-400">Notifiche di sicurezza</h2>
      <p className="text-xs text-ink-400 dark:text-ink-500">
        Solo per tentativi di accesso falliti o blocchi — mai per un login riuscito.
      </p>

      {status === "checking" && <p className="text-sm text-ink-500 dark:text-ink-400">Verifica…</p>}

      {status === "unsupported" && (
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Questo browser non supporta le notifiche push. Su iPhone serve aver installato l&apos;app (icona in
          Home), non usarla da Safari.
        </p>
      )}

      {status === "subscribed" && (
        <Card className="flex flex-col gap-2 p-3">
          <p className="text-sm text-teal-600 dark:text-teal-400">Attive su questo dispositivo.</p>
          <Button variant="outline" size="sm" className="self-start" onClick={handleDisable}>
            Disattiva su questo dispositivo
          </Button>
        </Card>
      )}

      {status === "not-subscribed" && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={subscribe.isPending || !vapidPublicKey}
          onClick={handleEnable}
        >
          Attiva notifiche su questo dispositivo
        </Button>
      )}
    </div>
  );
}
