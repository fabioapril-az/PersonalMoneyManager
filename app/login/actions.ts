"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string } | undefined;

export async function authenticate(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      totpCode: formData.get("totpCode"),
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
