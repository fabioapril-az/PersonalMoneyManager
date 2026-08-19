"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/auth";

export type LoginState = { error?: string } | undefined;

export async function authenticate(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  try {
    // Letti qui (la vera richiesta arrivata al server), non dentro
    // authorize() — vedi il commento su credentialsSchema in auth.ts.
    // x-forwarded-for può contenere "client, proxy1, proxy2": il primo è il
    // client vero (Azure App Service, dietro il suo reverse proxy).
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = requestHeaders.get("user-agent") ?? undefined;

    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      totpCode: formData.get("totpCode"),
      ip,
      userAgent,
      redirectTo: "/",
    });
    return undefined;
  } catch (error) {
    // signIn() throws a redirect internally on success — NEXT_REDIRECT must
    // pass through untouched, or a successful login would render this
    // catch block's error message instead of actually redirecting.
    if (error instanceof AuthError) {
      // Un solo messaggio per ogni causa (password sbagliata, codice 2FA
      // sbagliato/mancante, blocco per troppi tentativi) — vedi il commento
      // in auth.ts sul perché non distinguiamo.
      return { error: "Email, password o codice non corretti (o troppi tentativi: riprova tra qualche minuto)." };
    }
    throw error;
  }
}
