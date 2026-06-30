"use client";

import type { Clip } from "@/lib/preview";

interface ClipTrayProps {
  clips: Clip[];
  registerVideo: (id: string, el: HTMLVideoElement | null) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/**
 * La rangée de clips importés. Les <video> sont rendues ici mais hors-cadre
 * (elles servent de *source* au canvas, pas d'affichage direct). On garde une
 * petite vignette cliquable + bouton de suppression pour chaque clip.
 */
export default function ClipTray({
  clips,
  registerVideo,
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
              ref={(el) => registerVideo(clip.id, el)}
              src={clip.url}
              muted
              loop
              playsInline
              preload="auto"
              className="aspect-video w-full bg-black object-cover"
            />
            <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              {i + 1}
            </span>
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
