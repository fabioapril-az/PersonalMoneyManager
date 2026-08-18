import { TOTP, Secret } from "otpauth";

const ISSUER = "Personal Money Manager";

/**
 * Genera un nuovo segreto TOTP (base32) — un giro alla volta, mai riusato.
 * Scritto su User.totpSecret già a questo punto (vedi il commento sul
 * campo in schema.prisma), ma non attiva nulla finché non viene confermato
 * con un primo codice valido (server/routers/user.ts: totpConfirm).
 */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function buildTotp(secretBase32: string, email: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

/** URI "otpauth://..." da codificare in un QR — l'app authenticator lo legge per configurarsi da sola. */
export function buildOtpauthUri(secretBase32: string, email: string): string {
  return buildTotp(secretBase32, email).toString();
}

/**
 * Verifica un codice a 6 cifre contro il segreto. window: 1 accetta anche il
 * codice del passo precedente/successivo (+-30s) — tollera un piccolo
 * disallineamento d'orologio tra telefono e server senza indebolire troppo
 * la verifica (finestra totale 90s, non minuti).
 */
export function verifyTotpCode(secretBase32: string, email: string, code: string): boolean {
  const totp = buildTotp(secretBase32, email);
  return totp.validate({ token: code, window: 1 }) !== null;
}
