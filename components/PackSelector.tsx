"use client";

/**
 * Sélecteur horizontal de packs de styles : une carte par pack (nom +
 * description d'une ligne), le pack actif surligné. Choisir un pack applique
 * sa config d'effets et sa cadence de base — les réglages fins en dessous
 * restent modifiables par-dessus.
 */

import { STYLE_PACKS } from "@/lib/packs";

interface PackSelectorProps {
  activeId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
}

export default function PackSelector({
  activeId,
  disabled,
  onSelect,
}: PackSelectorProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {STYLE_PACKS.map((p) => {
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            data-pack={p.id}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(p.id)}
            className={`w-36 shrink-0 rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "border-accent bg-accent/10 ring-1 ring-accent"
                : "border-ink-600 bg-ink-800/60 hover:border-zinc-500"
            }`}
          >
            <span
              className={`block text-sm font-semibold ${
                active ? "text-accent" : "text-zinc-200"
              }`}
            >
              {p.name}
            </span>
            <span className="mt-0.5 block text-[10px] leading-tight text-zinc-500">
              {p.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
