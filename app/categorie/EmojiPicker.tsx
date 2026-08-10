"use client";

import { Input } from "@/components/ui/input";

// Un set fisso e piccolo basta per un'app personale — niente libreria di
// icon-picker, niente dipendenza nuova. L'input sotto copre chiunque voglia
// un'emoji diversa da questa lista (basta scriverla o incollarla).
export const CATEGORY_EMOJI_OPTIONS = [
  "🍔",
  "🛒",
  "🏠",
  "🚗",
  "⚡",
  "🎬",
  "🏥",
  "✈️",
  "📱",
  "💳",
  "🎓",
  "🐶",
  "👕",
  "🎁",
  "📚",
  "☕",
  "🍺",
  "🏋️",
  "🎮",
  "💰",
];

export function EmojiPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {CATEGORY_EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onChange(emoji)}
            aria-pressed={value === emoji}
            className={`flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
              value === emoji ? "bg-zinc-200 ring-2 ring-zinc-950 dark:bg-zinc-700 dark:ring-zinc-50" : ""
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="oppure scrivi/incolla un'altra emoji"
        maxLength={8}
      />
    </div>
  );
}
