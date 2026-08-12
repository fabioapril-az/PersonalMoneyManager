"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Receipt, Target, PieChart, MoreHorizontal, Landmark, Tag, User } from "lucide-react";

// Sostituisce la fila di link testuali in alto (6 voci, affollava la testata
// soprattutto su telefono, dove questa app si usa di più) — barra fissa in
// basso, stile app mobile, sempre a portata di pollice. Le 4 destinazioni
// quotidiane restano sempre visibili; il resto (Conti/Categorie/Profilo/Esci)
// è dietro "Più", aperto al tocco invece di occupare spazio permanente.
const TABS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/movimenti", label: "Movimenti", icon: Receipt },
  { href: "/budget", label: "Budget", icon: Target },
  { href: "/report", label: "Report", icon: PieChart },
];

const MORE_LINKS = [
  { href: "/conti", label: "Conti", icon: Landmark },
  { href: "/categorie", label: "Categorie", icon: Tag },
  { href: "/profilo", label: "Profilo", icon: User },
];

// logoutSlot: LogoutButton (app/logout-button.tsx) è un Server Component che
// usa una server action — un Client Component come questo non può
// importarlo/renderizzarlo direttamente, va passato già pronto da chi chiama
// (ogni page.tsx, che è un Server Component).
export function BottomNav({ logoutSlot }: { logoutSlot: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Chiudi menu"
            className="fixed inset-0 z-40 bg-ink-950/20"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-xs flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg dark:border-ink-800 dark:bg-ink-900">
            {MORE_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 text-sm text-ink-800 last:border-b-0 hover:bg-ink-50 dark:border-ink-800 dark:text-ink-100 dark:hover:bg-ink-800"
              >
                <Icon className="size-4 text-teal-600 dark:text-teal-400" />
                {label}
              </Link>
            ))}
            <div className="p-2">{logoutSlot}</div>
          </div>
        </>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-ink-800 dark:bg-ink-900">
        <div className="mx-auto flex max-w-2xl items-stretch justify-between px-1">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] ${
                  active ? "text-teal-600 dark:text-teal-400" : "text-ink-500 dark:text-ink-400"
                }`}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] ${
              moreOpen ? "text-teal-600 dark:text-teal-400" : "text-ink-500 dark:text-ink-400"
            }`}
          >
            <MoreHorizontal className="size-5" />
            Più
          </button>
        </div>
      </nav>
    </>
  );
}
