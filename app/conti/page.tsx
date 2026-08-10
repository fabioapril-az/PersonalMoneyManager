import Link from "next/link";
import { AccountsManager } from "./AccountsManager";

export default function ContiPage() {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-xl">
        <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← Torna alla dashboard
        </Link>
      </div>
      <AccountsManager />
    </div>
  );
}
