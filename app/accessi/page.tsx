import Link from "next/link";
import { LogoutButton } from "../logout-button";
import { BottomNav } from "../BottomNav";
import { LoginAttemptsClient } from "./LoginAttemptsClient";

export default function AccessiPage() {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-ink-50 px-6 py-16 pb-24 dark:bg-ink-950">
      <div className="flex w-full max-w-2xl flex-col gap-1">
        <Link href="/" className="text-sm text-ink-500 hover:underline dark:text-ink-400">
          ← Torna alla dashboard
        </Link>
        <h1 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Accessi</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Ogni tentativo di login, riuscito o no — con IP e dispositivo quando disponibili.
        </p>
      </div>
      <LoginAttemptsClient />
      <BottomNav logoutSlot={<LogoutButton />} />
    </div>
  );
}
