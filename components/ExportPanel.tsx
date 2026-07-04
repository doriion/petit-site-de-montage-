"use client";

/**
 * Panneau d'export (Phase 2a) : bouton Exporter → passe de lecture enregistrée
 * (progression + Annuler), puis partage natif si dispo (mobile) avec fallback
 * lien de téléchargement. Les barres/labels de progression sont remplis en DOM
 * direct par la boucle de rendu (refs), pas par setState.
 */

import type { RefObject } from "react";
import type { ExportResult } from "@/hooks/useMontage";

interface ExportPanelProps {
  ready: boolean;
  hasClips: boolean;
  exporting: boolean;
  result: ExportResult | null;
  error: string | null;
  barRef: RefObject<HTMLDivElement | null>;
  timeRef: RefObject<HTMLSpanElement | null>;
  onStart: () => void;
  onCancel: () => void;
  onShare: () => void;
  onClear: () => void;
}

export default function ExportPanel({
  ready,
  hasClips,
  exporting,
  result,
  error,
  barRef,
  timeRef,
  onStart,
  onCancel,
  onShare,
  onClear,
}: ExportPanelProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        4 · Exporter
      </h2>

      {!exporting && !result && (
        <>
          <button
            type="button"
            data-export
            onClick={onStart}
            disabled={!ready || !hasClips}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-ink-900 transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Exporter la vidéo
          </button>
          <p className="text-[11px] text-zinc-500">
            La preview est rejouée du début à la fin et enregistrée telle
            quelle (temps réel). Garde l&apos;onglet au premier plan.
          </p>
        </>
      )}

      {exporting && (
        <div
          data-export-progress
          className="space-y-3 rounded-xl border border-ink-600 bg-ink-800/80 p-3"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-zinc-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-beat" />
              Export en cours…
            </span>
            <span ref={timeRef} className="font-mono text-zinc-400">
              0:00 / 0:00
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-700">
            <div
              ref={barRef}
              className="h-full rounded-full bg-accent transition-[width] duration-150"
              style={{ width: "0%" }}
            />
          </div>
          <button
            type="button"
            data-export-cancel
            onClick={onCancel}
            className="w-full rounded-lg border border-ink-600 py-2 text-xs text-zinc-300 hover:border-beat hover:text-beat"
          >
            Annuler
          </button>
        </div>
      )}

      {result && (
        <div
          data-export-done
          className="space-y-2 rounded-xl border border-ink-600 bg-ink-800/80 p-3"
        >
          <p className="text-sm text-zinc-200">
            ✅ Montage prêt{" "}
            <span className="text-xs text-zinc-500">
              ({(result.size / 1_000_000).toFixed(1)} Mo ·{" "}
              {result.filename.split(".").pop()?.toUpperCase()})
            </span>
          </p>
          {result.canShare && (
            <button
              type="button"
              data-export-share
              onClick={onShare}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink-900"
            >
              Partager
            </button>
          )}
          <a
            data-export-download
            href={result.url}
            download={result.filename}
            className="block w-full rounded-lg border border-ink-600 py-2.5 text-center text-sm text-zinc-200 hover:border-accent hover:text-accent"
          >
            Télécharger ({result.filename})
          </a>
          <button
            type="button"
            data-export-clear
            onClick={onClear}
            className="w-full py-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Fermer
          </button>
        </div>
      )}

      {error && <p className="text-xs text-beat">{error}</p>}
    </div>
  );
}
