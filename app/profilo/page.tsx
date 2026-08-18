import Link from "next/link";
import { auth } from "@/auth";
import { LogoutButton } from "../logout-button";
import { BottomNav } from "../BottomNav";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { TwoFactorSetup } from "./TwoFactorSetup";

export default async function ProfiloPage() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-ink-50 px-6 py-16 pb-24 dark:bg-ink-950">
      <div className="flex w-full max-w-sm flex-col gap-1">
        <Link href="/" className="text-sm text-ink-500 hover:underline dark:text-ink-400">
          ← Torna alla dashboard
        </Link>
        <h1 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Profilo</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{session?.user?.email}</p>
      </div>
      <ChangePasswordForm />
      <TwoFactorSetup />
      <BottomNav logoutSlot={<LogoutButton />} />
    </div>
  );
}
