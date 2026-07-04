"use client";

/**
 * Timeline horizontale scrollable, façon appli de montage mobile : un bloc
 * arrondi par segment (largeur proportionnelle à la durée, minimum tapable),
 * coloré selon la zone d'énergie, tête de lecture synchronisée. Tap sur un
 * bloc = seek + inspection. Pas de drag des coupes ici — hors périmètre.
 *
 * La tête de lecture est positionnée en piecewise-linear : les blocs courts
 * étant élargis au minimum tapable, une position purement proportionnelle au
 * temps serait fausse ; on interpole DANS le bloc du segment courant.
 */

import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Segment } from "@/lib/preview";
import type { EnergyZone } from "@/lib/montage-engine";

const PX_PER_SEC = 40;
const MIN_BLOCK_PX = 24;
const GAP_PX = 4;

const ZONE_BLOCK: Record<string, string> = {
  low: "bg-sky-500/70 active:bg-sky-500",
  mid: "bg-amber-400/70 active:bg-amber-400",
  high: "bg-beat/80 active:bg-beat",
  none: "bg-ink-600 active:bg-ink-600/70",
};

const ZONE_DOT: Record<string, string> = {
  low: "bg-sky-500",
  mid: "bg-amber-400",
  high: "bg-beat",
};

interface TimelineProps {
  segments: Segment[];
  selected: number | null;
  overriddenIndices: ReadonlySet<number>;
  audioRef: RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  onSelect: (index: number) => void;
}

export default function Timeline({
  segments,
  selected,
  overriddenIndices,
  audioRef,
  isPlaying,
  onSelect,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const lastScrollAtRef = useRef(0);

  // Géométrie des blocs (partagée entre rendu et tête de lecture).
  const { widths, lefts } = useMemo(() => {
    const widths = segments.map((s) =>
      Math.max(MIN_BLOCK_PX, (s.end - s.start) * PX_PER_SEC)
    );
    const lefts: number[] = [];
    let x = 0;
    for (const w of widths) {
      lefts.push(x);
      x += w + GAP_PX;
    }
    return { widths, lefts };
  }, [segments]);

  // Tête de lecture : interpolation dans le bloc du segment courant.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      const ph = playheadRef.current;
      if (audio && ph && segments.length > 0) {
        const t = audio.currentTime;
        let i = segments.findIndex((s) => t < s.end);
        if (i === -1) i = segments.length - 1;
        const s = segments[i];
        const frac =
          s.end > s.start
            ? Math.min(1, Math.max(0, (t - s.start) / (s.end - s.start)))
            : 0;
        const x = lefts[i] + frac * widths[i];
        ph.style.transform = `translateX(${x}px)`;

        // Auto-scroll doux pendant la lecture, sans lutter contre le doigt.
        const sc = scrollRef.current;
        const now = performance.now();
        if (sc && isPlaying && now - lastScrollAtRef.current > 600) {
          const view = sc.clientWidth;
          if (x < sc.scrollLeft + view * 0.1 || x > sc.scrollLeft + view * 0.85) {
            lastScrollAtRef.current = now;
            sc.scrollTo({ left: Math.max(0, x - view / 2), behavior: "smooth" });
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [segments, widths, lefts, audioRef, isPlaying]);

  if (segments.length === 0) return null;
  const totalPx = lefts[lefts.length - 1] + widths[widths.length - 1];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Timeline ({segments.length} plans)
        </h3>
        {/* Légende discrète des zones d'énergie */}
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          {(
            [
              ["low", "Calme"],
              ["mid", "Modéré"],
              ["high", "Fort"],
            ] as [EnergyZone, string][]
          ).map(([z, label]) => (
            <span key={z} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${ZONE_DOT[z]}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-xl border border-ink-600 bg-ink-800/60 px-2 py-2"
      >
        <div className="relative" style={{ width: totalPx, height: 56 }}>
          {segments.map((s, i) => (
            <button
              key={i}
              type="button"
              data-seg={i}
              data-zone={s.zone ?? "none"}
              data-start={s.start.toFixed(3)}
              onClick={() => onSelect(i)}
              style={{ left: lefts[i], width: widths[i] }}
              className={`absolute top-1 h-12 rounded-lg text-[10px] font-semibold text-black/60 transition-transform active:scale-95 ${
                ZONE_BLOCK[s.zone ?? "none"]
              } ${selected === i ? "ring-2 ring-accent ring-offset-1 ring-offset-ink-800" : ""}`}
              aria-label={`Plan ${i + 1} — clip ${s.sourceIndex + 1}`}
            >
              {s.sourceIndex + 1}
              {s.transition === "crossfade" && (
                <span className="absolute bottom-0.5 left-1 text-[9px] text-black/50">
                  ⌒
                </span>
              )}
              {overriddenIndices.has(i) && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white shadow" />
              )}
            </button>
          ))}
          {/* Tête de lecture */}
          <div
            ref={playheadRef}
            data-playhead
            className="pointer-events-none absolute top-0 h-14 w-0.5 bg-accent shadow-[0_0_6px] shadow-accent"
            style={{ transform: "translateX(0px)" }}
          />
        </div>
      </div>
    </div>
  );
}
