"use client";

import type { Clip } from "@/lib/preview";

interface ClipTrayProps {
  clips: Clip[];
  /** Clips dont l'analyse de mouvement est encore en cours. */
  analyzingIds: ReadonlySet<string>;
  onMeta: (id: string, duration: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/**
 * La rangée de clips importés. Pures vignettes : ces <video> ne JOUENT jamais
 * (preload="metadata" + un micro-seek pour afficher une frame). La lecture
 * passe par les deux slots de `lib/player.ts` — c'est ce qui rend la preview
 * viable sur mobile. Chaque vignette remonte la durée de son clip via
 * `onMeta`, dont dérivent les points d'entrée (inPoint) des segments.
 */
export default function ClipTray({
  clips,
  analyzingIds,
  onMeta,
  onRemove,
  onClear,
}: ClipTrayProps) {
  if (clips.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Clips ({clips.length})
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-zinc-500 transition-colors hover:text-beat"
        >
          Tout retirer
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {clips.map((clip, i) => (
          <li
            key={clip.id}
            className="group relative overflow-hidden rounded-xl border border-ink-600 bg-ink-800"
          >
            <video
              src={clip.url}
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                onMeta(clip.id, v.duration);
                // Force une frame visible (sinon vignette noire sur iOS).
                try {
                  if (Number.isFinite(v.duration) && v.duration > 0) {
                    v.currentTime = Math.min(0.1, v.duration / 2);
                  }
                } catch {
                  /* peu importe : vignette noire au pire */
                }
              }}
              className="aspect-video w-full bg-black object-cover"
            />
            <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              {i + 1}
            </span>
            {analyzingIds.has(clip.id) && (
              <span
                data-analyzing
                className="pointer-events-none absolute bottom-7 left-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-accent"
              >
                <span className="h-1 w-1 animate-pulse rounded-full bg-accent" />
                analyse…
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(clip.id)}
              aria-label={`Retirer ${clip.name}`}
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-zinc-300 opacity-0 transition-opacity hover:bg-beat hover:text-white group-hover:opacity-100"
            >
              ✕
            </button>
            <span className="block truncate px-2 py-1 text-[11px] text-zinc-400">
              {clip.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
