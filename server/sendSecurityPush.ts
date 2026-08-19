import webpush from "web-push";
import type { Context } from "./context";

/**
 * Notifica push (Web Push, PWA — vedi public/sw.js) per un evento di
 * sicurezza: solo tentativi falliti/blocchi (auth.ts), mai i login riusciti
 * — altrimenti diventerebbe rumore quotidiano invece di un segnale che vale
 * la pena guardare.
 *
 * Silenziosa se le chiavi VAPID non sono configurate (VAPID_PUBLIC_KEY/
 * VAPID_PRIVATE_KEY/VAPID_SUBJECT) o se l'utente non ha mai attivato le
 * notifiche su nessun dispositivo (nessuna PushSubscription salvata) — le
 * notifiche sono un extra opzionale, la loro assenza non deve mai far
 * fallire un login.
 */
export async function sendSecurityPush(prisma: Context["prisma"], title: string, body: string) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return;

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const subscriptions = await prisma.pushSubscription.findMany();
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body })
        );
      } catch (error) {
        // 404/410: il browser ha revocato/dimenticato questa sottoscrizione
        // (permessi ritirati, app disinstallata) — ripulirla, non serve più.
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
}
