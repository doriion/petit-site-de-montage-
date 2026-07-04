"use client";

/**
 * Galerie de la bibliothèque de sons (zone « 1 · La musique »). Charge le
 * manifeste au montage ; absent/vide/malformé → ne rend rien (import seul).
 * Un tap télécharge la piste (état de chargement) et l'injecte par le
 * pipeline d'upload STANDARD — même code path que la démo, zéro branche
 * spéciale. Le morceau reste remplaçable par un import ou un autre choix.
 */

import { useEffect, useState } from "react";
import { fetchAsFile } from "@/lib/demo";
import { parseLibrary, type LibraryTrack } from "@/lib/library";

interface SoundLibraryProps {
  loadAudio: (file: File, opts?: { credit?: string | null }) => Promise<void>;
  /** Crédit du morceau actif (surligne la carte correspondante). */
  activeCredit: string | null;
  disabled: boolean;
}

export default function SoundLibrary({
  loadAudio,
  activeCredit,
  disabled,
}: SoundLibraryProps) {
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/sounds/library.json");
        if (!res.ok) return;
        const parsed = parseLibrary(await res.json());
        if (alive) setTracks(parsed);
      } catch {
        /* pas de bibliothèque : galerie masquée */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const pick = async (track: LibraryTrack) => {
    if (loadingId || disabled) return;
    setLoadingId(track.id);
    try {
      const file = await fetchAsFile(track.file);
      await loadAudio(file, { credit: track.credit });
    } catch {
      // Fichier manquant/corrompu : on retire la carte, sans bruit.
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
    } finally {
      setLoadingId(null);
    }
  };

  if (tracks.length === 0) return null;

  return (
    <div data-library className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Ou choisis dans la bibliothèque
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tracks.map((t) => {
          const active = activeCredit !== null && t.credit === activeCredit;
          const loading = loadingId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-track={t.id}
              aria-pressed={active}
              disabled={disabled || loadingId !== null}
              onClick={() => void pick(t)}
              className={`w-40 shrink-0 rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed ${
                active
                  ? "border-accent bg-accent/10 ring-1 ring-accent"
                  : "border-ink-600 bg-ink-800/60 hover:border-zinc-500"
              } ${loadingId !== null && !loading ? "opacity-50" : ""}`}
            >
              <span
                className={`block truncate text-sm font-semibold ${
                  active ? "text-accent" : "text-zinc-200"
                }`}
              >
                {t.title}
              </span>
              <span className="block truncate text-[11px] text-zinc-500">
                {t.artist}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-[10px]">
                {loading ? (
                  <span
                    data-track-loading
                    className="flex items-center gap-1 text-accent"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    chargement…
                  </span>
                ) : (
                  <>
                    <span className="rounded-full bg-ink-700 px-1.5 py-0.5 text-zinc-400">
                      {t.mood}
                    </span>
                    {t.bpm !== undefined && (
                      <span className="rounded-full bg-ink-700 px-1.5 py-0.5 text-zinc-400">
                        {t.bpm} BPM
                      </span>
                    )}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
