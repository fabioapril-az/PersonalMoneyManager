import Link from "next/link";
import { auth } from "@/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ProfiloPage() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-1">
        <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← Torna alla dashboard
        </Link>
        <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">Profilo</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{session?.user?.email}</p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
