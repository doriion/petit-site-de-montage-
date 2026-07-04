"use client";

/**
 * Panneau d'inspection d'un segment (s'ouvre au tap sur la timeline) :
 * 1. l'explication pédagogique de la décision de montage (templates FR) ;
 * 2. deux retouches par segment — clip assigné et point d'entrée — stockées
 *    en overrides à part des segments générés (voir useMontage).
 */

import { useEffect, useRef } from "react";
import type { Clip, Segment } from "@/lib/preview";
import { formatTime } from "@/lib/preview";
import type { EnergyZone } from "@/lib/montage-engine";
import type { EffectsConfig } from "@/lib/effects";
import { explainSegment } from "@/lib/explain";

const ZONE_LABEL: Record<string, string> = {
  low: "Calme",
  mid: "Modéré",
  high: "Fort",
};
const ZONE_CHIP: Record<string, string> = {
  low: "bg-sky-500/20 text-sky-300",
  mid: "bg-amber-400/20 text-amber-300",
  high: "bg-beat/20 text-beat-soft",
};

interface SegmentInspectorProps {
  index: number;
  segment: Segment;
  prevZone?: EnergyZone;
  clips: Clip[];
  clipDurations: ReadonlyMap<string, number>;
  baseCutEvery: number;
  dynamic: boolean;
  /** Config d'effets du pack actif (pour des explications véridiques). */
  effects: EffectsConfig;
  packName: string;
  overridden: boolean;
  onChangeClip: (sourceIndex: number) => void;
  onChangeInPoint: (inPoint: number) => void;
  onResetOverride: () => void;
  onClose: () => void;
}

export default function SegmentInspector({
  index,
  segment,
  prevZone,
  clips,
  clipDurations,
  baseCutEvery,
  dynamic,
  effects,
  packName,
  overridden,
  onChangeClip,
  onChangeInPoint,
  onResetOverride,
  onClose,
}: SegmentInspectorProps) {
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const clip = clips[segment.sourceIndex];
  const clipDur = clip ? clipDurations.get(clip.id) : undefined;
  const hasDur = !!clipDur && Number.isFinite(clipDur) && clipDur > 0.3;
  const inPoint = segment.inPoint ?? 0;
  const maxIn = hasDur ? Math.max(0, clipDur! - 0.15) : 0;

  // Preview de la frame au point d'entrée : on seek la petite vidéo.
  useEffect(() => {
    const v = previewRef.current;
    if (!v) return;
    const seek = () => {
      try {
        v.currentTime = Math.max(0, Math.min(inPoint, maxIn));
      } catch {
        /* métadonnées pas prêtes : le listener ci-dessous repassera */
      }
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [inPoint, maxIn, clip?.url]);

  const text = explainSegment(segment, {
    index,
    baseCutEvery,
    dynamic,
    prevZone,
    effects,
    packName,
  });

  return (
    <div
      data-inspector
      className="mt-3 space-y-4 rounded-2xl border border-ink-600 bg-ink-800/80 p-4"
    >
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            Plan {index + 1}
            <span className="ml-2 font-mono text-xs font-normal text-zinc-500">
              {formatTime(segment.start, 1)} → {formatTime(segment.end, 1)}
            </span>
          </h3>
          <p data-explain className="mt-1 text-sm leading-relaxed text-zinc-300">
            {text}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink-700 text-zinc-400 hover:text-zinc-100"
        >
          ✕
        </button>
      </div>

      {/* Données du segment */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {segment.zone && (
          <span className={`rounded-full px-2 py-0.5 ${ZONE_CHIP[segment.zone]}`}>
            {ZONE_LABEL[segment.zone]}
          </span>
        )}
        {segment.energy !== undefined && (
          <span className="rounded-full bg-ink-700 px-2 py-0.5 text-zinc-400">
            énergie {Math.round(segment.energy * 100)} %
          </span>
        )}
        {segment.motion !== undefined && (
          <span className="rounded-full bg-ink-700 px-2 py-0.5 text-zinc-400">
            mouvement {Math.round(segment.motion * 100)} %
          </span>
        )}
        <span className="rounded-full bg-ink-700 px-2 py-0.5 text-zinc-400">
          {(segment.end - segment.start).toFixed(1)} s
        </span>
        <span className="rounded-full bg-ink-700 px-2 py-0.5 text-zinc-400">
          {segment.transition === "crossfade" ? "fondu enchaîné" : "coupe franche"}
        </span>
        {overridden && (
          <button
            type="button"
            data-reset
            onClick={onResetOverride}
            className="rounded-full bg-ink-700 px-2 py-0.5 text-accent hover:bg-ink-600"
          >
            retouché · réinitialiser
          </button>
        )}
      </div>

      {/* Choix du clip */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Clip du plan
        </h4>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {clips.map((c, i) => (
            <button
              key={c.id}
              type="button"
              data-clip-thumb={i}
              onClick={() => onChangeClip(i)}
              className={`relative w-24 shrink-0 overflow-hidden rounded-lg border transition-colors ${
                i === segment.sourceIndex
                  ? "border-accent ring-1 ring-accent"
                  : "border-ink-600 hover:border-zinc-500"
              }`}
            >
              <video
                src={c.url}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  try {
                    if (Number.isFinite(v.duration) && v.duration > 0) {
                      v.currentTime = Math.min(0.1, v.duration / 2);
                    }
                  } catch {
                    /* vignette noire au pire */
                  }
                }}
                className="aspect-video w-full bg-black object-cover"
              />
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] font-semibold text-accent">
                {i + 1}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Point d'entrée dans le clip */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Point d&apos;entrée dans le clip
          </h4>
          <span className="font-mono text-xs text-accent">
            {inPoint.toFixed(2)} s
          </span>
        </div>
        {hasDur ? (
          <div className="flex items-center gap-3">
            <input
              id="inPoint"
              type="range"
              min={0}
              max={maxIn}
              step={0.05}
              value={Math.min(inPoint, maxIn)}
              onChange={(e) => onChangeInPoint(parseFloat(e.target.value))}
              className="slider flex-1"
              aria-label="Point d'entrée dans le clip"
            />
            {clip && (
              <video
                ref={previewRef}
                src={clip.url}
                muted
                playsInline
                preload="metadata"
                className="aspect-video w-24 shrink-0 rounded-lg border border-ink-600 bg-black object-cover"
              />
            )}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500">
            Durée du clip inconnue — réglage indisponible pour ce fichier.
          </p>
        )}
      </div>
    </div>
  );
}
